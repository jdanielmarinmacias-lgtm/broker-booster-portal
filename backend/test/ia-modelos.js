'use strict';
/* Comprobación periódica del catálogo de Groq.
 *
 * Sin red: el fetch se sustituye por respuestas controladas. Verifica que
 * detecta un modelo retirado, crea una sola alerta para dirección, la marca
 * como resuelta cuando el modelo vuelve y no confunde un fallo de consulta con
 * un retiro.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.RESEND_API_KEY = '';
process.env.IA_ALERT_RECIPIENTS = '';
process.env.REPORT_RECIPIENTS = '';

const {
  MODELOS_PERMITIDOS,
  consultarCatalogo,
  evaluarCatalogo,
  enviarAlerta,
  revisar,
} = require('../src/iaCatalogo');
const { createStore } = require('../src/store');
const { createMemoryAdapter } = require('../src/adapters/memory');

const MODELO = MODELOS_PERMITIDOS[0];
const URL_PRUEBA = 'https://example.test/openai/v1/models';

function respuesta(payload, status) {
  const code = status || 200;
  return async () => ({
    ok: code >= 200 && code < 300,
    status: code,
    text: async () => JSON.stringify(payload),
  });
}

function catalogo(ids) {
  return { object: 'list', data: ids.map((id) => ({ id })) };
}

async function nuevoStore() {
  const store = createStore(createMemoryAdapter({ users: [], notifications: [], settings: {} }));
  await store.init();
  return store;
}

function opciones(store, payload, status) {
  return {
    store,
    apiKey: 'gsk_test_catalogo_offline_0000',
    fetchImpl: respuesta(payload, status),
    url: URL_PRUEBA,
    email: false,
  };
}

describe('catálogo de modelos de Groq', () => {
  it('solo permite el modelo verificado', () => {
    assert.deepEqual(MODELOS_PERMITIDOS.slice(), [MODELO]);
  });

  it('detecta el modelo permitido presente y el ausente', () => {
    const presente = evaluarCatalogo([MODELO, 'otro/modelo']);
    assert.equal(presente.ok, true);
    assert.deepEqual(presente.faltantes, []);

    const ausente = evaluarCatalogo(['otro/modelo']);
    assert.equal(ausente.ok, false);
    assert.deepEqual(ausente.faltantes, [MODELO]);
  });

  it('lee los ids del catálogo y reporta los errores HTTP', async () => {
    const ok = await consultarCatalogo('gsk_test', {
      fetchImpl: respuesta(catalogo([MODELO])),
      url: URL_PRUEBA,
    });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.ids, [MODELO]);

    const fallo = await consultarCatalogo('gsk_test', {
      fetchImpl: respuesta({ error: { message: 'invalid api key' } }, 401),
      url: URL_PRUEBA,
    });
    assert.equal(fallo.ok, false);
    assert.equal(fallo.status, 401);
    assert.match(fallo.error, /invalid api key/);
  });
});

describe('alertas del catálogo de IA', () => {
  let store;

  beforeEach(async () => {
    store = await nuevoStore();
  });

  it('crea una sola notificación para dirección y no la duplica', async () => {
    const r = await revisar(opciones(store, catalogo(['otro/modelo'])));
    assert.equal(r.estado, 'modelo-no-disponible');
    assert.equal(r.ok, false);
    assert.deepEqual(r.faltantes, [MODELO]);
    assert.equal(r.alertasNuevas, 1);

    const alertas = store.get().notifications.filter((n) => n.type === 'ia-modelo');
    assert.equal(alertas.length, 1);
    assert.equal(alertas[0].modelo, MODELO);
    assert.deepEqual(alertas[0].roles, ['gm', 'admin', 'desarrollador']);
    assert.equal(alertas[0].resuelto, false);
    assert.equal(store.get().settings.iaModelos.estado, 'modelo-no-disponible');

    const otra = await revisar(opciones(store, catalogo(['otro/modelo'])));
    assert.equal(otra.alertasNuevas, 0);
    assert.equal(store.get().notifications.filter((n) => n.type === 'ia-modelo').length, 1);
  });

  it('marca la alerta como resuelta cuando el modelo vuelve', async () => {
    await revisar(opciones(store, catalogo(['otro/modelo'])));
    const vuelta = await revisar(opciones(store, catalogo([MODELO])));

    assert.equal(vuelta.estado, 'ok');
    assert.equal(vuelta.ok, true);
    assert.equal(vuelta.alertasResueltas, 1);
    const alerta = store.get().notifications.find((n) => n.type === 'ia-modelo');
    assert.equal(alerta.resuelto, true);
    assert.ok(alerta.resueltoEn);
    assert.equal(store.get().settings.iaModelos.ok, true);
  });

  it('un fallo de consulta no se confunde con un modelo retirado', async () => {
    const r = await revisar(opciones(store, { error: { message: 'sin red' } }, 503));

    assert.equal(r.estado, 'error-consulta');
    assert.equal(r.ok, false);
    assert.deepEqual(r.faltantes, []);
    assert.equal(r.alertasNuevas, 0);
    assert.equal(store.get().notifications.length, 0);
    assert.equal(store.get().settings.iaModelos.error, 'sin red');
  });
});

describe('correo de Resend', () => {
  let previo;

  beforeEach(() => {
    previo = {
      key: process.env.RESEND_API_KEY,
      to: process.env.IA_ALERT_RECIPIENTS,
      from: process.env.MAIL_FROM,
    };
    process.env.RESEND_API_KEY = 're_test_key_no_real';
    process.env.IA_ALERT_RECIPIENTS = 'alertas@example.com';
    process.env.MAIL_FROM = 'Alertas <onboarding@resend.dev>';
  });

  afterEach(() => {
    const restaurar = (clave, valor) => {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    };
    restaurar('RESEND_API_KEY', previo.key);
    restaurar('IA_ALERT_RECIPIENTS', previo.to);
    restaurar('MAIL_FROM', previo.from);
  });

  it('envía a los destinatarios configurados con Resend', async () => {
    let peticion = null;
    const r = await enviarAlerta(
      { checkedAt: '2026-10-29T20:00:00.000Z', faltantes: [MODELO] },
      {
        fetchImpl: async (url, opts) => {
          peticion = { url, opts };
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'email_123' }) };
        },
      }
    );

    assert.equal(r.sent, true);
    assert.equal(r.id, 'email_123');
    assert.equal(r.destinatarios, 1);
    assert.match(peticion.url, /api\.resend\.com\/emails/);
    const body = JSON.parse(peticion.opts.body);
    assert.deepEqual(body.to, ['alertas@example.com']);
    assert.match(body.subject, /Modelo de IA no disponible/);
    assert.match(body.html, /openai\/gpt-oss-120b/);
    assert.equal(body.from, 'Alertas <onboarding@resend.dev>');
  });

  it('la prueba usa un asunto distinto y no simula un modelo retirado', async () => {
    let peticion = null;
    const r = await enviarAlerta(
      { checkedAt: '2026-10-29T20:00:00.000Z', faltantes: [] },
      {
        prueba: true,
        fetchImpl: async (url, opts) => {
          peticion = { url, opts };
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'email_test' }) };
        },
      }
    );

    assert.equal(r.sent, true);
    const body = JSON.parse(peticion.opts.body);
    assert.equal(body.subject, '[Portal] Prueba de alertas de IA');
    assert.match(body.html, /correo de prueba/);
  });

  it('sin RESEND_API_KEY queda en dry-run', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await enviarAlerta({ checkedAt: new Date().toISOString(), faltantes: [MODELO] });
    assert.equal(r.sent, false);
    assert.equal(r.dryRun, true);
    assert.match(r.motivo, /RESEND_API_KEY/);
  });
});
