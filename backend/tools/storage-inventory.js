'use strict';
/* Inventario del bucket: qué objetos existen, cuánto pesan y qué se ganaría.
 * Solo lectura. Uso: node tools/storage-inventory.js */
const config = require('../src/config');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.MEDIA_BUCKET || 'portal-media';
const IMG = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;

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
        if (f.id === null || (f.metadata === null && !f.name.includes('.'))) pendientes.push(ruta); // carpeta
        else out.push({ ruta, bytes: f.metadata?.size || 0, mime: f.metadata?.mimetype || '' });
      }
      if (data.length < 100) break;
      offset += 100;
    }
  }
  return out;
}

(async () => {
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });
  const todo = await listarTodo(sb);
  const imgs = todo.filter((o) => IMG.test(o.ruta));
  const otros = todo.filter((o) => !IMG.test(o.ruta));

  const total = todo.reduce((a, o) => a + o.bytes, 0);
  console.log(`objetos: ${todo.length} (imágenes ${imgs.length})  ·  total ${(total / 1048576).toFixed(1)} MB\n`);

  const grandes = imgs.filter((o) => o.bytes >= 300 * 1024).sort((a, b) => b.bytes - a.bytes);
  console.log(`imágenes >= 300 KB: ${grandes.length}  ·  ${(grandes.reduce((a, o) => a + o.bytes, 0) / 1048576).toFixed(1)} MB`);
  for (const g of grandes) {
    console.log(`  ${String(Math.round(g.bytes / 1024)).padStart(6)} KB  ${g.mime.padEnd(16)} ${g.ruta}`);
  }

  const resto = imgs.filter((o) => o.bytes < 300 * 1024);
  console.log(`\nimágenes < 300 KB: ${resto.length}  ·  ${(resto.reduce((a, o) => a + o.bytes, 0) / 1048576).toFixed(1)} MB`);
  console.log(`no-imágenes (pdf, video, office...): ${otros.length}`);
})();
