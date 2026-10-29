/* ============================================================================
 * js/modules/chat.js — FACHADA CHAT DE GRUPOS + MENSAJES (Paso 1)
 * Colecciones: groups, groupMessages, messages. Servicios: groupsService,
 * chatService, directMessagesService. El render legacy sigue mandando;
 * migrar aquí un render a la vez (primero lectura, luego envío).
 * ========================================================================== */
(function () {
  'use strict';
  window.ChatModule = {
    grupos: function () { return window.groupsService.getAll(); },
    mensajesDe: function (groupId) { return window.chatService.porGrupo(groupId); },
    enviar: function (groupId, texto) {
      var yo = window.userService.sesion();
      return window.chatService.crear({
        groupId: groupId, texto: texto,
        autor: yo ? yo.id : null, autorNombre: yo ? yo.name : '',
        fecha: Date.now()
      });
    },
    directos: function () { return window.directMessagesService.getAll(); }
  };
})();
