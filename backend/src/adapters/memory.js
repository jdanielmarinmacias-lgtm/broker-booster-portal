'use strict';
/* Adaptador en memoria (tests y fallback). Interfaz que todo adaptador cumple:
 * loadDocuments/saveDocuments · getUserByUsername/getUserById/listUsers/upsertUser/deleteUser
 * getSession/setSession/deleteSession · pushFeed · kind · cacheTtlMs */
function createMemoryAdapter(initial) {
  let docs = initial ? JSON.parse(JSON.stringify(initial)) : {};
  const sessions = new Map();
  const feed = [];
  /* Estado efímero compartido (cuota IA / intentos de login). En memoria no
   * hay concurrencia real: el evento de Node es el punto de serialización. */
  const estados = new Map();
  const claveEstado = (col, id) => String(col) + '∅' + String(id);
  if (!Array.isArray(docs.users)) docs.users = [];
  return {
    kind: 'memory',
    cacheTtlMs: Infinity,
    async loadDocuments() { return JSON.parse(JSON.stringify(docs)); },
    async saveDocuments(obj) { docs = JSON.parse(JSON.stringify(obj)); },
    async saveCollections(obj, names) {
      const next = JSON.parse(JSON.stringify(docs));
      for (const n of (names || [])) {
        if (n in obj) next[n] = JSON.parse(JSON.stringify(obj[n]));
      }
      docs = next;
    },
    async getUserByUsername(username) {
      return (docs.users || []).find((x) => String(x.username).toLowerCase() === String(username).toLowerCase()) || null;
    },
    async getUserById(id) {
      return (docs.users || []).find((x) => String(x.id) === String(id)) || null;
    },
    async listUsers() { return JSON.parse(JSON.stringify(docs.users || [])); },
    async upsertUser(row) {
      docs.users = docs.users || [];
      const i = docs.users.findIndex((x) => String(x.id) === String(row.id));
      if (i >= 0) docs.users[i] = JSON.parse(JSON.stringify(row));
      else docs.users.push(JSON.parse(JSON.stringify(row)));
    },
    async deleteUser(id) { docs.users = (docs.users || []).filter((x) => String(x.id) !== String(id)); },
    async getEstado(collection, docId) {
      const v = estados.get(claveEstado(collection, docId));
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    async putEstado(collection, docId, value) {
      const next = JSON.parse(JSON.stringify(value || {}));
      next._t = Date.now();
      estados.set(claveEstado(collection, docId), next);
    },
    async bumpEstado(collection, docId, field, delta) {
      const k = claveEstado(collection, docId);
      const cur = estados.get(k) || {};
      const next = Math.max(0, Number(cur[field] || 0) + Number(delta || 0));
      estados.set(k, { ...cur, [field]: next, _t: Date.now() });
      return next;
    },
    async pruneEstado(collection, antesDeMs) {
      const limite = Number(antesDeMs) || 0;
      let removed = 0;
      for (const [k, v] of estados) {
        if (!k.startsWith(String(collection) + '∅')) continue;
        if (Number(v && v._t) < limite) { estados.delete(k); removed++; }
      }
      return removed;
    },
    async getSession(token) { return sessions.get(token) || null; },
    async setSession(token, s) { sessions.set(token, s); },
    async deleteSession(token) { sessions.delete(token); },
    async pruneSessions(beforeMs) {
      const limit = Number(beforeMs) || Date.now();
      let removed = 0;
      for (const [token, s] of sessions) {
        if (!s || !(s.expiresAt >= limit)) { sessions.delete(token); removed++; }
      }
      return removed;
    },
    async pushFeed(item) {
      feed.push({ id: Date.now(), created_at: new Date().toISOString(), ...item });
      return feed[feed.length - 1];
    },
    async listFeed(limit) {
      return feed.slice(-Math.min(Number(limit) || 20, 50)).reverse();
    },
    async ensureMediaBucket() { /* sin Storage en memoria */ },
    _feed: feed,
  };
}

module.exports = { createMemoryAdapter };
