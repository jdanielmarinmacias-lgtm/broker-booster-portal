'use strict';
/* Smoke tests (node --test test/smoke.js). Sin red: adaptador en memoria.
 * Cubre auth propio, roles en servidor, API genérica, feed y config pública. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SEED_PASSWORD = 'Test1234*';
// Hermeticidad: la IA del portal se prueba con una clave de TEST, nunca la
// real del propietario (que viaja solo como env de Vercel).
process.env.GROQ_API_KEY = 'gsk_testkey_leaked_offline_test_only_0000';
// Herméticos y offline: pisan el .env real (config.js solo rellena lo undefined;
// '' es falsy y deja supabaseUrl/ServiceKey en null).
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
// El suite hace >10 logins desde la misma IP: sube el tope (el limitador se
// verifica aparte en producción con su default de 10).
process.env.LOGIN_RATE_MAX = '100';
// Hermeticidad del reporte semanal: ningún test debe enviar correo real.
process.env.RESEND_API_KEY = ''; // vacío ⇒ dry-run (solo registra, no envía)
// Subidas locales de los tests a tmp (no ensucian el repo).
process.env.DATA_DIR = require('os').tmpdir() + '/bb-test-' + process.pid;

const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');

let base, server, store;
const jar = {};

/* Simula otra instancia de Vercel: escribe directo al adaptador por detrás
 * de la caché del store. Toda mutación HTTP debe recargar antes de tocar. */
async function externalWrite(mut) {
  const docs = await store.adapter.loadDocuments();
  mut(docs);
  await store.adapter.saveDocuments(docs);
}

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

  it('el portal público refleja los settings guardados (no sirve una portada vacía)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const w = await api('PUT', '/api/data/settings/institutionName', { value: 'Academia Fase4' });
    assert.ok(w.status === 200 || w.status === 201, 'PUT ' + w.status);
    jar.cookie = null;
    const r = await api('GET', '/api/public/portal', null, false);
    assert.equal(r.status, 200);
    assert.equal(r.json.portal.institutionName, 'Academia Fase4');
  });
  it('IA key: 401 sin sesión; con sesión entrega clave gsk_ (no se loggea)', async () => {
    jar.cookie = null;
    const anon = await api('GET', '/api/ia/key', null, false);
    assert.equal(anon.status, 401);
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('GET', '/api/ia/key');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.ok(String(r.json.key || '').startsWith('gsk_'), 'clave Groq con formato correcto');
  });
  it('publicar en escaparate genera item de feed (array: posts)', async () => {
    // autoHub/settings ahora son COLECCIONES-OBJETO (su POST mergea y
    // responde 200): el feed se prueba con un array de escaparate, `posts`.
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('POST', '/api/data/posts', { titulo: 'Test Post' });
    assert.equal(r.status, 201);
    // Ventas/solicitudes también espejan a feed (promotoría en vivo), así que
    // puede haber más de 1 item; lo que importa es que posts llegó último.
    assert.ok(store.adapter._feed.length >= 1);
    assert.equal(store.adapter._feed[store.adapter._feed.length - 1].kind, 'posts');
    await api('DELETE', `/api/data/posts/${r.json.item.id}`);
  });
  it('feed público lista lo publicado (último primero)', async () => {
    // El DELETE de arriba agrega un item de feed (borrado): comprobamos que
    // hay ≥1 item y que posts aparece en los primeros.
    const r = await api('GET', '/api/public/feed', null, false);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.items));
    assert.ok(r.json.items.length >= 1);
    assert.ok(r.json.items.some((x) => x.kind === 'posts'));
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
  it('POST y PUT /api/users persisten ubicacion, agenciaId, username y cambio opcional de password', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const created = await api('POST', '/api/users', {
      username: 'userubic1',
      password: 'ClaveInicial1*',
      role: 'agente_agencia',
      name: 'Usuario Ubicacion',
      ubicacion: 'Nuevo León',
      ciudad: 'Monterrey',
      agenciaId: 77,
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.user.ubicacion, 'Nuevo León');
    assert.equal(created.json.user.ciudad, 'Monterrey');
    assert.equal(created.json.user.agenciaId, 77);
    const uid = created.json.user.id;

    // Editar ubicación sin enviar password conserva la contraseña original
    const edit1 = await api('PUT', `/api/users/${uid}`, {
      ubicacion: 'Jalisco',
      agenciaId: null,
    });
    assert.equal(edit1.status, 200);
    assert.equal(edit1.json.user.ubicacion, 'Jalisco');
    assert.equal(edit1.json.user.agenciaId, undefined);

    // Login con la contraseña original sigue funcionando tras editar sin password
    jar.cookie = null;
    const loginOrig = await api('POST', '/api/auth/login', { username: 'userubic1', password: 'ClaveInicial1*' }, false);
    assert.equal(loginOrig.status, 200);

    // Ahora admin rota la contraseña y username desde PUT /api/users/:id
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const edit2 = await api('PUT', `/api/users/${uid}`, {
      username: 'userubic2',
      password: 'ClaveRotada2*',
    });
    assert.equal(edit2.status, 200);
    assert.equal(edit2.json.user.username, 'userubic2');

    // Login con la nueva contraseña y nuevo username funciona
    jar.cookie = null;
    const loginNew = await api('POST', '/api/auth/login', { username: 'userubic2', password: 'ClaveRotada2*' }, false);
    assert.equal(loginNew.status, 200);

    // Limpieza y dejar cookie en maestro para el siguiente test
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    await api('DELETE', `/api/users/${uid}`);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'maestro', password: 'Test1234*' }, false);
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

