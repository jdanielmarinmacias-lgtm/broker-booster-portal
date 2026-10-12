/* ============================================================================
 * js/modules/dashboard.js — FACHADA DASHBOARD / RANKING (Paso 1)
 * El render real (renderRanking, setRankingTab, dashboard GM/agencia) sigue
 * en js/legacy/01-core-db-roles-portal.js. Este módulo expone la interfaz
 * ordenada que usarán las vistas cuando se migren.
 * Próximo micro-paso: mover setRankingTab + renderRanking aquí usando
 * ventasService + userService.agentes() en vez de db.* directo.
 * ========================================================================== */
(function () {
  'use strict';
  window.DashboardModule = {
    setRankingTab: function (tab) {
      if (typeof window.setRankingTab === 'function') return window.setRankingTab(tab);
      window.currentRankingTab = tab;
    },
    ranking: function (tab) {
      // Versión con servicios (convive con la legacy hasta el corte):
      var agentes = window.userService.agentes();
      var ventas = window.ventasService.enPeriodo(tab || window.currentRankingTab || 'mensual');
      return agentes.map(function (a) {
        var vs = ventas.filter(function (v) {
          return String(v.agenteId) === String(a.id) || String(v.agente) === String(a.id);
        });
        var total = vs.reduce(function (acc, v) { return acc + Number(v.prima || 0); }, 0);
        return { id: a.id, name: a.name || a.nombre, avatar: a.avatar, total: total, count: vs.length };
      }).sort(function (a, b) { return b.total - a.total; });
    }
  };
})();
