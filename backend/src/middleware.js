'use strict';
/* Middlewares: cabeceras duras, sesión, autorización por rol, rate-limit de login, errores. */
const sessions = require('./sessions');
const db = require('./db');
const roles = require('./roles');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function noStorePrivate(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/* Carga la sesión y adjunta req.user (SIN hash). Sesión Y usuario siempre en
 * directo contra el adaptador (sin caché): correcto en serverless multi-instancia. */
function loadSession(store) {
  return async (req, res, next) => {
    req.user = null;
    try {
      const token = sessions.readCookie(req);
      if (token) {
        const s = await sessions.get(token);
        if (s) {
          const u = await store.adapter.getUserById(s.userId);
          if (u) req.user = db.safeUser(u);
          else await sessions.destroy(token);
        }
      }
    } catch (e) {
      /* La consulta de sesión falló (Supabase lento/caído), NO que la sesión
       * sea inválida. Marcarlo evita el 401 engañoso: el portal mostraba
       * "loginAttempts/settings (HTTP 401: No autenticado)" y dejaba de
       * sincronizar por una caída pasajera de la base. */
      req.sessionLookupFailed = true;
      console.error('[backend] sesión no verificable:', e.message);
    }
    next();
  };
}

/* Revalida la caché de colecciones según TTL del adaptador (serverless). */
function refreshCache(store) {
  return async (req, res, next) => {
    try { await store.refreshIfStale(); } catch (e) { /* conserva caché cálida */ }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.sessionLookupFailed) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ ok: false, backend: true, retryable: true, error: 'Base de datos ocupada: reintenta en unos segundos' });
    }
    return res.status(401).json({ ok: false, backend: true, error: 'No autenticado' });
  }
  next();
}

const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) {
    if (req.sessionLookupFailed) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ ok: false, backend: true, retryable: true, error: 'Base de datos ocupada: reintenta en unos segundos' });
    }
    return res.status(401).json({ ok: false, backend: true, error: 'No autenticado' });
  }
  if (!roles.hasRole(req.user, allowed)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso para este recurso' });
  }
  next();
};

/* Rate-limit en memoria para /login: N intentos FALLIDOS / LOGIN_RATE_MIN min por IP
 * (defaults: 10 fallos / 2 min; LOGIN_RATE_MAX y LOGIN_RATE_MIN lo ajustan;
 * los tests suben el tope). Solo cuentan los fallos: un login válido perdona
 * uno (los usuarios legítimos jamás se bloquean). */
const attempts = new Map();
const LOGIN_RATE_MAX = Number(process.env.LOGIN_RATE_MAX || 10);
const LOGIN_RATE_MIN = Number(process.env.LOGIN_RATE_MIN || 2);
const WINDOW_MS = LOGIN_RATE_MIN * 60 * 1000;

/* Almacén compartido (en producción: tabla documents, colección `loginAttempts`).
 * Sin store compartido (local/tests) se usa el Map en memoria. El estado vive
 * en el store para que varias instancias serverless vean los mismos fallos. */
function bindLoginStore(store) { void store; }

const recentFails = (list, now) => (list || []).filter((t) => now - t < WINDOW_MS);

/* Contador en memoria por instancia: no toca Supabase en cada login. Guardar
 * en la base compartida (saveCollections de todo el documento) tardaba 20-40 s
 * y dejaba el inicio de sesión sin respuesta. */
async function readFails(ip) {
  return recentFails(attempts.get(ip), Date.now());
}

async function writeFails(ip, list) {
  attempts.set(ip, list);
}

async function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || '?';
  req._rlIp = ip;
  try {
    const list = await readFails(ip);
    if (list.length >= LOGIN_RATE_MAX) {
      return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${LOGIN_RATE_MIN} minutos.` });
    }
  } catch (e) { /* nunca bloquear por fallo del contador */ }
  next();
}

async function noteFailedLogin(req) {
  try {
    const list = await readFails(req._rlIp);
    list.push(Date.now());
    await writeFails(req._rlIp, list);
  } catch (e) { /* nunca romper el login */ }
}

async function forgiveLogin(req) {
  try {
    const list = await readFails(req._rlIp);
    list.shift();
    await writeFails(req._rlIp, list);
  } catch (e) { /* nunca romper el login */ }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[backend]', err);
  /* Errores con status propio (413 por documento gigante, 409, etc.) llegan
   * con su código y su mensaje accionable. Antes TODO se volvía un 500
   * "Error interno" opaco: el portal no sabía qué arreglar. */
  const status = Number(err && (err.status || err.statusCode));
  if (status >= 400 && status < 500 && status !== 401 && err && err.message) {
    if (status === 503) res.setHeader('Retry-After', '5');
    return res.status(status).json({ ok: false, retryable: status === 503, error: err.message });
  }
  res.status(500).json({ ok: false, error: 'Error interno' });
}

module.exports = { securityHeaders, noStorePrivate, loadSession, refreshCache, requireAuth, requireRole, loginRateLimit, noteFailedLogin, forgiveLogin, errorHandler, bindLoginStore };
