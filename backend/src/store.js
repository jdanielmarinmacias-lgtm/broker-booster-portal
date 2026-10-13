'use strict';
/* Store con adaptador interchangeable (memory | json | supabase).
 * - Lecturas sync desde caché cálida (init en boot).
 * - refreshIfStale(): en serverless, revalida la caché cada TTL del adaptador.
 * - persist(): write-through al adaptador (async).
 * - pushFeed(): espejo al feed público realtime (no-op salvo supabase/json). */
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
  return {
    adapter,
    async init(initial) {
      const loaded = await adapter.loadDocuments();
      cache = (loaded && Object.keys(loaded).length) ? loaded : (initial || {});
      cacheAt = Date.now();
    },
    get: () => cache,
    set: (next) => { cache = next; cacheAt = Date.now(); },
    async refreshIfStale() {
      const ttl = adapter.cacheTtlMs ?? Infinity;
      if (Date.now() - cacheAt > ttl) {
        cache = await adapter.loadDocuments();
        cacheAt = Date.now();
      }
    },
    /* Recarga INCONDICIONAL para rutas de escritura: en serverless la caché
     * puede estar dentro del TTL pero vieja respecto a otra instancia.
     * Mutar sin esto = reescribir (y borrar) lo ajeno. Un read extra por
     * escritura es barato frente a perder datos. */
    async refreshForWrite() {
      cache = await adapter.loadDocuments();
      cacheAt = Date.now();
    },
    async persist() {
      await adapter.saveDocuments(cache);
      cacheAt = Date.now();
    },
    /* Persist quirúrgico: solo las colecciones indicadas (+ auditoría se
     * incluye cuando el caller la tocó). Si el adaptador no lo soporta,
     * cae al write-through total. */
    async persistCollections(names) {
      if (adapter.saveCollections) await adapter.saveCollections(cache, names);
      else await adapter.saveDocuments(cache);
      cacheAt = Date.now();
    },
    pushFeed: (item) => adapter.pushFeed(item),
  };
}

module.exports = { createStore, selectAdapter };
