/* ============================================================================
 * js/core/backend.js — CLIENTE DEL BACKEND PROPIO (Paso 2)
 * Autodetecta: si GET /api/auth/me responde JSON con marca backend → modo API.
 * Si no (file://, servidor estático simple, backend caído) → modo local legacy.
 * Cargar ANTES que el legacy (no depende de db/currentUser).
 * ========================================================================== */
(function () {
  'use strict';

  async function call(path, opts) {
    opts = opts || {};
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', // envía la cookie HttpOnly de sesión
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error('Respuesta no JSON del servidor'); }
    if (!res.ok) {
      const err = new Error((json && json.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.json = json;
      throw err;
    }
    return json;
  }

  const Backend = {
    available: false,

    /** Detecta presencia del backend sin romper el modo local. */
    async detect() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        const json = await res.json();
        this.available = !!(json && (json.backend === true || json.ok === true));
      } catch (e) { this.available = false; }
      return this.available;
    },

    api: call,
    me: () => call('/api/auth/me'),
    login: (username, password) => call('/api/auth/login', { method: 'POST', body: { username, password } }),
    logout: () => call('/api/auth/logout', { method: 'POST' }).catch(() => ({ ok: true })),
    changePassword: (current, next) =>
      call('/api/auth/change-password', { method: 'POST', body: { current, next } }),
    listUsers: () => call('/api/users').then((r) => r.users),
  };

  window.Backend = Backend;
})();
