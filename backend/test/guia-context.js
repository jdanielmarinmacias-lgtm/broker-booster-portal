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
process.env.IA_DIARIO = '30';
process.env.IA_MINUTO = '30';

const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');
const sessions = require('../src/sessions');
const { seed } = require('../src/seed');
const iaRoute = require('../src/routes/ia');
const { appsVisibles } = require('../src/guiaSecciones');

let base, server, store;
const jar = {};
const jarAlumno = {};
const jarProspecto = {};
const jarAgenteDesarrollo = {};
const jarAgenteAgencia = {};
let idAgenteDesarrollo;
let idAgenteAgencia;
let ultimoCuerpo = null;

async function api(method, p, body, useAuth = true, authJar = jar) {
  const headers = { 'Content-Type': 'application/json' };
  if (useAuth && authJar.cookie) headers.Cookie = authJar.cookie;
  const res = await fetch(base + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) authJar.cookie = setCookie.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch (e) { /* no-json */ }
  return { status: res.status, json };
}

/* Pregunta real de usuario: siempre limpia el cuerpo anterior para poder
 * comprobar si el listado se resolvió sin proveedor. */
async function preguntar(texto, authJar = jar) {
  ultimoCuerpo = null;
  return api('POST', '/api/ia/chat', {
    messages: [
      { role: 'system', content: 'Eres Gu-IA.' },
      { role: 'user', content: texto },
    ],
  }, true, authJar);
}

async function preguntarSeguimiento(previos, texto, authJar = jar) {
  ultimoCuerpo = null;
  return api('POST', '/api/ia/chat', {
    messages: [
      { role: 'system', content: 'Eres Gu-IA.' },
      ...previos,
      { role: 'user', content: texto },
    ],
  }, true, authJar);
}

