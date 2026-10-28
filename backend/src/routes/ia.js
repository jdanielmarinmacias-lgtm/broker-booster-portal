'use strict';
/* ============================================================================
 * IA del portal: PROXY CON CUPO (la clave del propietario nunca sale del server)
 *
 * Antes, GET /api/ia/key entregaba la clave de Groq a cualquier sesión: cualquiera
 * podía copiarla del inspector y gastar el saldo fuera del portal. Ahora el
 * navegador llama aquí, el servidor pone la clave y cada usuario tiene su cupo
 * diario.
 *
 * Por qué el proxy devuelve el JSON del proveedor tal cual: el cliente ya habla
 * el formato OpenAI (`choices[0].message.content`), así que las funciones de
 * IA siguen funcionando sin tocar su forma de leer la respuesta.
 * ========================================================================== */
const express = require('express');
const mw = require('../middleware');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_CHARS = 120000;      // conversación completa (≈ 30k tokens)
const MAX_TOKENS = 4000;       // tope por respuesta
const LIMITE_USUARIO = Number(process.env.IA_DIARIO || 300);
const LIMITE_TOTAL = Number(process.env.IA_DIARIO_TOTAL || 3000);

const MODELOS = String(process.env.IA_MODELOS ||
  'openai/gpt-oss-120b,llama-3.3-70b-versatile,llama-3.1-8b-instant')
  .split(',').map((s) => s.trim()).filter(Boolean);

/* Proveedor real. Los tests lo sustituyen para no salir a la red. */
let proveedor = async function llamarGroq(cuerpo, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { json = null; }
    return { ok: r.ok, status: r.status, json, texto };
  } finally {
    clearTimeout(timer);
  }
};

const dia = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const claveUso = (quien) => String(quien) + ':' + dia();

