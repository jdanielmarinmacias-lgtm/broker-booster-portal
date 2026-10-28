/* Pantalla de carga (splash). Antes era un <script> inline en index.html; con
 * una CSP que prohíbe 'unsafe-inline' hay que servirlo como archivo.
 * Se oculta al terminar la carga, con un tope de 4 s para no bloquear nunca. */
(function () {
  var el = document.getElementById('splash-screen');
  if (!el) return;
  var hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    el.classList.add('splash-hide');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
  }
  if (document.readyState === 'complete') setTimeout(hide, 350);
  else window.addEventListener('load', function () { setTimeout(hide, 350); });
  setTimeout(hide, 4000);
})();