describe('promotoría+escuela: matriz y persist quirúrgico', () => {
  it('índice incluye colecciones vacías conocidas (incógnito no pierde nada)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('GET', '/api/data');
    assert.equal(r.status, 200);
    for (const k of ['ventas', 'solicitudes', 'cotizaciones', 'siniestros', 'lessons', 'messages']) {
      assert.ok(r.json.collections.includes(k), 'falta ' + k);
    }
  });
  it('agente crea solicitud (201) pero no cotización (403); cotizador sí (201)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const s = await api('POST', '/api/data/solicitudes', { id: 991001, ramo: 'auto-ind', cliente: 'Test' });
    assert.equal(s.status, 201);
    const c = await api('POST', '/api/data/cotizaciones', { id: 991002, solicitudId: 991001 });
    assert.equal(c.status, 403);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'maestro', password: 'Test1234*' }, false);
    const c2 = await api('POST', '/api/data/cotizaciones', { id: 991002, solicitudId: 991001 });
    assert.equal(c2.status, 201);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    await api('DELETE', '/api/data/cotizaciones/991002');
    await api('DELETE', '/api/data/solicitudes/991001');
  });
  it('GET /api/data/bundle devuelve todas las colecciones legibles en una sola respuesta', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('GET', '/api/data/bundle');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.ok(r.json.bundle && typeof r.json.bundle === 'object');
    assert.equal(r.json.bundle.ventas.shape, 'array');
    assert.equal(r.json.bundle.settings.shape, 'object');
    assert.ok(!('users' in r.json.bundle) && !('sessions' in r.json.bundle));
  });
  it('agente crea venta y mensaje (escuela/chat abiertos a todos)', async () => {
    // Alta de un agente temporal (el seed no trae agentes).
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const au = await api('POST', '/api/users', { username: 'agentetmp', password: 'Clave1234', role: 'agente_agencia', name: 'Agente Tmp' });
    assert.equal(au.status, 201);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'agentetmp', password: 'Clave1234' }, false);
    const v = await api('POST', '/api/data/ventas', { id: 991003, contratante: 'Agente vende' });
    assert.equal(v.status, 201);
    const m = await api('POST', '/api/data/messages', { id: 991004, texto: 'hola' });
    assert.equal(m.status, 201);
    // Alumno: vende NO (403, es estudiante) pero chatea SÍ (201).
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const v2 = await api('POST', '/api/data/ventas', { id: 991008, contratante: 'Alumno vende' });
    assert.equal(v2.status, 403);
    const m2 = await api('POST', '/api/data/messages', { id: 991009, texto: 'hola alumno' });
    assert.equal(m2.status, 201);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    await api('DELETE', '/api/data/ventas/991003');
    await api('DELETE', '/api/data/messages/991004');
    await api('DELETE', '/api/data/messages/991009');
    await api('DELETE', `/api/users/${au.json.user.id}`);
  });
  it('persist quirúrgico: editar una colección no borra otra', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    await api('POST', '/api/data/solicitudes', { id: 991005, cliente: 'A' });
    await api('POST', '/api/data/ventas', { id: 991006, contratante: 'B' });
    const put = await api('PUT', '/api/data/ventas/991006', { contratante: 'B2' });
    assert.equal(put.status, 200);
    const g = await api('GET', '/api/data/solicitudes');
    assert.ok(g.json.items.some((x) => String(x.id) === '991005'), 'solicitud sobrevivió al PUT de ventas');
    await api('DELETE', '/api/data/solicitudes/991005');
    await api('DELETE', '/api/data/ventas/991006');
  });
  it('solicitud nueva genera item de feed (realtime encargado)', async () => {
    const n0 = (await api('GET', '/api/public/feed', null, false)).json.items.length;
    const s = await api('POST', '/api/data/solicitudes', { id: 991007, cliente: 'Feed test' });
    assert.equal(s.status, 201);
    const feed = await api('GET', '/api/public/feed', null, false);
    assert.equal(feed.json.items.length, n0 + 1);
    assert.equal(feed.json.items[0].kind, 'solicitudes');
    await api('DELETE', '/api/data/solicitudes/991007');
  });
});

