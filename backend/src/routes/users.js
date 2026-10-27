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

  // Propio usuario actualiza su actividad/asistencia/racha (heartbeat) sin requerir rol MANAGER:
  const SELF_FIELDS = new Set(['lastActive', 'lastConnection', 'solicitudesVistasHasta', 'attendance', 'lastStudy', 'xp', 'streak']);

  r.get('/', mw.requireRole(...MANAGERS), async (req, res, next) => {
    try {
      await store.refreshIfStale(); // lectura: el TTL basta
      const users = db.collection(store.get(), 'users');
      res.json({ ok: true, users: users.map(db.safeUser) });
    } catch (e) { next(e); }
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

  /* Alias de roles del legacy: 'agente' genérico → agente de agencia. */
  const roleAlias = (r) => {
    const k = String(r || '').toLowerCase();
    if (k === 'agente') return 'agente_agencia';
    return k;
  };

  r.post('/', mw.requireRole(...MANAGERS), async (req, res, next) => {
    try {
    // ORDEN CRÍTICO: refrescar ANTES de leer/duplicar/mutar (ver collections.js).
    await store.refreshForWrite(['users']);
    if (!canCreate(req.user, roleAlias((req.body || {}).role))) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para crear ese rol' });
    }
    const {
      username, role, name, email, phone, password, id, avatar,
      ubicacion, ciudad, ubicacionCiudad, agenciaId, agencia, parentId, assignedTo, calendarColor,
    } = req.body || {};
    if (!username) return res.status(400).json({ ok: false, error: 'username requerido' });
    const normRole = roleAlias(role);
    if (!roles.ROLES[normRole]) {
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
      username, role: normRole,
      /* Quién lo dio de alta: agencia/maestro puede editar a su equipo incluso
       * si aún no tiene agenciaId/parentId. Antes esto se deducía leyendo la
       * colección `auditoria` completa (26 MB) en cada PUT. */
      createdBy: req.user.id,
      name: name || username, email: email || '', phone: phone || '',
      avatar: avatar || `https://i.pravatar.cc/40?u=${encodeURIComponent(username)}`,
      xp: 0, students: [],
      mustChangePassword: true,
    };
    for (const [k, v] of Object.entries({ ubicacion, ciudad, ubicacionCiudad, agenciaId, agencia, parentId, assignedTo, calendarColor })) {
      if (v !== undefined) rec[k] = v;
    }
    if (roles.isGM(rec) && !roles.isGM(req.user)) {
      return res.status(403).json({ ok: false, error: 'Solo un GM puede crear cuentas GM' });
    }
    rec.passwordHash = passwords.hash(password || (Math.random().toString(36).slice(2) + 'Aa1!'));
    users.push(rec);
    db.audit(store.get(), 'creacion_usuario', req.user, { usuarioCreadoId: rec.id, username });
    await store.persistCollections(['users', 'auditoria']);
    res.status(201).json({ ok: true, user: db.safeUser(rec) });
    } catch (e) { next(e); }
  });

  r.put('/:id', mw.requireAuth, async (req, res, next) => {
    try {
    const bodyKeys = Object.keys(req.body || {}).filter((k) => req.body[k] !== undefined);
    /* Un usuario sin rol de gestión sí puede editar SU perfil (nombre, correo,
     * teléfono, avatar, ubicación) y su progreso. Antes cualquier cambio propio
     * fuera del heartbeat devolvía 403: el portal mostraba "Sin permiso en
     * servidor para usuarios" y el perfil nunca llegaba a la base. */
    const SELF_PROFILE = new Set(['name', 'email', 'phone', 'avatar', 'ubicacion',
      'ciudad', 'ubicacionCiudad', 'calendarColor', 'password']);
    // Campos que jamás puede tocarse uno mismo (escalada de privilegios / equipo).
    const SELF_FORBIDDEN = new Set(['role', 'students', 'agenciaId', 'agencia', 'parentId', 'assignedTo']);
    const isSelf = String(req.params.id) === String(req.user.id);
    const isSelfProgressOnly = isSelf && bodyKeys.length > 0 && bodyKeys.every((k) => SELF_FIELDS.has(k));
    const isSelfProfileOnly = isSelf && bodyKeys.length > 0
      && bodyKeys.every((k) => SELF_FIELDS.has(k) || SELF_PROFILE.has(k))
      && !bodyKeys.some((k) => SELF_FORBIDDEN.has(k));
    if (!isSelfProgressOnly && !isSelfProfileOnly && !roles.hasRole(req.user, MANAGERS)) {
      return res.status(403).json({ ok: false, error: 'Permisos insuficientes' });
    }
    // ORDEN CRÍTICO: refrescar ANTES de resolver (ver collections.js).
    await store.refreshForWrite(['users']);
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
        createdByMe = String(target.createdBy || '') === String(req.user.id);
      }
      const mine = String(target.agenciaId || target.parentId || target.assignedTo || '') === String(req.user.id)
        || String(target.id) === String(req.user.id) || createdByMe;
      if (!mine) return res.status(403).json({ ok: false, error: 'Solo puedes editar a tu equipo' });
    }
    const {
      username, password, name, email, phone, role, avatar,
      ubicacion, ciudad, ubicacionCiudad, calendarColor,
      agenciaId, agencia, parentId, assignedTo, xp, students,
      lastActive, lastConnection, solicitudesVistasHasta, attendance, lastStudy,
    } = req.body || {};
    const HEARTBEAT_FIELDS = new Set(['lastActive', 'lastConnection', 'solicitudesVistasHasta', 'attendance', 'lastStudy', 'xp', 'streak']);
    const isHeartbeatOnly = bodyKeys.length > 0 && bodyKeys.every((k) => HEARTBEAT_FIELDS.has(k));
    const antes = { ...target };
    const previo = { ...target }; // foto previa compacta (solo para el diff)
    if (username !== undefined && String(username).trim() !== '' && String(username) !== String(target.username)) {
      const nextU = String(username).trim();
      if (users.some((x) => String(x.id) !== String(target.id) && String(x.username).toLowerCase() === nextU.toLowerCase())) {
        return res.status(409).json({ ok: false, error: 'El username ya existe' });
      }
      target.username = nextU;
    }
    if (name !== undefined) target.name = name;
    if (email !== undefined) target.email = email;
    if (phone !== undefined) target.phone = phone;
    if (avatar !== undefined) target.avatar = avatar;
    // Asignaciones de equipo + ubicación + color calendario + progreso:
    // el legacy las guarda en el mismo formulario de usuario.
    const extraFields = {
      ubicacion, ciudad, ubicacionCiudad, calendarColor,
      agenciaId, agencia, parentId, assignedTo, xp, students,
      lastActive, lastConnection, solicitudesVistasHasta, attendance, lastStudy,
    };
    for (const [k, v] of Object.entries(extraFields)) {
      if (v === null) delete target[k];
      else if (v !== undefined) target[k] = v;
    }
    if (password !== undefined && String(password).trim() !== '') {
      target.passwordHash = passwords.hash(String(password).trim());
      target.mustChangePassword = false;
    }
    if (role !== undefined) {
      const normRole = roleAlias(role);
      if (!roles.ROLES[normRole]) return res.status(400).json({ ok: false, error: 'Rol inválido' });
      if (roles.isGM({ ...target, role: normRole }) && !roles.isGM(req.user)) {
        return res.status(403).json({ ok: false, error: 'Solo un GM puede otorgar rol GM' });
      }
      target.role = normRole;
    }
    if (isHeartbeatOnly) {
      /* Latido (lastActive/streak): escribe SOLO este usuario y no avisa al
       * ticker realtime. Antes re-escribía toda la tabla de usuarios y
       * despertaba un pull en todos los equipos cada minuto.
       * OJO: hay que conservar el hash — `req.user` viene sin él y el upsert
       * lo dejaría en null (el usuario ya no podría entrar). */
      if (typeof store.adapter.upsertUser === 'function') {
        const full = await store.adapter.getUserById(target.id);
        if (full && full.passwordHash) target.passwordHash = full.passwordHash;
        await store.adapter.upsertUser(target);
      } else {
        await store.persistCollections(['users']);
      }
    } else {
      /* Solo el resumen del cambio: antes se guardaba el usuario COMPLETO
       * (con su avatar en base64). Con cientos de ediciones eso inflaba la
       * colección de auditoría a MBs y cada carga de la base arrastraba ese
       * peso: el guardado hacía timeout y el portal quedaba en local. */
      const ahora = { ...target };
    const cambiados = bodyKeys.filter((k) => JSON.stringify(ahora[k]) !== JSON.stringify(previo[k]));
      db.audit(store.get(), 'edicion_usuario', req.user, {
        usuarioId: target.id, username: target.username, campos: cambiados,
      });
      await store.persistCollections(['users', 'auditoria']);
    }
    res.json({ ok: true, user: db.safeUser(target) });
    } catch (e) { next(e); }
  });

  r.delete('/:id', mw.requireRole(...MANAGERS), async (req, res, next) => {
    try {
    // ORDEN CRÍTICO: refrescar ANTES de resolver (ver collections.js).
    await store.refreshForWrite(['users']);
    const data = store.get();
    const users = db.collection(data, 'users');
    const target = db.byId(users, req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: 'No encontrado' });
    if (!roles.canModifyUser(req.user, target)) {
      return res.status(403).json({ ok: false, error: 'No se puede eliminar una cuenta GM' });
    }
    data.users = users.filter((x) => String(x.id) !== String(target.id));
    db.audit(data, 'borrado_usuario', req.user, { usuarioId: target.id, username: target.username });
    await store.persistCollections(['users', 'auditoria']);
    res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
};
