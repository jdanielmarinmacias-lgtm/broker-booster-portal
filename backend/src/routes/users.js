'use strict';
/* Gestión de usuarios (sistema propio). Toda regla se valida en servidor:
 * - Listar/crear/editar/borrar: admin, gm, desarrollador.
 * - Cuentas GM protegidas (canModifyUser): ni otros GM las tocan ni se borran.
 * - Respuestas siempre sin password/hash. */
const express = require('express');
const db = require('../db');
const roles = require('../roles');
const passwords = require('../passwords');
const mw = require('../middleware');

const MANAGERS = ['admin', 'gm', 'desarrollador'];

module.exports = (store) => {
  const r = express.Router();
  r.use(mw.requireRole(...MANAGERS));

  r.get('/', (req, res) => {
    const users = db.collection(store.get(), 'users');
    res.json({ ok: true, users: users.map(db.safeUser) });
  });

  r.post('/', async (req, res, next) => {
    try {
    const { username, role, name, email, phone, password, id } = req.body || {};
    if (!username) return res.status(400).json({ ok: false, error: 'username requerido' });
    if (!roles.ROLES[String(role || '').toLowerCase()]) {
      return res.status(400).json({ ok: false, error: 'Rol inválido' });
    }
    const users = db.collection(store.get(), 'users');
    if (users.some((x) => String(x.username).toLowerCase() === String(username).toLowerCase())) {
      return res.status(409).json({ ok: false, error: 'El username ya existe' });
    }
    // Acepta id del cliente (sincronización offline-first del frontend):
    // preserva las referencias locales (students, agenteId…).
    let useId = db.newId();
    if (id !== undefined && id !== null) {
      if (users.some((x) => String(x.id) === String(id))) {
        return res.status(409).json({ ok: false, error: 'El id ya existe' });
      }
      useId = id;
    }
    const rec = {
      id: useId,
      username, role: String(role).toLowerCase(),
      name: name || username, email: email || '', phone: phone || '',
      avatar: `https://i.pravatar.cc/40?u=${encodeURIComponent(username)}`,
      xp: 0, students: [],
      mustChangePassword: true,
    };
    if (roles.isGM(rec) && !roles.isGM(req.user)) {
      return res.status(403).json({ ok: false, error: 'Solo un GM puede crear cuentas GM' });
    }
    rec.passwordHash = passwords.hash(password || (Math.random().toString(36).slice(2) + 'Aa1!'));
    users.push(rec);
    db.audit(store.get(), 'creacion_usuario', req.user, { usuarioCreadoId: rec.id, username });
    await store.persist();
    res.status(201).json({ ok: true, user: db.safeUser(rec) });
    } catch (e) { next(e); }
  });

  r.put('/:id', async (req, res, next) => {
    try {
    const users = db.collection(store.get(), 'users');
    const target = db.byId(users, req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: 'No encontrado' });
    if (!roles.canModifyUser(req.user, target)) {
      return res.status(403).json({ ok: false, error: 'Cuenta GM protegida' });
    }
    const { name, email, phone, role, avatar } = req.body || {};
    const antes = { ...target };
    if (name !== undefined) target.name = name;
    if (email !== undefined) target.email = email;
    if (phone !== undefined) target.phone = phone;
    if (avatar !== undefined) target.avatar = avatar;
    if (role !== undefined) {
      if (!roles.ROLES[String(role).toLowerCase()]) return res.status(400).json({ ok: false, error: 'Rol inválido' });
      if (roles.isGM({ ...target, role }) && !roles.isGM(req.user)) {
        return res.status(403).json({ ok: false, error: 'Solo un GM puede otorgar rol GM' });
      }
      target.role = String(role).toLowerCase();
    }
    db.audit(store.get(), 'edicion_usuario', req.user, { usuarioId: target.id, antes: db.safeUser(antes) });
    await store.persist();
    res.json({ ok: true, user: db.safeUser(target) });
    } catch (e) { next(e); }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
    const data = store.get();
    const users = db.collection(data, 'users');
    const target = db.byId(users, req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: 'No encontrado' });
    if (!roles.canModifyUser(req.user, target)) {
      return res.status(403).json({ ok: false, error: 'No se puede eliminar una cuenta GM' });
    }
    data.users = users.filter((x) => String(x.id) !== String(target.id));
    db.audit(data, 'borrado_usuario', req.user, { usuarioId: target.id, username: target.username });
    await store.persist();
    res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
