'use strict';
/* Sesiones propias (async, sobre el adaptador): token opaco en cookie HttpOnly.
 * La validación es SIEMPRE en directo contra el adaptador (sin caché): un
 * logout invalida al instante en cualquier instancia serverless. */
const crypto = require('crypto');
const config = require('./config');

let adapter = null;
function bind(a) { adapter = a; }

/* Poda de sesiones vencidas: las filas de app_sessions crecían sin límite (12h
 * de TTL, pero nadie las borraba: cada login dejaba una fila para siempre).
 * Se purgan como máximo 1 vez por hora y por instancia, al crear sesión, para
 * no añadir una consulta de escritura a cada petición. La expiración sigue
 * siendo perezosa en get() (un token vencido nunca se acepta). */
const SWEEP_EVERY_MS = 60 * 60 * 1000;
let lastSweep = 0;
async function sweep() {
  if (!adapter || typeof adapter.pruneSessions !== 'function') return;
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  try {
    await adapter.pruneSessions(now);
  } catch (e) {
    /* Sin poda no se puede bloquear el login: se reintenta en la próxima hora. */
    console.warn('[sessions] poda de vencidas falló:', e.message);
  }
}

async function create(userId) {
  await sweep(); // 1 vez/hora: borra filas vencidas sin penalizar cada petición
  const token = crypto.randomBytes(32).toString('hex');
  await adapter.setSession(token, { userId: String(userId), expiresAt: Date.now() + config.sessionTtlMs });
  return token;
}

async function get(token) {
  if (!token || !adapter) return null;
  const s = await adapter.getSession(token);
  if (!s || s.expiresAt < Date.now()) {
    if (s) await adapter.deleteSession(token).catch(() => {});
    return null;
  }
  // Rolling: solo renueva en base si ha transcurrido más de 10 minutos,
  // evitando una escritura extra a Supabase en cada petición autenticada.
  const targetExp = Date.now() + config.sessionTtlMs;
  if (targetExp - s.expiresAt > 10 * 60 * 1000) {
    await adapter.setSession(token, { userId: s.userId, expiresAt: targetExp }).catch(() => {});
  }
  return s;
}

async function destroy(token) {
  if (token && adapter) await adapter.deleteSession(token).catch(() => {});
}

function cookieHeader(token) {
  const parts = [
    `${config.cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader() {
  return `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req) {
  const header = req.headers.cookie || '';
  const pair = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(config.cookieName + '='));
  return pair ? decodeURIComponent(pair.slice(config.cookieName.length + 1)) : null;
}

/* Solo tests: fuerza que el próximo create pode aunque el throttle esté activo. */
function resetSweepForTests() { lastSweep = 0; }

module.exports = { bind, create, get, destroy, cookieHeader, clearCookieHeader, readCookie, resetSweepForTests };
