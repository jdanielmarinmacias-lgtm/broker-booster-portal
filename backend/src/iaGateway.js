'use strict';
/* ============================================================================
 * Respan Gateway local: la IA del portal puede salir por un gateway propio
 *
 * Con `IA_GATEWAY_URL` definida, /api/ia/chat deja de llamar a Groq directo:
 * manda la misma petición OpenAI a un Respan Gateway que escucha en loopback
 * (ver backend/gateway/) y el gateway pone la clave del proveedor. El cuerpo y
 * la respuesta conservan el formato OpenAI, así que el cliente del portal sigue
 * leyendo `choices[0].message.content` sin cambios.
 *
 * La clave de Groq NUNCA se reenvía: el gateway la lee de su propio entorno
 * (`key = "env:GROQ_API_KEY"` en gateway.toml). El backend solo manda una clave
 * de cliente de relleno que el gateway descarta.
 *
 * El modelo se prefija con `groq/` porque el nombre real
 * (`openai/gpt-oss-120b`) empieza por `openai/` y por nombre el gateway lo
 * mandaría al proveedor equivocado.
 * ========================================================================== */
const RUTA_CHAT = '/chat/completions';
const PREFIJO_PROVEEDOR = 'groq/';
const CLAVE_CLIENTE = 'portal-local'; // no autentica a Groq: el gateway la descarta

/* ¿Hay gateway configurado? Sin IA_GATEWAY_URL todo sigue yendo a Groq directo. */
function activo(config) {
  return !!(config && config.iaGatewayUrl);
}

/* URL OpenAI-compatible: acepta http://127.0.0.1:8787 y .../v1 sin duplicar. */
function urlChat(config) {
  const base = String(config.iaGatewayUrl).trim().replace(/\/+$/, '');
  return (/\/v1$/.test(base) ? base : base + '/v1') + RUTA_CHAT;
}

/* `openai/gpt-oss-120b` -> `groq/openai/gpt-oss-120b` (idempotente). */
function modeloEnrutado(modelo) {
  const m = String(modelo || '');
  if (!m || m.indexOf(PREFIJO_PROVEEDOR) === 0) return m;
  return PREFIJO_PROVEEDOR + m;
}

/* Petición lista para el gateway: mismo cuerpo OpenAI y modelo enrutado. */
function prepararPeticion(cuerpo, config) {
  return {
    url: urlChat(config),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CLAVE_CLIENTE },
    cuerpo: { ...cuerpo, model: modeloEnrutado(cuerpo && cuerpo.model) },
  };
}

module.exports = { activo, urlChat, modeloEnrutado, prepararPeticion, PREFIJO_PROVEEDOR };
