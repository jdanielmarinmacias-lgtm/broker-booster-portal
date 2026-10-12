/* ============================================================================
 * js/core/media.js — SUBIDA DE ARCHIVOS AL SERVIDOR (Paso 4)
 * Media.subir(file, {scope, title, refId}) -> {url, mime, ...} (metadata).
 * Flujo Supabase: POST /api/media/sign -> PUT directo al Storage -> confirm.
 *   Los bytes NUNCA pasan por Vercel (límite 4.5MB): van directo a Supabase,
 *   por eso soporta videos de hasta 50MB.
 * Fallback local (dev sin Supabase): POST /api/media multipart.
 * Sin backend/sesión: lanza error y el llamador usa base64 como antes.
 * Cargar DESPUÉS de backend.js (usa window.Backend para detectar API).
 * ========================================================================== */
(function () {
  'use strict';

  async function json(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no-json */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.json = data;
      throw err;
    }
    return data;
  }

  async function subir(file, opts) {
    opts = opts || {};
    if (!file) throw new Error('Sin archivo');
    const scope = opts.scope || 'media';
    if (!(window.Backend && window.Backend.available)) throw new Error('Sin backend');

    // 1) Intento firmado (Supabase). 501 => modo local.
    let signed = null;
    try {
      signed = await json('/api/media/sign', {
        filename: file.name, mime: file.type, size: file.size, scope,
      });
    } catch (e) {
      if (!(e.status === 501 && e.json && e.json.fallback === 'local')) throw e;
    }

    if (signed && signed.uploadUrl) {
      // 2a) PUT directo al Storage + confirm con metadata.
      const up = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!up.ok) throw new Error('No se pudo subir al Storage (HTTP ' + up.status + ')');
      const done = await json('/api/media/confirm', {
        path: signed.path, mime: file.type, size: file.size,
        scope, title: opts.title || file.name, refId: opts.refId || null,
      });
      return done.item;
    }

    // 2b) Fallback local: multipart al backend (dev sin Supabase).
    const fd = new FormData();
    fd.append('files', file, file.name);
    fd.append('scope', scope);
    if (opts.title) fd.append('title', opts.title);
    if (opts.refId) fd.append('refId', opts.refId);
    const res = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', body: fd });
    let data = null;
    try { data = await res.json(); } catch (e) { throw new Error('Respuesta no JSON del servidor'); }
    if (!res.ok || !data.items || !data.items[0]) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data.items[0];
  }

  async function subirMuchos(files, scope) {
    const list = Array.from(files || []).slice(0, 8);
    const out = [];
    for (const f of list) out.push(await subir(f, { scope }));
    return out;
  }

  window.Media = { subir, subirMuchos };
})();