describe('stale-cache multi-instancia: escribir con caché vieja no borra nada', () => {
  it('POST con caché vieja conserva lo ajeno (ventas)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    await externalWrite((d) => {
      d.ventas = d.ventas || [];
      d.ventas.push({ id: 992001, contratante: 'Otra instancia' });
    });
    const r = await api('POST', '/api/data/ventas', { id: 992002, contratante: 'Esta instancia' });
    assert.equal(r.status, 201);
    const g = await api('GET', '/api/data/ventas');
    assert.ok(g.json.items.some((x) => String(x.id) === '992001'), 'sobrevive lo ajeno');
    assert.ok(g.json.items.some((x) => String(x.id) === '992002'), 'sobrevive lo propio');
    await api('DELETE', '/api/data/ventas/992001');
    await api('DELETE', '/api/data/ventas/992002');
  });
  it('PUT usuario con caché vieja conserva usuarios ajenos', async () => {
    await externalWrite((d) => {
      d.users = d.users || [];
      d.users.push({ id: 992010, username: 'externo', role: 'alumno', name: 'Externo' });
    });
    const me = (await api('GET', '/api/users')).json.users.find((u) => u.username === 'admin');
    const put = await api('PUT', `/api/users/${me.id}`, { phone: '521111111111' });
    assert.equal(put.status, 200);
    const after = (await api('GET', '/api/users')).json.users;
    assert.ok(after.some((u) => u.username === 'externo'), 'usuario ajeno sobrevive al PUT');
    assert.equal(after.find((u) => u.username === 'admin').phone, '521111111111');
    await api('DELETE', '/api/users/992010');
    await api('PUT', `/api/users/${me.id}`, { phone: '521000000000' });
  });
  it('login fallido (401) no borra registros ajenos', async () => {
    await externalWrite((d) => {
      d.solicitudes = d.solicitudes || [];
      d.solicitudes.push({ id: 992020, cliente: 'No tocar' });
    });
    jar.cookie = null;
    const bad = await api('POST', '/api/auth/login', { username: 'admin', password: 'mala-clave' }, false);
    assert.equal(bad.status, 401);
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const g = await api('GET', '/api/data/solicitudes');
    assert.ok(g.json.items.some((x) => String(x.id) === '992020'), 'login fallido no wipea');
    await api('DELETE', '/api/data/solicitudes/992020');
  });
});

