'use strict';
/* Adaptador en memoria (tests y fallback). Interfaz que todo adaptador cumple:
 * loadDocuments/saveDocuments · getUserByUsername/getUserById/listUsers/upsertUser/deleteUser
 * getSession/setSession/deleteSession · pushFeed · kind · cacheTtlMs */
function createMemoryAdapter(initial) {
  let docs = initial ? JSON.parse(JSON.stringify(initial)) : {};
  const sessions = new Map();
  const feed = [];
  if (!Array.isArray(docs.users)) docs.users = [];
  return {
    kind: 'memory',
    cacheTtlMs: Infinity,
    async loadDocuments() { return JSON.parse(JSON.stringify(docs)); },
    async saveDocuments(obj) { docs = JSON.parse(JSON.stringify(obj)); },
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
    async getSession(token) { return sessions.get(token) || null; },
    async setSession(token, s) { sessions.set(token, s); },
    async deleteSession(token) { sessions.delete(token); },
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
