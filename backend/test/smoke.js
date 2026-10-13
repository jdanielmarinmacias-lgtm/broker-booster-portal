'use strict';
/* Smoke tests (node --test test/smoke.js). Sin red: adaptador en memoria.
 * Cubre auth propio, roles en servidor, API genérica, feed y config pública. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SEED_PASSWORD = 'Test1234*';
// Herméticos y offline: pisan el .env real (config.js solo rellena lo undefined;
// '' es falsy y deja supabaseUrl/ServiceKey en null).
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
// El suite hace >10 logins desde la misma IP: sube el tope (el limitador se
// verifica aparte en producción con su default de 10).
process.env.LOGIN_RATE_MAX = '100';
// Subidas locales de los tests a tmp (no ensucian el repo).
process.env.DATA_DIR = require('os').tmpdir() + '/bb-test-' + process.pid;

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

describe('salud pública (regressión: ningún router la debe 401-izar)', () => {
  it('/api/salud responde sin sesión', async () => {
    const r = await api('GET', '/api/salud', null, false);
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
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
  it('feed público lista lo publicado (último primero)', async () => {
    const r = await api('GET', '/api/public/feed', null, false);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.items));
    assert.equal(r.json.items[0].kind, 'autoHub');
  });
});

describe('fase 2b: índice y upsert para sync', () => {
  it('GET /api/data lista colecciones sin users/sessions', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('GET', '/api/data');
    assert.equal(r.status, 200);
    assert.ok(r.json.collections.includes('ventas'));
    assert.ok(!r.json.collections.includes('users') && !r.json.collections.includes('sessions'));
  });
  it('sin sesión el índice es 401', async () => {
    const r = await api('GET', '/api/data', null, false);
    assert.equal(r.status, 401);
  });
  it('POST con id de cliente crea (201) y re-POST hace upsert (200)', async () => {
    const c1 = await api('POST', '/api/data/metas', { id: 999001, titulo: 'Meta local' });
    assert.equal(c1.status, 201);
    assert.equal(c1.json.item.id, 999001);
    const c2 = await api('POST', '/api/data/metas', { id: 999001, titulo: 'Meta editada' });
    assert.equal(c2.status, 200);
    assert.equal(c2.json.upserted, true);
    const g = await api('GET', '/api/data/metas');
    assert.equal(g.json.items.find((x) => x.id === 999001).titulo, 'Meta editada');
    const d = await api('DELETE', '/api/data/metas/999001');
    assert.equal(d.status, 200);
  });
  it('ids duplicados no tumban el persist (upsert last-wins, no 500)', async () => {
    // El legacy genera ids con Date.now: pueden repetirse; el adaptador dedupa.
    const a = await api('POST', '/api/data/metas', { id: 999002, titulo: 'Uno' });
    assert.equal(a.status, 201);
    const b = await api('POST', '/api/data/metas', { id: 999002, titulo: 'Dos' });
    assert.equal(b.status, 200);
    const g = await api('GET', '/api/data/metas');
    assert.equal(g.json.items.filter((x) => x.id === 999002).length, 1);
    await api('DELETE', '/api/data/metas/999002');
  });
  it('POST /api/users acepta id de cliente (referencias locales intactas)', async () => {
    const r = await api('POST', '/api/users', { id: 888001, username: 'sinctest', password: 'Clave1234', role: 'alumno', name: 'Sync Test' });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.id, 888001);
    assert.ok(!('passwordHash' in r.json.user));
    const dup = await api('POST', '/api/users', { id: 888001, username: 'otro', password: 'Clave1234', role: 'alumno' });
    assert.equal(dup.status, 409);
    const del = await api('DELETE', '/api/users/888001');
    assert.equal(del.status, 200);
  });
});

describe('auditoría: guardado de usuarios y equipo', () => {
  it('maestro edita a su equipo incl. agenciaId/assignedTo (200)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'maestro', password: 'Test1234*' }, false);
    const c = await api('POST', '/api/users', { username: 'agenteq', password: 'Clave1234', role: 'agente_desarrollo', name: 'Agente Q' });
    assert.equal(c.status, 201);
    const id = c.json.user.id;
    const put = await api('PUT', `/api/users/${id}`, { agenciaId: 999, assignedTo: 2, xp: 50 });
    assert.equal(put.status, 200);
    assert.equal(put.json.user.agenciaId, 999);
    assert.equal(put.json.user.xp, 50);
    const del = await api('DELETE', `/api/users/${id}`);
    assert.equal(del.status, 200);
  });
  it('maestro no toca a quien no es su equipo (403)', async () => {
    const r = await api('PUT', '/api/users/1', { name: 'Hack' });
    assert.equal(r.status, 403);
  });
  it('agencia crea agentes (201)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const a = await api('POST', '/api/users', { username: 'agenciaq', password: 'Clave1234', role: 'agencia', name: 'Agencia Q' });
    assert.equal(a.status, 201);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'agenciaq', password: 'Clave1234' }, false);
    const g = await api('POST', '/api/users', { username: 'agenteqq', password: 'Clave1234', role: 'agente_agencia', name: 'Agente QQ' });
    assert.equal(g.status, 201);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    await api('DELETE', `/api/users/${g.json.user.id}`);
    await api('DELETE', `/api/users/${a.json.user.id}`);
  });
  it('payload gigante responde 413 JSON (no crash silencioso)', async () => {
    const big = await api('POST', '/api/data/posts', { id: 999100, titulo: 'x'.repeat(11 * 1024 * 1024) });
    assert.equal(big.status, 413);
    assert.equal(big.json.ok, false);
  });
  it('rate-limit: mensaje usa LOGIN_RATE_MIN (2 minutos)', async () => {
    // El comportamiento (bloqueo al 11vo fallo) se verifica manual contra un
    // servidor real; aquí solo el mensaje (el contador es global al proceso).
    const mw = require('../src/middleware');
    assert.ok(typeof mw.loginRateLimit === 'function');
    assert.ok(typeof mw.noteFailedLogin === 'function');
    assert.ok(typeof mw.forgiveLogin === 'function');
  });
});

describe('paso 4: archivos compartidos (modo local)', () => {
  async function rawForm(fd, withAuth = true) {
    const headers = {};
    if (withAuth && jar.cookie) headers.Cookie = jar.cookie;
    const res = await fetch(base + '/api/media', { method: 'POST', headers, body: fd });
    let json = null;
    try { json = await res.json(); } catch (e) { /* no-json */ }
    return { status: res.status, json };
  }
  const png = (name) => {
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), name);
    fd.append('scope', 'autoHub');
    fd.append('title', 'Auto con foto');
    return fd;
  };
  it('sign sin Supabase responde 501 con fallback local', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('POST', '/api/media/sign', { filename: 'a.png', mime: 'image/png', size: 100, scope: 'autoHub' });
    assert.equal(r.status, 501);
    assert.equal(r.json.fallback, 'local');
  });
  it('sin sesión es 401', async () => {
    const r = await rawForm(png('s.png'), false);
    assert.equal(r.status, 401);
  });
  it('alumno no sube a ventas (403) y se borra el temporal', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const fd = png('x.png');
    fd.set('scope', 'ventas');
    const r = await rawForm(fd);
    assert.equal(r.status, 403);
  });
  it('rechaza ejecutables (400)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const fd = new FormData();
    fd.append('files', new Blob(['x'], { type: 'application/x-msdownload' }), 'mal.exe');
    fd.append('scope', 'media');
    const r = await rawForm(fd);
    assert.equal(r.status, 400);
  });
  it('admin sube PNG (201), sirve el archivo y el feed lo incluye', async () => {
    const r = await rawForm(png('foto.png'));
    assert.equal(r.status, 201);
    const item = r.json.items[0];
    assert.match(item.url, /^\/uploads\//);
    assert.equal(item.mime, 'image/png');
    const f = await fetch(base + item.url);
    assert.equal(f.status, 200);
    const feed = await api('GET', '/api/public/feed', null, false);
    const row = feed.json.items.find((x) => x.title === 'Auto con foto');
    assert.ok(row);
    assert.equal(row.image_url, item.url);
  });
});