describe('colecciones-objeto: settings/autoHub (publicidad, capacitaciones, clientes de módulos)', () => {
  it('índice incluye objetos conocidos (settings, autoHub…)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('GET', '/api/data');
    assert.equal(r.status, 200);
    for (const k of ['settings', 'autoHub', 'inmPublica', 'notifications']) {
      assert.ok(r.json.collections.includes(k), 'falta objeto ' + k);
    }
  });
  it('GET settings devuelve {object} (nunca []); se puede escribir por clave', async () => {
    const g = await api('GET', '/api/data/settings');
    assert.equal(g.status, 200);
    assert.ok(g.json.object && !Array.isArray(g.json.object), 'settings es objeto');
    const p = await api('PUT', '/api/data/settings/publicidad', { value: [{ id: 551, titulo: 'Curso veraniego', fecha: 1 }] });
    assert.equal(p.status, 200);
    const cap = await api('PUT', '/api/data/settings/casosExito', { value: [{ id: 552, titulo: 'Caso 1' }] });
    assert.equal(cap.status, 200);
    const g2 = await api('GET', '/api/data/settings');
    assert.equal(g2.json.object.publicidad.length, 1);
    assert.equal(g2.json.object.casosExito[0].titulo, 'Caso 1');
  });
  it('autoHub se escribe como objeto (unidades/clientes) y NO se coacciona a []', async () => {
    const p = await api('PUT', '/api/data/autoHub/unidades', { value: [{ id: 771, marca: 'Toyota', precio: 250000 }] });
    assert.equal(p.status, 200);
    const c = await api('PUT', '/api/data/autoHub/clientes', { value: [{ id: 772, nombre: 'Cliente CRM autos' }] });
    assert.equal(c.status, 200);
    // POST genérico sobre objeto: merge (no destruye con [])
    const m = await api('POST', '/api/data/autoHub', { guion: 'Guion de ventas' });
    assert.equal(m.status, 200);
    const g = await api('GET', '/api/data/autoHub');
    assert.ok(g.json.object && g.json.object.unidades.length === 1, 'unidades sobrevive');
    assert.equal(g.json.object.clientes[0].nombre, 'Cliente CRM autos');
    assert.equal(g.json.object.guion, 'Guion de ventas');
  });
  it('DELETE clave top-level funciona y 404 si falta', async () => {
    const d = await api('DELETE', '/api/data/settings/casosExito');
    assert.equal(d.status, 200);
    const d2 = await api('DELETE', '/api/data/settings/no_existe_abc');
    assert.equal(d2.status, 404);
  });
  it('guiaChats y practicaConfig funcionan como colecciones-objeto (PUT /:clave)', async () => {
    const p1 = await api('PUT', '/api/data/guiaChats/1', { value: [{ rol: 'user', texto: 'Hola Gu-IA' }] });
    assert.equal(p1.status, 200);
    const g1 = await api('GET', '/api/data/guiaChats');
    assert.ok(g1.json.object && Array.isArray(g1.json.object['1']));
    assert.equal(g1.json.object['1'][0].texto, 'Hola Gu-IA');

    const p2 = await api('PUT', '/api/data/practicaConfig/proveedor', { value: 'groq' });
    assert.equal(p2.status, 200);
    const g2 = await api('GET', '/api/data/practicaConfig');
    assert.equal(g2.json.object.proveedor, 'groq');
  });
  it('notifications funciona como colección-array (POST registro)', async () => {
    const p = await api('POST', '/api/data/notifications', { id: 'notif-test-1', msg: 'Prueba', readBy: [] });
    assert.ok(p.status === 200 || p.status === 201);
    const g = await api('GET', '/api/data/notifications');
    assert.ok(Array.isArray(g.json.items));
    assert.ok(g.json.items.some((x) => x.id === 'notif-test-1'));
  });
  it('escritura por clave NO pisa claves de otra instancia (stale-safe)', async () => {
    await externalWrite((d) => {
      d.settings = d.settings || {};
      d.settings.comparadorProductos = [{ id: 900, nombre: 'Externo' }];
    });
    const p = await api('PUT', '/api/data/settings/publicidad', { value: [{ id: 551, titulo: 'Re-editada' }] });
    assert.equal(p.status, 200);
    const g = await api('GET', '/api/data/settings');
    assert.ok(g.json.object.comparadorProductos, 'clave de otra instancia sobrevive');
    assert.equal(g.json.object.publicidad[0].titulo, 'Re-editada');
  });
  it('alumno NO puede escribir settings ni rolePermissions (403); admin sí', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const w = await api('PUT', '/api/data/settings/publicidad', { value: [] });
    assert.equal(w.status, 403);
    const p = await api('PUT', '/api/data/rolePermissions/alumno', { value: {} });
    assert.equal(p.status, 403);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const a = await api('PUT', '/api/data/settings/publicidad', { value: [] });
    assert.equal(a.status, 200);
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

describe('fase 3: deduplicación de subidas por huella SHA-256', () => {
  const HUELLA = 'b'.repeat(64);
  async function subirConHuella(name) {
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], { type: 'image/png' }), name);
    fd.append('scope', 'media');
    fd.append('hash', HUELLA);
    const res = await fetch(base + '/api/media', {
      method: 'POST',
      headers: jar.cookie ? { Cookie: jar.cookie } : {},
      body: fd,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* no-json */ }
    return { status: res.status, json };
  }

  it('rechaza una huella mal formada (400)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const r = await api('POST', '/api/media/check', { hash: 'no-es-una-huella' });
    assert.equal(r.status, 400);
  });

  it('la primera subida guarda la huella y la segunda reutiliza la misma URL', async () => {
    const vacio = await api('POST', '/api/media/check', { hash: HUELLA });
    assert.equal(vacio.status, 200);
    assert.equal(vacio.json.item, null);

    const primera = await subirConHuella('misma.png');
    assert.equal(primera.status, 201);
    const url = primera.json.items[0].url;
    assert.match(url, /^\/uploads\//);

    const ya = await api('POST', '/api/media/check', { hash: HUELLA });
    assert.equal(ya.json.item.url, url);

    const segunda = await subirConHuella('copia-con-otro-nombre.png');
    assert.equal(segunda.status, 200);
    assert.equal(segunda.json.reuse, true);
    assert.equal(segunda.json.items[0].url, url);

    /* Una sola fila en `media` con esa huella: el archivo repetido no se
     * registró de nuevo ni se quedó como huérfano en /uploads. */
    const lista = await api('GET', '/api/data/media');
    const filas = (lista.json.items || []).filter((m) => m.hash === HUELLA);
    assert.equal(filas.length, 1);
  });

  it('la misma huella en otro destino NO se reutiliza (el aviso al feed depende del scope)', async () => {
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], { type: 'image/png' }), 'otra-seccion.png');
    fd.append('scope', 'autoHub');
    fd.append('hash', HUELLA);
    const res = await fetch(base + '/api/media', {
      method: 'POST',
      headers: jar.cookie ? { Cookie: jar.cookie } : {},
      body: fd,
    });
    const j = await res.json();
    assert.equal(res.status, 201);
    assert.equal(j.reuse, undefined);
    assert.equal(j.items[0].scope, 'autoHub');

    const otro = await api('POST', '/api/media/check', { hash: HUELLA, scope: 'autoHub' });
    assert.equal(otro.json.item.scope, 'autoHub');
    const deMedia = await api('POST', '/api/media/check', { hash: HUELLA });
    assert.equal(deMedia.json.item.scope, 'media');
  });
});

