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

  /* Igual que un archivo, pero más pequeño: se sube y se sirve menos peso.
   * Una foto de móvil de 6 MB se pinta después en tarjetas de 300 px. Se
   * redimensiona a 1600 px de ancho y se recomprime; PNG/WebP van a WebP para
   * no perder transparencia y JPEG a JPEG. Si el resultado no es menor, se
   * conserva el original (nunca empeorar). */
  const MAX_ANCHO_SUBIDA = 1600;
  const CALIDAD_SUBIDA = 0.82;
  const UMBRAL_OPTIMIZAR = 350 * 1024;

  function aBlob(canvas, tipo, calidad) {
    return new Promise(function (resolve) {
      try { canvas.toBlob(function (b) { resolve(b); }, tipo, calidad); }
      catch (e) { resolve(null); }
    });
  }

  async function optimizar(file) {
    try {
      if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return file;
      if (file.size <= UMBRAL_OPTIMIZAR) return file;
      let imagen;
      if (window.createImageBitmap) {
        imagen = await createImageBitmap(file);
      } else {
        imagen = await new Promise(function (resolve, reject) {
          const img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
      }
      const ancho = imagen.width || imagen.naturalWidth;
      const alto = imagen.height || imagen.naturalHeight;
      if (!ancho || !alto) return file;
      const escala = Math.min(1, MAX_ANCHO_SUBIDA / ancho);
      if (escala === 1 && file.size <= 900 * 1024) return file;
      const w = Math.max(1, Math.round(ancho * escala));
      const h = Math.max(1, Math.round(alto * escala));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imagen, 0, 0, w, h);
      const tipo = /png|webp/i.test(file.type) ? 'image/webp' : 'image/jpeg';
      const blob = await aBlob(canvas, tipo, CALIDAD_SUBIDA);
      if (!blob || blob.size >= file.size) return file;
      const nombre = (file.name || 'imagen').replace(/\.[^.]+$/, '') + (tipo === 'image/webp' ? '.webp' : '.jpg');
      return new File([blob], nombre, { type: tipo });
    } catch (e) { return file; }
  }

  /* Huella SHA-256 del archivo: sirve para no volver a subir (ni a guardar) el
   * mismo contenido dos veces. En este portal el mismo JPEG llegó a estar 10
   * veces en el Storage con nombres distintos. */
  const MAX_HUELLA = 12 * 1024 * 1024; // no leer en RAM videos de 50 MB

  async function huella(file) {
    try {
      if (!window.crypto || !window.crypto.subtle || !file || !file.arrayBuffer) return null;
      if (file.size > MAX_HUELLA) return null;
      const buf = await file.arrayBuffer();
      const dig = await window.crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(dig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } catch (e) { return null; }
  }

  async function subir(file, opts) {
    opts = opts || {};
    if (!file) throw new Error('Sin archivo');
    const scope = opts.scope || 'media';
    if (!(window.Backend && window.Backend.available)) throw new Error('Sin backend');

    // 0) Optimización + huella ANTES de pedir la firma (el tamaño firmado debe
    //    ser el real). Si ya existe ese mismo archivo, se reutiliza su URL.
    file = await optimizar(file);
    const hash = await huella(file);
    if (hash) {
      try {
        const dup = await json('/api/media/check', { hash, scope });
        if (dup && dup.item && dup.item.url) return dup.item;
      } catch (e) { /* sin endpoint o sin red: se sube normal */ }
    }

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
        path: signed.path, mime: file.type, size: file.size, hash,
        scope, title: opts.title || file.name, refId: opts.refId || null,
      });
      return done.item;
    }

    // 2b) Fallback local: multipart al backend (dev sin Supabase).
    const fd = new FormData();
    fd.append('files', file, file.name);
    fd.append('scope', scope);
    if (hash) fd.append('hash', hash);
    if (opts.title) fd.append('title', opts.title);
    if (opts.refId) fd.append('refId', opts.refId);
    const res = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', body: fd });
    let data = null;
    try { data = await res.json(); } catch (e) { throw new Error('Respuesta no JSON del servidor'); }
    if (!res.ok || !data.items || !data.items[0]) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data.items[0];
  }

  /* #3 Refuerzo: compresión inteligente de imágenes en cliente para evitar
   * errores 413 en Vercel y acelerar cargas tanto en Storage como en base64. */
  function comprimirImagen(file, maxW, quality) {
    maxW = maxW || 1400;
    quality = quality || 0.82;
    return new Promise(function (resolve) {
      if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { resolve(null); };
        r.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(c.toDataURL('image/jpeg', quality));
          } catch (err) {
            resolve(e.target.result);
          }
        };
        img.onerror = function () { resolve(e.target.result); };
        img.src = e.target.result;
      };
      reader.onerror = function () { resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  /* Cura automática de base64 embebido en documentos.
   * Los modales legacy guardaban el archivo como dataURL dentro del JSON
   * (settings.publicidad, carruselCirculares, avatares…). Eso hacía documentos
   * de MBs: el upsert a Supabase entraba en statement timeout (HTTP 500), los
   * 401 en cascada del resto de la sincronización y la portada tardaba en
   * cargar porque cada tarjeta traía la imagen entera dentro del JSON.
   * Aquí se sube cada dataURL a Storage y se reemplaza por su URL.
   * Devuelve cuántos reemplazó. Sin backend o sin sesión no toca nada. */
  const DATAURL_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,/;
  const MAX_INLINE = 24 * 1024; // ~24 KB de dataURL: por encima, a Storage
  const MAX_HEAL = 40; // tope por llamada (no bloquear el push)

  function base64ABlob(dataUrl) {
    const coma = dataUrl.indexOf(',');
    const bin = atob(dataUrl.slice(coma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream' });
  }

  /* Recorre el valor y devuelve {obj, cambios}. Muta el objeto recibido (es la
   * referencia viva del `db` legacy: así el local también deja de cargar MBs). */
  async function desbase64(value, scope) {
    if (!value || typeof value !== 'object') return 0;
    if (!(window.Backend && window.Backend.available)) return 0;
    const nodos = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'string') {
          if (v.length > MAX_INLINE && DATAURL_RE.test(v)) nodos.push({ node, k, v });
        } else if (v && typeof v === 'object') walk(v);
      }
    })(value);
    let cambios = 0;
    for (const n of nodos.slice(0, MAX_HEAL)) {
      try {
        const mime = n.v.match(DATAURL_RE)[1];
        const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
        const blob = base64ABlob(n.v);
        const file = new File([blob], 'inline-' + Date.now() + '-' + cambios + '.' + ext, { type: mime });
        const item = await subir(file, { scope: scope || 'media', title: 'inline' });
        if (item && item.url && !/^data:/.test(item.url)) {
          n.node[n.k] = item.url;
          cambios++;
        }
      } catch (e) { /* se conserva el base64: el push fallará con mensaje claro */ }
    }
    return cambios;
  }

  async function subirMuchos(files, scope) {
    const list = Array.from(files || []).slice(0, 10);
    const out = [];
    for (const f of list) out.push(await subir(f, { scope }));
    return out;
  }

  /* Sube archivo a Storage si hay backend activo, o devuelve dataURL (comprimido
   * si es imagen) como fallback seguro para adjuntos en chat/cotizaciones. */
  async function subirOUrl(file, scope, opts) {
    if (!file) return '';
    try {
      const item = await subir(file, Object.assign({ scope: scope || 'media' }, opts || {}));
      if (item && item.url) return item.url;
    } catch (e) { /* fallback a dataURL comprimido */ }
    return (await comprimirImagen(file, 1280, 0.82)) || '';
  }

  window.Media = { subir, subirMuchos, comprimirImagen, subirOUrl, desbase64, optimizar, huella };

  /* ==========================================================================
   * RED DE SEGURIDAD DEL PROXY `/media/`
   * Las imágenes se sirven desde nuestro dominio para poder cachearlas un año
   * (Supabase manda `private, no-cache`). Si el proxy fallara en algún entorno,
   * el usuario se quedaría sin imágenes: aquí se reintenta UNA vez contra el
   * original del Storage. `window.__MEDIA_BASE` lo publica realtime.js al leer
   * /api/public/config.
   * ========================================================================== */
  const PREFIJO_PROXY = '/media/';
  function activarRespaldoMedia() {
    document.addEventListener('error', function (e) {
      const img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      const src = img.getAttribute('src') || '';
      if (src.indexOf(PREFIJO_PROXY) !== 0 || img.dataset.mediaOriginal) return;
      const base = window.__MEDIA_BASE;
      if (!base) return;
      img.dataset.mediaOriginal = '1';
      img.src = base + src.slice(PREFIJO_PROXY.length);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activarRespaldoMedia);
  else activarRespaldoMedia();
})();
