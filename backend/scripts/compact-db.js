'use strict';
/* ============================================================================
 * scripts/compact-db.js — Limpieza ÚNICA de la base (Supabase)
 *
 * Por qué: la colección `auditoria` acumuló 26 MB de 26.7 MB totales (898
 * filas, una de 1.65 MB) porque guardaba usuarios/fotos COMPLETOS en base64.
 * Cada lectura y cada guardado arrastraba esos MBs: statement_timeout
 * (HTTP 500 en carruselCirculares), sesión "no verificable" (401 en cascada
 * de settings/loginAttempts) y el portal quedándose en localStorage.
 *
 * Qué hace (seguro e idempotente):
 *  1. Respalda TODAS las filas de `documents` en backups/compact-<fecha>.json.
 *  2. Compacta las entradas de auditoría: dataURLs → '[archivo]' y textos
 *     largos recortados. El registro (quién, qué, cuándo) se conserva.
 *  3. Conserva las 300 entradas de auditoría más recientes.
 *  4. Poda public_feed (300 visibles) y borra marcas internas 'version:%'.
 *  5. Borra sesiones expiradas.
 *
 * Uso: cd backend && node scripts/compact-db.js [--dry]
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry');
const MAX_STR = 400;
const AUDIT_KEEP = 300;
const FEED_KEEP = 300;

function compact(v, depth) {
  depth = depth || 0;
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    if (/^data:/i.test(v)) return '[archivo]';
    return v.length > MAX_STR ? v.slice(0, MAX_STR) + '…' : v;
  }
  if (typeof v !== 'object') return v;
  if (depth >= 3) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) return v.slice(0, 25).map((x) => compact(x, depth + 1));
  const out = {};
  for (const k of Object.keys(v)) out[k] = compact(v[k], depth + 1);
  return out;
}
function compactAuditRow(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  for (const k of Object.keys(out)) {
    if (['id', 'tipo', 'fecha', 'usuarioId', 'usuarioNombre'].includes(k)) continue;
    out[k] = compact(out[k]);
  }
  return out;
}
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

(async () => {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en backend/.env');
    process.exit(1);
  }
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });

  // 1) Descargar todo + respaldo
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents').select('collection,doc_id,data,updated_at').range(from, from + 999);
    if (error) { console.error('Error leyendo documents:', error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const before = rows.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r.data || {}), 'utf8'), 0);
  const auditRows = rows.filter((r) => r.collection === 'auditoria')
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  console.log('Filas:', rows.length, '· auditoría:', auditRows.length, '· total:', mb(before));

  if (!DRY) {
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'compact-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(file, JSON.stringify(rows));
    console.log('Respaldo:', file, '(' + mb(Buffer.byteLength(JSON.stringify(rows))) + ')');
  }

  // 2) Compactar auditoría (idempotente: recalcula y compara)
  let compacted = 0;
  for (const r of auditRows) {
    const next = compactAuditRow(r.data || {});
    if (JSON.stringify(next) === JSON.stringify(r.data || {})) continue;
    compacted++;
    if (DRY) continue;
    const { error } = await sb.from('documents')
      .update({ data: next, updated_at: new Date().toISOString() })
      .eq('collection', 'auditoria').eq('doc_id', r.doc_id);
    if (error) console.error('  compactar', r.doc_id, '→', error.message);
  }
  console.log('Auditoría compactada:', compacted, 'filas');

  // 3) Conservar las AUDIT_KEEP más recientes
  const sobran = auditRows.slice(AUDIT_KEEP).map((r) => r.doc_id);
  if (sobran.length && !DRY) {
    for (let i = 0; i < sobran.length; i += 200) {
      const { error } = await sb.from('documents').delete()
        .eq('collection', 'auditoria').in('doc_id', sobran.slice(i, i + 200));
      if (error) console.error('  poda auditoría →', error.message);
    }
  }
  console.log('Auditoría podada:', sobran.length, 'filas antiguas');

  // 4) public_feed: fuera marcas del ticker y recorte a las últimas FEED_KEEP
  const { data: feed } = await sb.from('public_feed')
    .select('id,kind,created_at').order('created_at', { ascending: false });
  const marcadores = (feed || []).filter((f) => String(f.kind || '').startsWith('version:'));
  if (marcadores.length && !DRY) {
    await sb.from('public_feed').delete().in('id', marcadores.map((f) => f.id));
  }
  const visibles = (feed || []).filter((f) => !String(f.kind || '').startsWith('version:'));
  const feedSobra = visibles.slice(FEED_KEEP).map((f) => f.id);
  if (feedSobra.length && !DRY) {
    for (let i = 0; i < feedSobra.length; i += 200) {
      await sb.from('public_feed').delete().in('id', feedSobra.slice(i, i + 200));
    }
  }
  console.log('Feed: marcas internas', marcadores.length, '· podadas', feedSobra.length);

  // 5) Sesiones expiradas
  const { data: ses } = await sb.from('app_sessions').select('token,expires_at');
  const viejas = (ses || []).filter((s) => new Date(s.expires_at).getTime() < Date.now()).map((s) => s.token);
  if (viejas.length && !DRY) {
    for (let i = 0; i < viejas.length; i += 200) {
      await sb.from('app_sessions').delete().in('token', viejas.slice(i, i + 200));
    }
  }
  console.log('Sesiones expiradas borradas:', viejas.length);

  // Verificación final
  const after = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('documents').select('collection,doc_id,data').range(from, from + 999);
    after.push(...data);
    if (!data || data.length < 1000) break;
  }
  const afterBytes = after.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r.data || {}), 'utf8'), 0);
  console.log('\nRESULTADO: ' + mb(before) + ' → ' + mb(afterBytes) + ' (' + after.length + ' filas)');
})().catch((e) => { console.error(e); process.exit(1); });
