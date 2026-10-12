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
    } catch (e) { /* sin sesión válida: ruta pública o 401 */ }
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
  if (!req.user) return res.status(401).json({ ok: false, backend: true, error: 'No autenticado' });
  next();
}

const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ ok: false, backend: true, error: 'No autenticado' });
  if (!roles.hasRole(req.user, allowed)) {
    return res.status(403).json({ ok: false, error: 'Sin permiso para este recurso' });
  }
  next();
};

/* Rate-limit en memoria para /login: N intentos FALLIDOS / 10 min por IP
 * (LOGIN_RATE_MAX, default 10; los tests lo suben). Solo cuentan los fallos:
 * un login válido perdona uno (los usuarios legítimos jamás se bloquean). */
const attempts = new Map();
const LOGIN_RATE_MAX = Number(process.env.LOGIN_RATE_MAX || 10);
function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || '?';
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(ip, list);
  req._rlIp = ip;
  if (list.length >= LOGIN_RATE_MAX) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera 10 minutos.' });
  }
  next();
}
function noteFailedLogin(req) {
  try {
    const list = attempts.get(req._rlIp) || [];
    list.push(Date.now());
    attempts.set(req._rlIp, list);
  } catch (e) { /* nunca romper el login */ }
}
function forgiveLogin(req) {
  try {
    const list = attempts.get(req._rlIp) || [];
    list.shift();
    attempts.set(req._rlIp, list);
  } catch (e) { /* nunca romper el login */ }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[backend]', err);
  res.status(500).json({ ok: false, error: 'Error interno' });
}

module.exports = { securityHeaders, noStorePrivate, loadSession, refreshCache, requireAuth, requireRole, loginRateLimit, noteFailedLogin, forgiveLogin, errorHandler };
