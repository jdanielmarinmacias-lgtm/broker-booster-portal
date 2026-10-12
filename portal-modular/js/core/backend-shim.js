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
    // campus rechaza roles admin-ish; admin rechaza al resto.
    const dest = sessionStorage.getItem('login_destination') || 'campus';
    const adminish = window.RolesService
      ? window.RolesService.isAdmin(user)
      : ['admin', 'gm', 'desarrollador'].includes((user.role || '').toLowerCase());
    if (dest === 'admin' && !adminish) { alert('Acceso denegado. Solo administradores y editores.'); return false; }
    if (dest !== 'admin' && adminish) {
      alert('Los editores solo pueden acceder al panel de edición. Usa "Acceso administrativo".');
      return false;
    }
    return true;
  }

  function askChangePassword(user, then) {
    const show = window.showModal || ((html) => { document.body.insertAdjacentHTML('beforeend', `<div id="tmp-pw">${html}</div>`); });
    const close = window.closeModal || (() => { const t = $('tmp-pw'); if (t) t.remove(); });
    show(`<form id="pw-form" class="p-6 space-y-3 max-w-md w-full">
      <h3 class="font-bold text-lg">Cambia tu contraseña</h3>
      <p class="text-sm text-slate-500">Tu cuenta usa una clave temporal. Crea una definitiva (mínimo 8 caracteres).</p>
      <input name="current" type="password" required placeholder="Clave temporal actual" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">
      <input name="next" type="password" required minlength="8" placeholder="Nueva contraseña" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">
      <div id="pw-err" class="hidden text-sm text-red-600"></div>
      <button class="w-full bg-indigo-600 text-white py-2 rounded font-semibold">Guardar y entrar</button>
    </form>`);
    $('pw-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await window.Backend.changePassword(f.get('current'), f.get('next'));
        close();
        then();
      } catch (err) {
        const box = $('pw-err');
        if (box) { box.textContent = err.message; box.classList.remove('hidden'); }
      }
    };
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
        if (!guardCampus(r.user)) return;
        await syncUsersMirror();
        // fase 2b: pull del servidor ANTES del primer render (datos de todos).
        try { if (window.BackendSync) await window.BackendSync.pull(); } catch (e) {}
        const proceed = () => enterApp(r.user);
        if (r.mustChangePassword) askChangePassword(r.user, proceed);
        else proceed();
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
