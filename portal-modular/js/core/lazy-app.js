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

  var V = '20261059a';

  /* El worker de PDF.js debe ser EXACTAMENTE la misma versión que la API
   * (3.11.174) y se sirve desde el propio dominio. Así la CSP sigue en
   * `worker-src 'self' blob:` —sin abrirla a cdnjs— y el lector usa un worker
   * real en vez del "fake worker" del hilo principal, que avisa en consola y
   * bloquea la página con PDFs grandes. La marca ?v= evita que el worker
   * quede cacheado tras un despliegue. */
  var PDF_API = 'js/vendor/pdf.min.js?v=' + V;
  var PDF_WORKER = 'js/vendor/pdf.worker.min.js?v=' + V;
  var promesaPdf = null;

  function configurarPdfWorker() {
    try {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(PDF_WORKER, document.baseURI).href;
      }
    } catch (e) { /* PDF.js aún no cargó: se configura al terminar la carga */ }
  }

  /* Carga la API local cuando alguien pide un PDF antes de que el campus
   * termine de cargar (Gu-IA, cotizador, comparador). Es el mismo archivo de
   * js/vendor/ que ya trae LIBRERIAS: una sola versión (3.11.174) para API y
   * worker, sin tocar el CDN. */
  function cargarPdf() {
    if (window.pdfjsLib) {
      configurarPdfWorker();
      return Promise.resolve(window.pdfjsLib);
    }
    if (promesaPdf) return promesaPdf;
    promesaPdf = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = new URL(PDF_API, document.baseURI).href;
      s.onload = function () {
        configurarPdfWorker();
        resolve(window.pdfjsLib);
      };
      s.onerror = function () {
        promesaPdf = null;
        reject(new Error('no se pudo cargar el lector de PDF'));
      };
      document.head.appendChild(s);
    });
    return promesaPdf;
  }

  /* Librerías de terceros: se piden primero, como estaban en el <head>. La
   * API de PDF.js va con el worker local, ambos 3.11.174: si la API viniera
   * del CDN y el worker del portal, una diferencia de build podía dejar el
   * render de páginas esperando al worker. */
  var LIBRERIAS = [
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
    PDF_API,
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  ];

  /* Secciones del campus y módulos de pantalla, en el orden original. */
  /* Viven en el servidor (/api/campus): solo se entregan con sesión válida. */
  var SECCIONES = [
    'api/campus/legacy/02-modulo-b.js',
    'api/campus/legacy/03-config-73l.js',
    'api/campus/legacy/04-modulo-d.js',
    'api/campus/legacy/05-modulo-e.js',
    'api/campus/legacy/06-modulo-f.js',
    'api/campus/legacy/07-modulo-g.js',
    'api/campus/legacy/08-snippet-h.js',
    'api/campus/legacy/09-modulo-i.js',
    'api/campus/legacy/10-modulo-j.js',
    'api/campus/modules/auth-custom.js',
    'api/campus/modules/dashboard.js',
    'api/campus/modules/chat.js',
    'api/campus/modules/ventas.js',
    'api/campus/modules/inventario.js',
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
      configurarPdfWorker();
      if (resultado.fallos.length) {
        /* Sin sesión (401) o red caída: no dejar la promesa fallida en caché,
         * así el siguiente intento (tras entrar) vuelve a pedir los archivos. */
        promesa = null;
        return resultado;
      }
      terminado = true;
      return resultado;
    });
    return promesa;
  }

  /* --- Disparadores -------------------------------------------------------
   * El campus se pide cuando de verdad se va a usar, no antes:
   *  1) al entrar con sesión válida ya guardada en el navegador,
   *  2) al completar el login (backend-shim o compuerta de initializeApp),
   *  3) al llamar BBApp.cargar() explícitamente.
   * Sin sesión no se pide nada: la portada no paga los 14 archivos. */

  function dispararSiHaceFalta() {
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
    /* Único punto que fija el worker de PDF.js: la API y el worker salen de
     * js/vendor/ (mismo origen y misma versión). Las lecturas de PDF del
     * legacy llaman a BBApp.pdf.cargar() en vez de cargar el CDN. */
    pdf: { api: PDF_API, worker: PDF_WORKER, configurar: configurarPdfWorker, cargar: cargarPdf },
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
    configurarPdfWorker();
    ponerCompuerta();
    dispararSiHaceFalta();
  }

  instalar();
  document.addEventListener('DOMContentLoaded', instalar);
})();
