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

describe('Voces naturales de práctica', () => {
  const config = require('../src/config');
  it('protege el catálogo y audio, valida voz, origen y cuota sin contactar al proveedor real', async () => {
    await como('admin');
    const keyAnterior = config.elevenLabsApiKey;
    const fetchReal = global.fetch;
    const pruebaKey = 'eleven-test-key';
    let llamadasAudio = 0;
    config.elevenLabsApiKey = pruebaKey;
    global.fetch = async (url, opts) => {
      if (String(url).startsWith('https://api.elevenlabs.io/v2/voices')) {
        assert.equal(opts.headers['xi-api-key'], pruebaKey);
        return new Response(JSON.stringify({ voices: [
          { voice_id: 'vozA', name: 'Voz A', labels: { accent: 'mexicano' } },
          { voice_id: 'vozB', name: 'Voz B', labels: {} },
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) {
        llamadasAudio++;
        assert.equal(opts.headers['xi-api-key'], pruebaKey);
        assert.equal(JSON.parse(opts.body).model_id, 'eleven_multilingual_v2');
        return new Response(Buffer.from('audio-ficticio'), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
      }
      return fetchReal(url, opts);
    };
    const pedir = (cookie, origin, body) => fetchReal(base + '/api/ia/voz', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
    });
    try {
      const anon = await fetchReal(base + '/api/ia/voces');
      assert.equal(anon.status, 401);
      const catalogo = await fetchReal(base + '/api/ia/voces', { headers: { Cookie: jar.cookie } });
      const lista = await catalogo.json();
      assert.equal(catalogo.status, 200);
      assert.deepEqual(lista.voces.map((v) => v.id), ['vozA', 'vozB']);
      assert.ok(!JSON.stringify(lista).includes(pruebaKey));
      assert.equal((await pedir(null, base, { voz: 'vozA', texto: 'Hola' })).status, 401);
      assert.equal((await pedir(jar.cookie, 'https://ajeno.example', { voz: 'vozA', texto: 'Hola' })).status, 403);
      assert.equal((await pedir(jar.cookie, base, { voz: 'ajena', texto: 'Hola' })).status, 400);
      assert.equal((await pedir(jar.cookie, base, { voz: 'vozA', texto: 'x'.repeat(501) })).status, 400);
      const audio = await pedir(jar.cookie, base, { voz: 'vozB', texto: 'Hola' });
      assert.equal(audio.status, 200);
      assert.match(audio.headers.get('content-type'), /^audio\/mpeg/);
      assert.equal(await audio.text(), 'audio-ficticio');
      for (let i = 0; i < 9; i++) assert.equal((await pedir(jar.cookie, base, { voz: 'vozA', texto: 'Hola' })).status, 200);
      assert.equal((await pedir(jar.cookie, base, { voz: 'vozA', texto: 'Hola' })).status, 429);
      assert.equal(llamadasAudio, 10, 'el proveedor no recibe solicitudes por encima del límite');
    } finally {
      global.fetch = fetchReal;
      config.elevenLabsApiKey = keyAnterior;
    }
  });
});
