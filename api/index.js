'use strict';
/* Entrypoint Vercel: exporta la app Express como Function.
 * Boot perezoso una sola vez por instancia (stateless: sesiones y datos
 * viven en Supabase cuando hay env, si no en /tmp efímero). */
let appPromise = null;

function boot() {
  if (!appPromise) {
    appPromise = (async () => {
      const { boot } = require('../backend/src/server');
      const { app } = await boot();
      return app;
    })().catch((e) => {
      appPromise = null;
      console.error('[api] boot failed', e);
      throw e;
    });
  }
  return appPromise;
}

module.exports = (req, res) => boot().then((app) => app(req, res));
