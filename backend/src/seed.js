'use strict';
/* Seed inicial: los 7 usuarios del portal con contraseña bootstrap (hash scrypt)
 * y mustChangePassword=true. NO sobreescribe DB existente. `npm run seed` */
const config = require('./config');
const db = require('./db');
const passwords = require('./passwords');
const { createStore, selectAdapter } = require('./store');

const SEEDS = [
  { id: 0, username: 'gmteo', role: 'gm', name: 'GM Teo', email: 'gm@portal.com', xp: 9999 },
  { id: 5, username: 'gmmarin', role: 'gm', name: 'GM Marín', email: 'gmmarin@portal.com', xp: 0 },
  { id: 6, username: 'gmvillegas', role: 'gm', name: 'GM Villegas', email: 'gmvillegas@portal.com', xp: 0 },
  { id: 1, username: 'admin', role: 'admin', name: 'Admin Principal', email: 'admin@pepes.com', xp: 0 },
  { id: 2, username: 'maestro', role: 'maestro', name: 'Prof. García', email: 'maestro@pepes.com', xp: 0, students: [3] },
  { id: 3, username: 'alumno', role: 'alumno', name: 'Ana López', email: 'alumno@pepes.com', xp: 150 },
  { id: 4, username: 'editor', role: 'editor', name: 'Editor Contenidos', email: 'editor@pepes.com', xp: 0 },
];

async function seed(store, seedPassword) {
  await store.init();
  const data = store.get();
  if (Array.isArray(data.users) && data.users.length > 0) {
    return { created: false, reason: 'DB ya tiene usuarios' };
  }
  data.users = SEEDS.map((s) => ({
    ...s,
    avatar: `https://i.pravatar.cc/40?u=${s.username}`,
    students: s.students || [],
    phone: '521000000000',
    passwordHash: passwords.hash(seedPassword),
    mustChangePassword: true,
  }));
  if (!data.rolePermissions || Array.isArray(data.rolePermissions)) data.rolePermissions = {};
  if (!Array.isArray(data.auditoria)) data.auditoria = [];
  db.audit(data, 'seed_inicial', null, { usuarios: data.users.length });
  await store.persist();
  return { created: true, usuarios: data.users.length };
}

if (require.main === module) {
  (async () => {
    const store = createStore(selectAdapter(config));
    const r = await seed(store, config.seedPassword);
    console.log(r.created
      ? `Seed OK (${store.adapter.kind}): ${r.usuarios} usuarios. Cambia SEED_PASSWORD en producción.`
      : `Seed omitido: ${r.reason}`);
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed, SEEDS };
