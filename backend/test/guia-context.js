'use strict';
/* La base de conocimiento de Gu-IA se inyecta en el SERVIDOR.
 *
 * Antes el navegador recibía `guiaBase` completa y armaba el contexto. Ahora
 * el cliente no la recibe: /api/ia/chat elige los fragmentos y los añade al
 * prompt. Esta prueba verifica que el proveedor recibe el material y que una
 * consulta sin coincidencias no inyecta nada.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SEED_PASSWORD = 'Test1234*';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.LOGIN_RATE_MAX = '100';
process.env.DATA_DIR = require('os').tmpdir() + '/bb-gctx-' + process.pid;
process.env.GROQ_API_KEY = 'gsk_testkey_guia_context_offline_0000';
process.env.IA_DIARIO = '10';
process.env.IA_MINUTO = '10';

const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');
const iaRoute = require('../src/routes/ia');

let base, server, store;
const jar = {};
let ultimoCuerpo = null;

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

before(async () => {
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
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'Test1234*' }, false);
  assert.equal(login.status, 200);
  store.get().guiaBase = {
    docs: [
      { id: 'g1', titulo: 'AXA', texto: 'La comisión de AXA es 20% sobre la prima total.', activo: true },
      { id: 'g2', titulo: 'GNP', texto: 'La comisión de GNP es 15% sobre la prima total.', activo: true },
    ],
  };
  iaRoute.__setProveedor(async (cuerpo) => {
    ultimoCuerpo = cuerpo;
    return { ok: true, status: 200, json: { choices: [{ message: { role: 'assistant', content: 'ok' } }] } };
  });
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('Gu-IA: contexto de conocimiento en el servidor', () => {
  it('inyecta el documento relevante en el mensaje system', async () => {
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: '¿Cuánto paga AXA de comisión?' },
      ],
    });
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el proveedor recibió el cuerpo');
    const system = ultimoCuerpo.messages.find((m) => m.role === 'system') || {};
    assert.match(String(system.content), /BASE DE CONOCIMIENTO DEL PORTAL/);
    assert.match(String(system.content), /AXA/);
    assert.match(String(system.content), /20%/);
    assert.ok(String(system.content).indexOf('[AXA]') < String(system.content).indexOf('[GNP]'),
      'AXA debe quedar antes que GNP por mayor coincidencia');
  });

  it('no inyecta nada cuando la consulta no tiene términos útiles', async () => {
    ultimoCuerpo = null;
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: 'hola' },
      ],
    });
    assert.equal(r.status, 200);
    const system = ultimoCuerpo.messages.find((m) => m.role === 'system') || {};
    assert.ok(!String(system.content).includes('BASE DE CONOCIMIENTO DEL PORTAL'));
  });
});