module.exports = (store, config) => {
  const r = express.Router();

  /* Estado de la IA para el cliente: ¿hay clave en el servidor? ¿cuánto queda?
   * Con esto la interfaz decide si ofrece IA o el motor local, sin ver la clave. */
  r.get('/estado', mw.requireAuth, async (req, res, next) => {
    try {
      const disponible = !!config.groqApiKey;
      /* Mismo contador que usa /chat: adaptador compartido o memoria local. */
      const usados = disponible ? (await leerUso(req.user.id)).usuario : 0;
      res.json({ ok: true, disponible, limite: LIMITE_USUARIO, usados, restantes: Math.max(0, LIMITE_USUARIO - usados) });
    } catch (e) { next(e); }
  });

  r.post('/chat', mw.requireAuth, async (req, res, next) => {
    try {
      if (!config.groqApiKey) {
        return res.status(503).json({ ok: false, error: 'IA no configurada en el servidor' });
      }
      const body = req.body || {};
      const mensajes = Array.isArray(body.messages) ? body.messages : null;
      if (!mensajes || !mensajes.length) {
        return res.status(400).json({ ok: false, error: 'Faltan los mensajes' });
      }
      let chars = 0;
      for (const m of mensajes) {
        if (!m || typeof m.content === 'undefined') {
          return res.status(400).json({ ok: false, error: 'Mensaje inválido' });
        }
        chars += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
      }
      if (chars > MAX_CHARS) {
        return res.status(413).json({ ok: false, error: 'La conversación es demasiado larga (máximo ' + MAX_CHARS + ' caracteres)' });
      }
      const modelo = String(body.model || MODELOS[0]);
      if (!MODELOS.includes(modelo)) {
        return res.status(400).json({ ok: false, error: 'Modelo no permitido: ' + modelo });
      }
      /* Solo se reenvían los campos que el contrato admite: nada de inyectar
       * parámetros del proveedor (ni otro Authorization) desde el navegador. */
      const cuerpo = {
        model: modelo,
        messages: mensajes,
        max_tokens: Math.min(Number(body.max_tokens) || 800, MAX_TOKENS),
      };
      ['temperature', 'top_p', 'response_format', 'reasoning_effort', 'stop'].forEach((k) => {
        if (body[k] !== undefined) cuerpo[k] = body[k];
      });

      /* Cupo: se cobra ANTES de llamar (dos peticiones simultáneas no se cuelan).
       * Si el proveedor falla por red/5xx se devuelve, para no castigar al usuario. */
      const uso = await leerUso(req.user.id);
      if (uso.total >= LIMITE_TOTAL) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({ ok: false, error: 'La IA del portal alcanzó su límite diario. Intenta mañana.' });
      }
      if (uso.usuario >= LIMITE_USUARIO) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({
          ok: false,
          error: 'Alcanzaste tu límite diario de IA (' + LIMITE_USUARIO + '). Se renueva a medianoche.',
          limite: LIMITE_USUARIO,
        });
      }
      await sumarUso(req.user.id, 1, 1);

      let salida;
      try {
        salida = await proveedor(cuerpo, config.groqApiKey);
      } catch (e) {
        await sumarUso(req.user.id, -1, -1).catch(() => {});
        if (e && e.name === 'AbortError') {
          return res.status(504).json({ ok: false, error: 'La IA tardó demasiado en responder' });
        }
        return res.status(502).json({ ok: false, error: 'No se pudo contactar con la IA' });
      }

      if (!salida.ok) {
        /* 401/403 del proveedor = clave inválida o revocada: no es culpa del
         * usuario y no debe consumirle cupo. */
        await sumarUso(req.user.id, -1, -1).catch(() => {});
        if (salida.status === 401 || salida.status === 403) {
          console.error('[ia] el proveedor rechazó la clave:', salida.status);
          return res.status(503).json({ ok: false, error: 'IA no disponible: la clave del servidor no es válida' });
        }
        const detalle = (salida.json && salida.json.error && salida.json.error.message) || ('HTTP ' + salida.status);
        return res.status(502).json({ ok: false, error: 'La IA respondió con error: ' + String(detalle).slice(0, 200) });
      }
      if (!salida.json) return res.status(502).json({ ok: false, error: 'Respuesta ilegible de la IA' });
      res.json(salida.json);
    } catch (e) { next(e); }
  });

  /* Contador compartido. Si no hay adaptador con estado (memoria/json), el cupo
   * se lleva en proceso: suficiente para desarrollo, y el login sigue protegido. */
  const memoria = new Map();
  async function leerUso(userId) {
    if (typeof store.adapter.getEstado === 'function') {
      try {
        const [u, g] = await Promise.all([
          store.adapter.getEstado('iaUso', claveUso(userId)),
          store.adapter.getEstado('iaUso', claveUso('global')),
        ]);
        return { usuario: Number((u && u.n) || 0), total: Number((g && g.n) || 0) };
      } catch (e) { /* cae a memoria */ }
    }
    return { usuario: memoria.get(claveUso(userId)) || 0, total: memoria.get(claveUso('global')) || 0 };
  }
  async function sumarUso(userId, deltaUsuario, deltaGlobal) {
    const k = claveUso(userId);
    const kg = claveUso('global');
    if (typeof store.adapter.getEstado === 'function') {
      const [u, g] = await Promise.all([
        store.adapter.getEstado('iaUso', k),
        store.adapter.getEstado('iaUso', kg),
      ]);
      await Promise.all([
        store.adapter.putEstado('iaUso', k, { id: k, n: Math.max(0, Number((u && u.n) || 0) + deltaUsuario) }),
        store.adapter.putEstado('iaUso', kg, { id: kg, n: Math.max(0, Number((g && g.n) || 0) + deltaGlobal) }),
      ]);
      podar();
      return;
    }
    memoria.set(k, Math.max(0, (memoria.get(k) || 0) + deltaUsuario));
    memoria.set(kg, Math.max(0, (memoria.get(kg) || 0) + deltaGlobal));
  }

  /* Una poda al día por instancia: las filas de días pasados no sirven. */
  let ultimaPoda = 0;
  function podar() {
    if (typeof store.adapter.pruneEstado !== 'function') return;
    const ahora = Date.now();
    if (ahora - ultimaPoda < 24 * 3600 * 1000) return;
    ultimaPoda = ahora;
    store.adapter.pruneEstado('iaUso', ahora - 10 * 24 * 3600 * 1000).catch(() => {});
  }

  return r;
};

/* Solo tests: sustituye el proveedor para no salir a la red. */
module.exports.__setProveedor = (fn) => { proveedor = fn; };
module.exports.__reset = () => { proveedor = async () => ({ ok: true, status: 200, json: { choices: [{ message: { content: 'ok' } }] } }); };
