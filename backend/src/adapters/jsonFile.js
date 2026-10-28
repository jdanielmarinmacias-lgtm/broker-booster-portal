'use strict';
/* Adaptador JSON local (desarrollo en tu máquina): db.json + sessions.json
 * con escritura atómica. Sin red, sin cuentas. */
const fs = require('fs');
const path = require('path');

function createJsonFileAdapter(dataDir) {
  const DB_FILE = path.join(dataDir, 'db.json');
  const SES_FILE = path.join(dataDir, 'sessions.json');
  const ensure = () => fs.mkdirSync(dataDir, { recursive: true });
  const read = (f, fb) => {
    try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fb; }
    catch (e) { return fb; }
  };
  const writeAtomic = (f, obj) => {
    ensure();
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, f);
  };
  return {
    kind: 'json',
    cacheTtlMs: Infinity, // un solo proceso: la caché siempre está al día
    async loadDocuments() { ensure(); return read(DB_FILE, {}); },
    async saveDocuments(obj) { writeAtomic(DB_FILE, obj); },
    async saveCollections(obj, names) {
      const cur = read(DB_FILE, {});
      for (const n of (names || [])) {
        if (n in obj) cur[n] = obj[n];
      }
      writeAtomic(DB_FILE, cur);
    },
    async getUserByUsername(username) {
      const users = read(DB_FILE, {}).users || [];
      return users.find((x) => String(x.username).toLowerCase() === String(username).toLowerCase()) || null;
    },
    async getUserById(id) {
      const users = read(DB_FILE, {}).users || [];
      return users.find((x) => String(x.id) === String(id)) || null;
    },
    async listUsers() { return (read(DB_FILE, {}).users || []).slice(); },
    async upsertUser() { /* el write-through de documents ya persiste users */ },
    async deleteUser() { /* idem */ },
    async getSession(token) { return read(SES_FILE, {})[token] || null; },
    async setSession(token, s) {
      const all = read(SES_FILE, {});
      all[token] = s;
      writeAtomic(SES_FILE, all);
    },
    async deleteSession(token) {
      const all = read(SES_FILE, {});
      delete all[token];
      writeAtomic(SES_FILE, all);
    },
    async pruneSessions(beforeMs) {
      const limit = Number(beforeMs) || Date.now();
      const all = read(SES_FILE, {});
      let removed = 0;
      for (const token of Object.keys(all)) {
        if (!all[token] || !(all[token].expiresAt >= limit)) { delete all[token]; removed++; }
      }
      if (removed) writeAtomic(SES_FILE, all);
      return removed;
    },
    async listFeed(limit) {
      const data = read(DB_FILE, {});
      return (data.publicFeed || []).slice(-Math.min(Number(limit) || 20, 50)).reverse();
    },
    async ensureMediaBucket() { /* sin Storage local: disco */ },
    async pushFeed(item) {
      const data = read(DB_FILE, {});
      data.publicFeed = data.publicFeed || [];
      const row = { id: Date.now(), created_at: new Date().toISOString(), ...item };
      data.publicFeed.push(row);
      writeAtomic(DB_FILE, data);
      return row;
    },
  };
}

module.exports = { createJsonFileAdapter };
