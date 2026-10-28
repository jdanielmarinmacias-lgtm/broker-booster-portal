/* ============================================================================
 * js/core/actions.js — ACCIONES DELEGADAS (CSP sin 'unsafe-inline')
 *
 * El portal nació con manejadores inline (onclick="…"). Con una CSP que
 * prohíbe 'unsafe-inline' el navegador los ignora: los botones quedan muertos
 * sin error visible. Aquí se sustituyen por delegación de eventos:
 *
 *   <button data-bx-click="a12" data-p0="s:5">  →  __bx.a12(event, '5')
 *
 * - Un solo listener por tipo de evento (burbuja en document; 'error' y
 *   'ended' no burbujean → captura en window). También cubre el HTML que se
 *   pinta DESPUÉS de cargar (antes los manejadores inline sí funcionaban por
 *   ser atributos, así que no se pierde nada).
 * - El cuerpo de cada acción vive en bx-actions.js (generado por
 *   tools/csp-inline.js); aquí no hay eval ni new Function.
 * - `this` dentro del cuerpo es el elemento (igual que un manejador inline) y
 *   `event` es el evento real.
 * - Devolver false equivale a "return false" inline: preventDefault +
 *   stopPropagation.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__bxReady) return;
  window.__bxReady = true;

  /* Tipos que viajan en el atributo: n número · b booleano · s cadena ·
   * o objeto/array (JSON) · z null · u undefined. Se codifica para que un
   * valor con comillas, espacios o acentos no rompa el atributo HTML y para
   * que el valor llegue con SU tipo (un id "5" de texto no se vuelve 5). */
  function bxTipo(v) {
    if (v === null) return 'z';
    var t = typeof v;
    if (t === 'undefined') return 'u';
    if (t === 'number') return 'n';
    if (t === 'boolean') return 'b';
    if (t === 'string') return 's';
    return 'o';
  }

  window.bxP = function (v) {
    var t = bxTipo(v);
    var cuerpo = (t === 'o') ? JSON.stringify(v) : (t === 'u' || t === 'z') ? '' : String(v);
    return encodeURIComponent(t + ':' + cuerpo);
  };

  /* Evalúa en el momento de pintar la expresión de un parámetro. Si la
   * expresión falla (un dato incompleto que antes solo se evaluaba al pulsar),
   * el atributo queda sin valor en vez de romper el render de toda la vista. */
  window.bxE = function (fn) {
    try { return window.bxP(fn()); } catch (e) { return 'u:'; }
  };

  /* Emite los atributos de una acción para HTML armado por CONCATENACIÓN
   * ('…<button ' + bxOn('click','miFuncion',[dato]) + ' …>'), donde el codemod
   * no puede convertir el atributo porque el valor está partido en trozos. */
  window.bxOn = function (ev, fn, args) {
    var s = 'data-bx-' + ev + '="g:' + fn + '"';
    (args || []).forEach(function (a, i) {
      s += ' data-p' + i + '="' + window.bxP(a) + '"';
    });
    return s;
  };

  function bxGlobal(nombre) {
    var partes = String(nombre).split('.');
    var obj = window;
    for (var i = 0; i < partes.length; i++) {
      if (obj == null) return null;
      obj = obj[partes[i]];
    }
    return obj;
  }

  function bxLeer(raw) {
    var s;
    try { s = decodeURIComponent(raw); } catch (e) { s = raw; }
    var t = s.charAt(0);
    var cuerpo = s.slice(2);
    if (t === 'z') return null;
    if (t === 'u') return undefined;
    if (t === 'n') return Number(cuerpo);
    if (t === 'b') return cuerpo === '1' || cuerpo === 'true';
    if (t === 'o') {
      try { return JSON.parse(cuerpo); } catch (e) { return null; }
    }
    return cuerpo;
  }

  function bxArgs(el) {
    var args = [];
    for (var i = 0; el.getAttribute('data-p' + i) !== null; i++) {
      args.push(bxLeer(el.getAttribute('data-p' + i)));
    }
    return args;
  }

  function bxEjecutar(ev, nombre) {
    var reg = window.__bx;
    if (!reg || !ev || !ev.target) return;
    var attr = 'data-bx-' + nombre;
    /* Ruta del evento: del objetivo hacia arriba (mismo orden que el burbujeo
     * de los manejadores inline, de dentro hacia fuera). */
    var ruta = [];
    var nodo = ev.target;
    while (nodo && nodo.nodeType === 1) {
      if (nodo.getAttribute && nodo.getAttribute(attr)) ruta.push(nodo);
      nodo = nodo.parentElement;
    }
    if (!ruta.length) {
      /* 'error'/'ended' se capturan en window: algunos objetivos (una imagen
       * recién creada, un <source>) pueden no colgar todavía del documento. */
      var t = ev.target;
      if (t && t.nodeType === 1 && t.getAttribute && t.getAttribute(attr)) ruta.push(t);
    }
    for (var i = 0; i < ruta.length; i++) {
      var el = ruta[i];
      var clave = el.getAttribute(attr);
      /* 'g:nombre' = función global (usada por bxOn en HTML concatenado). */
      var fn = clave.slice(0, 2) === 'g:' ? bxGlobal(clave.slice(2)) : reg[clave];
      if (typeof fn !== 'function') continue;
      /* 'g:' reproduce EXACTAMENTE una llamada inline: fn(args…) con this = el.
       * Los cuerpos generados (aN) reciben además el evento como 1er argumento,
       * porque su código original podía usar `event`. */
      var invocar = function () {
        return clave.slice(0, 2) === 'g:'
          ? fn.apply(el, bxArgs(el))
          : fn.apply(el, [ev].concat(bxArgs(el)));
      };
      var r;
      try {
        r = invocar();
      } catch (e) {
        /* La portada pública tiene botones que abren formularios del campus
         * (p. ej. «Quiero Aplicar» → openSolicitudModal). Esos módulos ahora se
         * cargan al entrar: si falta la función, se carga el campus y se
         * reintenta UNA vez, en vez de dejar el botón muerto. */
        if (e && e.name === 'ReferenceError' && !el.__bxReintento
            && window.BBApp && typeof window.BBApp.cargar === 'function') {
          el.__bxReintento = true;
          window.BBApp.cargar().then(function () {
            el.__bxReintento = false;
            try { invocar(); } catch (e2) { setTimeout(function () { throw e2; }, 0); }
          });
          continue;
        }
        /* Igual que un manejador inline: el error se reporta pero no tumba
         * el resto de la interfaz. */
        setTimeout(function () { throw e; }, 0);
        continue;
      }
      if (r === false) {
        ev.preventDefault();
        ev.stopPropagation();
        break;
      }
      /* stopPropagation() dentro del manejador = "no sigas subiendo". Antes se
       * ignoraba y un botón dentro de una tarjeta clicable ejecutaba también la
       * acción de la tarjeta: la rueda de "Editar grupo" (Mensajes) abría el
       * editor y, acto seguido, el chat encima — parecía que no hacía nada. */
      if (ev.cancelBubble) break;
    }
  }

  var EN_BURBUJEO = ['click', 'change', 'input', 'dblclick', 'keydown', 'submit'];
  var EN_CAPTURA = ['error', 'ended'];

  EN_BURBUJEO.forEach(function (nombre) {
    document.addEventListener(nombre, function (ev) { bxEjecutar(ev, nombre); }, false);
  });
  EN_CAPTURA.forEach(function (nombre) {
    window.addEventListener(nombre, function (ev) { bxEjecutar(ev, nombre); }, true);
  });
})();
