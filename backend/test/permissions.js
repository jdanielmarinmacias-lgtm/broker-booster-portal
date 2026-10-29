'use strict';
/* Pruebas de permisos del servidor (Fase 0).
 *
 * No sustituyen a smoke.js: aquí se concentran los bordes que más riesgo
 * tienen de volver a abrirse:
 *   · estado interno (users/sessions/loginAttempts/iaUso) fuera de la API;
 *   · configuración sensible (guiaBase, practicaConfig, settings, rolePermissions);
 *   · privacidad de guiaChats y notifications;
 *   · matriz de escritura de Academia y contenido institucional.
 *
 * Sin red: adaptador en memoria.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.SEED_PASSWORD = 'Test1234*';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.LOGIN_RATE_MAX = '100';
process.env.DATA_DIR = require('os').tmpdir() + '/bb-perm-' + process.pid;

const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');
const roles = require('../src/roles');

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

async function como(username, password = 'Test1234*') {
  jar.cookie = null;
  const r = await api('POST', '/api/auth/login', { username, password }, false);
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
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('estado interno fuera de la API', () => {
  it('users/sessions/loginAttempts/iaUso responden 404 y no viajan en el bundle', async () => {
    await como('admin');
    for (const col of ['users', 'sessions', 'loginAttempts', 'iaUso']) {
      const g = await api('GET', '/api/data/' + col);
      assert.equal(g.status, 404, 'GET ' + col);
      const p = await api('POST', '/api/data/' + col, { x: 1 });
      assert.equal(p.status, 404, 'POST ' + col);
    }
    const bundle = await api('GET', '/api/data/bundle');
    assert.equal(bundle.status, 200);
    for (const col of ['users', 'sessions', 'loginAttempts', 'iaUso', 'guiaBase', 'practicaConfig']) {
      assert.ok(!(col in bundle.json.bundle), col + ' no debe viajar en el bundle');
    }
  });

  it('auditoría solo la lee el staff autorizado', async () => {
    await como('alumno');
    assert.equal((await api('GET', '/api/data/auditoria')).status, 403);
    await como('admin');
    assert.equal((await api('GET', '/api/data/auditoria')).status, 200);
  });
});

describe('base de conocimiento y configuración de Práctica', () => {
  it('no viajan en el bundle y solo dirección puede leerlas', async () => {
    await como('alumno');
    assert.equal((await api('GET', '/api/data/guiaBase')).status, 403);
    assert.equal((await api('GET', '/api/data/practicaConfig')).status, 403);

    await como('admin');
    const bundle = await api('GET', '/api/data/bundle');
    assert.ok(!('guiaBase' in bundle.json.bundle), 'guiaBase fuera del bundle');
    assert.ok(!('practicaConfig' in bundle.json.bundle), 'practicaConfig fuera del bundle');
    assert.equal((await api('GET', '/api/data/guiaBase')).status, 200);
    assert.equal((await api('GET', '/api/data/practicaConfig')).status, 200);
  });

  it('AI Lobby carga guiaBase por su endpoint dedicado', async () => {
    await como('admin');
    const p = await api('PUT', '/api/data/guiaBase/docs', {
      value: [{ id: 'g1', titulo: 'AXA', texto: 'La comisión AXA es 20% sobre la prima total.', activo: true }],
    });
    assert.equal(p.status, 200);
    const g = await api('GET', '/api/data/guiaBase');
    assert.equal(g.status, 200);
    assert.equal(g.json.object.docs[0].titulo, 'AXA');
  });

  it('practicaConfig nunca persiste ni devuelve apiKey', async () => {
    await como('admin');
    const post = await api('POST', '/api/data/practicaConfig', {
      proveedor: 'groq',
      apiKey: 'gsk_test_never_persist_000000000000',
    });
    assert.equal(post.status, 200);

    const g = await api('GET', '/api/data/practicaConfig');
    assert.equal(g.json.object.proveedor, 'groq');
    assert.ok(!('apiKey' in g.json.object), 'la lectura no debe devolver apiKey');

    assert.equal((await api('PUT', '/api/data/practicaConfig/apiKey', { value: 'gsk_x' })).status, 400);
    assert.equal((await api('PUT', '/api/data/practicaConfig/proveedor', { value: 'groq' })).status, 200);
  });
});

describe('configuración sensible', () => {
  it('un alumno no escribe guiaBase, practicaConfig, carruselCirculares ni settings', async () => {
    await como('alumno');
    const casos = [
      ['guiaBase', 'docs', { value: [] }],
      ['practicaConfig', 'proveedor', { value: 'groq' }],
      ['carruselCirculares', 'slides', { value: [] }],
      ['rolePermissions', 'alumno', { value: { ver: true } }],
      ['settings', 'publicidad', { value: [] }],
    ];
    for (const [col, id, body] of casos) {
      const r = await api('PUT', '/api/data/' + col + '/' + id, body);
      assert.equal(r.status, 403, 'alumno no debe escribir ' + col + '/' + id);
    }
  });

  it('el staff sí escribe la configuración de contenido', async () => {
    await como('admin');
    assert.equal((await api('PUT', '/api/data/guiaBase/docs', { value: [] })).status, 200);
    assert.equal((await api('PUT', '/api/data/practicaConfig/proveedor', { value: 'groq' })).status, 200);
    assert.equal((await api('PUT', '/api/data/carruselCirculares/slides', { value: [] })).status, 200);
    assert.equal((await api('PUT', '/api/data/settings/publicidad', { value: [] })).status, 200);
  });
});

describe('privacidad de datos por usuario', () => {
  it('guiaChats: el alumno solo lee y escribe su propia clave', async () => {
    await como('admin');
    assert.equal((await api('PUT', '/api/data/guiaChats/2', {
      value: [{ rol: 'user', texto: 'historial del maestro' }],
    })).status, 200);

    await como('alumno');
    assert.equal((await api('PUT', '/api/data/guiaChats/3', {
      value: [{ rol: 'user', texto: 'historial del alumno' }],
    })).status, 200);
    assert.equal((await api('PUT', '/api/data/guiaChats/2', { value: [] })).status, 403);

    const g = await api('GET', '/api/data/guiaChats');
    assert.equal(g.status, 200);
    assert.deepEqual(Object.keys(g.json.object), ['3'], 'solo la clave del alumno');

    await como('admin');
    assert.equal((await api('DELETE', '/api/data/guiaChats/2')).status, 200);
    assert.equal((await api('DELETE', '/api/data/guiaChats/3')).status, 200);
  });

  it('notifications: el aviso personal no lo ve otro alumno', async () => {
    await como('admin');
    const users = (await api('GET', '/api/users')).json.users;
    const maestro = users.find((u) => u.role === 'maestro');
    const alumno = users.find((u) => u.role === 'alumno');
    assert.ok(maestro && alumno, 'faltan usuarios semilla');

    const idPrivado = 'perm-privado-' + Date.now();
    const idGeneral = 'perm-general-' + Date.now();
    assert.ok([200, 201].includes((await api('POST', '/api/data/notifications', {
      id: idPrivado, userId: maestro.id, msg: 'solo para el maestro',
    })).status));
    assert.ok([200, 201].includes((await api('POST', '/api/data/notifications', {
      id: idGeneral, msg: 'aviso general', readBy: [],
    })).status));

    await como('maestro');
    const paraMaestro = await api('GET', '/api/data/notifications');
    assert.ok(paraMaestro.json.items.some((n) => n.id === idPrivado), 'el destinatario sí lo ve');

    await como('alumno');
    const paraAlumno = await api('GET', '/api/data/notifications');
    assert.ok(!paraAlumno.json.items.some((n) => n.id === idPrivado), 'el ajeno no se filtra');
    assert.ok(paraAlumno.json.items.some((n) => n.id === idGeneral), 'el aviso general sí llega');

    await como('admin');
    assert.equal((await api('DELETE', '/api/data/notifications/' + idPrivado)).status, 200);
    assert.equal((await api('DELETE', '/api/data/notifications/' + idGeneral)).status, 200);
  });
});

describe('matriz de escritura del servidor', () => {
  const rolesSinEscritura = ['alumno', 'agente_agencia', 'agente_desarrollo', 'prospecto'];
  const coleccionesProtegidas = [
    'groups', 'enrollments', 'generations', 'planes', 'categories',
    'tasks', 'lessons', 'exams', 'glossaryConcepts', 'chatGroups',
    'guiaBase', 'practicaConfig', 'settings', 'rolePermissions', 'carruselCirculares',
  ];

  it('los roles de alumno/agente no escriben colecciones de docencia ni configuración', () => {
    for (const role of rolesSinEscritura) {
      for (const col of coleccionesProtegidas) {
        assert.equal(roles.canWrite({ role }, col), false, role + ' no debe escribir ' + col);
      }
    }
  });

  it('GM y admin conservan la escritura de esas colecciones', () => {
    for (const role of ['gm', 'admin', 'desarrollador']) {
      for (const col of coleccionesProtegidas) {
        assert.equal(roles.canWrite({ role }, col), true, role + ' debe escribir ' + col);
      }
    }
  });

  it('la auditoría no es legible por alumnos ni escribible por nadie desde la API', () => {
    assert.equal(roles.canRead({ role: 'alumno' }, 'auditoria'), false);
    assert.equal(roles.canRead({ role: 'admin' }, 'auditoria'), true);
    assert.equal(roles.canWrite({ role: 'gm' }, 'auditoria'), false);
  });
});
