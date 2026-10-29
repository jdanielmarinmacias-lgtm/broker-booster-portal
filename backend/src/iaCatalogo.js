'use strict';
/* ============================================================================
 * Catálogo de modelos de IA (Groq)
 *
 * Groq puede retirar un modelo o moverlo al plan Enterprise sin avisar en la
 * API de chat. Este módulo consulta la lista de modelos disponibles para la
 * clave del servidor y avisa cuando uno de los permitidos deja de aparecer.
 *
 * La comprobación NO llama al modelo: solo lee /openai/v1/models. Así no gasta
 * cupo de IA ni depende de que el modelo responda en ese momento.
 *
 * Alertas:
 *   · Notificación en el portal para GM, admin y desarrollador.
 *   · Correo por Resend si RESEND_API_KEY e IA_ALERT_RECIPIENTS (o
 *     REPORT_RECIPIENTS) están configurados.
 *   · Último resultado en `settings.iaModelos` para diagnóstico.
 * ========================================================================== */
const MODELOS_PERMITIDOS = Object.freeze(['openai/gpt-oss-120b']);
const URL_CATALOGO = 'https://api.groq.com/openai/v1/models';
const TIMEOUT_MS = 8000;
const ROLES_ALERTA = ['gm', 'admin', 'desarrollador'];
const RE_EMAIL = /.+@.+\..+/;

function urlCatalogo() {
  return String(process.env.GROQ_MODELS_URL || URL_CATALOGO);
}

/* Consulta la lista de modelos que la clave puede usar. Un modelo movido a
 * Enterprise deja de aparecer aquí, igual que uno retirado. */
