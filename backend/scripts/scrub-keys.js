'use strict';
/* ============================================================================
 * scripts/scrub-keys.js — Rotación/limpieza de claves expuestas (Fase 0)
 *
 * Busca claves de API guardadas en la base compartida y las elimina:
 *   · practicaConfig: apiKey/api_key/secret/token/password.
 *   · settings: groq_api_key, openai_api_key, elevenlabs_api_key y variantes.
 *   · cualquier documento con un campo *apiKey* cuyo valor parezca una clave
 *     real (gsk_, sk-, AIza, hf_, xox…) se reporta y se limpia si está en las
 *     colecciones de configuración; el resto se reporta para revisión manual.
 *
 * La CLAVE REAL del proveedor (GROQ_API_KEY, etc.) vive en Vercel/env, no en
 * esta base. Este script limpia copias; la rotación se hace en el proveedor y
 * en las variables de entorno (ver README).
 *
 * Uso:
 *   cd backend
 *   npm run db:scrub-keys              # simulación (no escribe)
 *   npm run db:scrub-keys -- --apply   # elimina los campos encontrados
 *   npm run db:scrub-keys -- --apply --revoke-sessions
 *
 * `--revoke-sessions` cierra TODAS las sesiones activas (obliga a re-login).
 * Úsalo solo si sospechas que una cookie/token pudo filtrarse.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY = !APPLY;
const REVOKE = args.includes('--revoke-sessions');

const CAMPOS_SECRETOS = /^(apiKey|api_key|secret|token|password|authorization)$/i;
const CAMPOS_SETTINGS = /^(apiKey|api_key|groq_api_key|groqApiKey|openai_api_key|openaiApiKey|elevenlabs_api_key|elevenlabsApiKey)$/i;
const PATRON_CLAVE = /^(gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|hf_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})$/;

const mask = (v) => {
  if (typeof v !== 'string') return typeof v;
  if (!v) return 'vacío';
  return v.slice(0, 4).replace(/[A-Za-z0-9]/g, '•') + '… (' + v.length + ' chars)';
};

function limpiarObjeto(obj, regex) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { valor: obj, quitados: [] };
  const out = { ...obj };
  const quitados = [];
  for (const k of Object.keys(out)) {
    if (regex.test(k)) { quitados.push(k + '=' + mask(out[k])); delete out[k]; }
  }
  return { valor: out, quitados };
}

function revisarDocumento(row, hallazgos) {
  const col = row.collection;
  let data = row.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { cambiado: false, data };

  const antes = JSON.stringify(data);
  let cambiado = false;
  let quitados = [];

  if (col === 'practicaConfig') {
    const r = limpiarObjeto(data, CAMPOS_SECRETOS);
    data = r.valor; quitados = r.quitados;
    cambiado = quitados.length > 0;
  } else if (col === 'settings') {
    const r = limpiarObjeto(data, CAMPOS_SETTINGS);
    data = r.valor; quitados = r.quitados;
    cambiado = quitados.length > 0;
  }

  /* Reporte de cualquier otro campo con pinta de clave (no se borra solo). */
  const walk = (node, p) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && PATRON_CLAVE.test(v)) {
        hallazgos.push(`${col}/${row.doc_id} → ${p}${k} = ${mask(v)}`);
      }
      if (v && typeof v === 'object') walk(v, p + k + '.');
    }
  };
  walk(data, '');

  return { cambiado: cambiado || JSON.stringify(data) !== antes, data, quitados };
}

async function scrubSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents')
      .select('collection,doc_id,data').range(from, from + 999);
    if (error) throw new Error('documents: ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const hallazgos = [];
  const cambios = [];
  for (const row of rows) {
    const r = revisarDocumento(row, hallazgos);
    if (r.cambiado) cambios.push({ row, data: r.data, quitados: r.quitados });
  }

  console.log('Origen:', 'supabase');
  console.log('Documentos revisados:', rows.length);
  console.log('Documentos a limpiar:', cambios.length);
  for (const c of cambios) {
    console.log(`  ${c.row.collection}/${c.row.doc_id}: ${c.quitados.join(', ') || 'objeto saneado'}`);
  }
  console.log('Claves con patrón detectadas:', hallazgos.length);
  for (const h of hallazgos.slice(0, 40)) console.log('  -', h);

  if (!DRY) {
    for (const c of cambios) {
      const { error } = await sb.from('documents')
        .update({ data: c.data, updated_at: new Date().toISOString() })
        .eq('collection', c.row.collection).eq('doc_id', c.row.doc_id);
      if (error) console.error('  error al actualizar', c.row.doc_id, error.message);
    }
    console.log('Documentos actualizados:', cambios.length);
  }

  if (REVOKE) {
    if (DRY) {
      console.log('[dry] se revocarían todas las sesiones activas');
    } else {
      const { data, error } = await sb.from('app_sessions').delete().neq('token', '').select('token');
      if (error) console.error('  error al revocar sesiones:', error.message);
      else console.log('Sesiones revocadas:', (data || []).length);
    }
  }
}

function scrubLocal() {
  const file = path.join(config.dataDir, 'db.json');
  if (!fs.existsSync(file)) throw new Error('No existe ' + file);
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = [];
  for (const [collection, value] of Object.entries(db)) {
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => rows.push({ collection, doc_id: String(item && item.id), data: item }));
    } else {
      rows.push({ collection, doc_id: '__object__', data: value });
    }
  }

  const hallazgos = [];
  const cambios = [];
  for (const row of rows) {
    const r = revisarDocumento(row, hallazgos);
    if (r.cambiado) cambios.push({ row, data: r.data, quitados: r.quitados });
  }

  console.log('Origen:', 'json');
  console.log('Documentos revisados:', rows.length);
  console.log('Documentos a limpiar:', cambios.length);
  for (const c of cambios) console.log(`  ${c.row.collection}/${c.row.doc_id}: ${c.quitados.join(', ') || 'objeto saneado'}`);
  console.log('Claves con patrón detectadas:', hallazgos.length);
  for (const h of hallazgos.slice(0, 40)) console.log('  -', h);

  if (!DRY && cambios.length) {
    for (const c of cambios) {
      if (c.row.doc_id === '__object__') db[c.row.collection] = c.data;
      else {
        const ix = (db[c.row.collection] || []).findIndex((x) => String(x && x.id) === c.row.doc_id);
        if (ix >= 0) db[c.row.collection][ix] = c.data;
      }
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }

  if (REVOKE) {
    const ses = path.join(config.dataDir, 'sessions.json');
    if (DRY) console.log('[dry] se revocarían todas las sesiones locales');
    else { fs.writeFileSync(ses, '{}'); console.log('Sesiones locales revocadas'); }
  }
}

(async () => {
  console.log(DRY ? 'MODO SIMULACIÓN (usa --apply para escribir)' : 'MODO APLICAR');
  if (config.supabaseUrl && config.supabaseServiceKey) await scrubSupabase();
  else scrubLocal();
  if (DRY) console.log('\nNo se escribió nada.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
