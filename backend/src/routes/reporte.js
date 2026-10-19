'use strict';
/* ------------------------------------------------------------------
 * Rutas del Reporte Ejecutivo programado:
 *   GET  /api/report/weekly      → disparo del cron (Bearer REPORT_CRON_SECRET; Vercel Cron lo inyecta)
 *   POST /api/report/weekly/run  → disparo manual (sesión admin/gm/desarrollador)
 * Genera el PDF con reporte-executivo.js y lo envía por correo.
 * Envío: Resend API (RESEND_API_KEY + MAIL_FROM). Sin clave ⇒ modo
 * dry-run: no se envía nada, se responde con lo que se habría enviado
 * (destinatarios, tamaño del adjunto y asunto) para probar en dev.
 * ------------------------------------------------------------------ */
const express = require('express');
const reporte = require('../reporte-executivo');

/* Se lee POR LLAMADA (no al cargar el módulo): así los tests y entornos
 * efímeros varían la variable, y nunca envía real por accidente. */
const proveedorActivo = () => process.env.RESEND_API_KEY;

function sujetoyHtml(s, resumen) {
  const nombre = (s && s.institutionName) || 'Portal';
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const kpi = (label, val) => '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;color:#334155">' + label + '</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;font-weight:700;color:#0f172a;text-align:right">' + val + '</td></tr>';
  const mx = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX');
  const html = '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">'
    + '<div style="background:#0a2540;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0"><p style="margin:0;font-size:12px;letter-spacing:1px;opacity:.8">' + nombre.toUpperCase() + '</p>'
    + '<p style="margin:4px 0 0;font-size:20px;font-weight:700">Reporte Ejecutivo Semanal</p>'
    + '<p style="margin:2px 0 0;font-size:12px;opacity:.8">' + fecha + '</p></div>'
    + '<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0">'
    + kpi('Primas facturadas (histórico)', mx(resumen.primas.total))
    + kpi('Primas en el mes en curso', mx(resumen.primas.mes))
    + kpi('Comisiones estimadas (ventas)', mx(resumen.comisiones.ventas))
    + kpi('Comisiones conciliadas (cartera)', mx(resumen.comisiones.conciliadas))
    + kpi('Renovaciones ≤30 días', String(resumen.renovaciones.u15 + resumen.renovaciones.d16a30))
    + kpi('Embudo: Solicitudes → Cotizaciones → Emitidas', resumen.embudo.solicitudes + ' → ' + resumen.embudo.cotizaciones + ' → ' + resumen.embudo.emitidas + ' (cierre ' + resumen.embudo.tasaCotVenta + '%)')
    + '</table>'
    + '<p style="color:#64748b;font-size:12px;margin:14px 2px">El PDF adjunto incluye la tendencia de primas por mes, renovaciones por vencer (60/30/15 días), producción por ramo y agenda de renovación.</p>'
    + '</div>';
  const subject = '[' + nombre + '] Reporte Ejecutivo Semanal — ' + new Date().toLocaleDateString('es-MX');
  return { subject, html, fecha };
}

async function enviarCorreo(mailFrom, subject, html, to, buffer) {
  const SENDER = proveedorActivo();
  if (!SENDER) {
    // Dry-run: sin credenciales, registra y confirma formato (no envía nada).
    console.log('[reporte] DRY-RUN: enviaría "' + subject + '" a ' + to.length + ' destinatario(s), adjunto ' + Math.round(buffer.length / 1024) + ' KB. Configura RESEND_API_KEY y MAIL_FROM para enviar en serio.');
    return { sent: false, dryRun: true };
  }
  const body = {
    from: mailFrom,
    to: to.map((d) => d.email),
    subject,
    html,
    /* Resend espera adjuntos { filename, content: base64 } */
    attachments: [{ filename: 'reporte_ejecutivo_' + new Date().toISOString().slice(0, 10) + '.pdf', content: buffer.toString('base64') }],
  };    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('Resend ' + r.status + ': ' + t.slice(0, 300));
  }
  const out = await r.json();
  return { sent: true, id: out.id };
}

module.exports = function reporteRoutes(store, config) {
  const router = express.Router();

  async function ejecutarSemanal() {
    await store.refreshIfStale();
    const data = store.get();
    const { buffer, pages, resumen } = reporte.construir(data);
    const dest = reporte.destinatarios(data.users, process.env.REPORT_RECIPIENTS);
    if (!dest.length) return { ok: false, skipped: true, reason: 'Sin destinatarios: no hay directivos con email válido ni REPORT_RECIPIENTS configurado' };
    const s = data.settings || {};
    const { subject, html } = sujetoyHtml(s, resumen);
    const mailFrom = process.env.MAIL_FROM || 'Reporte Ejecutivo <onboarding@resend.dev>';
    const result = await enviarCorreo(mailFrom, subject, html, dest, buffer);
    console.log('[reporte] semanal: ' + dest.length + ' destinatario(s), ' + pages + ' pág, ' + Math.round(buffer.length / 1024) + ' KB, sent=' + result.sent);
    return { ok: true, ...result, subject, pages, attachmentKB: Math.round(buffer.length / 1024), destinatarios: dest.map((d) => ({ name: d.name, email: d.email })), resumen };
  }

  /* Cron: Vercel inyecta "Authorization: Bearer $CRON_SECRET" cuando la
   * variable CRON_SECRET existe. Local: REPORT_CRON_SECRET como alternativa. */
  router.get('/report/weekly', async (req, res, next) => {
    try {
      const expected = process.env.CRON_SECRET || process.env.REPORT_CRON_SECRET;
      const got = String(req.headers.authorization || '');
      if (!expected || got !== 'Bearer ' + expected) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
      }
      const r = await ejecutarSemanal();
      res.status(r.skipped ? 422 : (r.sent || r.dryRun ? 200 : 500)).json(r);
    } catch (e) { next(e); }
  });

  /* Disparo manual (probar en vivo desde la UI/API): solo dirección. */
  router.post('/report/weekly/run', async (req, res, next) => {
    try {
      if (!req.user || !['admin', 'gm', 'desarrollador'].includes(String(req.user.role).toLowerCase())) {
        return res.status(403).json({ ok: false, error: 'Solo dirección puede disparar el envío' });
      }
      const r = await ejecutarSemanal();
      res.status(r.skipped ? 422 : (r.sent || r.dryRun ? 200 : 500)).json(r);
    } catch (e) { next(e); }
  });

  /* Estado: qué destinatarios se configurarían (admin, sin envío). */
  router.get('/report/weekly/status', async (req, res) => {
    if (!req.user || !['admin', 'gm', 'desarrollador'].includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }
    await store.refreshIfStale();
    const data = store.get();
    const dest = reporte.destinatarios(data.users, process.env.REPORT_RECIPIENTS);
    res.json({ ok: true, destinatarios: dest.map((d) => ({ name: d.name, email: d.email })), proveedor: proveedorActivo() ? 'resend' : 'dry-run', cron: 'lunes 07:00 (America/Mexico_City)' });
  });

  return router;
};
