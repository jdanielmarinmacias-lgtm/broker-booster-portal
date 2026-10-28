'use strict';
/* Middlewares: cabeceras duras, sesión, autorización por rol, rate-limit de login, errores. */
const sessions = require('./sessions');
const db = require('./db');
const roles = require('./roles');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  /* Cámara y micrófono SÍ se usan (grabación de la práctica y reconocimiento
   * de voz); bloquearlos aquí rompería esas funciones. Geolocalización, pagos
   * y USB no se usan: se desactivan. */
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
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

/* Rate-limit de /login COMPARTIDO entre instancias.
 * Antes era un Map en memoria: en Vercel con N instancias el tope real era N×10
 * y cualquier reinicio lo borraba, así que la fuerza bruta era viable. El estado
 * vive en `documents` (colección loginAttempts, clave = hash de la IP), que ven
 * todas las instancias. Si la base falla, queda el Map local como red de
 * seguridad: un fallo de infraestructura nunca bloquea a un usuario legítimo.
 *
 * Escalado: 10 fallos/2 min → 2 min · 30/h → 15 min · 200/día → 1 h.
 * Solo cuentan los fallos; un login válido perdona uno. */
const attempts = new Map();
const LOGIN_RATE_MAX = Number(process.env.LOGIN_RATE_MAX || 10);
const LOGIN_RATE_MIN = Number(process.env.LOGIN_RATE_MIN || 2);
const WINDOW_MS = LOGIN_RATE_MIN * 60 * 1000;
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const TIERS = [
  { ventana: WINDOW_MS, max: LOGIN_RATE_MAX, bloqueo: WINDOW_MS, texto: `${LOGIN_RATE_MIN} minutos` },
  { ventana: HORA, max: Number(process.env.LOGIN_RATE_HORA || 30), bloqueo: 15 * MINUTO, texto: '15 minutos' },
  { ventana: DIA, max: Number(process.env.LOGIN_RATE_DIA || 200), bloqueo: HORA, texto: '1 hora' },
];

let loginAdapter = null;
function bindLoginStore(store) { loginAdapter = (store && store.adapter) || null; }

/* Se guarda un hash, no la IP: el estado es compartido y no debe acumular PII. */
const claveIp = (ip) => require('crypto').createHash('sha256').update('login|' + String(ip)).digest('hex').slice(0, 32);

const vigentes = (list, now) => (list || []).filter((t) => Number.isFinite(Number(t)) && now - Number(t) < DIA);

async function readFails(ip) {
  const now = Date.now();
  if (loginAdapter && typeof loginAdapter.getEstado === 'function') {
    try {
      const doc = await loginAdapter.getEstado('loginAttempts', claveIp(ip));
      const lista = vigentes(doc && doc.t, now);
      attempts.set(ip, lista); // espejo local para el caso de caída
      return lista;
    } catch (e) { /* cae al Map local */ }
  }
  return vigentes(attempts.get(ip), now);
}

async function writeFails(ip, list) {
  attempts.set(ip, list);
  if (loginAdapter && typeof loginAdapter.putEstado === 'function') {
    try {
      await loginAdapter.putEstado('loginAttempts', claveIp(ip), { t: list.slice(-500) });
    } catch (e) { /* la memoria ya lo tiene: no se pierde el bloqueo local */ }
  }
}

/* Una poda al día: los intentos de hace más de 24 h ya no puntúan. */
let ultimaPoda = 0;
function podarIntentos() {
  if (!loginAdapter || typeof loginAdapter.pruneEstado !== 'function') return;
  const ahora = Date.now();
  if (ahora - ultimaPoda < DIA) return;
  ultimaPoda = ahora;
  loginAdapter.pruneEstado('loginAttempts', ahora - DIA).catch(() => {});
}

async function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || '?';
  req._rlIp = ip;
  try {
    const list = await readFails(ip);
    const ahora = Date.now();
    /* Gana el escalón MÁS DURO alcanzado: quien lleva 200 fallos en el día no
     * debe salir con el castigo suave de 15 minutos. */
    let castigo = null;
    for (const t of TIERS) {
      const cuantos = list.filter((x) => ahora - Number(x) < t.ventana).length;
      if (cuantos >= t.max && (!castigo || t.bloqueo > castigo.bloqueo)) castigo = t;
    }
    if (castigo) {
      res.setHeader('Retry-After', String(Math.ceil(castigo.bloqueo / 1000)));
      return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${castigo.texto}.` });
    }
  } catch (e) { /* nunca bloquear por fallo del contador */ }
  next();
}

async function noteFailedLogin(req) {
  try {
    const list = await readFails(req._rlIp);
    list.push(Date.now());
    await writeFails(req._rlIp, list);
    podarIntentos();
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