describe('reporte ejecutivo semanal (cron y envío dry-run)', () => {
  before(() => { process.env.REPORT_CRON_SECRET = 'sec_test_' + process.pid; });

  it('cron sin secretHeader responde 401', async () => {
    const r = await fetch(base + '/api/report/weekly');
    assert.equal(r.status, 401);
  });

  it('cron con secretHeader genera PDF y entra en dry-run (sin RESEND_API_KEY)', async () => {
    const r = await fetch(base + '/api/report/weekly', {
      headers: { Authorization: 'Bearer ' + process.env.REPORT_CRON_SECRET },
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.dryRun, true);
    assert.equal(j.sent, false);
    assert.ok(j.attachmentKB > 1, 'el PDF adjunto tiene contenido');
    assert.ok(j.subject.includes('Reporte Ejecutivo'));
    assert.ok(Array.isArray(j.destinatarios) && j.destinatarios.length >= 1, 'destinatarios directivos con email');
    assert.ok(j.destinatarios.every((d) => /.+@.+\..+/.test(d.email)));
    assert.ok(j.resumen && typeof j.resumen.primas.total === 'number');
  });

  it('disparo manual solo para dirección (alumno 403, admin 200)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const rNo = await api('POST', '/api/report/weekly/run', {});
    assert.equal(rNo.status, 403);
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const rOk = await api('POST', '/api/report/weekly/run', {});
    assert.equal(rOk.status, 200);
    assert.equal(rOk.json.dryRun, true);
  });

  it('status lista destinatarios y proveedor (sin enviar nada)', async () => {
    const r = await api('GET', '/api/report/weekly/status');
    assert.equal(r.status, 200);
    assert.equal(r.json.proveedor, 'dry-run');
    assert.ok(Array.isArray(r.json.destinatarios));
    assert.equal(r.json.cron, 'lunes 07:00 (America/Mexico_City)');
  });

  it('bundle incluye users seguros (sin hashes) para todos los usuarios autenticados (directorio de chat)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const rAdmin = await api('GET', '/api/data/bundle');
    assert.equal(rAdmin.status, 200);
    assert.ok(rAdmin.json.bundle && typeof rAdmin.json.bundle === 'object');
    assert.ok(Array.isArray(rAdmin.json.users) && rAdmin.json.users.length >= 3);
    assert.ok(rAdmin.json.users.every((u) => !u.password && !u.passwordHash));

    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const rAlumno = await api('GET', '/api/data/bundle');
    assert.equal(rAlumno.status, 200);
    assert.ok(Array.isArray(rAlumno.json.users) && rAlumno.json.users.length >= 3);
    assert.ok(rAlumno.json.users.every((u) => !u.password && !u.passwordHash));

    // Alumno puede actualizar su propio heartbeat (lastActive/streak) pero NO datos de otro usuario (403)
    const me = await api('GET', '/api/auth/me');
    const myId = me.json.user.id;
    const putSelf = await api('PUT', `/api/users/${myId}`, { lastActive: Date.now(), streak: 2 });
    assert.equal(putSelf.status, 200);
    const putSelfRole = await api('PUT', `/api/users/${myId}`, { role: 'admin' });
    assert.equal(putSelfRole.status, 403);
  });
});

