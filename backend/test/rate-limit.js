'use strict';
/* Rate-limit de IA por minuto (Fase 0).
 *
 * Verifica que una ráfaga se corta con 429, que el rechazo NO consume cuota
 * diaria y que un fallo del proveedor devuelve lo reservado. Sin red.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SEED_PASSWORD = 'Test1234*';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.LOGIN_RATE_MAX = '100';
process.env.DATA_DIR = require('os').tmpdir() + '/bb-rl-' + process.pid;
process.env.GROQ_API_KEY = 'gsk_testkey_rate_limit_offline_only_0000';
process.env.IA_DIARIO = '100';
process.env.IA_MINUTO = '2';
process.env.IA_MINUTO_TOTAL = '100';

const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');
const iaRoute = require('../src/routes/ia');

let base, server, store;
const jar = {};

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
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
}

async function como(username) {
  jar.cookie = null;
  const r = await api('POST', '/api/auth/login', { username, password: 'Test1234*' }, false);
  assert.equal(r.status, 200, 'login ' + username);
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
  iaRoute.__setProveedor(async () => ({
    ok: true,
    status: 200,
    json: { choices: [{ message: { role: 'assistant', content: 'ok' } }] },
  }));
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('IA: rate-limit por minuto', () => {
  it('corta la tercera petición en el mismo minuto y no consume cupo diario', async () => {
    await como('admin');
    const body = { messages: [{ role: 'user', content: 'hola' }] };

    assert.equal((await api('POST', '/api/ia/chat', body)).status, 200);
    assert.equal((await api('POST', '/api/ia/chat', body)).status, 200);

    const tercero = await api('POST', '/api/ia/chat', body);
    assert.equal(tercero.status, 429);
    assert.equal(tercero.retryAfter, '30');
    assert.match(tercero.json.error, /minuto/i);

    const estado = await api('GET', '/api/ia/estado');
    assert.equal(estado.json.usados, 2, 'el rechazo no debe gastar cupo diario');
    assert.equal(estado.json.restantes, 98);
  });

  it('un fallo del proveedor devuelve el cupo reservado', async () => {
    await como('maestro');
    iaRoute.__setProveedor(async () => { throw new Error('red caída'); });

    const fallo = await api('POST', '/api/ia/chat', {
      messages: [{ role: 'user', content: 'hola' }],
    });
    assert.equal(fallo.status, 502);
    const estado = await api('GET', '/api/ia/estado');
    assert.equal(estado.json.usados, 0, 'el fallo no debe consumir cupo');

    iaRoute.__setProveedor(async () => ({
      ok: true,
      status: 200,
      json: { choices: [{ message: { role: 'assistant', content: 'ok' } }] },
    }));
    assert.equal((await api('POST', '/api/ia/chat', {
      messages: [{ role: 'user', content: 'hola' }],
    })).status, 200);
  });

  it('un modelo no permitido se rechaza sin tocar el contador', async () => {
    await como('admin');
    const antes = (await api('GET', '/api/ia/estado')).json.usados;
    const r = await api('POST', '/api/ia/chat', {
      model: 'modelo-inventado',
      messages: [{ role: 'user', content: 'hola' }],
    });
    assert.equal(r.status, 400);
    const despues = (await api('GET', '/api/ia/estado')).json.usados;
    assert.equal(despues, antes);
  });
});
