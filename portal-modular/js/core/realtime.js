/* ============================================================================
 * js/core/realtime.js — REALTIME DEL FEED PÚBLICO (Paso 3, Supabase)
 * Solo se activa si /api/public/config anuncia realtime (hay Supabase).
 * Usa la ANON key (pública por diseño): RLS solo le permite LEER public_feed.
 * Al llegar una publicación: toast + evento 'public-feed' + actualiza
 * contadores [data-feed-count="<kind>"] si existen en la portada.
 * Sin backend/Supabase o sin red: silencio total, nada se rompe.
 * ========================================================================== */
(function () {
  'use strict';

  async function boot() {
    let cfg;
    try {
      const res = await fetch('/api/public/config', { credentials: 'same-origin' });
      cfg = await res.json();
    } catch (e) { return; }
    if (!cfg || !cfg.realtime || !cfg.supabaseUrl || !cfg.anonKey) return;

    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      const sb = mod.createClient(cfg.supabaseUrl, cfg.anonKey);
      sb.channel('public-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_feed' }, (payload) => {
          const row = payload.new || {};
          try {
            if (window.showToast) window.showToast('Nuevo: ' + (row.title || 'publicación'), 'info');
            document.querySelectorAll('[data-feed-count]').forEach((el) => {
              if (!row.kind || el.getAttribute('data-feed-count') === row.kind) {
                const n = parseInt(el.textContent, 10);
                if (!isNaN(n)) el.textContent = String(n + 1);
              }
            });
            document.dispatchEvent(new CustomEvent('public-feed', { detail: row }));
          } catch (e) { /* portada en otro estado: ignorar */ }
        })
        .subscribe();
      window.SupabaseFeed = sb;
    } catch (e) { /* CDN bloqueado: modo sin realtime */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
