'use strict';
/* ============================================================================
 * POST /api/media/sign    — firma subida directa a Supabase Storage (autenticado)
 * POST /api/media/confirm — registra metadata + espejo al feed realtime (autenticado)
 * POST /api/media         — subida multipart SOLO modo local (sin Supabase)
 * GET  /api/public/feed   — últimas publicaciones (público, con imagen/video/doc)
 *
 * Diseño: los bytes NUNCA pasan por Vercel en producción. El backend firma una
 * URL (service key, bypass RLS) y el navegador sube directo a Supabase Storage
 * (bucket público `portal-media`, creado en boot). Luego /confirm valida que el
 * archivo exista, guarda metadata en la colección `media` y publica el evento
 * realtime que ven los demás usuarios en vivo.
 * Permisos: requiere sesión + roles.canWrite(usuario, scope). Sin sesión: 401.
 * ========================================================================== */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const roles = require('../roles');
const mw = require('../middleware');

const BUCKET = 'portal-media';
const MAX_MB = Number(process.env.MEDIA_MAX_MB || 50);
const MAX_BYTES = MAX_MB * 1024 * 1024;

const ALLOWED = [
  /^image\//,
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'text/markdown',
];
const isAllowed = (mime) => ALLOWED.some((a) => (a instanceof RegExp ? a.test(mime) : a === mime));
const isViewable = (mime) => /^image\//.test(mime || '') || /^(video\/mp4|video\/webm)$/.test(mime || '');

// Scopes escaparate: además de guardarse, generan evento realtime visible.
const FEED_SCOPES = new Set(['inmPublica', 'autoHub', 'posts', 'carruselCirculares', 'media']);

const safeName = (name) => String(name || 'archivo')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'archivo';

function checkPayload(user, { filename, mime, size, scope }) {
  if (!roles.canWrite(user, scope || 'media')) return { status: 403, error: 'Sin permiso de subida' };
  if (!isAllowed(mime)) return { status: 400, error: 'Tipo de archivo no permitido (imagen, video, PDF, Office, texto)' };
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_BYTES) {
    return { status: 400, error: `Tamaño inválido (máximo ${MAX_MB} MB)` };
  }
  if (!filename) return { status: 400, error: 'Falta el nombre del archivo' };
  return null;
}

