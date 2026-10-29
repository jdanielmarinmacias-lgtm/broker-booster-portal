'use strict';
/* ============================================================================
 * scripts/backup.js — Respaldo verificable de la base (Fase 0)
 *
 * Qué respalda:
 *   · Supabase: filas crudas de `documents` (colecciones y objetos), `app_users`
 *     (incluye hashes de contraseña) y las últimas 1,000 filas de `public_feed`.
 *   · Local: `backend/data/db.json` completo.
 *
 * Qué NO respalda:
 *   · `app_sessions` (efímeras, caducan solas) ni `collection_versions`.
 *
 * Uso:
 *   cd backend
 *   npm run db:backup                 # crea backups/backup-<fecha>.json + .sha256
 *   npm run db:backup -- --dry        # solo cuenta y muestra el destino
 *   npm run db:backup -- --keep 30    # conserva los últimos 30 respaldos
 *   npm run db:backup -- --verify     # verifica el respaldo más reciente
 *   npm run db:backup -- --verify backups/backup-....json
 *
 * El archivo contiene hashes de contraseña: trátalo como material sensible y
 * no lo subas al repositorio (backend/backups/ ya está en .gitignore).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../src/config');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const PREFIX = 'backup-';
const KEEP_DEFAULT = 14;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : fallback;
};

const DRY = has('--dry');
const VERIFY_FLAG = has('--verify');
const VERIFY_FILE = valueOf('--verify', null);
const KEEP = Math.max(1, Number(valueOf('--keep', KEEP_DEFAULT)) || KEEP_DEFAULT);
const OUT = valueOf('--out', null);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const mb = (n) => (Number(n || 0) / 1048576).toFixed(2) + ' MB';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.json'))
    .map((f) => path.join(BACKUP_DIR, f))
    .sort((a, b) => String(b).localeCompare(String(a))); // más reciente primero
}

async function dumpSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const documents = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents')
      .select('collection,doc_id,data,updated_at')
      .range(from, from + 999);
    if (error) throw new Error('documents: ' + error.message);
    documents.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const { data: users, error: uerr } = await sb.from('app_users').select('*');
  if (uerr) throw new Error('app_users: ' + uerr.message);

  /* El feed es prescindible, pero ayuda a reconstruir la portada. */
  let feed = [];
  try {
    const { data, error } = await sb.from('public_feed')
      .select('*').order('created_at', { ascending: false }).limit(1000);
    if (!error) feed = data || [];
  } catch (e) { /* el respaldo principal ya está completo */ }

  const collections = new Set(documents.map((r) => r.collection));
  return {
    source: 'supabase',
    documents,
    users: users || [],
    public_feed: feed,
    counts: {
      documents: documents.length,
      collections: collections.size,
      users: (users || []).length,
      public_feed: feed.length,
    },
  };
}

function dumpLocal() {
  const file = path.join(config.dataDir, 'db.json');
  if (!fs.existsSync(file)) {
    throw new Error('No existe ' + file + ' (¿arrancaste el backend local alguna vez?)');
  }
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    source: 'json',
    db,
    counts: {
      collections: Object.keys(db || {}).length,
      users: (db && Array.isArray(db.users)) ? db.users.length : 0,
    },
  };
}

function buildPayload(data) {
  return {
    format: 'broker-booster-backup',
    version: 1,
    generatedAt: new Date().toISOString(),
    ...data,
  };
}

function writeBackup(payload, target) {
  const json = JSON.stringify(payload);
  const buf = Buffer.from(json, 'utf8');
  const hash = sha256(buf);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, target);
  fs.writeFileSync(target + '.sha256', hash + '  ' + path.basename(target) + '\n');
  return { hash, bytes: buf.length };
}

function verifyBackup(file) {
  if (!fs.existsSync(file)) throw new Error('No existe el respaldo: ' + file);
  const buf = fs.readFileSync(file);
  const hash = sha256(buf);
  let payload;
  try { payload = JSON.parse(buf.toString('utf8')); }
  catch (e) { throw new Error('El respaldo no es JSON válido: ' + e.message); }

  if (payload.format !== 'broker-booster-backup' || Number(payload.version) !== 1) {
    throw new Error('Formato de respaldo no reconocido');
  }
  const counts = payload.counts || {};
  if (payload.source === 'supabase') {
    if (!Array.isArray(payload.documents)) throw new Error('Faltan documents');
    if (payload.documents.length !== Number(counts.documents)) {
      throw new Error('documents no coincide: ' + payload.documents.length + ' vs ' + counts.documents);
    }
    if (!Array.isArray(payload.users) || payload.users.length !== Number(counts.users)) {
      throw new Error('users no coincide con el manifiesto');
    }
  } else if (payload.source === 'json') {
    if (!payload.db || typeof payload.db !== 'object') throw new Error('Falta db local');
  } else {
    throw new Error('Origen desconocido: ' + payload.source);
  }

  const sidecar = file + '.sha256';
  let checksum = 'sin sidecar';
  if (fs.existsSync(sidecar)) {
    const esperado = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
    if (esperado !== hash) throw new Error('Checksum no coincide (archivo alterado)');
    checksum = 'sha256 OK';
  }
  return { file, hash, checksum, counts, source: payload.source, generatedAt: payload.generatedAt };
}

function pruneOldBackups() {
  const files = listBackups();
  const sobra = files.slice(KEEP);
  for (const f of sobra) {
    try { fs.unlinkSync(f); } catch (e) { /* best-effort */ }
    try { fs.unlinkSync(f + '.sha256'); } catch (e) { /* best-effort */ }
  }
  return sobra.length;
}

async function main() {
  if (VERIFY_FLAG) {
    const latest = listBackups()[0];
    const file = VERIFY_FILE
      ? path.resolve(process.cwd(), VERIFY_FILE)
      : latest;
    if (!file) throw new Error('No hay respaldos en ' + BACKUP_DIR);
    const r = verifyBackup(file);
    console.log('Respaldo VÁLIDO');
    console.log('  archivo :', r.file);
    console.log('  origen  :', r.source, '·', r.generatedAt);
    console.log('  conteo  :', JSON.stringify(r.counts));
    console.log('  hash    :', r.hash, '·', r.checksum);
    return;
  }

  const data = (config.supabaseUrl && config.supabaseServiceKey)
    ? await dumpSupabase()
    : dumpLocal();
  const payload = buildPayload(data);
  const target = OUT
    ? path.resolve(process.cwd(), OUT)
    : path.join(BACKUP_DIR, PREFIX + stamp() + '.json');

  console.log('Origen :', data.source);
  console.log('Conteo :', JSON.stringify(data.counts));

  if (DRY) {
    console.log('[dry] destino:', target);
    return;
  }

  const r = writeBackup(payload, target);
  console.log('Escrito:', target, '(' + mb(r.bytes) + ')');
  console.log('SHA256 :', r.hash);

  /* Verificación inmediata: releer el archivo y comparar el manifiesto. */
  const check = verifyBackup(target);
  console.log('Verificación:', check.checksum, '·', JSON.stringify(check.counts));

  if (!OUT) {
    const removed = pruneOldBackups();
    if (removed) console.log('Respaldos antiguos eliminados:', removed, '(conservados:', KEEP + ')');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
}

module.exports = { dumpSupabase, dumpLocal, buildPayload, writeBackup, verifyBackup, listBackups };
