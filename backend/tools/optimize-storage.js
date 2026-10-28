'use strict';
/* ============================================================================
 * tools/optimize-storage.js — Adelgaza las imágenes YA subidas al Storage.
 *
 * Reescribe cada objeto EN SU MISMA RUTA (upsert), así que las URLs públicas
 * no cambian y ninguna referencia del portal se rompe.
 *
 * Seguridad:
 *   · Por defecto NO cambia nada: solo informa (dry-run).
 *   · Antes de sobrescribir guarda el original en backend/backups/<fecha>/.
 *   · Solo sustituye si se ahorra al menos MIN_AHORRO (15 %). Si la
 *     recompresión no gana peso, se conserva el original.
 *   · Tras subir, verifica con HEAD que la URL responde 200 y con el nuevo
 *     tamaño; si no, restaura el original automáticamente.
 *
 * Uso:
 *   node tools/optimize-storage.js                 # informe, no toca nada
 *   node tools/optimize-storage.js --apply         # aplica
 *   node tools/optimize-storage.js --apply --min=150
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../src/config');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.MEDIA_BUCKET || 'portal-media';
const args = process.argv.slice(2);
const APLICAR = args.includes('--apply');
const MIN_KB = Number((args.find((a) => a.startsWith('--min=')) || '--min=200').split('=')[1]);
const MAX_ANCHO = Number((args.find((a) => a.startsWith('--ancho=')) || '--ancho=1600').split('=')[1]);
const MIN_AHORRO = 0.15;
const CALIDAD = 82;

const IMG_RE = /\.(jpe?g|png|webp)$/i; // gif/svg fuera: animados y vectoriales
const kb = (n) => Math.round(n / 1024);

async function listarTodo(sb) {
  const out = [];
  const pendientes = [''];
  while (pendientes.length) {
    const prefijo = pendientes.shift();
    let offset = 0;
    for (;;) {
      const { data, error } = await sb.storage.from(BUCKET).list(prefijo || undefined, { limit: 100, offset });
      if (error) throw new Error(`list ${prefijo}: ${error.message}`);
      if (!data || !data.length) break;
      for (const f of data) {
        const ruta = prefijo ? `${prefijo}/${f.name}` : f.name;
        if (f.id === null || (f.metadata === null && !f.name.includes('.'))) pendientes.push(ruta);
        else if (IMG_RE.test(ruta)) out.push({ ruta, bytes: f.metadata?.size || 0, mime: f.metadata?.mimetype || '' });
      }
      if (data.length < 100) break;
      offset += 100;
    }
  }
  return out;
}

/* Recompresión conservando el formato y, por tanto, el Content-Type. */
async function recomprimir(buf, mime, ruta) {
  const img = sharp(buf, { failOn: 'none' }).rotate(); // rotate() respeta la orientación EXIF
  const meta = await img.metadata();
  const ancho = meta.width || 0;
  const alto = meta.height || 0;
  const escala = ancho > MAX_ANCHO ? MAX_ANCHO / ancho : 1;
  const lienzo = escala < 1
    ? img.resize(MAX_ANCHO, Math.max(1, Math.round(alto * escala)), { withoutEnlargement: true })
    : img;

  let salida;
  if (/png$/i.test(ruta)) {
    // `palette` cuantiza color (clave para fotos guardadas como PNG) y
    // conserva la transparencia. `effort` alto = mejor ratio, más lento.
    salida = await lienzo.png({ compressionLevel: 9, palette: true, quality: 90, effort: 7 }).toBuffer();
  } else if (/webp$/i.test(ruta)) {
    salida = await lienzo.webp({ quality: CALIDAD, effort: 5 }).toBuffer();
  } else {
    salida = await lienzo.jpeg({ quality: CALIDAD, mozjpeg: true, progressive: true }).toBuffer();
  }
  return { bytes: salida.length, buf: salida, ancho: Math.round(ancho * escala), alto: Math.round(alto * escala), mime };
}

