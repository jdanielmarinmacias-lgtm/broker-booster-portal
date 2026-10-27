'use strict';
/* ============================================================================
 * scripts/externalize-media.js — Archivos embebidos → Supabase Storage
 *
 * Los avatares de usuario y el logo del portal se guardaron como dataURL
 * dentro del JSON. Eso hacía dos cosas:
 *  · /api/auth/me y /api/data/bundle devolvían cientos de KB de base64 en
 *    cada carga (portal lento, imágenes de academia/publicidad tardando).
 *  · Los upserts viajaban con el archivo dentro: timeouts y HTTP 500.
 *
 * Este script sube cada dataURL al bucket público `portal-media` y lo
 * reemplaza por su URL. Idempotente: si ya es una URL, no la toca.
 *
 * Uso: cd backend && node scripts/externalize-media.js [--dry]
 * ========================================================================== */
const config = require('../src/config');
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry');
const BUCKET = 'portal-media';
const DATAURL = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

function parse(dataUrl) {
  const m = String(dataUrl).match(DATAURL);
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2].replace(/\s/g, ''), 'base64') };
}

(async () => {
  const sb = createClient(config.supabaseUrl, config.serviceKey || config.supabaseServiceKey,
    { auth: { persistSession: false } });
  let subidos = 0;
  let bytes = 0;

  async function externalizar(nombre, valor) {
    const p = parse(valor);
    if (!p) return null;
    bytes += p.buf.length;
    if (DRY) { subidos++; return 'https://dry/' + nombre; }
    const ruta = 'inline/' + nombre + '-' + Date.now() + '.' + (EXT[p.mime] || 'bin');
    const { error } = await sb.storage.from(BUCKET).upload(ruta, p.buf, { contentType: p.mime, upsert: true });
    if (error) { console.error('  subida falló', nombre, error.message); return null; }
    subidos++;
    return sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  // 1) Avatares de usuarios
  const { data: users, error: uerr } = await sb.from('app_users').select('id,profile');
  if (uerr) { console.error(uerr.message); process.exit(1); }
  for (const u of users) {
    const avatar = u.profile && u.profile.avatar;
    if (typeof avatar !== 'string' || !avatar.startsWith('data:')) continue;
    const url = await externalizar('avatar-u' + u.id, avatar);
    if (!url) continue;
    const profile = { ...(u.profile || {}), avatar: url };
    if (!DRY) {
      const { error } = await sb.from('app_users').update({ profile }).eq('id', u.id);
      if (error) console.error('  usuario', u.id, error.message);
    }
    console.log('  avatar', u.id, '→', url.slice(0, 70));
  }

  // 2) Documentos (logo, publicidad, academia…)
  const { data: docs } = await sb.from('documents').select('collection,doc_id,data');
  for (const d of docs || []) {
    if (d.collection === 'auditoria') continue; // ya se compacta aparte
    const data = d.data || {};
    let cambios = 0;
    const nodos = [];
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'string' && v.startsWith('data:')) nodos.push({ node, k, v, path: path + '.' + k });
        else if (v && typeof v === 'object') walk(v, path + '.' + k);
      }
    })(data, d.collection);
    for (const n of nodos) {
      const p = parse(n.v);
      if (!p) continue;
      const url = await externalizar('doc-' + d.collection + '-' + n.k, n.v);
      if (!url) continue;
      n.node[n.k] = url;
      cambios++;
      console.log('  ', d.collection + n.path, '→', url.slice(0, 70));
    }
    if (cambios && !DRY) {
      const { error } = await sb.from('documents').update({ data, updated_at: new Date().toISOString() })
        .eq('collection', d.collection).eq('doc_id', d.doc_id);
      if (error) console.error('  doc', d.collection, error.message);
    }
  }

  console.log('\nArchivos externalizados:', subidos, '·', (bytes / 1048576).toFixed(2), 'MB liberados del JSON');
})().catch((e) => { console.error(e); process.exit(1); });
