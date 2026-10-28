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

  /* Clave del propio usuario: la que pegó en Config IA o guardó en el navegador.
   * La del portal ya no se descarga nunca, así que lo que haya aquí es suya. */
  function clavePropia() {
    try {
      var guardada = String(localStorage.getItem('groq_api_key') || '').trim();
      if (/^gsk_[A-Za-z0-9_-]{20,}$/.test(guardada)) return guardada;
      if (window.psAPIKey) return String(window.psAPIKey);
      var db = (typeof psGetDB === 'function') ? psGetDB() : null;
      var conf = (db && db.practicaConfig) || {};
      return String(conf.apiKey || '');
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
        return j;
      } catch (e) { IA.servidor = false; return null; }
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
