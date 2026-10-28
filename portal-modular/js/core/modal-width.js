/* ============================================================================
 * js/core/modal-width.js — ANCHO DEL CONTENEDOR DE LOS MODALES
 *
 * showModal() envolvia el contenido en un contenedor de ancho fijo (max-w-lg)
 * salvo que el HTML declarara `modal-large`, `modal-scroll`, max-w-7xl o
 * max-w-[95vw]; en ese caso el contenedor adoptaba el max-w-* declarado.
 *
 * Esa regla vive aquí, en una función pura, para que una prueba automática
 * pueda comprobarla sin navegador (backend/test/portal-checks.js): el lector
 * de lecciones debe abrir al doble del modal estándar.
 *
 * UMD mínimo: en el navegador publica window.BBModal; en Node, module.exports.
 * ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BBModal = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* Solo se busca el ancho cuando el contenido pide un modal grande. */
  var ANCHO_DECLARADO = /max-w-(?:[1-7]xl|\[95vw\])/;
  var GRANDES = ['max-w-7xl', 'max-w-[95vw]', 'modal-large', 'modal-scroll'];

  /* Clases del contenedor (sin el resto de clases base) para un HTML dado. */
  function anchoContenedor(html) {
    var s = String(html == null ? '' : html);
    var esGrande = GRANDES.some(function (marca) { return s.indexOf(marca) !== -1; });
    if (!esGrande) return 'w-full max-w-lg';
    var cap = s.match(ANCHO_DECLARADO);
    return cap ? 'w-full ' + cap[0] : '';
  }

  return { anchoContenedor: anchoContenedor };
});
