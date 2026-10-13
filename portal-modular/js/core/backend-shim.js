/* ============================================================================
 * js/core/backend-shim.js — PUENTE LOGIN LEGACY ↔ BACKEND (Paso 2)
 * Cargar DESPUÉS del legacy y módulos, ANTES de 11-init (ver index.html).
 * En modo local (sin backend) no hace NADA: paridad total.
 * En modo backend:
 *  - Intercepta el submit de #login-form en fase de captura (el listener
 *    legacy nunca se entera) y autentica contra POST /api/auth/login.
 *  - Replica EXACTO el flujo post-login del legacy (misma lógica de
 *    destinos campus/admin, mismos hide/show, initializeApp, navigateTo).
 *  - Sincroniza db.users desde el servidor (el servidor manda; SIN hashes).
 *  - Si mustChangePassword → modal obligatorio de cambio de clave.
 *  - Envuelve window.logout para cerrar también la sesión del servidor.
 *  - Restaura sesión válida al cargar (entra directo a la app).
 * ========================================================================== */
(function () {
  'use strict';

  function $ (id) { return document.getElementById(id); }
  function loginError(msg) {
    const el = $('login-error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    else alert(msg);
  }

  /* --- Flujo de entrada: espejo de login() del legacy (01-core ~línea 471) --- */
  function enterApp(user, destination) {
    destination = destination || sessionStorage.getItem('login_destination') || 'campus';
    try { sessionStorage.removeItem('login_destination'); } catch (e) {}
    // currentUser es `let` del legacy: asignar el binding real (no window.*).
    try {
      // eslint-disable-next-line no-undef
      currentUser = user;
    } catch (e) { window.currentUser = user; }
    try { sessionStorage.setItem('pepes_user', JSON.stringify(user)); } catch (e) {}
    if ($('login-screen')) $('login-screen').classList.add('hidden');
    if ($('public-portal')) $('public-portal').classList.add('hidden');
    if ($('main-app')) $('main-app').classList.remove('hidden');
    if (typeof window.initializeApp === 'function') window.initializeApp();
    const go = () => {
      if (typeof window.navigateTo !== 'function') return;
      if (destination === 'admin') {
        window.navigateTo((user.role || '').toLowerCase() === 'gm' ? 'dashboard' : 'editor');
      } else {
        window.navigateTo(window.lastPage && window.lastPage !== 'login' ? window.lastPage : 'dashboard');
      }
    };
    setTimeout(go, 100);
  }

  function guardCampus(user) {
    // Espejo de las reglas de destino del legacy:
    // - admin rechaza al no-admin (con aviso).
    // - SIN POPUP: un admin/editor que entra por Campus va directo a su panel.
    const dest = sessionStorage.getItem('login_destination') || 'campus';
    const adminish = window.RolesService
      ? window.RolesService.isAdmin(user)
      : ['admin', 'gm', 'desarrollador'].includes((user.role || '').toLowerCase());
    if (dest === 'admin' && !adminish) { alert('Acceso denegado. Solo administradores y editores.'); return null; }
    return dest === 'admin' ? 'admin' : (adminish ? 'admin' : 'campus');
  }

  function askChangePassword() {
    /* ELIMINADA: el modal obligatorio se auto-actualizaba (no dejaba escribir)
     * y bloqueaba el ingreso de usuarios nuevos. El cambio de clave se hace
     * después desde el menú/perfil con POST /api/auth/change-password. */
    void arguments;
  }

  async function syncUsersMirror() {
    try {
      const users = await window.Backend.listUsers();
      // eslint-disable-next-line no-undef
      if (typeof db !== 'undefined' && db && Array.isArray(users)) {
        // eslint-disable-next-line no-undef
        db.users.length = 0;
        // eslint-disable-next-line no-undef
        users.forEach((u) => db.users.push(u)); // sin hashes: el servidor nunca los envía
      }
    } catch (e) { /* sin permiso de listar: se sigue con el mirror local */ }
  }

  async function boot() {
    const hasBackend = await window.Backend.detect();
    if (!hasBackend) return; // modo local: no tocar nada

    // Logout también cierra sesión en servidor (el legacy sigue con su flujo visual).
    if (typeof window.logout === 'function' && !window.logout.__backendWrapped) {
      const orig = window.logout;
      const wrapped = function () { window.Backend.logout(); return orig.apply(this, arguments); };
      wrapped.__backendWrapped = true;
      window.logout = wrapped;
    }

    // Intercepta el login en captura: el listener legacy no se ejecuta en modo backend.
    document.addEventListener('submit', async (e) => {
      if (!e.target || e.target.id !== 'login-form') return;
      e.preventDefault();
      e.stopPropagation();
      const u = ($('username') || {}).value || '';
      const p = ($('password') || {}).value || '';
      try {
        const r = await window.Backend.login(u, p);
        try { if (window.BackendSync) window.BackendSync.normUser(r.user); } catch (e) {}
        const finalDest = guardCampus(r.user);
        if (!finalDest) return;
        await syncUsersMirror();
        // fase 2b: pull del servidor ANTES del primer render (datos de todos).
        try { if (window.BackendSync) await window.BackendSync.pull(); } catch (e) {}
        // Sin modal de cambio de clave (bloqueaba el ingreso): entra directo.
        enterApp(r.user, finalDest);
      } catch (err) {
        loginError(err.message || 'Credenciales incorrectas');
      }
    }, true);

    // Sesión válida al cargar → entrar directo (comportamiento estándar con backend).
    try {
      const me = await window.Backend.me();
      if (me && me.user) {
        await syncUsersMirror();
        try { if (window.BackendSync) window.BackendSync.normUser(me.user); } catch (e) {}
        // fase 2b: el pull vive en sync.js (boot con sesión); aquí solo espejo.
        enterApp(me.user, 'campus');
      }
    } catch (e) { /* sin sesión: se queda en portada/login */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
