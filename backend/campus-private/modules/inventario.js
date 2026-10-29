/* ============================================================================
 * js/modules/inventario.js — FACHADA INVENTARIOS (Paso 1)
 * Cubre: autos (autoHub/autoCartera + escaparate público au*),
 * financiera (finCartera), inmuebles (inmCartera/inmPublica + escaparate inm*).
 * Servicios: autosService, financieraService, inmueblesService.
 * Los renders de vitrina (auVitrinaFicha, inmVerProp...) siguen en legacy;
 * migrar primero las lecturas (listas/fichas) y al final los formularios.
 * ========================================================================== */
(function () {
  'use strict';
  window.InventarioModule = {
    autos: function () { return window.autosService.getAll(); },
    autoPorId: function (id) { return window.autosService.getById(id); },
    carteraAutos: function () { return window.autosService.cartera(); },
    inmueblesPublicados: function () { return window.inmueblesService.publicados(); },
    inmueblePorId: function (id) { return window.inmueblesService.getById(id); },
    verAuto: function (id) {
      if (typeof window.auVerAuto === 'function') return window.auVerAuto(id);
      return this.autoPorId(id);
    },
    verPropiedad: function (id) {
      if (typeof window.inmVerProp === 'function') return window.inmVerProp(id);
      return this.inmueblePorId(id);
    }
  };
})();
