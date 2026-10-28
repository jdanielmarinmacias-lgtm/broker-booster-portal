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

  /* IA del portal: pregunta al servidor si hay IA disponible y cuánto cupo
   * queda. La CLAVE ya no se descarga al navegador (antes /api/ia/key la
   * entregaba y quedaba guardada en localStorage de cada usuario). */
  async function ensureIAEstado() {
    try {
      if (window.IA && typeof window.IA.estado === 'function') await window.IA.estado();
    } catch (e) { /* sin red: la IA se ofrece igual y el error sale al usarla */ }
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
    // Pre-establecer la página destino ANTES de initializeApp() para que no
    // renderice Dashboard primero y cambie a Editor 100ms después ni quede en blanco.
    let targetPage = window.lastPage && window.lastPage !== 'login' ? window.lastPage : 'dashboard';
    if (destination === 'admin') {
      targetPage = (user.role || '').toLowerCase() === 'gm' ? 'dashboard' : 'editor';
    }
    if ((user.role || '').toLowerCase() === 'prospecto') {
      targetPage = 'mi-experiencia';
    }
    window.lastPage = targetPage;
    if (typeof window.initializeApp === 'function') window.initializeApp();
    if (typeof window.navigateTo === 'function' && window.lastPage !== targetPage) {
      window.navigateTo(targetPage);
    }
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
        users.forEach((u) => db.users.push(window.BackendSync ? window.BackendSync.normUser(u) : u)); // sin hashes: el servidor nunca los envía
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
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const prevBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Ingresando...';
      }
      try {
        const r = await window.Backend.login(u, p);
        try { if (window.BackendSync) window.BackendSync.normUser(r.user); } catch (e0) {}
        const finalDest = guardCampus(r.user);
        if (!finalDest) return;
        // Entrar DE INMEDIATO a la interfaz tras validar credenciales (sin bloquear
        // ~10s esperando la descarga completa de todas las colecciones). El pull del
        // servidor corre en paralelo y refresca la vista en cuanto llega.
        ensureIAEstado();
        enterApp(r.user, finalDest);
        if (window.BackendSync) {
          window.BackendSync.pull().then((ok) => {
            if (ok) {
              try { if (typeof window.ensureDbDefaults === 'function') window.ensureDbDefaults(); } catch (e1) {}
              try { if (typeof window.applyBranding === 'function') window.applyBranding(); } catch (e2) {}
              try { if (typeof window.render === 'function') window.render(); } catch (e3) {}
            }
          }).catch(() => {});
        } else {
          syncUsersMirror().then(() => {
            try { if (typeof window.render === 'function') window.render(); } catch (e4) {}
          });
        }
      } catch (err) {
        loginError(err.message || 'Credenciales incorrectas');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevBtnHtml;
        }
      }
    }, true);

    // Sesión válida al cargar → entrar directo (comportamiento estándar con backend).
    try {
      const me = await window.Backend.me();
      if (me && me.user) {
        try { if (window.BackendSync) window.BackendSync.normUser(me.user); } catch (e) {}
        ensureIAEstado();
        enterApp(me.user, 'campus');
      }
    } catch (e) { /* sin sesión: se queda en portada/login */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
