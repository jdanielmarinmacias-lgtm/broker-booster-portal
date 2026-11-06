'use strict';
/* Integración de Gu-IA con el Respan Gateway local.
 *
 * El gateway real corre aparte (backend/gateway/, Python 3.10+). Aquí se
 * sustituye por un fixture HTTP en loopback que habla el mismo contrato OpenAI:
 * comprueba que /api/ia/chat sale por IA_GATEWAY_URL/v1/chat/completions, con el
 * modelo prefijado `groq/`, y que la clave del proveedor NO viaja al gateway.
 * El segundo caso confirma que sin IA_GATEWAY_URL todo sigue yendo a Groq
 * directo. Sin red.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.SEED_PASSWORD = 'Test1234*';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.LOGIN_RATE_MAX = '100';
process.env.DATA_DIR = require('os').tmpdir() + '/bb-gw-' + process.pid;
process.env.GROQ_API_KEY = 'gsk_testkey_gateway_offline_only_0000';
process.env.IA_MINUTO = '100';
process.env.IA_MINUTO_TOTAL = '1000';

const config = require('../src/config');
const iaGateway = require('../src/iaGateway');
const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');

const PREGUNTA = '¿Cómo redacto un correo de seguimiento para un cliente interesado?';

let base, server, store, fixture, gatewayUrl;
const jar = {};
const recibidas = [];

async function api(method, p, body, useAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (useAuth && jar.cookie) headers.Cookie = jar.cookie;
  const res = await fetch(base + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jar.cookie = setCookie.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch (e) { /* no-json */ }
  return { status: res.status, json };
}

async function como(username) {
  jar.cookie = null;
  const r = await api('POST', '/api/auth/login', { username, password: 'Test1234*' }, false);
  assert.equal(r.status, 200, 'login ' + username);
}

before(async () => {
  fixture = http.createServer((req, res) => {
    let texto = '';
    req.on('data', (trozo) => { texto += trozo; });
    req.on('end', () => {
      let cuerpo = null;
      try { cuerpo = JSON.parse(texto); } catch (e) { cuerpo = null; }
      recibidas.push({ metodo: req.method, url: req.url, headers: req.headers, cuerpo });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion',
        model: (cuerpo && cuerpo.model) || 'groq/desconocido',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'respuesta del gateway de prueba' },
          finish_reason: 'stop',
        }],
      }));
    });
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  gatewayUrl = 'http://127.0.0.1:' + fixture.address().port;
  config.iaGatewayUrl = gatewayUrl;

  const adapter = createMemoryAdapter();
  sessions.bind(adapter);
  store = createStore(adapter);
  const r = await seed(store, process.env.SEED_PASSWORD);
  assert.equal(r.created, true);
  await new Promise((resolve) => {
    server = createApp(store).listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => new Promise((resolve) => {
  server.close(() => fixture.close(resolve));
}));

describe('Gu-IA a través del Respan Gateway local', () => {
  it('manda /api/ia/chat al gateway, con el modelo enrutado y sin la clave del proveedor', async () => {
    await como('admin');
    const r = await api('POST', '/api/ia/chat', { messages: [{ role: 'user', content: PREGUNTA }] });

    assert.equal(r.status, 200);
    assert.equal(r.json.choices[0].message.content, 'respuesta del gateway de prueba');
    assert.equal(recibidas.length, 1, 'el gateway recibe exactamente una petición');
    assert.equal(recibidas[0].metodo, 'POST');
    assert.equal(recibidas[0].url, '/v1/chat/completions');
    assert.equal(recibidas[0].cuerpo.model, 'groq/openai/gpt-oss-120b');
    assert.equal(recibidas[0].headers.authorization, 'Bearer portal-local');
    assert.ok(
      !JSON.stringify(recibidas[0].headers).includes(process.env.GROQ_API_KEY),
      'la clave de Groq no debe viajar al gateway'
    );
  });

  it('sin IA_GATEWAY_URL sigue llamando a Groq directo con su clave', async () => {
    await como('admin');
    const fetchReal = global.fetch;
    let capturada = null;
    global.fetch = async (url, opts) => {
      if (String(url).startsWith('https://api.groq.com/')) {
        capturada = { url: String(url), headers: opts.headers };
        return new Response(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'respuesta directa de Groq' } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return fetchReal(url, opts);
    };
    const antes = recibidas.length;
    try {
      config.iaGatewayUrl = null;
      const r = await api('POST', '/api/ia/chat', { messages: [{ role: 'user', content: PREGUNTA }] });

      assert.equal(r.status, 200);
      assert.equal(r.json.choices[0].message.content, 'respuesta directa de Groq');
      assert.equal(capturada.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(capturada.headers.Authorization, 'Bearer ' + process.env.GROQ_API_KEY);
      assert.equal(recibidas.length, antes, 'el gateway no debe recibir la petición');
    } finally {
      global.fetch = fetchReal;
      config.iaGatewayUrl = gatewayUrl;
    }
  });

  it('construye la URL sin duplicar /v1 y prefija el proveedor una sola vez', () => {
    assert.equal(iaGateway.urlChat({ iaGatewayUrl: 'http://127.0.0.1:8787' }),
      'http://127.0.0.1:8787/v1/chat/completions');
    assert.equal(iaGateway.urlChat({ iaGatewayUrl: 'http://127.0.0.1:8787/' }),
      'http://127.0.0.1:8787/v1/chat/completions');
    assert.equal(iaGateway.urlChat({ iaGatewayUrl: 'http://127.0.0.1:8787/v1' }),
      'http://127.0.0.1:8787/v1/chat/completions');
    assert.equal(iaGateway.modeloEnrutado('openai/gpt-oss-120b'), 'groq/openai/gpt-oss-120b');
    assert.equal(iaGateway.modeloEnrutado('groq/openai/gpt-oss-120b'), 'groq/openai/gpt-oss-120b');
    assert.equal(iaGateway.activo({}), false);
  });
});
