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
const { construirContexto, inyectarContexto } = require('../guiaContext');
const { MODELOS_PERMITIDOS } = require('../iaCatalogo');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_CHARS = 120000;      // conversación completa (≈ 30k tokens)
const MAX_TOKENS = 4000;       // tope por respuesta
const LIMITE_USUARIO = Number(process.env.IA_DIARIO || 300);
const LIMITE_TOTAL = Number(process.env.IA_DIARIO_TOTAL || 3000);
/* Rate-limit por minuto: frena ráfagas (script, doble clic, reintentos) sin
 * castigar el uso normal. El cupo diario sigue siendo el techo económico. */
const LIMITE_MINUTO = Number(process.env.IA_MINUTO || 10);
const LIMITE_MINUTO_TOTAL = Number(process.env.IA_MINUTO_TOTAL || 120);

/* Groq movió Llama 3.1 8B y 3.3 70B al plan Enterprise: en esta cuenta ya no
 * se sirven y el proxy los convertía en un 502. Solo se permite el modelo
 * estable que usa el portal y que está verificado en producción. La lista
 * vive en iaCatalogo.js para que el cron vigile exactamente la misma. */
const MODELOS = MODELOS_PERMITIDOS;

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
const minuto = () => new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm (UTC)
const claveUso = (quien) => String(quien) + ':' + dia();
const claveMinuto = (quien) => String(quien) + ':' + minuto();