(async () => {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en backend/.env');
    process.exit(1);
  }
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });
  const todo = (await listarTodo(sb)).filter((o) => o.bytes >= MIN_KB * 1024).sort((a, b) => b.bytes - a.bytes);

  console.log(`${APLICAR ? 'APLICANDO' : 'INFORME (dry-run)'} · ${todo.length} imágenes >= ${MIN_KB} KB · ancho máx ${MAX_ANCHO}px\n`);

  const backupDir = path.join(__dirname, '..', 'backups', 'storage-' + new Date().toISOString().slice(0, 10));
  if (APLICAR) fs.mkdirSync(backupDir, { recursive: true });

  const cambios = [];
  let antesTotal = 0;
  let despuesTotal = 0;

  for (const obj of todo) {
    antesTotal += obj.bytes;
    despuesTotal += obj.bytes; // se corrige abajo si hay ganancia
    try {
      const { data, error } = await sb.storage.from(BUCKET).download(obj.ruta);
      if (error) throw new Error(error.message);
      const original = Buffer.from(await data.arrayBuffer());

      const r = await recomprimir(original, obj.mime, obj.ruta);
      const ahorro = 1 - r.bytes / obj.bytes;
      const gana = ahorro >= MIN_AHORRO && r.bytes < obj.bytes;

      const linea = `${String(kb(obj.bytes)).padStart(6)} KB → ${String(kb(r.bytes)).padStart(6)} KB  (${String(Math.round(ahorro * 100)).padStart(3)}%)  ${r.ancho}px  ${obj.ruta}`;
      if (!gana) { console.log(`  ·  sin ganancia  ${linea}`); continue; }
      console.log(`  ${APLICAR ? '✔' : '·'}  ${linea}`);

      if (!APLICAR) { despuesTotal -= obj.bytes - r.bytes; cambios.push({ ...obj, nuevos: r.bytes }); continue; }

      /* 1) copia de seguridad con la ruta espejo */
      const destino = path.join(backupDir, obj.ruta.replace(/\//g, '__'));
      fs.writeFileSync(destino, original);

      /* 2) sobrescribir en la MISMA ruta (la URL no cambia) */
      const up = await sb.storage.from(BUCKET).upload(obj.ruta, r.buf, {
        contentType: obj.mime || 'application/octet-stream',
        upsert: true,
      });
      if (up.error) throw new Error('upload: ' + up.error.message);

      /* 3) verificar de verdad: 200 + tamaño nuevo */
      const url = sb.storage.from(BUCKET).getPublicUrl(obj.ruta).data.publicUrl;
      const head = await fetch(url, { method: 'HEAD' });
      const len = Number(head.headers.get('content-length') || 0);
      if (head.status !== 200 || len !== r.bytes) {
        // Restaurar: mejor una imagen pesada que una rota.
        await sb.storage.from(BUCKET).upload(obj.ruta, original, { contentType: obj.mime, upsert: true });
        throw new Error(`verificación falló (status ${head.status}, ${len} B) → original restaurado`);
      }

      despuesTotal -= obj.bytes - r.bytes;
      cambios.push({ ruta: obj.ruta, antes: obj.bytes, despues: r.bytes, backup: destino });
    } catch (e) {
      console.log(`  ✖  ${obj.ruta}: ${e.message}`);
    }
  }

  console.log(`\n${APLICAR ? 'Optimizadas' : 'Optimizables'}: ${cambios.length} de ${todo.length}`);
  console.log(`Total de esas imágenes: ${(antesTotal / 1048576).toFixed(1)} MB → ${(despuesTotal / 1048576).toFixed(1)} MB ` +
    `(−${Math.round((1 - despuesTotal / antesTotal) * 100)} %)`);

  if (APLICAR && cambios.length) {
    const manifiesto = path.join(backupDir, 'cambios.json');
    fs.writeFileSync(manifiesto, JSON.stringify({ fecha: new Date().toISOString(), bucket: BUCKET, cambios }, null, 2));
    console.log(`Originales respaldados en ${path.relative(process.cwd(), backupDir)}/`);
    console.log(`Manifiesto: ${path.relative(process.cwd(), manifiesto)}`);
  }
})();
