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
  app.use(mw.securityHeaders);
  app.use(express.json({ limit: '2mb' }));
  app.use(mw.loadSession(store));
  app.use('/api', mw.refreshCache(store));

  app.use('/api/auth', mw.noStorePrivate, require('./routes/auth')(store));
  app.use('/api/users', mw.noStorePrivate, require('./routes/users')(store));
  app.use('/api', mw.noStorePrivate, require('./routes/collections')(store, config));

  app.get('/api/salud', (req, res) => res.json({
    ok: true, backend: true, store: store.adapter.kind,
    realtime: !!(config.supabaseUrl && config.supabaseAnonKey),
  }));

  if (fs.existsSync(config.frontendDir)) {
    // Local: sirve el frontend. En Vercel se ignora (el estático sale de outputDirectory).
    app.use(express.static(config.frontendDir, { index: 'index.html' }));
  }

  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Ruta API no encontrada' }));
  app.use(mw.errorHandler);
  return app;
}

async function boot(adapter) {
  adapter = adapter || selectAdapter(config);
  sessions.bind(adapter);
  const store = createStore(adapter);
  await store.init();
  return { store, app: createApp(store) };
}

if (require.main === module) {
  (async () => {
    const { store, app } = await boot();
    const db = require('./db');
    if (!Array.isArray(store.get().users) || store.get().users.length === 0) {
      const { seed } = require('./seed');
      await seed(store, config.seedPassword);
      console.log(`[backend] DB inicial creada (store: ${store.adapter.kind}).`);
    }
    app.listen(config.port, () => console.log(`[backend] http://localhost:${config.port} (store: ${store.adapter.kind})`));
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { createApp, boot };
