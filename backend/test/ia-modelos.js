'use strict';
/* Comprobación periódica del catálogo de Groq.
 *
 * Sin red: el fetch se sustituye por respuestas controladas. Verifica que
 * detecta un modelo retirado, crea una sola alerta para dirección, la marca
 * como resuelta cuando el modelo vuelve y no confunde un fallo de consulta con
 * un retiro.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.RESEND_API_KEY = '';
process.env.IA_ALERT_RECIPIENTS = '';
process.env.REPORT_RECIPIENTS = '';

const {
  MODELOS_PERMITIDOS,
  consultarCatalogo,
  evaluarCatalogo,
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
