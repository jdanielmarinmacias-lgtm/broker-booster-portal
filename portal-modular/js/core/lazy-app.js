/* ============================================================================
 * js/core/lazy-app.js — CARGA DIFERIDA DEL CAMPUS
 *
 * La portada pública (lo primero que ve cualquier visita, con o sin sesión) solo
 * necesita el núcleo: antes descargaba además 19 archivos que no usa —secciones
 * del campus, módulos de pantalla y las librerías de gráficas, calendario y PDF—
 * para nada. Ahora esos 19 se cargan al ENTRAR al campus (login válido o sesión
 * restaurada), en el MISMO orden que tenían en index.html.
 *
 * Cómo se conserva el comportamiento: los scripts se insertan con `async=false`,
 * así el navegador los DESCARGA en paralelo pero los EJECUTA en el orden de
 * inserción, exactamente como los `defer` del HTML. No se reordena nada.
 *
 * Si algún archivo falla, se resuelve igual (el campus se abre con lo que haya y
 * el error queda en consola) para no dejar al usuario atrapado en el login.
 * ========================================================================== */
(function () {
  'use strict';

  var V = '20261048a';

  /* Librerías de terceros: se piden primero, como estaban en el <head>. */
  var LIBRERIAS = [
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  ];

  /* Secciones del campus y módulos de pantalla, en el orden original. */
  var SECCIONES = [
    'js/legacy/02-modulo-b.js',
    'js/legacy/03-config-73l.js',
    'js/legacy/04-modulo-d.js',
    'js/legacy/05-modulo-e.js',
    'js/legacy/06-modulo-f.js',
    'js/legacy/07-modulo-g.js',
    'js/legacy/08-snippet-h.js',
    'js/legacy/09-modulo-i.js',
    'js/legacy/10-modulo-j.js',
    'js/modules/auth-custom.js',
    'js/modules/dashboard.js',
    'js/modules/chat.js',
    'js/modules/ventas.js',
    'js/modules/inventario.js',
  ];

  var conVersion = function (ruta) { return ruta + '?v=' + V; };
  var listaCompleta = LIBRERIAS.concat(SECCIONES.map(conVersion));

  var promesa = null;
  var terminado = false;

  function cargar() {
    if (promesa) return promesa;
    promesa = new Promise(function (resolve) {
      var pendientes = listaCompleta.length;
      var fallos = [];
      if (!pendientes) return resolve({ fallos: fallos });

      var terminar = function (url, ok) {
        if (!ok) {
          fallos.push(url);
          try { console.error('[campus] no se pudo cargar ' + url); } catch (e) {}
        }
        pendientes -= 1;
        if (pendientes === 0) resolve({ fallos: fallos });
      };

      listaCompleta.forEach(function (url) {
        var s = document.createElement('script');
        s.src = url;
        s.async = false;            // descarga en paralelo, ejecuta en orden
        s.setAttribute('data-bb-campus', '1');
        s.onload = function () { terminar(url, true); };
        s.onerror = function () { terminar(url, false); };
        document.head.appendChild(s);
      });
    });
    promesa = promesa.then(function (resultado) {
      terminado = true;
      return resultado;
    });
    return promesa;
  }

  /* --- Disparadores -------------------------------------------------------
   * El campus se pide cuando de verdad se va a usar, no antes:
   *  1) al abrirse la pantalla de acceso (el visitante ya va a entrar),
   *  2) si el navegador recuerda una sesión,
   *  3) al llamar BBApp.cargar() explícitamente (backend-shim/sync).
   * Así la portada sigue siendo la única visita que no paga los 19 archivos. */

  function pantallaDeAccesoVisible() {
    var el = document.getElementById('login-screen');
    return !!(el && !el.classList.contains('hidden'));
  }

  /* Nota: NO se dispara por "la pantalla de acceso está visible" en el arranque:
   * el HTML la trae a la vista y se cargaría el campus en cada visita a la
   * portada. El MutationObserver sólo reacciona al CAMBIO (clic en Acceso). */

  function observarAcceso() {
    var el = document.getElementById('login-screen');
    if (!el || !window.MutationObserver) return;
    new MutationObserver(function () {
      if (pantallaDeAccesoVisible()) cargar();
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function dispararSiHaceFalta() {
    observarAcceso();
    try {
      if (sessionStorage.getItem('pepes_user') || localStorage.getItem('pepes_user')) cargar();
    } catch (e) { /* sin storage: el login dispara la carga igual */ }
  }

  /* Compuerta de initializeApp: varias entradas del núcleo (checkSession, login
   * local) pintan el campus en el acto y usan funciones de las secciones
   * diferidas (sinDB, renderConvenciones...). Aquí se espera la carga UNA vez,
   * sin tocar cada llamador: si el campus ya está, se ejecuta al instante. */
  function ponerCompuerta() {
    var original = window.initializeApp;
    if (typeof original !== 'function' || original.__bbCompuerta) return;
    var conCompuerta = function () {
      var args = arguments, self = this;
      if (window.BBApp && !window.BBApp.listo()) {
        window.BBApp.cargar().then(function () {
          try { original.apply(self, args); } catch (e) { console.error('[campus] initializeApp:', e); }
        });
        return;
      }
      return original.apply(self, args);
    };
    conCompuerta.__bbCompuerta = true;
    window.initializeApp = conCompuerta;
  }

  window.BBApp = {
    cargar: cargar,
    rutas: listaCompleta.slice(),
    /* ¿Ya está todo ejecutado? (la compuerta lo usa para no esperar de más) */
    listo: function () { return terminado; },
  };

  /* Con `defer` el documento ya está en "interactive": este script corre ANTES
   * que el núcleo, así que initializeApp() aún no existe. Por eso NO basta con
   * intentarlo aquí: hay que reintentar en DOMContentLoaded, que es justo
   * cuando el núcleo llama a checkSession → initializeApp(). Este listener se
   * registra antes que el del núcleo, así que la compuerta está puesta. */
  function instalar() {
    ponerCompuerta();
    dispararSiHaceFalta();
  }

  instalar();
  document.addEventListener('DOMContentLoaded', instalar);
})();
