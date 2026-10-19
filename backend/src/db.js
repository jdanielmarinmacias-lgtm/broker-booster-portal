'use strict';
/* Persistencia JSON propia (etapa previa a una DB real).
 * - Un solo archivo db.json con todas las colecciones (misma forma que pepes_v3_db).
 * - Escritura atómica (tmp + rename) para no corromper ante caídas.
 * - Las contraseñas viven SOLO aquí, con hash. Jamás salen por la API. */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const DB_FILE = path.join(config.dataDir, 'db.json');

function ensureDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return null;
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save(db) {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

function collection(db, name) {
  if (!Array.isArray(db[name])) db[name] = [];
  return db[name];
}

const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
const byId = (col, id) => col.find((x) => String(x.id) === String(id)) || null;

/* Copia segura de usuario para respuestas API: SIN password ni hash. */
function safeUser(u) {
  if (!u) return null;
  const { password, passwordHash, ...safe } = u;
  return safe;
}

function audit(db, tipo, actor, detalle) {
  const col = collection(db, 'auditoria');
  const entry = {
    id: newId(),
    tipo,
    fecha: new Date().toISOString(),
    usuarioId: actor ? actor.id : null,
    usuarioNombre: actor ? (actor.name || actor.username) : 'sistema',
    ...(detalle || {}),
  };
  col.push(entry);
  // #1 Refuerzo: cota de auditoría a los últimos 500 registros para evitar crecimiento infinito
  if (col.length > 500) {
    col.splice(0, col.length - 500);
  }
  return entry;
}

module.exports = { DB_FILE, load, save, collection, newId, byId, safeUser, audit };