async function consultarCatalogo(apiKey, opciones) {
  const opts = opciones || {};
  const fetchImpl = opts.fetchImpl || fetch;
  const url = opts.url || urlCatalogo();
  const timeoutMs = Number(opts.timeoutMs || TIMEOUT_MS);
  if (!apiKey) {
    return { ok: false, status: 0, ids: [], error: 'GROQ_API_KEY no configurada' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
    if (!r.ok) {
      const err = json && json.error;
      const detalle = err && (typeof err === 'string' ? err : err.message);
      return {
        ok: false,
        status: r.status,
        ids: [],
        error: String(detalle || texto || ('HTTP ' + r.status)).slice(0, 300),
      };
    }
    if (!json || !Array.isArray(json.data)) {
      return { ok: false, status: r.status, ids: [], error: 'Respuesta sin lista de modelos' };
    }
    const ids = json.data.map((m) => String((m && m.id) || '')).filter(Boolean);
    return { ok: true, status: r.status, ids, error: null };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ids: [],
      error: e && e.name === 'AbortError' ? 'Tiempo de espera agotado' : String((e && e.message) || e).slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

/* Compara el catálogo con la allowlist. `faltantes` es la señal de alerta. */
function evaluarCatalogo(ids, permitidos) {
  const lista = permitidos || MODELOS_PERMITIDOS;
  const set = new Set((ids || []).map(String));
  const faltantes = lista.filter((m) => !set.has(m));
  return {
    ok: faltantes.length === 0,
    faltantes,
    disponibles: lista.filter((m) => set.has(m)),
  };
}

function destinatariosAlerta() {
  const raw = process.env.IA_ALERT_RECIPIENTS || process.env.REPORT_RECIPIENTS || '';
  return String(raw).split(',').map((s) => s.trim()).filter((e) => RE_EMAIL.test(e));
}

function escaparHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function enviarAlerta(resultado, opciones) {
  const opts = opciones || {};
  const fetchImpl = opts.fetchImpl || fetch;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, dryRun: true, motivo: 'RESEND_API_KEY no configurada' };
  const to = destinatariosAlerta();
  if (!to.length) {
    return { sent: false, dryRun: true, motivo: 'Sin IA_ALERT_RECIPIENTS ni REPORT_RECIPIENTS' };
  }

  const esPrueba = !!opts.prueba;
  const modelos = (resultado.faltantes || []).map((m) => '<li><code>' + escaparHtml(m) + '</code></li>').join('');
  const fecha = new Date(resultado.checkedAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const subject = esPrueba
    ? '[Portal] Prueba de alertas de IA'
    : '[Portal] Modelo de IA no disponible: ' + (resultado.faltantes || []).join(', ');
  const color = esPrueba ? '#0a2540' : '#7f1d1d';
  const titulo = esPrueba ? 'Prueba de alertas de IA' : 'Modelo de IA no disponible';
  const cuerpo = esPrueba
    ? '<p style="margin:0 0 12px;font-size:14px;color:#334155">Este es un correo de prueba enviado desde el portal.</p>'
      + '<p style="margin:0 0 14px;font-size:14px;color:#0f172a">Si lo recibes, Resend y el destinatario de las alertas están configurados correctamente.</p>'
    : '<p style="margin:0 0 12px;font-size:14px;color:#334155">La comprobación del catálogo de Groq ya no encuentra estos modelos permitidos:</p>'
      + '<ul style="margin:0 0 14px 18px;padding:0;font-size:14px;color:#0f172a">' + modelos + '</ul>'
      + '<p style="margin:0 0 10px;font-size:13px;color:#475569">Suele significar que Groq los retiró o los movió al plan Enterprise. La IA del portal fallará si siguen en la allowlist.</p>';
  const html = '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">'
    + '<div style="background:' + color + ';color:#fff;padding:18px 20px;border-radius:12px 12px 0 0">'
    + '<p style="margin:0;font-size:12px;letter-spacing:1px;opacity:.8">PORTAL BROKER BOOSTER</p>'
    + '<p style="margin:4px 0 0;font-size:20px;font-weight:700">' + titulo + '</p></div>'
    + '<div style="background:#fff;border:1px solid #e2e8f0;padding:18px 20px">'
    + cuerpo
    + '<p style="margin:0;font-size:13px;color:#475569">Revisa <code>backend/src/iaCatalogo.js</code> y el estado en <code>/api/ia/modelos/estado</code>.</p>'
    + '<p style="margin:16px 0 0;font-size:11px;color:#94a3b8">Comprobado: ' + escaparHtml(fecha) + '</p>'
    + '</div></div>';

  try {
    const r = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Alertas IA <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    });
    const texto = await r.text();
    if (!r.ok) return { sent: false, status: r.status, error: String(texto).slice(0, 300) };
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { /* respuesta sin id */ }
    return { sent: true, id: json && json.id, destinatarios: to.length };
  } catch (e) {
    return { sent: false, error: String((e && e.message) || e).slice(0, 300) };
  }
}

/* Ejecuta la comprobación, persiste el estado y crea/cierra la alerta.
 * `email: false` se usa en pruebas para no tocar la red de Resend. */
async function revisar(opciones) {
  const opts = opciones || {};
  const store = opts.store;
  if (!store) throw new Error('revisar() requiere store');
  const checkedAt = new Date().toISOString();
  const catalogo = await consultarCatalogo(opts.apiKey, {
    fetchImpl: opts.fetchImpl,
    url: opts.url,
    timeoutMs: opts.timeoutMs,
  });
  const evaluacion = catalogo.ok
    ? evaluarCatalogo(catalogo.ids)
    : { ok: false, faltantes: [], disponibles: [] };

  await store.refreshForWrite(['notifications', 'settings']);
  const data = store.get() || {};
  if (!Array.isArray(data.notifications)) data.notifications = [];
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) data.settings = {};

  let alertasNuevas = 0;
  let alertasResueltas = 0;

  if (catalogo.ok) {
    if (evaluacion.faltantes.length) {
      evaluacion.faltantes.forEach((modelo, i) => {
        const abierta = data.notifications.find(
          (n) => n && n.type === 'ia-modelo' && String(n.modelo) === modelo && !n.resuelto
        );
        if (abierta) return;
        const mensaje = 'El modelo ' + modelo + ' ya no aparece en el catálogo de Groq. '
          + 'Puede haber sido retirado o movido al plan Enterprise; revisa la allowlist antes de que la IA falle.';
        data.notifications.unshift({
          id: 'ia-modelo-' + Date.now() + '-' + i,
          type: 'ia-modelo',
          titulo: 'Modelo de IA no disponible',
          title: 'Modelo de IA no disponible',
          mensaje,
          message: mensaje,
          modelo,
          roles: ROLES_ALERTA.slice(),
          read: false,
          leidoPor: [],
          fecha: checkedAt,
          date: checkedAt,
          resuelto: false,
        });
        alertasNuevas += 1;
      });
    } else {
      data.notifications.forEach((n) => {
        if (n && n.type === 'ia-modelo' && !n.resuelto) {
          n.resuelto = true;
          n.resueltoEn = checkedAt;
          alertasResueltas += 1;
        }
      });
    }
  }

  const resultado = {
    checkedAt,
    ok: catalogo.ok && evaluacion.ok,
    estado: !catalogo.ok ? 'error-consulta' : (evaluacion.ok ? 'ok' : 'modelo-no-disponible'),
    permitidos: MODELOS_PERMITIDOS.slice(),
    disponibles: evaluacion.disponibles,
    faltantes: evaluacion.faltantes,
    catalogo: catalogo.ids.length,
    error: catalogo.ok ? null : catalogo.error,
    alertasNuevas,
    alertasResueltas,
  };
  data.settings.iaModelos = resultado;
  await store.persistCollections(['settings', 'notifications']);

  let correo = null;
  if (opts.email !== false && catalogo.ok && alertasNuevas > 0) {
    correo = await enviarAlerta(resultado, { fetchImpl: opts.fetchImpl });
  }
  return { ...resultado, correo };
}

module.exports = {
  MODELOS_PERMITIDOS,
  consultarCatalogo,
  evaluarCatalogo,
  destinatariosAlerta,
  enviarAlerta,
  revisar,
};