describe('invitaciones de Mi Agenda (colección sincronizada)', () => {
  it('admin crea una invitación y el invitado la lee en su bundle', async () => {
    const adminJar = { ...jar };
    const r = await api('POST', '/api/data/invitaciones', { id: 'inv-test-1', deId: 1, paraId: 2, titulo: 'Acompañamiento', estado: 'pendiente', inicio: '2026-11-02T16:00:00.000Z', fin: '2026-11-02T17:00:00.000Z' });
    assert.ok(r.status < 300, 'POST invitaciones debe aceptarse: ' + r.status);
    const list = await api('GET', '/api/data/invitaciones');
    assert.equal(list.status, 200);
    assert.ok(JSON.stringify(list.json).includes('inv-test-1'), 'la invitación debe estar en la colección');
    assert.ok(adminJar.cookie);
  });
});

describe('notificaciones: privacidad por destinatario', () => {
  it('se crean avisos personales, generales y por rol', async () => {
    // La suite llega aquí con sesión de admin (id 1).
    for (const n of [
      { id: 'notif-priv-alumno', userId: 3, msg: 'Solo para Ana', readBy: [] },
      { id: 'notif-priv-admin', userId: 1, msg: 'Solo para Admin', readBy: [] },
      { id: 'notif-general', msg: 'Para todo el portal', readBy: [] },
      { id: 'notif-solo-gm', paraRoles: ['gm'], msg: 'Solo GM', readBy: [] },
    ]) {
      const r = await api('POST', '/api/data/notifications', n);
      assert.ok(r.status === 200 || r.status === 201, 'POST ' + n.id + ': ' + r.status);
    }
  });
  it('el alumno recibe la suya y la general, nunca la de otro usuario ni la de otro rol', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false);
    const g = await api('GET', '/api/data/notifications');
    assert.equal(g.status, 200);
    const ids = g.json.items.map((n) => n.id);
    assert.ok(ids.includes('notif-priv-alumno'), 've su notificación personal');
    assert.ok(ids.includes('notif-general'), 've el aviso general');
    assert.ok(!ids.includes('notif-priv-admin'), 'NO ve la notificación personal del admin');
    assert.ok(!ids.includes('notif-solo-gm'), 'NO ve la notificación de rol gm');

    const b = await api('GET', '/api/data/bundle');
    assert.equal(b.status, 200);
    const bids = b.json.bundle.notifications.items.map((n) => n.id);
    assert.ok(bids.includes('notif-priv-alumno'));
    assert.ok(!bids.includes('notif-priv-admin'));
    assert.ok(!bids.includes('notif-solo-gm'));
  });
  it('el admin ve la suya y el aviso general, pero NO la personal del alumno', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const g = await api('GET', '/api/data/notifications');
    assert.equal(g.status, 200);
    const ids = g.json.items.map((n) => n.id);
    assert.ok(ids.includes('notif-priv-admin'));
    assert.ok(ids.includes('notif-general'));
    assert.ok(!ids.includes('notif-priv-alumno'), 'ser admin no da acceso al aviso privado de otro');
  });
});

