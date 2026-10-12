/* ============================================================================
 * js/services/rolesService.js — SISTEMA PROPIO DE ROLES (copia canónica)
 * Extraído INTACTO de portal.html líneas ~503-532 (bloque ROLES + helpers).
 *
 * Se conserva el sistema interno y NO se usa Auth externo (decisión Paso 1).
 * Todo vive bajo window.RolesService para no colisionar con los globales
 * del legacy (const ROLES, hasRole, isAdmin...) que siguen existiendo en
 * js/legacy/01-core-db-roles-portal.js hasta que se migren las llamadas.
 *
 * Cuando todos los onclick/render usen RolesService, se borra el bloque
 * duplicado del legacy. Ver MIGRACION-PASO-1.md (fase de quema del legacy).
 * ========================================================================== */
(function () {
  'use strict';

  // Copia exacta de las definiciones del monolito (legacy + nuevos).
  var ROLE_DEFS = {
    admin:            { key: 'admin',            label: 'Admin',              level: 90 },
    editor:           { key: 'editor',           label: 'Editor',             level: 70 },
    maestro:          { key: 'maestro',          label: 'Maestro',            level: 60 },
    alumno:           { key: 'alumno',           label: 'Alumno',             level: 20 },
    gm:               { key: 'gm',               label: 'GM',                 level: 100 },
    desarrollador:    { key: 'desarrollador',    label: 'Desarrollador',      level: 80 },
    capacitador:      { key: 'capacitador',      label: 'Capacitador',        level: 60 },
    agencia:          { key: 'agencia',          label: 'Agencia',            level: 55 },
    agente_agencia:   { key: 'agente_agencia',   label: 'Agente de Agencia',  level: 25 },
    agente_desarrollo:{ key: 'agente_desarrollo',label: 'Agente en Desarrollo', level: 20 },
    prospecto:        { key: 'prospecto',        label: 'Prospecto',          level: 10 }
  };

  function norm(user) { return String(((user || {}).role || '')).toLowerCase(); }
  function hasRole(user, roles) { return roles.indexOf(norm(user)) !== -1; }

  var RolesService = {
    ROLES: ROLE_DEFS,

    hasRole: hasRole,
    isGM:      function (u) { return hasRole(u, ['gm']); },
    isAdmin:   function (u) { return hasRole(u, ['admin', 'gm', 'desarrollador']); },
    isTeacher: function (u) { return hasRole(u, ['maestro', 'capacitador', 'agencia', 'admin', 'gm', 'desarrollador']); },
    isStudent: function (u) { return hasRole(u, ['alumno', 'agente_desarrollo', 'agente_agencia', 'prospecto']); },
    isAgencia: function (u) { return hasRole(u, ['agencia', 'admin', 'gm', 'desarrollador']); },

    /** Lógica intacta de canModifyUser: cuentas GM protegidas. */
    canModifyUser: function (actor, target) {
      if (!actor || !target) return false;
      if (this.isGM(target)) {
        return this.isGM(actor) && String(actor.id) === String(target.id);
      }
      return !this.isGM(target);
    },

    /**
     * validarPermiso(actor, permiso) — puerta única para permisos finos.
     * Usa db.rolePermissions cuando existe; si no, cae a jerarquía por nivel.
     *  Ej: validarPermiso(user, 'ventas.borrar'), validarPermiso(user, 'users.crear')
     */
    validarPermiso: function (actor, permiso) {
      if (!actor) return false;
      if (this.isGM(actor) || norm(actor) === 'admin') return true; // GM/admin: todo
      try {
        var store = window.Store;
        var matrix = store ? store.collection('rolePermissions') : [];
        var row = matrix.filter(function (r) {
          return String(r.role || '').toLowerCase() === norm(actor)
              && String(r.permiso || r.action || '') === String(permiso);
        })[0];
        if (row) return !!row.allowed;
      } catch (e) { /* sin matriz: cae a nivel */ }
      var lvl = (ROLE_DEFS[norm(actor)] || {}).level || 0;
      var necesita = (permiso.indexOf('borrar') !== -1 || permiso.indexOf('admin') !== -1) ? 80 : 50;
      return lvl >= necesita;
    },

    /** Roles asignables al crear un usuario (para el <select> del admin). */
    listables: function () {
      return Object.keys(ROLE_DEFS).map(function (k) { return ROLE_DEFS[k]; });
    }
  };

  window.RolesService = RolesService;
})();