module.exports = (store, config) => {
  const r = express.Router();
  const useSupabase = !!(config.supabaseUrl && config.supabaseServiceKey);

  /* ---- Feed público (lo consumen la portada y el realtime) ---- */
  r.get('/public/feed', async (req, res, next) => {
    try {
      const items = await store.adapter.listFeed(20);
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json({ ok: true, items });
    } catch (e) { next(e); }
  });

  const api = express.Router();
  api.use(mw.requireAuth);

  /* ---- 1) Firmar subida directa (solo Supabase) ---- */
  api.post('/sign', async (req, res, next) => {
    try {
      if (!useSupabase) return res.status(501).json({ ok: false, fallback: 'local', error: 'Sin Storage: usa POST /api/media' });
      const { filename, mime, size, scope } = req.body || {};
      const bad = checkPayload(req.user, { filename, mime, size, scope: scope || 'media' });
      if (bad) return res.status(bad.status).json({ ok: false, error: bad.error });
      const clean = `${scope || 'media'}/${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safeName(filename)}`;
      const signed = await store.adapter.signUpload(clean);
      res.json({ ok: true, path: clean, uploadUrl: signed.uploadUrl, publicUrl: signed.publicUrl, mime, size: Number(size) });
    } catch (e) { next(e); }
  });

  /* ---- 1b) ¿Ya está subido este mismo archivo? ----
   * El cliente manda la huella SHA-256 antes de firmar la subida. Si ya existe
   * un registro con esa huella se devuelve su URL y no se vuelve a subir: el
   * mismo JPEG estaba diez veces en el Storage con nombres distintos. */
  api.post('/check', async (req, res, next) => {
    try {
      const hash = normalizarHash((req.body || {}).hash);
      if (!hash) return res.status(400).json({ ok: false, error: 'Huella inválida' });
      const item = await buscarPorHash(store, hash, (req.body || {}).scope || 'media');
      res.json({ ok: true, item: item || null });
    } catch (e) { next(e); }
  });

  /* ---- 2) Confirmar: valida existencia, guarda metadata, publica feed ---- */
  api.post('/confirm', async (req, res, next) => {
    try {
      if (!useSupabase) return res.status(501).json({ ok: false, fallback: 'local', error: 'Sin Storage: usa POST /api/media' });
      const { path: fpath, mime, size, scope, title, refId } = req.body || {};
      const hash = normalizarHash((req.body || {}).hash);
      const bad = checkPayload(req.user, { filename: fpath, mime, size, scope: scope || 'media' });
      if (bad) return res.status(bad.status).json({ ok: false, error: bad.error });
      if (!fpath || String(fpath).includes('..')) return res.status(400).json({ ok: false, error: 'Ruta inválida' });
      const exists = await store.adapter.storageExists(fpath);
      if (!exists) return res.status(400).json({ ok: false, error: 'El archivo no llegó al Storage' });
      /* Carrera entre dos equipos subiendo lo mismo: el que llega segundo
       * reutiliza el registro del primero (su copia en Storage queda sin
       * referencia, pero la base no se duplica). */
      const dup = await buscarPorHash(store, hash, scope || 'media');
      if (dup) return res.status(200).json({ ok: true, item: dup, reuse: true });
      const publicUrl = store.adapter.publicUrl(fpath);
      const item = await registerMedia(store, req.user, {
        url: publicUrl, path: fpath, mime, size: Number(size), hash,
        scope: scope || 'media', title: title || safeName(fpath), refId: refId || null,
      });
      res.status(201).json({ ok: true, item });
    } catch (e) { next(e); }
  });

  /* ---- 3) Subida multipart SOLO local (dev sin Supabase). En Vercel con
   * Supabase esta ruta responde 501: los bytes van directo al Storage. ---- */
  const uploadDir = () => {
    const dir = path.join(config.dataDir, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir()),
      filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safeName(file.originalname)}`),
    }),
    limits: { fileSize: Math.min(MAX_BYTES, 15 * 1024 * 1024), files: 5 },
    fileFilter: (req, file, cb) => (isAllowed(file.mimetype) ? cb(null, true) : cb(new Error('Tipo no permitido'))),
  }).array('files', 5);

  api.post('/', (req, res, next) => {
    if (useSupabase) return res.status(501).json({ ok: false, error: 'Usa /sign + subida directa al Storage' });
    upload(req, res, async (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message || 'Subida inválida' });
      try {
        const scope = req.body.scope || 'media';
        if (!roles.canWrite(req.user, scope)) {
          for (const f of req.files || []) fs.unlink(f.path, () => {});
          return res.status(403).json({ ok: false, error: 'Sin permiso de subida' });
        }
        const hash = normalizarHash(req.body.hash);
        const dup = await buscarPorHash(store, hash, scope);
        if (dup) {
          for (const f of req.files || []) fs.unlink(f.path, () => {});
          return res.status(200).json({ ok: true, items: [dup], reuse: true });
        }
        const out = [];
        for (const f of req.files || []) {
          const item = await registerMedia(store, req.user, {
            url: `/uploads/${path.basename(f.filename)}`, path: f.filename, mime: f.mimetype,
            size: f.size, hash, scope, title: req.body.title || f.originalname, refId: req.body.refId || null,
          });
          out.push(item);
        }
        res.status(201).json({ ok: true, items: out });
      } catch (e) { next(e); }
    });
  });

  // OJO: montar en /media (no en /) para no 401-izar el resto de /api/*.
  r.use('/media', api);
  return r;
};

/* Huella normalizada (SHA-256 hex) o null si no es válida. */
function normalizarHash(valor) {
  const h = String(valor || '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(h) ? h : null;
}

/* Busca un archivo ya registrado con la misma huella EN EL MISMO DESTINO.
 * El scope forma parte de la clave: reutilizar una imagen subida a `media` al
 * publicar en `autoHub` se saltaría el aviso al feed y la ficha de esa sección. */
async function buscarPorHash(store, hash, scope) {
  if (!hash) return null;
  try { await store.refreshIfStale(); } catch (e) { /* usa la caché cálida */ }
  const col = db.collection(store.get(), 'media');
  const destino = scope || 'media';
  return col.find((m) => m && m.hash === hash && (m.scope || 'media') === destino) || null;
}

/* Guarda metadata en `media`, audita y espeja a feed si es escaparate. */
async function registerMedia(store, user, meta) {
  const rec = {
    id: db.newId(),
    url: meta.url,
    path: meta.path,
    mime: meta.mime,
    size: meta.size,
    hash: meta.hash || null,
    scope: meta.scope,
    title: meta.title,
    refId: meta.refId,
    uploaderId: user.id,
    uploaderName: user.name || user.username,
    createdAt: new Date().toISOString(),
  };
  // ORDEN CRÍTICO: refrescar ANTES de mutar (ver routes/collections.js).
  await store.refreshForWrite(['media']);
  db.collection(store.get(), 'media').push(rec);
  db.audit(store.get(), 'subida_media', user, { id: rec.id, scope: rec.scope, mime: rec.mime });
  if (store.persistCollections) await store.persistCollections(['media', 'auditoria']);
  else await store.persist();
  if (FEED_SCOPES.has(rec.scope)) {
    await store.pushFeed({
      kind: rec.scope,
      title: rec.title,
      body: isViewable(rec.mime) ? '' : rec.url,
      image_url: isViewable(rec.mime) ? rec.url : null,
      media_kind: (rec.mime || '').split('/')[0],
    }).catch(() => {});
  }
  return rec;
}
