/* ============================================================================
 * js/core/ia.js — IA DEL PORTAL SIN CLAVE EN EL NAVEGADOR
 *
 * Antes, el cliente pedía la clave de Groq a /api/ia/key y llamaba a Groq con
 * ella: cualquiera con sesión podía copiarla del inspector y gastar el saldo
 * del propietario. Ahora todo pasa por /api/ia/chat, que pone la clave en el
 * servidor y aplica un cupo diario por usuario.
 *
 * La clave propia del usuario (configurada en «Práctica → Config IA») sigue
 * funcionando: si existe, se llama al proveedor directamente, como siempre.
 * ========================================================================== */
(function () {
  'use strict';

  var PROVEEDOR_POR_DEFECTO = 'https://api.groq.com/openai/v1/chat/completions';
  var LEGACY_KEY = 'groq_api_key';
  var PROPIA_KEY = 'bb_api_key_propia';

  /* Clave del propio usuario. La nueva vive SOLO en este navegador
   * (bb_api_key_propia): nunca en la base compartida ni en `practicaConfig`.
   * `groq_api_key` se conserva como compatibilidad para Teo y para claves
   * propias capturadas antes de la rotación; la copia de la clave DEL PORTAL
   * se elimina con purgarCopiaServidor cuando su huella coincide. */
  function clavePropia() {
    try {
      var propia = String(localStorage.getItem(PROPIA_KEY) || '').trim();
      if (propia) return propia;
      var legacy = String(localStorage.getItem(LEGACY_KEY) || '').trim();
      if (legacy) return legacy;
      if (window.psAPIKey) return String(window.psAPIKey).trim();
      return '';
    } catch (e) { return ''; }
  }

  var IA = {
    /* Estado del servidor, para decidir si se ofrece IA o el motor local. */
    servidor: false,
    limite: 0,
    usados: 0,
    restantes: 0,
    clavePropia: clavePropia,

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
     * borra si su huella coincide con la del servidor; así no se toca una
     * clave propia del usuario que viva en el mismo slot legado. */
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
          try { if (window.psAPIKey === guardada) window.psAPIKey = ''; } catch (e0) {}
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

    /* Punto único para las funciones de IA del portal: con clave propia va
     * directo al proveedor; sin ella, por el proxy (misma forma de respuesta,
     * así que los llamadores no cambian cómo leen el resultado). */
    completar: function (cuerpo, opciones) {
      var propia = clavePropia();
      if (propia) {
        var url = (opciones && opciones.url) || window.psAPIUrl || PROVEEDOR_POR_DEFECTO;
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + propia },
          body: JSON.stringify(cuerpo || {}),
        });
      }
      return IA.chat(cuerpo);
    },
  };

  window.IA = IA;
})();
