/* ============================================================================
 * js/core/ia.js — IA DEL PORTAL SIN CLAVE EN EL NAVEGADOR
 *
 * Ninguna clave de IA vive ya en el navegador. Todo pasa por /api/ia/chat:
 * el servidor usa la clave propia del usuario (guardada por usuario, solo de
 * escritura) o la del propietario, y aplica el cupo diario.
 * ========================================================================== */
(function () {
  'use strict';

  var LEGACY_KEY = 'groq_api_key';
  var PROPIA_KEY = 'bb_api_key_propia';

  /* Limpia copias antiguas de claves que el código anterior guardó en
   * localStorage. Nunca se vuelven a escribir. */
  function limpiarClavesLocales() {
    try { localStorage.removeItem(PROPIA_KEY); } catch (e) {}
  }
  limpiarClavesLocales();

  var IA = {
    /* Estado del servidor, para decidir si se ofrece IA o el motor local. */
    servidor: false,
    limite: 0,
    usados: 0,
    restantes: 0,

    estado: async function () {
      try {
        var r = await fetch('/api/ia/estado', { credentials: 'same-origin' });
        if (!r.ok) { IA.servidor = false; return null; }
        var j = await r.json();
        IA.servidor = !!j.disponible;
        IA.limite = Number(j.limite) || 0;
        IA.usados = Number(j.usados) || 0;
        IA.restantes = Number(j.restantes) || 0;
        if (j.huella) await IA.purgarCopiaServidor(j.huella);
        return j;
      } catch (e) { IA.servidor = false; return null; }
    },

    /* El código anterior descargaba la clave del portal a localStorage. Se
     * borra si su huella coincide con la del servidor. */
    purgarCopiaServidor: async function (huella) {
      try {
        var guardada = String(localStorage.getItem(LEGACY_KEY) || '').trim();
        if (!guardada || !window.crypto || !crypto.subtle || !crypto.subtle.digest) return;
        var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(guardada));
        var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('').slice(0, huella.length);
        if (hex === huella) {
          localStorage.removeItem(LEGACY_KEY);
          console.info('[IA] copia local de la clave del portal eliminada');
        }
      } catch (e) { /* sin WebCrypto: se deja como está */ }
    },

    /* Llamada al proxy: devuelve la Response cruda del servidor. */
    chat: function (cuerpo) {
      return fetch('/api/ia/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo || {}),
      });
    },

    /* Punto único para las funciones de IA del portal. */
    completar: function (cuerpo) {
      return IA.chat(cuerpo);
    },
  };

  window.IA = IA;
})();
