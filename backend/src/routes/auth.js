'use strict';
/* Auth propio (sin proveedores externos), async y stateless:
 * POST /api/auth/login {username,password} -> 200 + cookie HttpOnly
 * POST /api/auth/logout · GET /api/auth/me · POST /api/auth/change-password */
const express = require('express');
const db = require('../db');
const sessions = require('../sessions');
const passwords = require('../passwords');
const mw = require('../middleware');

module.exports = (store) => {
  const r = express.Router();

  r.post('/login', mw.loginRateLimit, async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ ok: false, error: 'Faltan credenciales' });
      const u = await store.adapter.getUserByUsername(username);
      const stored = u && (u.passwordHash || u.password);
      const valid = u && stored && (passwords.isHash(stored)
        ? passwords.verify(password, stored)
        : String(stored) === String(password));
      if (!valid) {
        mw.noteFailedLogin(req);
        db.audit(store.get(), 'login_fallido', null, { username: String(username) });
        await store.persist().catch(() => {});
        return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
      }
      mw.forgiveLogin(req);
      const token = await sessions.create(u.id);
      res.setHeader('Set-Cookie', sessions.cookieHeader(token));
      db.audit(store.get(), 'login', db.safeUser(u), {});
      await store.persist().catch(() => {});
      const safe = db.safeUser(u);
      res.json({ ok: true, user: safe, mustChangePassword: !!u.mustChangePassword });
    } catch (e) { next(e); }
  });

  r.post('/logout', async (req, res) => {
    await sessions.destroy(sessions.readCookie(req));
    res.setHeader('Set-Cookie', sessions.clearCookieHeader());
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false, backend: true, error: 'No autenticado' });
    res.json({ ok: true, user: req.user });
  });

  r.post('/change-password', mw.requireAuth, async (req, res, next) => {
    try {
      const { current, next: nextPw } = req.body || {};
      if (!nextPw || String(nextPw).length < 8) {
        return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
      }
      const u = await store.adapter.getUserById(req.user.id);
      if (!u) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      const stored = u.passwordHash || u.password;
      const okCurrent = stored && (passwords.isHash(stored)
        ? passwords.verify(current, stored)
        : String(stored) === String(current));
      if (!okCurrent) return res.status(401).json({ ok: false, error: 'La contraseña actual no coincide' });
      const newHash = passwords.hash(nextPw);
      const data = store.get();
      const local = db.byId(db.collection(data, 'users'), u.id);
      if (local) {
        delete local.password;
        local.passwordHash = newHash;
        local.mustChangePassword = false;
      }
      // Sincroniza el registro directo (supabase; en json/memory es no-op).
      await store.adapter.upsertUser({ ...u, passwordHash: newHash, mustChangePassword: false });
      db.audit(data, 'cambio_password', db.safeUser(u), {});
      await store.persist().catch(() => {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
