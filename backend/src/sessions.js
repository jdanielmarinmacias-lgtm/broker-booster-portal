'use strict';
/* Sesiones propias (async, sobre el adaptador): token opaco en cookie HttpOnly.
 * La validación es SIEMPRE en directo contra el adaptador (sin caché): un
 * logout invalida al instante en cualquier instancia serverless. */
const crypto = require('crypto');
const config = require('./config');

let adapter = null;
function bind(a) { adapter = a; }

async function sweep() { /* expiración perezosa: se filtra en get() */ }

async function create(userId) {
  await sweep();
  const token = crypto.randomBytes(32).toString('hex');
  await adapter.setSession(token, { userId: String(userId), expiresAt: Date.now() + config.sessionTtlMs });
  return token;
}

async function get(token) {
  if (!token || !adapter) return null;
  await sweep();
  const s = await adapter.getSession(token);
  if (!s || s.expiresAt < Date.now()) {
    if (s) await adapter.deleteSession(token).catch(() => {});
    return null;
  }
  await adapter.setSession(token, { userId: s.userId, expiresAt: Date.now() + config.sessionTtlMs }); // rolling
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

module.exports = { bind, create, get, destroy, cookieHeader, clearCookieHeader, readCookie };
