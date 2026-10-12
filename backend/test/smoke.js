'use strict';
/* Smoke tests (node --test test/smoke.js). Sin red: adaptador en memoria.
 * Cubre auth propio, roles en servidor, API genérica, feed y config pública. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SEED_PASSWORD = 'Test1234*';

const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');

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
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('auth propio', () => {
  it('rechaza login incorrecto (401)', async () => {
    const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'mala' }, false);
    assert.equal(r.status, 401);
  });
  it('login admin OK + cookie HttpOnly + mustChange', async () => {
    const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'Test1234*' }, false);
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.mustChangePassword, true);
    assert.match(jar.cookie || '', /bb_session=/);
  });
  it('/me sin cookie es 401 con marca backend', async () => {
    const r = await api('GET', '/api/auth/me', null, false);
    assert.equal(r.status, 401);
    assert.equal(r.json.backend, true);
  });
  it('/me con cookie devuelve usuario SIN hash', async () => {
    const r = await api('GET', '/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.json.user.username, 'admin');
    assert.ok(!('passwordHash' in r.json.user) && !('password' in r.json.user));
  });
  it('cambio de contraseña rota el hash y quita el flag', async () => {
    const r = await api('POST', '/api/auth/change-password', { current: 'Test1234*', next: 'NuevaClave99' });
    assert.equal(r.status, 200);
    jar.cookie = null;
    const r2 = await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    assert.equal(r2.status, 200);
    assert.equal(r2.json.mustChangePassword, false);
  });
});

describe('roles en servidor', () => {
  it('alumno no lista usuarios (403)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const r = await api('GET', '/api/users');
    assert.equal(r.status, 403);
  });
  it('admin lista usuarios sin hashes', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('GET', '/api/users');
    assert.equal(r.status, 200);
    assert.ok(r.json.users.length >= 7);
    assert.ok(r.json.users.every((u) => !('passwordHash' in u)));
  });
  it('nadie borra una cuenta GM (403)', async () => {
    const gm = (await api('GET', '/api/users')).json.users.find((u) => u.role === 'gm');
    const r = await api('DELETE', `/api/users/${gm.id}`);
    assert.equal(r.status, 403);
  });
  it('alumno no escribe ventas (403) pero admin sí (201)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const d1 = await api('POST', '/api/data/ventas', { contratante: 'X' });
    assert.equal(d1.status, 403);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const d2 = await api('POST', '/api/data/ventas', { contratante: 'ACME', prima: 5000 });
    assert.equal(d2.status, 201);
  });
  it('logout invalida la sesión', async () => {
    await api('POST', '/api/auth/logout');
    const r = await api('GET', '/api/auth/me');
    assert.equal(r.status, 401);
  });
});

describe('paso 3: config pública y feed', () => {
  it('config pública anuncia realtime=false sin Supabase', async () => {
    const r = await api('GET', '/api/public/config', null, false);
    assert.equal(r.status, 200);
    assert.equal(r.json.realtime, false);
  });
  it('portal público responde contadores', async () => {
    const r = await api('GET', '/api/public/portal', null, false);
    assert.equal(r.status, 200);
    assert.ok('autosDisponibles' in r.json.portal);
  });
  it('publicar en escaparate genera item de feed', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('POST', '/api/data/autoHub', { titulo: 'Test Auto' });
    assert.equal(r.status, 201);
    assert.equal(store.adapter._feed.length, 1);
    assert.equal(store.adapter._feed[0].kind, 'autoHub');
  });
});
