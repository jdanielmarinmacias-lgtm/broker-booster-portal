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

  function ensureStrip() {
    var list = document.getElementById(LIST_ID);
    if (list) return list;
    var strip = document.createElement('section');
    strip.id = STRIP_ID;
    strip.innerHTML = '<div style="max-width:1100px;margin:0 auto;padding:18px 16px 0">'
      + '<h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 2px">Novedades en vivo</h2>'
      + '<p style="font-size:12px;color:#64748b;margin:0 0 12px">Publicaciones e inmuebles, autos y avisos del equipo — se actualizan solas.</p>'
      + '<div id="' + LIST_ID + '" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px"></div></div>';
    var main = document.querySelector('main') || document.body;
    if (main === document.body) document.body.insertBefore(strip, document.body.firstChild);
    else main.insertBefore(strip, main.firstChild);
    return strip.querySelector('#' + LIST_ID);
  }

  function toast(row) {
    try {
      if (!window.showToast) return;
      var img = row.image_url && row.media_kind !== 'video'
        ? '<img src="' + esc(row.image_url) + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px">' : '';
      window.showToast((img ? img + '<span>' : '<span>') + 'Nuevo: ' + esc(row.title || 'publicación') + '</span>', 'info');
    } catch (e) { /* toast incompatible: ignorar */ }
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
      var list = ensureStrip();
      var tmp = document.createElement('div');
      tmp.innerHTML = card(row);
      var node = tmp.firstChild;
      node.style.outline = '2px solid #10b981';
      list.insertBefore(node, list.firstChild);
      setTimeout(function () { node.style.outline = ''; }, 4000);
      while (list.children.length > 12) list.removeChild(list.lastChild);
      toast(row);
      bump(row);
      document.dispatchEvent(new CustomEvent('public-feed', { detail: row }));
    } catch (e) { /* portada en otro estado: ignorar */ }
  }

  async function boot() {
    // 1) Pintado inicial desde el backend (funciona sin socket).
    try {
      const res = await fetch('/api/public/feed', { credentials: 'same-origin' });
      const data = await res.json();
      if (data && Array.isArray(data.items) && data.items.length) {
        const list = ensureStrip();
        list.innerHTML = data.items.map(card).join('');
      }
    } catch (e) { /* sin backend: nada */ }

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
          onItem(payload.new || {});
        })
        .subscribe();
      window.SupabaseFeed = sb;
    } catch (e) { /* CDN bloqueado: modo sin realtime */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
