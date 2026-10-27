/* ============================================================================
 * js/core/realtime.js — FEED PÚBLICO EN VIVO (Paso 3 + Paso 4 archivos)
 * - Carga /api/public/feed y pinta el strip "Novedades en vivo" (si hay items).
 * - Si hay Supabase: suscripción realtime a public_feed (ANON key, solo lectura
 *   por RLS). Cada novedad se antepone al strip + toast + contadores.
 * - Tarjetas: imagen <img>, video <video controls>, documento (PDF/Office) link.
 * Sin backend o sin red: silencio total, nada se rompe.
 * ========================================================================== */
(function () {
  'use strict';

  var STRIP_ID = 'novedades-vivo';
  var LIST_ID = 'novedades-vivo-list';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function card(row) {
    var img = row.image_url || '';
    var kind = row.media_kind || '';
    var media = '';
    if (img && kind === 'video') {
      media = '<video src="' + esc(img) + '" controls preload="metadata" playsinline style="width:100%;border-radius:12px;background:#0f172a"></video>';
    } else if (img) {
      media = '<img src="' + esc(img) + '" alt="" loading="lazy" style="width:100%;height:180px;object-fit:cover;border-radius:12px;background:#f1f5f9">';
    } else if (row.body && /^https?:\/\//.test(row.body)) {
      media = '<a href="' + esc(row.body) + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;color:#0369a1;font-size:13px;text-decoration:none">Abrir documento adjunto</a>';
    }
    var when = '';
    try { when = new Date(row.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { /* fecha cruda */ }
    return '<article data-feed-kind="' + esc(row.kind || '') + '" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(2,6,23,.06)">'
      + media
      + '<div style="padding:12px 14px"><p style="font-weight:700;font-size:14px;color:#0f172a;margin:0 0 2px">' + esc(row.title || 'Novedad') + '</p>'
      + '<p style="font-size:11px;color:#94a3b8;margin:0">' + esc(when) + '</p></div></article>';
  }

  /* El strip visual "Novedades en vivo" se desactiva en la portada pública para no
   * mostrar tarjetas basura ("Nuevo en posts", "Nuevo en messages", etc.).
   * La suscripción realtime a public_feed SIGUE activa para disparar el evento
   * CustomEvent('public-feed') con el que sync.js actualiza las colecciones en vivo. */
  function portalVisible() {
    var portal = document.getElementById('public-portal');
    return !!portal && !portal.classList.contains('hidden');
  }
  function ensureStrip() {
    var old = document.getElementById(STRIP_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    return null;
  }
  /* Cuando la portada vuelve a mostrarse (logout, cierre de sesión), se
   * pinta el feed inicial; cuando se oculta, el strip desaparece con la
   * portada porque vive dentro de ella. */

  function toast(row) {
    try {
      if (!window.showToast) return;
      var img = row.image_url && row.media_kind !== 'video'
        ? '<img src="' + esc(row.image_url) + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px">' : '';
      window.showToast((img ? img + '<span>' : '<span>') + 'Nuevo: ' + esc(row.title || 'publicación') + '</span>', 'info');
    } catch (e) { /* toast incompatible: ignorar */ }
  }

  /* Ticker de versiones por colección (tabla pública collection_versions):
   * el backend la actualiza en cada guardado. Cada cambio dispara
   * CustomEvent('collection-version') para que sync.js haga pull quirúrgico
   * solo de esa colección. Funciona para TODAS (no solo las del feed) y
   * para ediciones/borrados (que no generan fila de feed). */
  var lastVersions = {}; // collection -> updated_at (marca ya vista)
  var versionsPrimed = false; // la primera carga solo calibra, no avisa
  function onVersion(collection) {
    if (!collection) return;
    try {
      document.dispatchEvent(new CustomEvent('collection-version', { detail: { collection: collection } }));
    } catch (e) { /* portada en otro estado: ignorar */ }
  }
  function trackVersions(rows) {
    (rows || []).forEach(function (r) {
      if (!r || !r.collection) return;
      if (lastVersions[r.collection] !== r.updated_at) {
        lastVersions[r.collection] = r.updated_at;
        if (versionsPrimed) onVersion(r.collection);
      }
    });
    versionsPrimed = true;
  }

  function bump(row) {
    document.querySelectorAll('[data-feed-count]').forEach(function (el) {
      if (!row.kind || el.getAttribute('data-feed-count') === row.kind) {
        var n = parseInt(el.textContent, 10);
        if (!isNaN(n)) el.textContent = String(n + 1);
      }
    });
  }

  function onItem(row) {
    try {
      ensureStrip();
      document.dispatchEvent(new CustomEvent('public-feed', { detail: row }));
    } catch (e) { /* portada en otro estado: ignorar */ }
  }

  async function boot() {
    // 1) El strip visual de la portada está desactivado (ensureStrip devuelve null).
    // No hacer GET /api/public/feed al cargar para ahorrar 1 viaje de red en el arranque.

    // 2) Realtime Supabase (solo si el backend lo anuncia).
    let cfg = null;
    try {
      const res = await fetch('/api/public/config', { credentials: 'same-origin' });
      cfg = await res.json();
    } catch (e) { return; }
    if (!cfg || !cfg.realtime || !cfg.supabaseUrl || !cfg.anonKey) return;
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      const sb = mod.createClient(cfg.supabaseUrl, cfg.anonKey);
      sb.channel('public-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_feed' }, function (payload) {
          var row = payload.new || {};
          /* Marca del ticker por colección (kind 'version:<colección>'): es el
           * aviso que usa el backend cuando la tabla collection_versions aún
           * no está creada. No es una publicación: solo dispara el pull
           * quirúrgico de esa colección en los demás equipos. */
          var kind = String(row.kind || '');
          if (kind.indexOf('version:') === 0) {
            versionsPrimed = true;
            onVersion(kind.slice('version:'.length));
            return;
          }
          onItem(row);
        })
        .subscribe();
      // Ticker entre PCs: cualquier INSERT/UPDATE en collection_versions.
      sb.channel('collection-versions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'collection_versions' }, function (payload) {
          var row = payload.new || {};
          if (row.collection && lastVersions[row.collection] !== row.updated_at) {
            lastVersions[row.collection] = row.updated_at;
            versionsPrimed = true;
            onVersion(row.collection);
          }
        })
        .subscribe();
      window.SupabaseFeed = sb;
      // Calibra marcas iniciales (sin avisar) y deja sondeo ligero de
      // respaldo: si el WebSocket se cae, los cambios llegan igual (45s).
      // Solo lee la tabla de marcas (KBs), jamás los datos.
      /* Sondeo de respaldo cada 45s. Si la tabla collection_versions no existe
       * (migración sin ejecutar) se sondean las marcas 'version:<col>' de
       * public_feed: mismo efecto y sin 404 repetidos en consola. */
      var versionsSource = 'table';
      (function pollVersions() {
        var q = versionsSource === 'table'
          ? sb.from('collection_versions').select('collection,updated_at')
          : sb.from('public_feed').select('kind,created_at').like('kind', 'version:%')
            .order('created_at', { ascending: false }).limit(200);
        try {
          q.then(function (res) {
            if (!res) return;
            if (res.error) {
              if (versionsSource === 'table') versionsSource = 'feed';
              return;
            }
            if (versionsSource === 'table') {
              trackVersions(res.data);
            } else {
              trackVersions((res.data || []).map(function (r) {
                return {
                  collection: String(r.kind || '').slice('version:'.length),
                  updated_at: r.created_at,
                };
              }));
            }
          }, function () {
            if (versionsSource === 'table') versionsSource = 'feed';
          });
        } catch (e) {}
        setTimeout(pollVersions, 45000);
      })();
    } catch (e) { /* CDN bloqueado: modo sin realtime */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
