/* ============================================================================
 * js/core/bx-manual.js — ACCIONES ESCRITAS A MANO que necesitan el elemento
 *
 * Unos pocos manejadores inline usaban `this` (el propio botón/input) y sus
 * valores solo existen al disparar el evento: no pueden pasar por parámetro
 * desde la plantilla. Se invocan con bxOn y reciben `this` = elemento, igual
 * que el manejador inline original:
 *   '…<button ' + bxOn('click','bxM.borrarCercano',['.fila']) + ' …>'
 * ========================================================================== */
(function () {
  'use strict';

  window.bxM = {
    /* this.closest(sel).remove() — quitar la fila/tarjeta que contiene el botón. */
    borrarCercano: function (sel) {
      var nodo = this && this.closest ? this.closest(sel) : null;
      if (nodo) nodo.remove();
    },

    /* uploadImageBase64(this, 'prev', 'logo') — subir la imagen del <input file>. */
    subirImagen: function (prev, logo) {
      if (typeof window.uploadImageBase64 === 'function') window.uploadImageBase64(this, prev, logo);
    },

    /* propsFoto(this, ix) */
    propsFoto: function (ix) {
      if (typeof window.propsFoto === 'function') window.propsFoto(this, ix);
    },

    /* propsGlobales[ix].tipo = this.value */
    propsTipo: function (ix) {
      if (window.propsGlobales && window.propsGlobales[ix]) window.propsGlobales[ix].tipo = this.value;
    },

    /* cotCfgChkDel(ramoId, this): el elemento va como segundo argumento. */
    cotChkDel: function (ramoId) {
      if (typeof window.cotCfgChkDel === 'function') window.cotCfgChkDel(ramoId, this);
    }
  };
})();