module.exports = (store, config) => {
  const r = express.Router();

  /* Estado de la IA para el cliente: ¿hay clave en el servidor? ¿cuánto queda?
   * Con esto la interfaz decide si ofrece IA o el motor local, sin ver la clave. */
  r.get('/estado', mw.requireAuth, async (req, res, next) => {
    try {
      const disponible = !!config.groqApiKey;
      /* Mismo contador que usa /chat: adaptador compartido o memoria local. */
      const usados = disponible ? (await leerUso(req.user.id)).usuario : 0;
      /* Huella (no la clave) para que el navegador pueda borrar copias viejas
       * de la clave del portal que quedaron en localStorage con el código
       * anterior. Doce hexadecimales no permiten recuperar la clave. */
      const huella = config.groqApiKey
        ? require('crypto').createHash('sha256').update(String(config.groqApiKey)).digest('hex').slice(0, 12)
        : null;
      res.json({
        ok: true, disponible,
        limite: LIMITE_USUARIO, usados, restantes: Math.max(0, LIMITE_USUARIO - usados),
        limiteMinuto: LIMITE_MINUTO,
        huella,
      });
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

      /* Base de conocimiento server-side: `guiaBase` ya no viaja en el bundle.
       * Se eligen los 3 documentos más relevantes y se inyectan en el prompt.
       * Si la colección no está disponible, se responde con el prompt del
       * cliente (degradación limpia, sin bloquear la IA). */
      try {
        if (typeof store.refreshCollections === 'function') {
          await store.refreshCollections(['guiaBase']);
        }
        const ultimo = [...mensajes].reverse().find((m) => m && m.role === 'user');
        const consulta = ultimo
          ? (typeof ultimo.content === 'string' ? ultimo.content : JSON.stringify(ultimo.content))
          : '';
        const contexto = construirContexto((store.get() || {}).guiaBase, consulta);
        if (contexto) cuerpo.messages = inyectarContexto(cuerpo.messages, contexto);
      } catch (e) { /* sin base: se conserva el prompt original */ }

      /* Cupo: se reserva ANTES de llamar con incrementos atómicos. Si el
       * proveedor falla por red/5xx, se devuelve para no castigar al usuario. */
      const cupo = await reservarCupo(req.user.id);
      if (!cupo.ok) {
        res.setHeader('Retry-After', String(cupo.retryAfter || 60));
        return res.status(429).json({
          ok: false,
          error: cupo.error,
          ...(cupo.limite ? { limite: cupo.limite } : {}),
        });
      }

      let salida;
      try {
        salida = await proveedor(cuerpo, config.groqApiKey);
      } catch (e) {
        await devolverCupo(cupo.reservas);
        if (e && e.name === 'AbortError') {
          return res.status(504).json({ ok: false, error: 'La IA tardó demasiado en responder' });
        }
        return res.status(502).json({ ok: false, error: 'No se pudo contactar con la IA' });
      }

      if (!salida.ok) {
        /* 401/403 del proveedor = clave inválida o revocada: no es culpa del
         * usuario y no debe consumirle cupo. */
        await devolverCupo(cupo.reservas);
        if (salida.status === 401 || salida.status === 403) {
          console.error('[ia] el proveedor rechazó la clave:', salida.status);
          return res.status(503).json({ ok: false, error: 'IA no disponible: la clave del servidor no es válida' });
        }
        const detalle = (salida.json && salida.json.error && salida.json.error.message) || ('HTTP ' + salida.status);
        return res.status(502).json({ ok: false, error: 'La IA respondió con error: ' + String(detalle).slice(0, 200) });
      }
      if (!salida.json) {
        await devolverCupo(cupo.reservas);
        return res.status(502).json({ ok: false, error: 'Respuesta ilegible de la IA' });
      }
      res.json(salida.json);
    } catch (e) { next(e); }
  });

  /* Contador compartido. Si el adaptador no tiene estado, se lleva en proceso:
   * suficiente para desarrollo, y el login sigue protegido por su propio Map. */
  const memoria = new Map();
  const claveMemoria = (collection, key) => String(collection) + '∅' + String(key);

  async function leerEstado(collection, key) {
    if (typeof store.adapter.getEstado === 'function') {
      try { return await store.adapter.getEstado(collection, key); } catch (e) { /* memoria */ }
    }
    return memoria.get(claveMemoria(collection, key)) || null;
  }

  async function escribirEstado(collection, key, value) {
    if (typeof store.adapter.putEstado === 'function') {
      try { await store.adapter.putEstado(collection, key, value); return; } catch (e) { /* memoria */ }
    }
    memoria.set(claveMemoria(collection, key), { ...(value || {}) });
  }

  /* Incremento atómico si el adaptador lo soporta (Supabase con la migración
   * rate_limit, o los adaptadores locales); si no, GET+PUT como fallback. */
  async function bump(collection, key, field, delta) {
    if (typeof store.adapter.bumpEstado === 'function') {
      try { return await store.adapter.bumpEstado(collection, key, field, delta); }
      catch (e) { /* fallback */ }
    }
    const cur = await leerEstado(collection, key);
    const next = Math.max(0, Number((cur && cur[field]) || 0) + Number(delta || 0));
    await escribirEstado(collection, key, { ...(cur || {}), [field]: next });
    return next;
  }

  async function leerUso(userId) {
    const [u, g] = await Promise.all([
      leerEstado('iaUso', claveUso(userId)),
      leerEstado('iaUso', claveUso('global')),
    ]);
    return { usuario: Number((u && u.n) || 0), total: Number((g && g.n) || 0) };
  }

  /* Reserva los cuatro topes en orden. Si uno falla, devuelve TODO lo
   * reservado: un rechazo no debe consumir cuota. */
  async function reservarCupo(userId) {
    /* Pre-chequeo barato: si ya está agotado, no se hacen 4 escrituras por
     * cada reintento. El bump atómico de abajo sigue siendo la autoridad. */
    const [minU, minG, uso] = await Promise.all([
      leerEstado('iaUso', claveMinuto(userId)),
      leerEstado('iaUso', claveMinuto('global')),
      leerUso(userId),
    ]);
    if (Number((minU && minU.n) || 0) >= LIMITE_MINUTO) {
      return { ok: false, retryAfter: 30, limite: LIMITE_MINUTO,
        error: 'Vas muy rápido: máximo ' + LIMITE_MINUTO + ' mensajes por minuto. Espera unos segundos.' };
    }
    if (Number((minG && minG.n) || 0) >= LIMITE_MINUTO_TOTAL) {
      return { ok: false, retryAfter: 30, limite: LIMITE_MINUTO_TOTAL,
        error: 'La IA está recibiendo muchas solicitudes. Reintenta en unos segundos.' };
    }
    if (uso.total >= LIMITE_TOTAL) {
      return { ok: false, retryAfter: 3600,
        error: 'La IA del portal alcanzó su límite diario. Intenta mañana.' };
    }
    if (uso.usuario >= LIMITE_USUARIO) {
      return { ok: false, retryAfter: 3600, limite: LIMITE_USUARIO,
        error: 'Alcanzaste tu límite diario de IA (' + LIMITE_USUARIO + '). Se renueva a medianoche.' };
    }

    const reservas = [];
    const pasos = [
      { key: claveMinuto(userId), limite: LIMITE_MINUTO, retryAfter: 30,
        error: 'Vas muy rápido: máximo ' + LIMITE_MINUTO + ' mensajes por minuto. Espera unos segundos.' },
      { key: claveMinuto('global'), limite: LIMITE_MINUTO_TOTAL, retryAfter: 30,
        error: 'La IA está recibiendo muchas solicitudes. Reintenta en unos segundos.' },
      { key: claveUso(userId), limite: LIMITE_USUARIO, retryAfter: 3600,
        error: 'Alcanzaste tu límite diario de IA (' + LIMITE_USUARIO + '). Se renueva a medianoche.' },
      { key: claveUso('global'), limite: LIMITE_TOTAL, retryAfter: 3600,
        error: 'La IA del portal alcanzó su límite diario. Intenta mañana.' },
    ];
    try {
      for (const p of pasos) {
        const n = await bump('iaUso', p.key, 'n', 1);
        reservas.push(p.key);
        if (n > p.limite) {
          await devolverCupo(reservas);
          return { ok: false, error: p.error, retryAfter: p.retryAfter, limite: p.limite };
        }
      }
    } catch (e) {
      await devolverCupo(reservas);
      throw e;
    }
    podar();
    return { ok: true, reservas };
  }

  async function devolverCupo(claves) {
    for (let i = (claves || []).length - 1; i >= 0; i--) {
      await bump('iaUso', claves[i], 'n', -1).catch(() => {});
    }
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
