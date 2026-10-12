/* ============================================================================
 * js/services/userService.js — SISTEMA PROPIO DE USUARIOS (sin Auth externo)
 * Fachada ordenada sobre la colección db.users.
 * Hoy persiste vía window.Store (localStorage 'pepes_v3_db').
 * Mañana: los mismos métodos harán fetch() al backend propio.
 *
 * API:
 *   userService.getAll() / getById(id) / buscar(texto)
 *   userService.crearUsuario({username, role, name, email, ...})
 *   userService.actualizarUsuario(id, patch)  (respeta canModifyUser)
 *   userService.eliminarUsuario(id, actor)    (GM protegido, con auditoría)
 *   userService.login(username) / logout() / sesion()  (sesión interna actual)
 *   userService.validarPermiso(user, permiso) (delega a RolesService)
 * ========================================================================== */
(function () {
  'use strict';

  function store() { return window.Store; }
  function roles() { return window.RolesService; }

  function currentActor() {
    // currentUser es `let` del legacy: binding global léxico, no window.*.
    // eslint-disable-next-line no-undef
    return (typeof currentUser !== 'undefined' && currentUser !== null) ? currentUser : null;
  }
  function setActor(user) {
    try {
      // eslint-disable-next-line no-undef
      currentUser = user; // asigna el binding real del legacy
    } catch (e) { window.currentUser = user; } // fallback si el legacy no cargó
  }

  var userService = {
    getAll: function () { return store().getAll('users'); },

    getById: function (id) { return store().getById('users', id); },

    buscar: function (texto) {
      var q = String(texto || '').toLowerCase().trim();
      if (!q) return this.getAll();
      return this.getAll().filter(function (u) {
        return String(u.name || u.nombre || '').toLowerCase().indexOf(q) !== -1
            || String(u.username || '').toLowerCase().indexOf(q) !== -1
            || String(u.email || '').toLowerCase().indexOf(q) !== -1;
      });
    },

    porRol: function (role) {
      return this.getAll().filter(function (u) {
        return String(u.role || '').toLowerCase() === String(role).toLowerCase();
      });
    },

    /** Agentes comerciales (mismo filtro que usa el ranking del legacy). */
    agentes: function () {
      return this.getAll().filter(function (u) {
        var r = String(u.role || '').toLowerCase();
        return r === 'agente_agencia' || r === 'agente_desarrollo' || r === 'alumno' || r === 'agente';
      });
    },

    crearUsuario: function (datos) {
      if (!datos || !datos.username) throw new Error('crearUsuario: username requerido');
      var dup = this.getAll().filter(function (u) {
        return String(u.username).toLowerCase() === String(datos.username).toLowerCase();
      })[0];
      if (dup) throw new Error('crearUsuario: el username ya existe');
      var rec = Object.assign({
        name: datos.username,
        role: 'prospecto',
        avatar: 'https://i.pravatar.cc/40?u=' + encodeURIComponent(datos.username),
        xp: 0, students: []
      }, datos);
      var creado = store().insert('users', rec);
      store().audit('creacion_usuario', { usuarioCreadoId: creado.id, username: creado.username, role: creado.role });
      return creado;
    },

    actualizarUsuario: function (id, patch, actor) {
      actor = actor || currentActor();
      var target = this.getById(id);
      if (!target) return null;
      if (actor && !roles().canModifyUser(actor, target)) {
        throw new Error('Sin permiso para modificar este usuario (cuenta GM protegida)');
      }
      var antes = JSON.parse(JSON.stringify(target));
      var rec = store().update('users', id, patch);
      store().audit('edicion_usuario', { usuarioId: id, antes: antes, despues: rec });
      // Si edité mi propia sesión, refrescar el global del legacy.
      if (actor && String(actor.id) === String(id)) {
        setActor(rec);
      }
      return rec;
    },

    eliminarUsuario: function (id, actor) {
      actor = actor || currentActor();
      var target = this.getById(id);
      if (!target) return false;
      if (!roles().canModifyUser(actor, target)) {
        throw new Error('No se puede eliminar una cuenta GM (protegida)');
      }
      var ok = store().remove('users', id);
      if (ok) store().audit('borrado_usuario', { usuarioId: id, username: target.username });
      return ok;
    },

    // ---- Sesión interna (la que ya usa el portal: currentUser global) ----
    login: function (username) {
      var user = this.getAll().filter(function (u) {
        return String(u.username).toLowerCase() === String(username).toLowerCase();
      })[0] || null;
      if (user) setActor(user);
      return user;
    },
    logout: function () {
      setActor(null);
    },
    sesion: function () { return currentActor(); },

    validarPermiso: function (user, permiso) { return roles().validarPermiso(user, permiso); }
  };

  window.userService = userService;
})();
