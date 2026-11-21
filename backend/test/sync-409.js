'use strict';
/* Regresión: un POST que responde 409 (el servidor tiene lápida para ese id)
 * debe descartar el registro localmente, no reintentarlo, y que no vuelva en
 * el siguiente pull aunque el servidor lo siga devolviendo. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SYNC_PATH = path.join(__dirname, '..', '..', 'portal-modular', 'js', 'core', 'sync.js');

function cargarSync(sandbox) {
  const code = fs.readFileSync(SYNC_PATH, 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'sync.js' });
  return sandbox.window.BackendSync;
}

function crearEntorno(respuestaPost) {
  const llamadas = [];
  const sandbox = {
    console,
    location: { search: '' },
    document: { addEventListener() {}, visibilityState: 'visible' },
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    Date, JSON, Math, Set, Object, Array, String, Number, Promise, Error,
    db: { categories: [{ id: 7, nombre: 'Matemáticas' }] },
    __bbKvGet: async () => null,
    __bbKvSet: async () => {},
    Backend: {
      available: true,
      me: async () => ({ user: { id: 1 } }),
      listUsers: async () => [],
    },
    fetch: async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      llamadas.push({ method, url });
      if (method === 'POST') {
        return { ok: respuestaPost.ok, status: respuestaPost.status, json: async () => respuestaPost.body };
      }
      // Bundle del servidor: devuelve el registro aunque tenga lápida (copia vieja).
      return {
        ok: true, status: 200,
        json: async () => ({
          bundle: { categories: { shape: 'array', items: [{ id: 7, nombre: 'Matemáticas' }] } },
          users: [],
        }),
      };
    },
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  return { sandbox, llamadas };
}

test('409 en POST descarta el registro con lápida y no lo reintenta', async () => {
  const { sandbox, llamadas } = crearEntorno({
    ok: false, status: 409, body: { error: 'Registro borrado' },
  });
  const sync = cargarSync(sandbox);

  // Sesión activa y sombra inicial vacía: el registro local aún no está en el servidor.
  await sync.pull();
  sandbox.db.categories.push({ id: 9, nombre: 'Portafolios' });
  llamadas.length = 0;

  // El servidor rechaza el POST del id 9 con 409 (lápida).
  const fetchOriginal = sandbox.fetch;
  sandbox.fetch = async (url, opts) => {
    if (opts && opts.method === 'POST') {
      llamadas.push({ method: 'POST', url });
      return { ok: false, status: 409, json: async () => ({ error: 'Registro borrado' }) };
    }
    return fetchOriginal(url, opts);
  };

  await sync.pushCollectionsImmediate(['categories']);

  const posts = llamadas.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 1, 'el POST con 409 no debe reintentarse');

  // Segundo envío: no debe volver a intentar el id con lápida.
  await sync.pushCollectionsImmediate(['categories']);
  assert.equal(llamadas.filter((c) => c.method === 'POST').length, 1,
    'tras el 409 el id con lápida no se vuelve a enviar');

  // Un pull posterior (el servidor aún lo devuelve) no lo resucita localmente.
  await sync.pull();
  const ids = sandbox.db.categories.map((x) => x.id);
  assert.ok(!ids.includes(9), 'el registro con lápida no debe quedar en la copia local');
});
