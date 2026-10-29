/* ============================================================================
 * js/core/ui-dialogs.js — NOTIFICACIONES Y CONFIRMACIONES PROPIAS
 *
 *   uiToast(msg, type)        → aviso breve (info | success | warning | error)
 *   await uiConfirm(msg, opts) → modal con Aceptar/Cancelar; resuelve true/false
 *
 * Sustituyen a alert() y confirm() nativos (bloqueantes y sin estilo).
 * El texto se escribe con textContent: nunca se interpreta como HTML.
 * ========================================================================== */
(function () {
  'use strict';

  var TONOS = {
    info:    'bg-[#0a2540] text-white',
    success: 'bg-[#22c55e] text-white',
    warning: 'bg-amber-500 text-white',
    error:   'bg-red-600 text-white'
  };

  function uiToast(msg, type) {
    var container = document.getElementById('ui-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ui-toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      container.className = 'fixed bottom-4 right-4 z-[10000] space-y-2 max-w-sm';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all duration-300 ' + (TONOS[type] || TONOS.info);
    toast.textContent = String(msg == null ? '' : msg);
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(function () { toast.remove(); }, 300);
    }, type === 'error' ? 5000 : 3500);
  }

  function uiConfirm(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var previo = document.activeElement;
      var overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';

      var caja = document.createElement('div');
      caja.setAttribute('role', 'alertdialog');
      caja.setAttribute('aria-modal', 'true');
      caja.className = 'bg-white rounded-2xl shadow-xl w-full max-w-sm p-6';

      var texto = document.createElement('p');
      texto.className = 'text-slate-800 text-base mb-6 whitespace-pre-line';
      texto.textContent = String(msg == null ? '' : msg);

      var fila = document.createElement('div');
      fila.className = 'flex justify-end gap-3';

      var btnNo = document.createElement('button');
      btnNo.type = 'button';
      btnNo.className = 'px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100';
      btnNo.textContent = opts.cancelText || 'Cancelar';

      var btnSi = document.createElement('button');
      btnSi.type = 'button';
      btnSi.className = 'px-4 py-2 rounded-xl text-sm font-semibold text-white ' + (opts.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#0a2540] hover:bg-[#123a66]');
      btnSi.textContent = opts.okText || 'Aceptar';

      fila.appendChild(btnNo);
      fila.appendChild(btnSi);
      caja.appendChild(texto);
      caja.appendChild(fila);
      overlay.appendChild(caja);
      document.body.appendChild(overlay);

      function cerrar(valor) {
        document.removeEventListener('keydown', teclas, true);
        overlay.remove();
        if (previo && typeof previo.focus === 'function') previo.focus();
        resolve(valor);
      }
      function teclas(e) {
        if (e.key === 'Escape') { e.preventDefault(); cerrar(false); }
        else if (e.key === 'Enter') { e.preventDefault(); cerrar(true); }
      }

      btnNo.addEventListener('click', function () { cerrar(false); });
      btnSi.addEventListener('click', function () { cerrar(true); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(false); });
      document.addEventListener('keydown', teclas, true);
      btnSi.focus();
    });
  }

  window.uiToast = uiToast;
  window.uiConfirm = uiConfirm;
})();
