'use strict';
/* ============================================================================
 * scripts/migrate-uploads.js — Lleva al Storage las rutas /uploads/<archivo>
 *
 * Por qué: el backend local guarda las subidas en disco y devuelve
 * `/uploads/<archivo>`, una ruta que solo existe en ese ordenador. Si el
 * documento llegó a la base compartida (sync desde otro equipo o import), la
 * imagen aparece rota para todos los demás.
 *
 * Qué hace, fila por fila de `documents`:
 *   1. Si el archivo está en backend/data/uploads, lo sube al bucket y guarda
 *      su URL pública (la imagen se conserva).
 *   2. Si el archivo ya no existe, quita la referencia (la interfaz muestra su
 *      hueco en vez de una imagen rota).
 * Deja un respaldo JSON con las filas antes/después en backups/.
 *
 * Uso: cd backend && node scripts/migrate-uploads.js [--dry]
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const uploads = require('../src/uploads');
const { createSupabaseAdapter } = require('../src/adapters/supabase');

const DRY = process.argv.includes('--dry');
const UPLOADS_DIR = path.join(config.dataDir, 'uploads');

(async () => {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en backend/.env');
    process.exit(1);
  }
  const adapter = createSupabaseAdapter({
    url: config.supabaseUrl,
    serviceKey: config.supabaseServiceKey,
    uploadsDir: UPLOADS_DIR,
  });
  await adapter.ensureMediaBucket();

  const rows = await adapter.loadRawDocuments();
  const cambios = [];
  let filasAfectadas = 0;
  let migradas = 0;
  let quitadas = 0;

  for (const row of rows) {
    let json = '';
    try { json = JSON.stringify(row.data || {}); } catch (e) { continue; }
    if (!json.includes('/uploads/')) continue;
    const antes = JSON.parse(json);
    const r = await uploads.migrarValor(row.data, async (nombre) => {
      const buf = uploads.leerLocal(UPLOADS_DIR, nombre);
      if (!buf) return null;
      if (DRY) return '/media/(se subiría) ' + nombre;
      return adapter.externalizarUploadLocal(nombre, buf);
    });
    if (!r.migradas && !r.quitadas) continue;
    filasAfectadas++;
    migradas += r.migradas;
    quitadas += r.quitadas;
    cambios.push({
      collection: row.collection,
      doc_id: row.doc_id,
      antes,
      despues: row.data,
      migradas: r.migradas,
      quitadas: r.quitadas,
    });
  }

  console.log('filas revisadas:', rows.length);
  console.log('filas con /uploads:', filasAfectadas);
  console.log('  archivos migrados al Storage:', migradas);
  console.log('  referencias muertas retiradas:', quitadas);

  if (!cambios.length) {
    console.log(DRY ? 'Dry run: no hay nada que migrar.' : 'Nada que migrar: la base está limpia.');
    return;
  }
  if (DRY) {
    cambios.forEach((c) => console.log('  ·', c.collection + '/' + c.doc_id, '→', c.migradas, 'migradas,', c.quitadas, 'retiradas'));
    console.log('Dry run: no se escribió nada.');
    return;
  }

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const respaldo = path.join(dir, 'migrate-uploads-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(respaldo, JSON.stringify(cambios, null, 2));
  console.log('respaldo:', respaldo);

  const cols = new Set();
  for (const c of cambios) {
    await adapter.putRawDocument(c.collection, c.doc_id, c.despues);
    cols.add(c.collection);
  }
  try { await adapter.touchVersions([...cols]); } catch (e) { /* best-effort */ }
  console.log('actualizadas:', cambios.length, 'filas en', cols.size, 'colecciones');
})().catch((e) => { console.error(e); process.exit(1); });
