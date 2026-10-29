/* ============================================================================
 * js/modules/ventas.js — FACHADA VENTAS / METAS / SOLICITUDES (Paso 1)
 * Preserva las reglas del legacy (00-head-utils.js):
 *   borrar/editar venta → isAdmin || isGM || rol agencia|maestro + auditoría.
 * Ahora pasan por ventasService + RolesService en vez de db.* suelto.
 * Los onclick="borrarVenta(id)" / "editarVenta(id)" / "exportarEquipoCSV()"
 * del legacy siguen expuestos como globales: esta fachada los envuelve.
 * ========================================================================== */
(function () {
  'use strict';
  function actor() { return window.userService.sesion(); }
  function puedeEditarVentas(u) {
    return window.RolesService.isAdmin(u) || window.RolesService.isGM(u) ||
      window.RolesService.hasRole(u, ['agencia', 'maestro']);
  }
  window.VentasModule = {
    puedeEditar: puedeEditarVentas,
    borrar: function (id) {
      var yo = actor();
      if (!puedeEditarVentas(yo)) throw new Error('Sin permisos');
      var v = window.ventasService.getById(id);
      var ok = window.ventasService.eliminar(id);
      if (ok) window.Store.audit('borrado_venta', { ventaId: id, antes: v, despues: null });
      return ok;
    },
    actualizar: function (id, patch) {
      var yo = actor();
      if (!puedeEditarVentas(yo)) throw new Error('Sin permisos');
      var antes = window.ventasService.getById(id);
      var rec = window.ventasService.actualizar(id, patch);
      window.Store.audit('edicion_venta', { ventaId: id, antes: antes, despues: rec });
      return rec;
    },
    porAgente: function (id) { return window.ventasService.porAgente(id); },
    exportarCSV: function () {
      if (typeof window.exportarEquipoCSV === 'function') return window.exportarEquipoCSV();
      return null;
    }
  };
})();