function systemDelUltimo() {
  const messages = (ultimoCuerpo && ultimoCuerpo.messages) || [];
  return String((messages.find((m) => m && m.role === 'system') || {}).content || '');
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
  const loginAlumno = await api('POST', '/api/auth/login', { username: 'alumno', password: 'Test1234*' }, false, jarAlumno);
  assert.equal(loginAlumno.status, 200);
  /* El seed no trae prospecto: se crea con la API real usando la sesión admin
   * y después se inicia una sesión propia para probar el flujo completo. */
  const altaProspecto = await api('POST', '/api/users', {
    username: 'prospecto_guia',
    password: 'Test1234*',
    role: 'prospecto',
    name: 'Prospecto Gu-IA',
  });
  assert.equal(altaProspecto.status, 201);
  const loginProspecto = await api('POST', '/api/auth/login', { username: 'prospecto_guia', password: 'Test1234*' }, false, jarProspecto);
  assert.equal(loginProspecto.status, 200);
  /* Los agentes también son alumnos para los exámenes, pero pertenecen al
   * equipo interno y sí pueden leer el catálogo de apps. Se crean y se
   * autentican igual que un usuario real para probar ambos límites. */
  const altaAgenteDesarrollo = await api('POST', '/api/users', {
    username: 'agente_desarrollo_guia',
    password: 'Test1234*',
    role: 'agente_desarrollo',
    name: 'Agente Desarrollo Gu-IA',
  });
  assert.equal(altaAgenteDesarrollo.status, 201);
  idAgenteDesarrollo = altaAgenteDesarrollo.json.user.id;
  const loginAgenteDesarrollo = await api('POST', '/api/auth/login', { username: 'agente_desarrollo_guia', password: 'Test1234*' }, false, jarAgenteDesarrollo);
  assert.equal(loginAgenteDesarrollo.status, 200);
  const altaAgenteAgencia = await api('POST', '/api/users', {
    username: 'agente_agencia_guia',
    password: 'Test1234*',
    role: 'agente_agencia',
    name: 'Agente Agencia Gu-IA',
  });
  assert.equal(altaAgenteAgencia.status, 201);
  idAgenteAgencia = altaAgenteAgencia.json.user.id;
  const loginAgenteAgencia = await api('POST', '/api/auth/login', { username: 'agente_agencia_guia', password: 'Test1234*' }, false, jarAgenteAgencia);
  assert.equal(loginAgenteAgencia.status, 200);
  store.get().guiaBase = {
    docs: [
      { id: 'g1', titulo: 'AXA', texto: 'La comisión de AXA es 20% sobre la prima total.', activo: true },
      { id: 'g2', titulo: 'GNP', texto: 'La comisión de GNP es 15% sobre la prima total.', activo: true },
    ],
  };
  /* Catálogo real de Formación: la prueba comprueba que Gu-IA lo usa y que
   * los listados no dependen de lo que "recuerde" el modelo. */
  store.get().planes = [
    { id: 501, nombre: 'Capacitación Comercial de Ventas', tipo: 'Capacitación Comercial', duracion: '40 horas', descripcion: 'Prospección, presentación y cierre.' },
    { id: 502, nombre: 'Curso de Producto y Pólizas', tipo: 'curso', duracion: '20 horas', descripcion: 'Coberturas y manejo de pólizas.' },
    { id: 503, nombre: 'Taller de Objeciones', tipo: 'taller', duracion: '8 horas', descripcion: 'Práctica de respuestas a objeciones.' },
  ];
  store.get().generations = [
    { id: 9001, planId: 501, name: 'Generación Ventas 2026', startDate: '2026-01-15', endDate: '2026-03-15', status: 'activa' },
    { id: 9002, planId: 502, name: 'Generación Producto 2026', startDate: '2026-02-01', endDate: '2026-02-28', status: 'planeada' },
  ];
  store.get().groups = [{ id: 20, name: 'Grupo Ventas A' }];
  store.get().enrollments = [{ id: 'e1', userId: 3, groupId: 20 }];
  store.get().liveClasses = [
    { id: 1001, title: 'Clase de Ventas', start: '2026-12-01T18:00:00.000Z', end: '2026-12-01T19:00:00.000Z', instructorId: 2, createdBy: 1, assignedTo: [3] },
    { id: 1002, title: 'Clase del Grupo A', start: '2026-12-02T18:00:00.000Z', end: '2026-12-02T19:00:00.000Z', instructorId: 2, createdBy: 1, assignedTo: [], assignedToGroup: 20 },
    { id: 1003, title: 'Clase privada de otro alumno', start: '2026-12-03T18:00:00.000Z', end: '2026-12-03T19:00:00.000Z', instructorId: 2, createdBy: 1, assignedTo: [99] },
    { id: 1004, title: 'Clase ya pasada', start: '2020-01-01T18:00:00.000Z', end: '2020-01-01T19:00:00.000Z', instructorId: 2, createdBy: 1, assignedTo: [3] },
  ];
  store.get().guiaAgenda = { 3: [{ id: 'a1', titulo: 'Llamada personal de prueba', inicio: '2026-12-04T18:00:00.000Z', durMin: 30 }] };
  store.get().externalApps = [
    { id: 'app1', name: 'CRM de Ventas', description: 'Seguimiento de prospectos.', url: 'https://crm.example.com', tag: 'Ventas' },
  ];
  store.get().categories = [{ id: 1, name: 'General' }];
  store.get().exams = [
    { id: 2001, title: 'Examen de Ventas', categoryId: 1, duration: 30, passPercent: 60, exemptPercent: 80, assignedTo: [3], questions: [{ question: '¿Qué es una póliza?', options: ['Contrato', 'Auto', 'Casa', 'Nada'], correct: 0, type: 'multiple' }] },
    { id: 2002, title: 'Examen interno', categoryId: 1, duration: 20, passPercent: 60, exemptPercent: 80, assignedTo: [99], questions: [{ question: 'Pregunta secreta', options: ['A', 'B', 'C', 'D'], correct: 1, type: 'multiple' }] },
  ];
  store.get().examAttempts = [{ id: 'att1', examId: 2001, userId: 3, score: 80, result: 'APROBADO', date: '2026-11-01T18:00:00.000Z' }];
  /* Un examen distinto para cada agente: cada sesión debe ver solo el suyo. */
  store.get().exams.push(
  { id: 2101, title: 'Examen de Desarrollo', categoryId: 1, duration: 25, passPercent: 60, exemptPercent: 80, assignedTo: [idAgenteDesarrollo], questions: [{ question: '¿Pregunta secreta de desarrollo?', options: ['Respuesta desarrollo', 'Otra', 'Otra más', 'Ninguna'], correct: 0, type: 'multiple' }] },
  { id: 2102, title: 'Examen de Agencia', categoryId: 1, duration: 25, passPercent: 60, exemptPercent: 80, assignedTo: [idAgenteAgencia], questions: [{ question: '¿Pregunta secreta de agencia?', options: ['Respuesta agencia', 'Otra', 'Otra más', 'Ninguna'], correct: 0, type: 'multiple' }] }
  );
  store.get().examAttempts.push(
  { id: 'att-dev', examId: 2101, userId: idAgenteDesarrollo, score: 90, result: 'APROBADO', date: '2026-11-02T18:00:00.000Z' },
  { id: 'att-ag', examId: 2102, userId: idAgenteAgencia, score: 75, result: 'APROBADO', date: '2026-11-02T18:00:00.000Z' }
  );
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
    assert.ok(!String(system.content).includes('FORMACIÓN ACADÉMICA'),
      'una consulta de comisiones no debe arrastrar el catálogo de Formación');
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

  it('responde el catálogo real de Formación sin llamar al modelo', async () => {
    ultimoCuerpo = null;
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: '¿Cuáles son las capacitaciones de Formación Académica?' },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true, 'el listado debe resolverse sin proveedor');
    assert.equal(ultimoCuerpo, null, 'no se debe llamar al modelo para un listado exacto');
    const content = r.json.choices[0].message.content;
    assert.match(content, /Capacitación Comercial de Ventas/);
    assert.match(content, /Curso de Producto y Pólizas/);
    assert.match(content, /Taller de Objeciones/);
    assert.ok(!/Capacitación Inventada/.test(content), 'no debe aparecer un nombre ajeno al catálogo');
  });

  it('resuelve «y sus nombres» con el historial reciente', async () => {
    ultimoCuerpo = null;
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: '¿Qué capacitaciones hay en Formación Académica?' },
        { role: 'assistant', content: 'Hay varias.' },
        { role: 'user', content: 'y sus nombres' },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true, 'el seguimiento debe seguir siendo determinista');
    assert.equal(ultimoCuerpo, null);
    assert.match(r.json.choices[0].message.content, /Curso de Producto y Pólizas/);
  });

  it('inyecta el catálogo real cuando la pregunta pide análisis', async () => {
    ultimoCuerpo = null;
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: 'Analiza cómo mejorar la capacitación comercial de ventas' },
      ],
    });
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'una pregunta de análisis sí debe llegar al modelo');
    const system = ultimoCuerpo.messages.find((m) => m.role === 'system') || {};
    assert.match(String(system.content), /FORMACIÓN ACADÉMICA — DATOS REALES DEL PORTAL/);
    assert.match(String(system.content), /Capacitación Comercial de Ventas/);
    assert.match(String(system.content), /No agregues nombres/);
  });

  it('no inventa nombres cuando Formación está vacía', async () => {
    const planes = store.get().planes;
    store.get().planes = [];
    ultimoCuerpo = null;
    try {
      const r = await api('POST', '/api/ia/chat', {
        messages: [
          { role: 'system', content: 'Eres Gu-IA.' },
          { role: 'user', content: '¿Qué capacitaciones hay?' },
        ],
      });
      assert.equal(r.status, 200);
      assert.equal(ultimoCuerpo, null);
      assert.match(r.json.choices[0].message.content, /no hay capacitaciones ni planes cargados/i);
    } finally {
      store.get().planes = planes;
    }
  });

  it('lista sesiones pendientes según el rol, sin llamar al modelo', async () => {
    ultimoCuerpo = null;
    const mensaje = {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: '¿Qué sesiones pendientes tengo?' },
      ],
    };
    const admin = await api('POST', '/api/ia/chat', mensaje);
    assert.equal(admin.status, 200);
    assert.equal(admin.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    assert.match(admin.json.choices[0].message.content, /Clase de Ventas/);
    assert.match(admin.json.choices[0].message.content, /Clase privada de otro alumno/);

    core: {
      const alumno = await api('POST', '/api/ia/chat', mensaje, true, jarAlumno);
      assert.equal(alumno.status, 200);
      assert.equal(alumno.json.guia.directo, true);
      assert.equal(ultimoCuerpo, null);
      const content = alumno.json.choices[0].message.content;
      assert.match(content, /Clase de Ventas/);
      assert.match(content, /Clase del Grupo A/);
      assert.match(content, /Llamada personal de prueba/);
      assert.ok(!content.includes('Clase privada de otro alumno'), 'el alumno no debe ver clases ajenas');
      assert.ok(!content.includes('Clase ya pasada'), 'las sesiones terminadas no son pendientes');
    }
  });

  it('lista apps reales y respeta el permiso de lectura por rol', async () => {
    ultimoCuerpo = null;
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: '¿Qué apps hay?' },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const content = r.json.choices[0].message.content;
    assert.match(content, /Vértice/);
    assert.match(content, /CRM de Ventas/);
    assert.match(content, /https:\/\/crm\.example\.com/);
    assert.equal(appsVisibles(store.get(), { id: 77, role: 'prospecto' }), null,
      'prospecto no debe recibir el catálogo de apps');
  });

  it('limita los exámenes del alumno y nunca le muestra preguntas ni respuestas', async () => {
    ultimoCuerpo = null;
    const r = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: '¿Qué exámenes tengo?' },
      ],
    }, true, jarAlumno);
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const content = r.json.choices[0].message.content;
    assert.match(content, /Examen de Ventas/);
    assert.match(content, /APROBADO/);
    assert.ok(!content.includes('Examen interno'), 'el alumno no debe ver exámenes no asignados');
    assert.ok(!content.includes('¿Qué es una póliza?'), 'el alumno no debe recibir preguntas');
    assert.ok(!content.includes('Contrato'), 'el alumno no debe recibir respuestas correctas');
  });

  it('incluye preguntas de examen solo para staff; al alumno no', async () => {
    ultimoCuerpo = null;
    const admin = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: 'Analiza el Examen de Ventas' },
      ],
    });
    assert.equal(admin.status, 200);
    assert.ok(ultimoCuerpo, 'una pregunta de análisis debe llegar al modelo');
    const sysAdmin = String((ultimoCuerpo.messages.find((m) => m.role === 'system') || {}).content || '');
    assert.match(sysAdmin, /EXÁMENES — DATOS REALES DEL PORTAL/);
    assert.match(sysAdmin, /¿Qué es una póliza\?/);
    assert.match(sysAdmin, /Correcta: Contrato/);

    ultimoCuerpo = null;
    const alumno = await api('POST', '/api/ia/chat', {
      messages: [
        { role: 'system', content: 'Eres Gu-IA.' },
        { role: 'user', content: 'Analiza mi examen de Ventas' },
      ],
    }, true, jarAlumno);
    assert.equal(alumno.status, 200);
    assert.ok(ultimoCuerpo, 'la pregunta de análisis debe llegar al modelo');
    const sysAlumno = String((ultimoCuerpo.messages.find((m) => m.role === 'system') || {}).content || '');
    assert.match(sysAlumno, /Examen de Ventas/);
    assert.ok(!sysAlumno.includes('Examen interno'), 'el alumno no debe ver exámenes ajenos');
    assert.ok(!sysAlumno.includes('¿Qué es una póliza?'), 'el alumno no debe ver preguntas');
    assert.ok(!sysAlumno.includes('Correcta: Contrato'), 'el alumno no debe ver respuestas correctas');
  });
});

