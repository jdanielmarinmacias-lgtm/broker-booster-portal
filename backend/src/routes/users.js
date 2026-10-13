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

/* Crear/editar/borrar usuarios: admin, gm, desarrollador + agencia y maestro
 * (ellos gestionan a SU equipo: altas de agentes, asignaciones). El servidor
 * sigue validando qué pueden tocar (ver PUT: solo su equipo / no-GM). */
const MANAGERS = ['admin', 'gm', 'desarrollador', 'agencia', 'maestro'];

module.exports = (store) => {
  const r = express.Router();
  r.use(mw.requireRole(...MANAGERS));

  r.get('/', (req, res) => {
    const users = db.collection(store.get(), 'users');
    res.json({ ok: true, users: users.map(db.safeUser) });
  });

  // Quién puede dar de alta a quién (crear es asignar a tu equipo).
  function canCreate(actor, role) {
    role = String(role || '').toLowerCase();
    if (roles.isAdmin(actor)) return true; // admin/gm/dev: cualquiera
    if (roles.hasRole(actor, ['agencia', 'maestro'])) {
      // Su equipo: agentes, prospectos, alumnos (no pares ni jefes).
      return ['agente', 'agente_agencia', 'agente_desarrollo', 'prospecto', 'alumno'].includes(role);
    }
    return false;
  }

  r.post('/', async (req, res, next) => {
    try {
    if (!canCreate(req.user, (req.body || {}).role)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para crear ese rol' });
    }
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
    // Agencia/maestro: su equipo (asignado a ellos), cuentas SIN equipo que
    // ELLOS crearon (auditoría: creacion_usuario por su id), o sí mismos.
    // Admin/gm/dev: todos. GM protegidas aparte (canModifyUser).
    if (!roles.isAdmin(req.user)) {
      const teamless = !target.agenciaId && !target.parentId && !target.assignedTo;
      let createdByMe = false;
      if (teamless) {
        try {
          const aud = db.collection(store.get(), 'auditoria') || [];
          createdByMe = aud.some((a) => a.tipo === 'creacion_usuario'
            && String(a.usuarioId) === String(req.user.id)
            && a.usuarioCreadoId !== undefined && String(a.usuarioCreadoId) === String(target.id));
        } catch (e) { /* sin auditoría: denegar */ }
      }
      const mine = String(target.agenciaId || target.parentId || target.assignedTo || '') === String(req.user.id)
        || String(target.id) === String(req.user.id) || createdByMe;
      if (!mine) return res.status(403).json({ ok: false, error: 'Solo puedes editar a tu equipo' });
    }
    const { name, email, phone, role, avatar, agenciaId, agencia, parentId, assignedTo, xp, students } = req.body || {};
    const antes = { ...target };
    if (name !== undefined) target.name = name;
    if (email !== undefined) target.email = email;
    if (phone !== undefined) target.phone = phone;
    if (avatar !== undefined) target.avatar = avatar;
    // Asignaciones de equipo (agenciaId/parentId/assignedTo/agencia) + xp/students:
    // el legacy las guarda en el mismo formulario de usuario.
    for (const [k, v] of Object.entries({ agenciaId, agencia, parentId, assignedTo, xp, students })) {
      if (v !== undefined) target[k] = v;
    }
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
