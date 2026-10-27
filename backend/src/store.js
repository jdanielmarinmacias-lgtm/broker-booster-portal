'use strict';
/* Store con adaptador interchangeable (memory | json | supabase).
 * - Lecturas sync desde caché cálida (init en boot).
 * - refreshIfStale(): en serverless, revalida la caché cada TTL del adaptador.
 * - persist(): write-through al adaptador (async).
 * - pushFeed(): espejo al feed público realtime (no-op salvo supabase/json).
 *
 * REGLA DE ORO: `auditoria` NUNCA se recarga ni se re-escribe completa. Llegó
 * a 26 MB (898 filas con fotos de usuario en base64) y cada guardado la
 * descargaba y la volvía a subir: statement_timeout (HTTP 500), sesión "no
 * verificable" (401 en cascada) y el portal quedándose en localStorage.
 * Ahora cada entrada nueva viaja sola con adapter.pushAudit(). */
const { createMemoryAdapter } = require('./adapters/memory');
const { createJsonFileAdapter } = require('./adapters/jsonFile');

function selectAdapter(config) {
  if (config.supabaseUrl && config.supabaseServiceKey) {
    const { createSupabaseAdapter } = require('./adapters/supabase');
    return createSupabaseAdapter({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
  }
  if (config.dataDir) return createJsonFileAdapter(config.dataDir);
  return createMemoryAdapter();
}

function createStore(adapter) {
  let cache = {};
  let cacheAt = 0;
  let refreshPromise = null;
  /* Ids de auditoría ya presentes en el almacén (para subir SOLO las nuevas). */
  let auditSeen = null;

  function hydrateAudit() {
    auditSeen = new Set(
      (Array.isArray(cache.auditoria) ? cache.auditoria : []).map((x) => String(x && x.id))
    );
  }
  function setCache(next) {
    cache = next || {};
    cacheAt = Date.now();
    hydrateAudit();
  }

  return {
    adapter,
    isWarm: () => cacheAt > 0,
    async init(initial) {
      const loaded = await adapter.loadDocuments();
      setCache((loaded && Object.keys(loaded).length) ? loaded : (initial || {}));
    },
    get: () => cache,
    set: (next) => setCache(next),
    async refreshIfStale() {
      const ttl = adapter.cacheTtlMs ?? Infinity;
      if (Date.now() - cacheAt > ttl) {
        if (!refreshPromise) {
          refreshPromise = adapter.loadDocuments().then((loaded) => setCache(loaded)).finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
      }
    },
    /* Refresco ACOTADO a las colecciones pedidas. En la base del portal hay
     * >1000 documentos: recargar todo en cada GET de una colección tardaba
     * decenas de segundos y disparaba statement_timeout (HTTP 500). */
    async refreshCollections(names) {
      const list = (names || []).filter((n) => n && n !== 'auditoria');
      if (!list.length) return this.refreshIfStale();
      if (typeof adapter.loadCollections !== 'function') return this.refreshIfStale();
      const subset = await adapter.loadCollections(list);
      for (const col of list) {
        if (col in subset) cache[col] = subset[col];
      }
      cacheAt = Date.now();
      return true;
    },
    /* Recarga INCONDICIONAL para rutas de escritura: en serverless la caché
     * puede estar dentro del TTL pero vieja respecto a otra instancia.
     * Mutar sin esto = reescribir (y borrar) lo ajeno. La auditoría queda
     * fuera: es append-only y se escribe por pushAudit. */
    async refreshForWrite(collections) {
      const list = (collections || []).filter((c) => c && c !== 'auditoria');
      if (Array.isArray(collections) && collections.length && typeof adapter.loadCollections === 'function') {
        if (!list.length) return;
        const subset = await adapter.loadCollections(list);
        for (const col of list) {
          if (col in subset) cache[col] = subset[col];
        }
        cacheAt = Date.now();
        if (!auditSeen) hydrateAudit();
        return;
      }
      setCache(await adapter.loadDocuments());
    },
    async persist() {
      await adapter.saveDocuments(cache);
      cacheAt = Date.now();
    },
    /* Persist quirúrgico. La auditoría se manda entrada por entrada (solo las
     * nuevas): nunca se re-suben las 898 históricas en cada guardado. */
    async persistCollections(names) {
      let list = (names || []).filter(Boolean);
      if (list.includes('auditoria')) {
        if (typeof adapter.pushAudit === 'function') {
          if (!auditSeen) hydrateAudit();
          const col = Array.isArray(cache.auditoria) ? cache.auditoria : [];
          const nuevas = col.filter((e) => e && !auditSeen.has(String(e.id)));
          for (const e of nuevas.slice(-50)) {
            try {
              await adapter.pushAudit(e);
              auditSeen.add(String(e.id));
            } catch (err) { /* la auditoría jamás rompe el guardado */ }
          }
        }
        list = list.filter((n) => n !== 'auditoria');
      }
      if (!list.length) { cacheAt = Date.now(); return; }
      if (adapter.saveCollections) await adapter.saveCollections(cache, list);
      else await adapter.saveDocuments(cache);
      cacheAt = Date.now();
    },
    /* Auditoría atómica: registra y persiste SOLO esa entrada. */
    async appendAudit(tipo, actor, detalle) {
      const db = require('./db');
      const entry = db.audit(cache, tipo, actor, detalle);
      if (typeof adapter.pushAudit === 'function') {
        await adapter.pushAudit(entry);
        if (!auditSeen) hydrateAudit();
        auditSeen.add(String(entry.id));
      } else {
        await this.persistCollections(['auditoria']);
      }
      return entry;
    },
    /* Ticker de versiones por colección (realtime entre equipos). No-op sin soporte. */
    touchVersions: (names) => (typeof adapter.touchVersions === 'function'
      ? adapter.touchVersions(names).catch(() => {})
      : Promise.resolve()),
    pushFeed: (item) => adapter.pushFeed(item),
  };
}

module.exports = { createStore, selectAdapter };
