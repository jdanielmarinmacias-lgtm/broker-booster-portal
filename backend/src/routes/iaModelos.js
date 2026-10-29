'use strict';
/* ============================================================================
 * Rutas de la comprobación periódica del catálogo de IA
 *
 *   GET  /api/ia/modelos          → cron de Vercel (Bearer CRON_SECRET)
 *   GET  /api/ia/modelos/estado   → último resultado (dirección)
 *   POST /api/ia/modelos/run      → disparo manual (dirección)
 * ========================================================================== */
const express = require('express');
const mw = require('../middleware');
const { MODELOS_PERMITIDOS, revisar } = require('../iaCatalogo');

const DIRECCION = new Set(['admin', 'gm', 'desarrollador']);
const esDireccion = (user) => !!user && DIRECCION.has(String(user.role || '').toLowerCase());

function secretoCron() {
  return process.env.CRON_SECRET || process.env.REPORT_CRON_SECRET || process.env.IA_CRON_SECRET || '';
}

module.exports = function iaModelosRoutes(store, config) {
  const router = express.Router();

  /* Cron diario de Vercel. Vercel inyecta `Authorization: Bearer
   * $CRON_SECRET`; se aceptan los nombres antiguos para no romper el cron
   * semanal que ya estaba configurado. */
  router.get('/', async (req, res, next) => {
    try {
      const esperado = secretoCron();
      if (!esperado) {
        return res.status(503).json({ ok: false, error: 'CRON_SECRET no configurado' });
      }
      const recibido = String(req.headers.authorization || '');
      if (recibido !== 'Bearer ' + esperado) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
      }
      if (!config.groqApiKey) {
        return res.status(503).json({ ok: false, error: 'GROQ_API_KEY no configurada' });
      }
      const r = await revisar({ store, apiKey: config.groqApiKey });
      res.status(r.estado === 'error-consulta' ? 502 : 200).json(r);
    } catch (e) { next(e); }
  });

  /* Diagnóstico para dirección: no llama a Groq ni gasta cupo. */
  router.get('/estado', mw.requireAuth, async (req, res, next) => {
    try {
      if (!esDireccion(req.user)) {
        return res.status(403).json({ ok: false, error: 'Solo dirección puede ver el estado de la IA' });
      }
      await store.refreshIfStale();
      const data = store.get() || {};
      const ultima = (data.settings && data.settings.iaModelos) || null;
      const abiertas = (Array.isArray(data.notifications) ? data.notifications : [])
        .filter((n) => n && n.type === 'ia-modelo' && !n.resuelto)
        .map((n) => ({ id: n.id, modelo: n.modelo, fecha: n.fecha || n.date, leida: !!n.read }));
      res.json({
        ok: true,
        permitidos: MODELOS_PERMITIDOS.slice(),
        ultima,
        alertasAbiertas: abiertas,
        cron: 'diario 07:15 America/Mexico_City (13:15 UTC)',
        correoConfigurado: !!(process.env.RESEND_API_KEY && (process.env.IA_ALERT_RECIPIENTS || process.env.REPORT_RECIPIENTS)),
      });
    } catch (e) { next(e); }
  });

  /* Disparo manual para comprobar el circuito sin esperar al cron. */
  router.post('/run', mw.requireAuth, async (req, res, next) => {
    try {
      if (!esDireccion(req.user)) {
        return res.status(403).json({ ok: false, error: 'Solo dirección puede ejecutar la comprobación' });
      }
      if (!config.groqApiKey) {
        return res.status(503).json({ ok: false, error: 'GROQ_API_KEY no configurada' });
      }
      const r = await revisar({ store, apiKey: config.groqApiKey });
      res.status(r.estado === 'error-consulta' ? 502 : 200).json(r);
    } catch (e) { next(e); }
  });

  return router;
};
