/* ============================================================================
 * js/modules/auth-custom.js — AUTENTICACIÓN PROPIA (fachada del Paso 1)
 * Conserva el login interno del portal (username → currentUser global).
 * Hoy delega al legacy + userService; NO introduce Auth externo.
 *
 * Cómo migrar una función legacy aquí (ejemplo con login):
 *   1. Localiza la función en js/legacy/01-core-db-roles-portal.js
 *   2. Cópiala a este archivo adaptando db.* → userService/Store
 *   3. Deja un shim en el legacy que delegue: function login(){ return AuthCustom.login(...) }
 *   4. Verifica que los onclick="login(...)" sigan funcionando (son globales)
 * ========================================================================== */
(function () {
  'use strict';

  var AuthCustom = {
    /** Login interno: busca por username y fija currentUser (comportamiento legacy). */
    login: function (username) {
      var user = window.userService.login(username);
      if (user && typeof window.navigateTo === 'function') {
        // Destino legacy: GM → dashboard, resto → editor (línea ~881 del monolito)
        var dest = String(user.role || '').toLowerCase() === 'gm' ? 'dashboard' : 'editor';
        setTimeout(function () { window.navigateTo(dest); }, 100);
      }
      return user;
    },
    logout: function () {
      window.userService.logout();
      if (typeof window.renderLogin === 'function') window.renderLogin();
      else location.reload();
    },
    sesion: function () { return window.userService.sesion(); },
    crearUsuario: function (datos) { return window.userService.crearUsuario(datos); },
    puede: function (permiso) {
      return window.RolesService.validarPermiso(this.sesion(), permiso);
    }
  };

  window.AuthCustom = AuthCustom;
})();
