'use strict';
/* ============================================================================
 * guiaContext.js — Contexto de la base de conocimiento de Gu-IA (servidor)
 *
 * Antes, `guiaBase` viajaba completa en /api/data/bundle a cualquier sesión y
 * el navegador elegía los fragmentos. Eso exponía todo el material y permitía
 * que un cliente manipulara el contexto. Ahora el servidor elige los 3
 * documentos más relevantes y los inyecta en el prompt de /api/ia/chat.
 * Reproduce la puntuación simple del legacy para no cambiar el comportamiento.
 * ========================================================================== */

const MAX_DOCS = 3;
const MAX_CHARS_POR_DOC = 8000;
const UMBRAL = 0.08;

function tokens(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function construirContexto(guiaBase, texto, opciones) {
  const opts = opciones || {};
  const docs = guiaBase && Array.isArray(guiaBase.docs) ? guiaBase.docs : [];
  const activos = docs.filter((d) => d && d.activo !== false);
  if (!activos.length) return '';

  const consulta = tokens(texto);
  if (!consulta.length) return '';

  const rankeados = activos.map((doc) => {
    const bolsa = tokens((doc.titulo || '') + ' ' + (doc.texto || ''));
    const set = new Set(bolsa);
    let aciertos = 0;
    consulta.forEach((q) => { if (set.has(q)) aciertos++; });
    return { doc, score: aciertos / Math.max(1, consulta.length) };
  }).filter((r) => r.score > (opts.umbral || UMBRAL))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxDocs || MAX_DOCS);

  if (!rankeados.length) return '';

  return '\n\n=== BASE DE CONOCIMIENTO DEL PORTAL (prioridad máxima: si el tema está aquí, respóndete SOLO con esto y no con conocimiento general) ===\n'
    + rankeados.map((r) => '[' + (r.doc.titulo || 'Doc') + ']\n' + String(r.doc.texto || '').slice(0, opts.maxChars || MAX_CHARS_POR_DOC)).join('\n---\n')
    + '\n=== FIN DE LA BASE: usa estos datos con prioridad sobre tu conocimiento general; si la respuesta no está aquí, dilo y complementa con lo que sepas. ===';
}

/* Añade el contexto al prompt del sistema sin romper proveedores que esperan
 * un único mensaje system. Devuelve una copia: no muta el body del cliente. */
function inyectarContexto(mensajes, contexto) {
  const lista = Array.isArray(mensajes) ? mensajes.map((m) => ({ ...m })) : [];
  if (!contexto) return lista;
  const idx = lista.findIndex((m) => m && m.role === 'system');
  if (idx >= 0) {
    lista[idx].content = String(lista[idx].content || '') + contexto;
  } else {
    lista.unshift({ role: 'system', content: contexto });
  }
  return lista;
}

module.exports = { construirContexto, inyectarContexto, tokens };
