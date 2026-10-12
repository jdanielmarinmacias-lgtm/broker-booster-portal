'use strict';
/* Importa un export de localStorage 'pepes_v3_db':
 *   npm run import -- ./respaldo-pepes.json
 * Conserva colecciones; hashea claves en claro; sin clave → hash aleatorio
 * + mustChangePassword. Funciona contra cualquier adaptador. */
const fs = require('fs');
const db = require('./db');
const passwords = require('./passwords');
const config = require('./config');
const { createStore, selectAdapter } = require('./store');

async function importFile(store, filePath) {
  await store.init();
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const data = store.get();
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'users' && Array.isArray(v)) {
      data.users = v.map((u) => {
        const copy = { ...u };
        if (copy.password && !passwords.isHash(copy.password)) {
          copy.passwordHash = passwords.hash(copy.password);
          copy.passwordMigratedAt = new Date().toISOString();
          delete copy.password;
        } else if (!copy.passwordHash) {
          copy.passwordHash = passwords.hash('__sin-clave__' + Math.random().toString(36));
          copy.mustChangePassword = true;
        }
        return copy;
      });
    } else {
      data[k] = v;
    }
  }
  if (!Array.isArray(data.auditoria)) data.auditoria = [];
  db.audit(data, 'import_localstorage', null, { archivo: filePath });
  await store.persist();
  return { colecciones: Object.keys(raw).length, usuarios: (data.users || []).length };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Uso: npm run import -- ./respaldo.json'); process.exit(1); }
  (async () => {
    const store = createStore(selectAdapter(config));
    const r = await importFile(store, file);
    console.log(`Import OK: ${r.colecciones} colecciones, ${r.usuarios} usuarios (claves en hash).`);
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { importFile };
