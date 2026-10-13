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
/* Escaparate (portada) + promotoría (encargados) + escuela/chat: todo lo nuevo
 * avisa en vivo por public_feed. El frontend re-hace pull de estas + toast. */
const FEED_COLLECTIONS = new Set([
  'inmPublica', 'autoHub', 'posts', 'carruselCirculares', 'media',
  'solicitudes', 'cotizaciones', 'ventas', 'siniestros',
  'messages', 'groupMessages', 'notifications',
  'lessons', 'liveClasses', 'exams',
]);

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

  /* Índice de colecciones sincronizables (el frontend hace pull de estas).
   * Excluye users/sessions (rutas propias) y todo lo que no sea array.
   * Incluye VACÍAS conocidas para que incógnito también las pida (si el
   * servidor aún no las tiene, el GET devuelve [] y no se pierde nada). */
  const KNOWN_EMPTY = ['ventas', 'metas', 'solicitudes', 'cotizaciones', 'siniestros',
    'lessons', 'liveClasses', 'exams', 'library', 'messages', 'groupMessages',
    'notifications', 'posts', 'auditoria'];
  api.get('/', async (req, res, next) => {
    try {
      await store.refreshIfStale();
      const data = store.get();
      const set = new Set(Object.keys(data).filter(
        (k) => !FORBIDDEN.has(k) && Array.isArray(data[k])
      ));
      for (const k of KNOWN_EMPTY) if (!FORBIDDEN.has(k)) set.add(k);
      res.json({ ok: true, collections: [...set] });
    } catch (e) { next(e); }
  });

  api.get('/:collection', async (req, res, next) => {
    try {
      const { collection } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canRead(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de lectura' });
      await store.refreshIfStale();
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
      const col = db.collection(store.get(), collection);
      const body = req.body || {};
      // Upsert por id: el frontend crea con id local (Date.now) y sincroniza.
      // Si el id ya existe se reemplaza (200); si no, se crea (201).
      await store.refreshIfStale();
      if (body.id !== undefined && body.id !== null) {
        const ix = col.findIndex((x) => String(x.id) === String(body.id));
        if (ix >= 0) {
          col[ix] = { ...body, id: col[ix].id };
          db.audit(store.get(), `edicion_${collection}`, req.user, { id: col[ix].id });
          await store.persistCollections([collection, 'auditoria']);
          return res.json({ ok: true, item: col[ix], upserted: true });
        }
      }
      const rec = { ...body, id: body.id ?? db.newId() };
      col.push(rec);
      db.audit(store.get(), `creacion_${collection}`, req.user, { id: rec.id });
      await store.persistCollections([collection, 'auditoria']);
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
      await store.refreshIfStale();
      const col = db.collection(store.get(), collection);
      const rec = db.byId(col, id);
      if (!rec) return res.status(404).json({ ok: false, error: 'No encontrado' });
      Object.assign(rec, req.body || {}, { id: rec.id });
      db.audit(store.get(), `edicion_${collection}`, req.user, { id: rec.id });
      await store.persistCollections([collection, 'auditoria']);
      res.json({ ok: true, item: rec });
    } catch (e) { next(e); }
  });

  api.delete('/:collection/:id', async (req, res, next) => {
    try {
      const { collection, id } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canWrite(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      await store.refreshIfStale();
      const data = store.get();
      const before = (data[collection] || []).length;
      data[collection] = (data[collection] || []).filter((x) => String(x.id) !== String(id));
      if (data[collection].length === before) return res.status(404).json({ ok: false, error: 'No encontrado' });
      db.audit(data, `borrado_${collection}`, req.user, { id });
      await store.persistCollections([collection, 'auditoria']);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.use('/data', api);
  return r;
};