describe('Gu-IA: no-alucinación con preguntas reales', () => {
  it('Formación: solo devuelve capacitaciones y generaciones del catálogo', async () => {
    const capacitaciones = await preguntar('¿Qué capacitaciones hay en Formación Académica y cómo se llaman?');
    assert.equal(capacitaciones.status, 200);
    assert.equal(capacitaciones.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null, 'un listado real no debe depender del modelo');
    const planes = capacitaciones.json.choices[0].message.content;
    assert.match(planes, /Capacitación Comercial de Ventas/);
    assert.match(planes, /Curso de Producto y Pólizas/);
    assert.match(planes, /Taller de Objeciones/);
    assert.ok(!/Capacitación Inventada|Curso Fantasma|Taller Imaginario/.test(planes),
      'no deben aparecer capacitaciones ajenas al catálogo');

    const generaciones = await preguntar('¿Cuáles son las generaciones cargadas en Formación Académica?');
    assert.equal(generaciones.status, 200);
    assert.equal(generaciones.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const gens = generaciones.json.choices[0].message.content;
    assert.match(gens, /Generación Ventas 2026/);
    assert.match(gens, /Generación Producto 2026/);
    assert.ok(!/Generación Inventada|Generación Fantasma/.test(gens),
      'no deben aparecer generaciones ajenas al catálogo');
  });

  it('Sesiones: solo muestra las clases y la agenda visibles para el alumno', async () => {
    const r = await preguntar('¿Cuáles son mis próximas clases y sesiones pendientes?', jarAlumno);
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const content = r.json.choices[0].message.content;
    assert.match(content, /Clase de Ventas/);
    assert.match(content, /Clase del Grupo A/);
    assert.match(content, /Llamada personal de prueba/);
    assert.ok(!content.includes('Clase privada de otro alumno'), 'no debe ver una clase ajena');
    assert.ok(!content.includes('Clase ya pasada'), 'no debe ver una clase terminada');
    assert.ok(!/Clase Inventada|Sesión Fantasma/.test(content), 'no debe inventar sesiones');
  });

  it('Apps: devuelve nombres y enlaces reales, sin inventar herramientas', async () => {
    const r = await preguntar('¿Qué apps y enlaces hay en el portal?');
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const content = r.json.choices[0].message.content;
    assert.match(content, /Vértice/);
    assert.match(content, /https:\/\/sumitims\.base44\.app/);
    assert.match(content, /CRM de Ventas/);
    assert.match(content, /https:\/\/crm\.example\.com/);
    assert.ok(!/App Inventada|Herramienta Fantasma|app-falsa\.example/.test(content),
      'no debe inventar apps ni enlaces');
    assert.equal(appsVisibles(store.get(), { id: 77, role: 'prospecto' }), null,
      'un prospecto no debe recibir el catálogo de apps');
  });

  it('Exámenes: el alumno solo recibe los asignados y sus resultados, no preguntas', async () => {
    const r = await preguntar('¿Qué exámenes tengo asignados y cuáles son mis resultados?', jarAlumno);
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const content = r.json.choices[0].message.content;
    assert.match(content, /Examen de Ventas/);
    assert.match(content, /APROBADO/);
    assert.ok(!content.includes('Examen interno'), 'no debe ver un examen no asignado');
    assert.ok(!content.includes('¿Qué es una póliza?'), 'no debe recibir preguntas');
    assert.ok(!content.includes('Contrato'), 'no debe recibir respuestas correctas');
    assert.ok(!/Examen Inventado|Pregunta Fantasma/.test(content), 'no debe inventar exámenes');
  });

  it('Exámenes: staff ve preguntas reales; el alumno recibe una negativa sin datos', async () => {
    const pregunta = '¿Qué preguntas y respuestas tiene el Examen de Ventas?';
    const admin = await preguntar(pregunta);
    assert.equal(admin.status, 200);
    assert.equal(admin.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const contenidoAdmin = admin.json.choices[0].message.content;
    assert.match(contenidoAdmin, /¿Qué es una póliza\?/);
    assert.match(contenidoAdmin, /Correcta: Contrato/);
    assert.ok(!/Pregunta Inventada|Respuesta Fantasma/.test(contenidoAdmin),
      'staff solo debe recibir preguntas reales');

    const alumno = await preguntar(pregunta, jarAlumno);
    assert.equal(alumno.status, 200);
    assert.equal(alumno.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null);
    const contenidoAlumno = alumno.json.choices[0].message.content;
    assert.match(contenidoAlumno, /No puedo mostrarte/i);
    assert.ok(!contenidoAlumno.includes('¿Qué es una póliza?'));
    assert.ok(!contenidoAlumno.includes('Contrato'));
  });

  it('contexto de análisis: contiene los datos reales de las cuatro secciones y las reglas antiinvención', async () => {
    const r = await preguntar('Analiza el portal, Formación Académica, sesiones, apps y exámenes para detectar qué falta.');
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el análisis sí debe llegar al modelo con contexto');
    const system = String((ultimoCuerpo.messages.find((m) => m.role === 'system') || {}).content || '');
    assert.match(system, /FORMACIÓN ACADÉMICA — DATOS REALES DEL PORTAL/);
    assert.match(system, /Capacitación Comercial de Ventas/);
    assert.match(system, /Generación Ventas 2026/);
    assert.match(system, /SESIONES PENDIENTES — DATOS REALES DEL PORTAL/);
    assert.match(system, /Clase de Ventas/);
    assert.match(system, /APPS DEL EQUIPO — DATOS REALES DEL PORTAL/);
    assert.match(system, /CRM de Ventas/);
    assert.match(system, /EXÁMENES — DATOS REALES DEL PORTAL/);
    assert.match(system, /Examen de Ventas/);
    assert.match(system, /¿Qué es una póliza\?/);
    assert.match(system, /Correcta: Contrato/);
    assert.ok(!/Capacitación Inventada|Clase Inventada|App Inventada|Examen Inventado/.test(system),
      'el contexto no debe contener datos inventados');
    assert.match(system, /No agregues nombres/);
    assert.match(system, /No inventes clases/);
    assert.match(system, /No inventes aplicaciones/);
    assert.match(system, /No inventes títulos/);
  });
});

describe('Gu-IA: sesión real de prospecto', () => {
  it('no recibe apps ni exámenes, aunque pregunte por ambos', async () => {
    const r = await preguntar('¿Qué apps y exámenes tengo disponibles?', jarProspecto);
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null, 'la negativa por rol no debe depender del modelo');
    const content = r.json.choices[0].message.content;
    assert.match(content, /no tiene acceso al catálogo de apps/i);
    assert.match(content, /No tienes exámenes asignados/i);
    assert.ok(!content.includes('Vértice'), 'el prospecto no debe recibir la app fija');
    assert.ok(!content.includes('CRM de Ventas'), 'el prospecto no debe recibir apps externas');
    assert.ok(!content.includes('sumitims.base44.app'), 'el prospecto no debe recibir enlaces de apps');
    assert.ok(!content.includes('Examen de Ventas'), 'el prospecto no debe recibir exámenes');
    assert.ok(!content.includes('Examen interno'), 'el prospecto no debe recibir exámenes ajenos');
    assert.ok(!content.includes('¿Qué es una póliza?'), 'el prospecto no debe recibir preguntas');
    assert.ok(!content.includes('Contrato'), 'el prospecto no debe recibir respuestas correctas');
  });
});

describe('datos de exámenes: bundle y ruta directa por rol', () => {
  it('el bundle del prospecto no incluye exámenes ni preguntas', async () => {
    const r = await api('GET', '/api/data/bundle', null, true, jarProspecto);
    assert.equal(r.status, 200);
    assert.ok(r.json && r.json.bundle, 'el bundle debe conservar su estructura');
    assert.deepEqual(r.json.bundle.exams, { shape: 'array', items: [] });
    const payload = JSON.stringify(r.json.bundle);
    assert.ok(!payload.includes('¿Qué es una póliza?'), 'no debe viajar una pregunta de examen');
    assert.ok(!payload.includes('Pregunta secreta'), 'no debe viajar el banco de otro alumno');
    assert.ok(!payload.includes('Respuesta desarrollo'), 'no debe viajar una respuesta correcta');
  });

  it('el alumno solo recibe en el bundle el examen que tiene asignado', async () => {
    const r = await api('GET', '/api/data/bundle', null, true, jarAlumno);
    assert.equal(r.status, 200);
    assert.equal(r.json.bundle.exams.shape, 'array');
    assert.deepEqual(r.json.bundle.exams.items.map((e) => String(e.id)), ['2001']);
    const payload = JSON.stringify(r.json.bundle.exams);
    assert.ok(!payload.includes('Pregunta secreta'), 'no debe recibir el examen de otro usuario');
    assert.ok(!payload.includes('Pregunta secreta de desarrollo'), 'no debe recibir el examen de un agente');
  });

  it('GET /api/data/exams filtra prospecto, alumno y agentes por asignación', async () => {
    const casos = [
      { rol: 'prospecto', jar: jarProspecto, ids: [], ajenos: ['¿Qué es una póliza?', '"Pregunta secreta"', '¿Pregunta secreta de desarrollo?', '¿Pregunta secreta de agencia?', 'Contrato', 'Respuesta desarrollo', 'Respuesta agencia'] },
      { rol: 'alumno', jar: jarAlumno, ids: ['2001'], ajenos: ['"Pregunta secreta"', '¿Pregunta secreta de desarrollo?', '¿Pregunta secreta de agencia?', 'Respuesta desarrollo', 'Respuesta agencia'] },
      { rol: 'agente de desarrollo', jar: jarAgenteDesarrollo, ids: ['2101'], ajenos: ['¿Qué es una póliza?', '"Pregunta secreta"', '¿Pregunta secreta de agencia?', 'Respuesta agencia'] },
      { rol: 'agente de agencia', jar: jarAgenteAgencia, ids: ['2102'], ajenos: ['¿Qué es una póliza?', '"Pregunta secreta"', '¿Pregunta secreta de desarrollo?', 'Respuesta desarrollo'] },
    ];
    for (const caso of casos) {
      const r = await api('GET', '/api/data/exams', null, true, caso.jar);
      assert.equal(r.status, 200, caso.rol);
      assert.deepEqual(r.json.items.map((e) => String(e.id)), caso.ids, caso.rol);
      const payload = JSON.stringify(r.json.items);
      for (const ajeno of caso.ajenos) {
        assert.ok(!payload.includes(ajeno), caso.rol + ': no debe recibir ' + ajeno);
      }
    }
  });
});

describe('Gu-IA: seguimientos y análisis sin inventar', () => {
  it('Formación: un seguimiento de fechas usa las generaciones reales', async () => {
    const r = await preguntarSeguimiento([
      { role: 'user', content: 'Háblame de las generaciones de Formación Académica' },
      { role: 'assistant', content: 'Hay dos generaciones cargadas.' },
    ], '¿y sus fechas?');
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el seguimiento con fechas debe llegar al modelo con contexto');
    const system = systemDelUltimo();
    assert.match(system, /FORMACIÓN ACADÉMICA — DATOS REALES DEL PORTAL/);
    assert.match(system, /Generación Ventas 2026/);
    assert.match(system, /Generación Producto 2026/);
    assert.match(system, /2026-01-15/);
    assert.match(system, /2026-03-15/);
    assert.ok(!/Generación Inventada|2027-/.test(system), 'no debe inventar fechas ni generaciones');
    assert.match(system, /No agregues nombres/);
  });

  it('Formación: un análisis del curso incluye solo el plan real', async () => {
    const r = await preguntar('Analiza el Curso de Producto y Pólizas y recomienda cómo reforzar su contenido');
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el análisis debe llegar al modelo con contexto');
    const system = systemDelUltimo();
    assert.match(system, /Curso de Producto y Pólizas/);
    assert.match(system, /20 horas/);
    assert.match(system, /Generación Producto 2026/);
    assert.ok(!/Curso Inventado|Taller Fantasma/.test(system), 'no debe inventar cursos');
  });

  it('Sesiones: un seguimiento de horarios respeta las clases visibles del alumno', async () => {
    const r = await preguntarSeguimiento([
      { role: 'user', content: 'Háblame de las sesiones de esta semana' },
      { role: 'assistant', content: 'Hay clases programadas.' },
    ], '¿y sus horarios?', jarAlumno);
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el seguimiento de horarios debe llegar al modelo con contexto');
    const system = systemDelUltimo();
    assert.match(system, /SESIONES PENDIENTES — DATOS REALES DEL PORTAL/);
    assert.match(system, /Clase de Ventas/);
    assert.match(system, /Clase del Grupo A/);
    assert.match(system, /Llamada personal de prueba/);
    assert.ok(!system.includes('Clase privada de otro alumno'), 'no debe ver clases ajenas');
    assert.ok(!system.includes('Clase ya pasada'), 'no debe ver clases terminadas');
    assert.match(system, /No inventes clases/);
  });

  it('Sesiones: un análisis de preparación no inventa clases ni horarios', async () => {
    const r = await preguntar('Analiza mis próximas clases y recomiéndame cómo prepararme', jarAlumno);
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el análisis de sesiones debe llegar al modelo con contexto');
    const system = systemDelUltimo();
    assert.match(system, /Clase de Ventas/);
    assert.match(system, /Clase del Grupo A/);
    assert.ok(!system.includes('Clase privada de otro alumno'), 'no debe ver clases ajenas');
    assert.ok(!/Clase Inventada|Sesión Fantasma/.test(system), 'no debe inventar sesiones');
  });

  it('Apps: un seguimiento de enlaces usa las URLs reales del catálogo', async () => {
    const r = await preguntarSeguimiento([
      { role: 'user', content: 'Háblame de las apps del equipo' },
      { role: 'assistant', content: 'Hay varias herramientas.' },
    ], '¿y sus enlaces?');
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el seguimiento de enlaces debe llegar al modelo con contexto');
    const system = systemDelUltimo();
    assert.match(system, /APPS DEL EQUIPO — DATOS REALES DEL PORTAL/);
    assert.match(system, /Vértice/);
    assert.match(system, /https:\/\/sumitims\.base44\.app/);
    assert.match(system, /CRM de Ventas/);
    assert.match(system, /https:\/\/crm\.example\.com/);
    assert.ok(!/App Inventada|app-falsa\.example/.test(system), 'no debe inventar apps ni enlaces');
    assert.match(system, /No inventes aplicaciones/);
  });

  it('Apps: un análisis del catálogo no inventa herramientas', async () => {
    const r = await preguntar('Analiza las apps del equipo y recomienda cuál usar para dar seguimiento a prospectos');
    assert.equal(r.status, 200);
    assert.ok(ultimoCuerpo, 'el análisis de apps debe llegar al modelo con contexto');
    const system = systemDelUltimo();
    assert.match(system, /CRM de Ventas/);
    assert.match(system, /Seguimiento de prospectos/);
    assert.match(system, /https:\/\/crm\.example\.com/);
    assert.ok(!/Herramienta Fantasma|app-falsa\.example/.test(system), 'no debe inventar herramientas');
  });

  it('Exámenes: un seguimiento de preguntas no expone datos a ningún alumno', async () => {
    const casos = [
      { rol: 'alumno', jar: jarAlumno },
      { rol: 'agente de desarrollo', jar: jarAgenteDesarrollo },
      { rol: 'agente de agencia', jar: jarAgenteAgencia },
    ];
    for (const caso of casos) {
      const r = await preguntarSeguimiento([
        { role: 'user', content: '¿Qué exámenes tengo?' },
        { role: 'assistant', content: 'Tienes un examen asignado.' },
      ], '¿y sus preguntas y respuestas?', caso.jar);
      assert.equal(r.status, 200, caso.rol);
      assert.equal(r.json.guia.directo, true, caso.rol);
      assert.equal(ultimoCuerpo, null, caso.rol + ': la negativa no debe depender del modelo');
      const content = r.json.choices[0].message.content;
      assert.match(content, /No puedo mostrarte ni responder/i, caso.rol);
      assert.ok(!/Examen (?:de Ventas|de Desarrollo|de Agencia|interno)/.test(content),
        caso.rol + ': no debe listar exámenes');
      for (const prohibido of ['¿Qué es una póliza?', 'Contrato', '¿Pregunta secreta de desarrollo?', 'Respuesta desarrollo', '¿Pregunta secreta de agencia?', 'Respuesta agencia']) {
        assert.ok(!content.includes(prohibido), caso.rol + ': no debe exponer ' + prohibido);
      }
    }
  });

  it('Exámenes: el análisis solo usa el examen del alumno y nunca preguntas', async () => {
    const casos = [
      { rol: 'alumno', jar: jarAlumno, propio: 'Examen de Ventas', ajeno: 'Examen interno', pregunta: '¿Qué es una póliza?', respuesta: 'Contrato' },
      { rol: 'agente de desarrollo', jar: jarAgenteDesarrollo, propio: 'Examen de Desarrollo', ajeno: 'Examen de Agencia', pregunta: '¿Pregunta secreta de desarrollo?', respuesta: 'Respuesta desarrollo' },
      { rol: 'agente de agencia', jar: jarAgenteAgencia, propio: 'Examen de Agencia', ajeno: 'Examen de Desarrollo', pregunta: '¿Pregunta secreta de agencia?', respuesta: 'Respuesta agencia' },
    ];
    for (const caso of casos) {
      const r = await preguntar(`Analiza el ${caso.propio} y recomiéndame cómo prepararme`, caso.jar);
      assert.equal(r.status, 200, caso.rol);
      assert.ok(ultimoCuerpo, caso.rol + ': el análisis debe llegar al modelo con contexto');
      const system = systemDelUltimo();
      assert.match(system, /EXÁMENES — DATOS REALES DEL PORTAL/, caso.rol);
      assert.ok(system.includes(caso.propio), caso.rol + ': debe incluir su examen');
      assert.match(system, /no se incluyen preguntas ni respuestas correctas/i, caso.rol);
      assert.ok(!system.includes(caso.ajeno), caso.rol + ': no debe ver exámenes ajenos');
      assert.ok(!system.includes(caso.pregunta), caso.rol + ': no debe ver preguntas');
      assert.ok(!system.includes(caso.respuesta), caso.rol + ': no debe ver respuestas correctas');
      assert.ok(!system.includes('Correcta:'), caso.rol + ': no debe ver la respuesta marcada');
    }
  });
});

describe('Gu-IA: sesiones reales de agentes', () => {
  it('agente de desarrollo recibe apps reales y solo su examen asignado', async () => {
    const r = await preguntar('¿Qué apps y exámenes tengo disponibles?', jarAgenteDesarrollo);
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null, 'los listados exactos no deben depender del modelo');
    const content = r.json.choices[0].message.content;
    assert.match(content, /Vértice/);
    assert.match(content, /https:\/\/sumitims\.base44\.app/);
    assert.match(content, /CRM de Ventas/);
    assert.match(content, /https:\/\/crm\.example\.com/);
    assert.match(content, /Examen de Desarrollo/);
    assert.match(content, /APROBADO/);
    assert.ok(!content.includes('Examen de Agencia'), 'no debe ver el examen del otro agente');
    assert.ok(!content.includes('Examen de Ventas'), 'no debe ver exámenes de otros alumnos');
    assert.ok(!content.includes('¿Pregunta secreta de desarrollo?'), 'no debe recibir preguntas');
    assert.ok(!content.includes('Respuesta desarrollo'), 'no debe recibir respuestas correctas');
    assert.ok(!/App Inventada|Herramienta Fantasma|app-falsa\.example/.test(content),
      'no debe inventar apps ni enlaces');
  });

  it('agente de agencia recibe apps reales y solo su examen asignado', async () => {
    const r = await preguntar('¿Qué apps y exámenes tengo disponibles?', jarAgenteAgencia);
    assert.equal(r.status, 200);
    assert.equal(r.json.guia.directo, true);
    assert.equal(ultimoCuerpo, null, 'los listados exactos no deben depender del modelo');
    const content = r.json.choices[0].message.content;
    assert.match(content, /Vértice/);
    assert.match(content, /CRM de Ventas/);
    assert.match(content, /https:\/\/crm\.example\.com/);
    assert.match(content, /Examen de Agencia/);
    assert.match(content, /APROBADO/);
    assert.ok(!content.includes('Examen de Desarrollo'), 'no debe ver el examen del otro agente');
    assert.ok(!content.includes('Examen de Ventas'), 'no debe ver exámenes de otros alumnos');
    assert.ok(!content.includes('¿Pregunta secreta de agencia?'), 'no debe recibir preguntas');
    assert.ok(!content.includes('Respuesta agencia'), 'no debe recibir respuestas correctas');
    assert.ok(!/App Inventada|Herramienta Fantasma|app-falsa\.example/.test(content),
      'no debe inventar apps ni enlaces');
  });
});
