'use strict';
/* Servidor del backend propio.
 * - Local: `npm start` (JSON en ./data, con seed automático).
 * - Vercel: exporta la app ya inicializada (ver /api/index.js); stateless.
 * - Con SUPABASE_URL + SUPABASE_SERVICE_KEY: persiste en Supabase. */
const express = require('express');
const fs = require('fs');
const config = require('./config');
const { createStore, selectAdapter } = require('./store');
const sessions = require('./sessions');
const mw = require('./middleware');

function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  // Confía en X-Forwarded-For de Vercel (1 salto) para que el rate-limit
  // vea la IP real del cliente y no la del balanceador.
  app.set('trust proxy', 1);
  app.use(mw.securityHeaders);
  // Límite generoso para fotos base64 del legacy (Vercel corta en ~4.5MB de
  // todos modos; el payload grande falla con 413 visible, no en silencio).
  app.use(express.json({ limit: '10mb' }));
  app.use(mw.loadSession(store));
  // NOTA: No montar refreshCache global en /api: rutas rápidas como /api/auth/me,
  // /api/auth/login, /api/public/config y /api/ia/key no necesitan recargar
  // toda la tabla documents. Las rutas de datos invocan store.refreshIfStale()
  // o store.refreshForWrite(collections) explícitamente.

  app.use('/api/auth', mw.noStorePrivate, require('./routes/auth')(store));
  app.use('/api/users', mw.noStorePrivate, require('./routes/users')(store));
  app.use('/api', mw.noStorePrivate, require('./routes/collections')(store, config));
  app.use('/api', mw.noStorePrivate, require('./routes/media')(store, config));
  app.use('/api', mw.noStorePrivate, require('./routes/reporte')(store, config));

  if (store.adapter.kind !== 'supabase') {
    // Solo local: sirve lo subido por POST /api/media. En producción los
    // bytes viven en Supabase Storage ( URLs públicas del bucket).
    const path = require('path');
    app.use('/uploads', express.static(path.join(config.dataDir, 'uploads')));
  }

  app.get('/api/salud', (req, res) => res.json({
    ok: true, backend: true, store: store.adapter.kind,
    realtime: !!(config.supabaseUrl && config.supabaseAnonKey),
  }));

  if (fs.existsSync(config.frontendDir)) {
    // Local: sirve el frontend. En Vercel se ignora (el estático sale de outputDirectory).
    app.use(express.static(config.frontendDir, { index: 'index.html' }));
  }

  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Ruta API no encontrada' }));
  // Body-parser: payload excesivo => 413 JSON (no el HTML default de Express).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      return res.status(413).json({ ok: false, error: 'Registro demasiado grande (usa Subir archivo en vez de foto embebida)' });
    }
    next(err);
  });
  app.use(mw.errorHandler);
  return app;
}

async function boot(adapter) {
  adapter = adapter || selectAdapter(config);
  sessions.bind(adapter);
  const store = createStore(adapter);
  mw.bindLoginStore(store);
  if (adapter.kind === 'supabase') {
    // Arranque instantáneo en serverless (<100ms): no bloquear /api/auth/login
    // ni /api/auth/me descargando toda la tabla documents en el cold-start.
    // Las rutas que leen colecciones llaman a store.refreshIfStale() (cacheAt=0)
    // y el bucket se asegura en segundo plano sin frenar la primera petición.
    store.adapter.ensureMediaBucket().catch((e) => { console.error('[backend] bucket:', e.message); });
  } else {
    await store.init();
    try { await store.adapter.ensureMediaBucket(); } catch (e) { console.error('[backend] bucket:', e.message); }
  }
  return { store, app: createApp(store) };
}

if (require.main === module) {
  (async () => {
    const { store, app } = await boot();
    /* Solo el arranque local con store vacío siembra. Con Supabase la caché
     * arranca vacía a propósito (serverless): sembrar aquí escribiría usuarios
     * demo en la base real. seed() sí comprueba antes, pero ni se invoca. */
    if (store.adapter.kind !== 'supabase') {
      if (!Array.isArray(store.get().users) || store.get().users.length === 0) {
        const { seed } = require('./seed');
        const r = await seed(store, config.seedPassword);
        if (r.created) console.log(`[backend] DB inicial creada (store: ${store.adapter.kind}).`);
      }
    }
    app.listen(config.port, () => console.log(`[backend] http://localhost:${config.port} (store: ${store.adapter.kind})`));
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { createApp, boot };