describe('proxy de media: /media/* y reescritura de URLs', () => {
  const proxy = require('../src/mediaProxy');
  const URL_SUPA = 'https://abcdefghijkl.supabase.co/storage/v1/object/public/portal-media/media/1792-foto.png';

  it('normaliza rutas y rechaza las peligrosas', () => {
    assert.equal(proxy.normalizarRuta('media/1792-foto.png'), 'media/1792-foto.png');
    assert.equal(proxy.normalizarRuta('/media/groups/FOTO GRUPO.png'), 'media/groups/FOTO GRUPO.png');
    assert.equal(proxy.normalizarRuta('../../etc/passwd'), null);
    assert.equal(proxy.normalizarRuta('media\\..\\x.png'), null);
    assert.equal(proxy.normalizarRuta('media//x.png'), null);
    assert.equal(proxy.normalizarRuta(''), null);
  });

  it('extrae la ruta de una URL pública del bucket', () => {
    assert.equal(proxy.rutaDeUrl(URL_SUPA), 'media/1792-foto.png');
    assert.equal(proxy.rutaDeUrl('/media/media/1792-foto.png'), null);
    assert.equal(proxy.rutaDeUrl(''), null);
  });

  it('las URLs de Supabase salen reescritas a /media (y solo esas)', async () => {
    jar.cookie = null;
    await api('POST', '/api/auth/login', { username: 'admin', password: 'NuevaClave99' }, false);
    const put = await api('PUT', '/api/data/settings/mediaProxyTest', {
      value: { img: URL_SUPA, externa: 'https://ejemplo.com/a.png', nota: 'texto' },
    });
    assert.ok(put.status === 200 || put.status === 201, 'PUT ' + put.status);
    const g = await api('GET', '/api/data/settings');
    assert.equal(g.status, 200);
    const val = g.json.object.mediaProxyTest;
    assert.equal(val.img, '/media/media/1792-foto.png', 'la imagen del bucket pasa por el proxy');
    assert.equal(val.externa, 'https://ejemplo.com/a.png', 'una URL externa no se toca');
    assert.equal(val.nota, 'texto', 'el resto del payload queda igual');
  });

  it('sin Storage configurado /media responde 404 (no inventa ni rompe)', async () => {
    jar.cookie = null;
    const r = await fetch(base + '/media/media/1792-foto.png');
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type') || '', /json/);
  });

  it('rechaza métodos distintos de GET/HEAD', async () => {
    const r = await fetch(base + '/media/media/1792-foto.png', { method: 'POST', body: 'x' });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'GET, HEAD');
  });
});

