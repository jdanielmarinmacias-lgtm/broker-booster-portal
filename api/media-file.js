'use strict';
/* Entrypoint Vercel de `/media/*` (ver vercel.json: rewrite con ?p=$1).
 * Deliberadamente ligero: no arranca la app ni toca la base de datos, solo
 * lee del Storage y responde con caché larga. Así el CDN puede servirlo sin
 * despertar el backend. */
const { servirMedia } = require('../backend/src/mediaProxy');

/* La ruta llega como ?p=<ruta> desde el rewrite; si por lo que sea no viene,
 * se deduce del camino original para no dejar un hueco. */
function rutaPedida(req) {
  try {
    const u = new URL(req.url || '/', 'http://local');
    const p = u.searchParams.get('p');
    if (p) return p;
    const camino = u.pathname || '';
    if (camino.startsWith('/media/')) return camino.slice('/media/'.length);
    return '';
  } catch (e) {
    return '';
  }
}

module.exports = (req, res) => servirMedia(req, res, rutaPedida(req));
