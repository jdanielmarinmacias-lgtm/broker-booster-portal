/* ============================================================================
 * js/core/idb-gate.js — COMPUERTA DE ARRANQUE CON INDEXEDDB
 * Guarda la base del portal en IndexedDB (no en localStorage). La primera vez
 * copia una sola vez el contenido de localStorage 'pepes_v3_db' y luego borra
 * esa clave. window.__bbDbReady se resuelve cuando la base ya está disponible
 * en window.__bbDbCache; el legacy espera esa promesa antes de leer `db`.
 * ========================================================================== */
(function () {
  'use strict';

  var DB_NAME = 'broker_booster_portal';
  var STORE = 'kv';
  var KEY = 'pepes_v3_db';
  var MIGRATED_FLAG = 'pepes_v3_db_migrated';

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(db, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(STORE, mode);
      var store = t.objectStore(STORE);
      var out;
      var r = fn(store);
      if (r) r.onsuccess = function () { out = r.result; };
      t.oncomplete = function () { resolve(out); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error); };
    });
  }

  var gate = (async function () {
    var db = await open();
    var raw = await tx(db, 'readonly', function (s) { return s.get(KEY); });
    var migrated = await tx(db, 'readonly', function (s) { return s.get(MIGRATED_FLAG); });

    if (!migrated) {
      var legacy = null;
      try { legacy = localStorage.getItem(KEY); } catch (e) { legacy = null; }
      if (legacy !== null && (raw === undefined || raw === null)) {
        raw = legacy;
        await tx(db, 'readwrite', function (s) { return s.put(legacy, KEY); });
      }
      await tx(db, 'readwrite', function (s) { return s.put(true, MIGRATED_FLAG); });
      try { localStorage.removeItem(KEY); } catch (e) {}
    }

    window.__bbDbCache = raw ? String(raw) : null;
    window.__bbDbIdb = db;
    return window.__bbDbCache;
  })();

  /* Escritura: guarda el JSON completo en IndexedDB. */
  window.__bbDbSet = function (json) {
    var db = window.__bbDbIdb;
    if (!db) return Promise.resolve();
    window.__bbDbCache = json;
    return tx(db, 'readwrite', function (s) { return s.put(json, KEY); });
  };

  window.__bbDbReady = gate;

  /* Valores pequeños por clave (p. ej. la cola de borrados pendientes). Usan el
   * mismo almacén kv pero con claves propias, no la base del portal. */
  window.__bbKvGet = async function (key) {
    var db = window.__bbDbIdb || (await gate, window.__bbDbIdb);
    var v = await tx(db, 'readonly', function (s) { return s.get(key); });
    return v === undefined ? null : v;
  };
  window.__bbKvSet = async function (key, value) {
    var db = window.__bbDbIdb || (await gate, window.__bbDbIdb);
    return tx(db, 'readwrite', function (s) { return s.put(value, key); });
  };
})();