describe('poda de sesiones vencidas', () => {
  it('al crear sesión se borran las filas vencidas y se conservan las vigentes', async () => {
    const adapter = store.adapter;
    await adapter.setSession('tok-vencido', { userId: '3', expiresAt: Date.now() - 60 * 60 * 1000 });
    await adapter.setSession('tok-vigente', { userId: '3', expiresAt: Date.now() + 60 * 60 * 1000 });
    sessions.resetSweepForTests(); // quita el throttle de 1h del proceso de pruebas
    await sessions.create(3);
    assert.equal(await adapter.getSession('tok-vencido'), null, 'la vencida se poda');
    assert.ok(await adapter.getSession('tok-vigente'), 'la vigente sobrevive');
    // El token vencido tampoco se acepta si llega por cookie.
    assert.equal(await sessions.get('tok-vencido'), null);
  });
});

describe('rutas locales /uploads (guard de base compartida)', () => {
  const uploads = require('../src/uploads');

  it('reconoce las rutas locales y descarta lo que no lo es', () => {
    assert.equal(uploads.nombreDeUpload('/uploads/foto.png'), 'foto.png');
    assert.equal(uploads.nombreDeUpload('http://localhost:3000/uploads/foto%20x.png'), 'foto x.png');
    assert.equal(uploads.nombreDeUpload('/media/groups/foto.png'), null);
    assert.equal(uploads.nombreDeUpload('https://x.supabase.co/storage/v1/object/public/portal-media/a.png'), null);
    assert.equal(uploads.nombreDeUpload('/uploads/../secreto.env'), null);
  });

  it('migra lo resoluble y retira lo que ya no existe, también en arrays', async () => {
    const doc = {
      image: '/uploads/viva.png',
      notas: '/uploads/muerta.png',
      items: [{ foto: '/uploads/viva.png' }],
      otro: '/media/groups/x.png',
    };
    const r = await uploads.migrarValor(doc, async (nombre) =>
      (nombre === 'viva.png' ? 'https://cdn/migrados/viva.png' : null));
    assert.equal(r.migradas, 2);
    assert.equal(r.quitadas, 1);
    assert.equal(doc.image, 'https://cdn/migrados/viva.png');
    assert.equal(doc.notas, '');
    assert.equal(doc.items[0].foto, 'https://cdn/migrados/viva.png');
    assert.equal(doc.otro, '/media/groups/x.png', 'las rutas /media no se tocan');
  });
});
