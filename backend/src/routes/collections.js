'use strict';
/* API genérica por colección (async, stateless):
 * GET|POST /api/data/:collection · PUT|DELETE /api/data/:collection/:id
 * Permisos según matriz de roles. `users` excluido (ruta propia).
 * Publicaciones nuevas en colecciones escaparate → espejo a public_feed
 * (Realtime: la portada se entera en vivo).
 * Sin sesión: GET /api/public/portal y GET /api/public/config. */
const express = require('express');
const db = require('../db');
const roles = require('../roles');
const mw = require('../middleware');

const FORBIDDEN = new Set(['users', 'sessions']);
const FEED_COLLECTIONS = new Set(['inmPublica', 'autoHub', 'posts', 'carruselCirculares']);

const feedTitle = (collection, rec) => rec.titulo || rec.title || rec.nombre || rec.name
  || (`Nuevo en ${collection}`);

module.exports = (store, config) => {
  const r = express.Router();

  r.get('/public/portal', async (req, res, next) => {
    try {
      await store.refreshIfStale();
      const data = store.get();
      const settings = data.settings || {};
      res.json({
        ok: true,
        portal: {
          institutionName: settings.institutionName || 'Broker Booster',
          logo: settings.logo || null,
          autosDisponibles: (data.autoHub || []).length,
          propiedadesPublicadas: (data.inmPublica || []).length,
        },
      });
    } catch (e) { next(e); }
  });

  /* Config pública para el realtime del frontend (la ANON key es pública por
   * diseño; RLS solo le permite leer public_feed). */
  r.get('/public/config', (req, res) => {
    const realtime = !!(config.supabaseUrl && config.supabaseAnonKey);
    res.json({
      ok: true,
      realtime,
      supabaseUrl: realtime ? config.supabaseUrl : null,
      anonKey: realtime ? config.supabaseAnonKey : null,
    });
  });

  const api = express.Router();
  api.use(mw.requireAuth);

  api.get('/:collection', async (req, res, next) => {
    try {
      const { collection } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canRead(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de lectura' });
      let items = db.collection(store.get(), collection).slice();
      if (req.query.q) {
        const q = String(req.query.q).toLowerCase();
        items = items.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
      }
      res.json({ ok: true, items });
    } catch (e) { next(e); }
  });

  api.post('/:collection', async (req, res, next) => {
    try {
      const { collection } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canWrite(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      const rec = { ...(req.body || {}), id: db.newId() };
      db.collection(store.get(), collection).push(rec);
      db.audit(store.get(), `creacion_${collection}`, req.user, { id: rec.id });
      await store.persist();
      if (FEED_COLLECTIONS.has(collection)) {
        store.pushFeed({ kind: collection, title: feedTitle(collection, rec) }).catch(() => {});
      }
      res.status(201).json({ ok: true, item: rec });
    } catch (e) { next(e); }
  });

  api.put('/:collection/:id', async (req, res, next) => {
    try {
      const { collection, id } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canWrite(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      const col = db.collection(store.get(), collection);
      const rec = db.byId(col, id);
      if (!rec) return res.status(404).json({ ok: false, error: 'No encontrado' });
      Object.assign(rec, req.body || {}, { id: rec.id });
      db.audit(store.get(), `edicion_${collection}`, req.user, { id: rec.id });
      await store.persist();
      res.json({ ok: true, item: rec });
    } catch (e) { next(e); }
  });

  api.delete('/:collection/:id', async (req, res, next) => {
    try {
      const { collection, id } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canWrite(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      const data = store.get();
      const before = (data[collection] || []).length;
      data[collection] = (data[collection] || []).filter((x) => String(x.id) !== String(id));
      if (data[collection].length === before) return res.status(404).json({ ok: false, error: 'No encontrado' });
      db.audit(data, `borrado_${collection}`, req.user, { id });
      await store.persist();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.use('/data', api);
  return r;
};
