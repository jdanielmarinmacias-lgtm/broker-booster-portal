/* ============================================================================
 * js/core/store.js — CAPA DE ABSTRACCIÓN DE DATOS (Mock API / Service Layer)
 * Paso 1 de la migración del monolito portal.html
 *
 * REGLA DE ORO: todo acceso a localStorage pasa por aquí.
 * Ningún módulo nuevo debe llamar a localStorage.getItem('pepes_v3_db')
 * directamente. Usan window.Store (CRUD genérico) o los servicios
 * específicos (userService, coursesService, etc.).
 *
 * DISEÑO ANTI-COLISIONES: este archivo se carga ANTES que el legacy, que
 * declara `const DB_KEY`, `let db`, `let currentUser` a nivel global.
 * Por eso aquí NO declaramos esos nombres: todo vive bajo window.Store
 * y resuelve los globales de forma perezosa (cuando el legacy ya cargó).
 *
 * MIGRACIÓN FUTURA (backend propio): solo hay que reimplementar los
 * métodos marcados con [ADAPTER] para que hablen con fetch() en vez de
 * localStorage. La firma no cambia, así que los módulos no se tocan.
 * ========================================================================== */
(function () {
  'use strict';

  var KEY = 'pepes_v3_db'; // espejo de DB_KEY del legacy (no redeclarar const)
  var saveTimer = null;

  function globals() {
    // Resuelve los globales del legacy (let/const a nivel de script clásico:
    // existen como bindings globales léxicos, NO como window.db — por eso
    // se referencian directos y nunca como window.db/window.currentUser).
    // eslint-disable-next-line no-undef
    var d = (typeof db !== 'undefined' && db !== null) ? db : null;
    // eslint-disable-next-line no-undef
    var u = (typeof currentUser !== 'undefined' && currentUser !== null) ? currentUser : null;
    return { db: d, user: u };
  }

  function rawRead() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Store] DB corrupta:', e);
      return null;
    }
  }

  var Store = {
    KEY: KEY,

    /** [ADAPTER] Lee la DB. Hoy: localStorage. Mañana: GET /api/db */
    load: function () {
      var data = rawRead();
      try {
        // eslint-disable-next-line no-undef
        if (data && typeof db !== 'undefined' && db !== null) {
          // eslint-disable-next-line no-undef
          Object.keys(db).forEach(function (k) { delete db[k]; });
          // eslint-disable-next-line no-undef
          Object.assign(db, data); // sincroniza el objeto vivo del legacy
        }
      } catch (e) { /* legacy aún no cargó: se devuelve lo persistido */ }
      // eslint-disable-next-line no-undef
      return data || ((typeof db !== 'undefined' && db !== null) ? db : {});
    },

    /** [ADAPTER] Persiste la DB con debounce (hereda la optimización v6.5). */
    save: function (immediate) {
      var g = globals();
      var persist = function () {
        try {
          var payload = g.db || rawRead() || {};
          localStorage.setItem(KEY, JSON.stringify(payload));
        } catch (e) {
          console.warn('[Store] No se pudo guardar (almacenamiento lleno):', e);
          if (window.showToast) window.showToast('No se pudo guardar (almacenamiento lleno)', 'warning');
        }
      };
      if (immediate) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        persist();
        return;
      }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 500); // mismo debounce que el legacy v6.5
    },

    /** Devuelve la colección (array) indicada, creándola si no existe. */
    collection: function (name) {
      var g = globals();
      var db = g.db;
      if (!db) {
        // Legacy aún no cargó: leer directo del storage.
        db = rawRead() || {};
      }
      if (!Array.isArray(db[name])) db[name] = [];
      return db[name];
    },

    /** Objeto de settings (db.settings). */
    settings: function () {
      var g = globals();
      var db = g.db || rawRead() || {};
      if (!db.settings) db.settings = {};
      return db.settings;
    },

    // ---- CRUD genérico ----------------------------------------------------
    getAll: function (name) { return this.collection(name).slice(); },
    getById: function (name, id) {
      return this.collection(name).find(function (x) { return String(x.id) === String(id); }) || null;
    },
    insert: function (name, record) {
      var col = this.collection(name);
      if (record.id == null) record.id = Date.now() + Math.floor(Math.random() * 1000);
      col.push(record);
      this.save();
      return record;
    },
    update: function (name, id, patch) {
      var rec = this.getById(name, id);
      if (!rec) return null;
      Object.assign(rec, patch);
      this.save();
      return rec;
    },
    remove: function (name, id) {
      var g = globals();
      var db = g.db || rawRead() || {};
      var before = (db[name] || []).length;
      db[name] = (db[name] || []).filter(function (x) { return String(x.id) !== String(id); });
      this.save();
      return (db[name] || []).length < before;
    },

    /** Auditoría centralizada (sustituye los push directos a db.auditoria). */
    audit: function (tipo, detalle) {
      var g = globals();
      var entry = Object.assign({
        id: Date.now(),
        tipo: tipo,
        fecha: new Date().toISOString(),
        usuarioId: g.user ? g.user.id : null,
        usuarioNombre: g.user ? g.user.name : 'sistema'
      }, detalle || {});
      this.collection('auditoria').push(entry);
      this.save();
      return entry;
    },

    /** Diagnóstico (equivale a checkStorageUsage del legacy). */
    usage: function () {
      try {
        var total = 0;
        for (var k in localStorage) {
          if (Object.prototype.hasOwnProperty.call(localStorage, k)) total += String(localStorage[k]).length;
        }
        var raw = localStorage.getItem(KEY) || '';
        return {
          totalMB: (total / 1024 / 1024).toFixed(2),
          dbMB: (raw.length / 1024 / 1024).toFixed(2)
        };
      } catch (e) { return null; }
    }
  };

  window.Store = Store;
})();
