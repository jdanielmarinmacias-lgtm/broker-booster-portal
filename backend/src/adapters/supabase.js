'use strict';
/* Adaptador Supabase (producción en Vercel + realtime).
 * Usa la SERVICE key (o la nueva `sb_secret_*`) SOLO en servidor: bypass RLS.
 * El navegador jamás la ve; solo recibe la ANON key vía /api/public/config
 * y RLS le permite leer únicamente `public_feed`.
 * Tablas (ver supabase/schema.sql): documents, app_users, app_sessions, public_feed. */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const uploads = require('../uploads');

const toUserRow = (u) => ({
  id: String(u.id),
  username: u.username,
  role: u.role,
  profile: {
    name: u.name, email: u.email, phone: u.phone, avatar: u.avatar,
    xp: u.xp, students: u.students, level: u.level, streak: u.streak, badges: u.badges,
    ubicacion: u.ubicacion, ciudad: u.ciudad, ubicacionCiudad: u.ubicacionCiudad,
    agenciaId: u.agenciaId, agencia: u.agencia, parentId: u.parentId, assignedTo: u.assignedTo,
    calendarColor: u.calendarColor, lastActive: u.lastActive, lastConnection: u.lastConnection,
    solicitudesVistasHasta: u.solicitudesVistasHasta, attendance: u.attendance, lastStudy: u.lastStudy,
  },
  password_hash: u.passwordHash || u.password || null,
  must_change: !!u.mustChangePassword,
});

const fromUserRow = (r) => ({
  id: r.id,
  username: r.username,
  role: r.role,
  name: r.profile?.name,
  email: r.profile?.email,
  phone: r.profile?.phone,
  avatar: r.profile?.avatar,
  xp: r.profile?.xp,
  students: r.profile?.students,
  level: r.profile?.level,
  streak: r.profile?.streak,
  badges: r.profile?.badges,
  ubicacion: r.profile?.ubicacion,
  ciudad: r.profile?.ciudad,
  ubicacionCiudad: r.profile?.ubicacionCiudad,
  agenciaId: r.profile?.agenciaId,
  agencia: r.profile?.agencia,
  parentId: r.profile?.parentId,
  assignedTo: r.profile?.assignedTo,
  calendarColor: r.profile?.calendarColor,
  lastActive: r.profile?.lastActive,
  lastConnection: r.profile?.lastConnection,
  solicitudesVistasHasta: r.profile?.solicitudesVistasHasta,
  attendance: r.profile?.attendance,
  lastStudy: r.profile?.lastStudy,
  passwordHash: r.password_hash,
  mustChangePassword: !!r.must_change,
});

const MEDIA_BUCKET = 'portal-media';

function createSupabaseAdapter({ url, serviceKey, uploadsDir }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  /* Huella de la última versión persistida por (collection,doc_id): evita
   * re-subir filas sin cambios en cada guardado (el legacy persiste la
   * colección COMPLETA en cada mensaje nuevo; con mensajes viejos empotrados
   * con imágenes base64 eso re-subía MBs por chat y provocaba el
   * statement_timeout del Postgres). */
  const savedHash = new Map(); // 'collection∅doc_id' -> sha1(JSON(data))
  const h1 = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');

  /* Resiliencia: la instancia de Postgres (free tier) sufre picos de latencia
   * y corta statements largos con "statement timeout". Reintentamos las
   * operaciones de escritura 2 veces más antes de fallar la petición: un
   * mensaje del chat que tocó un pico no se pierde. */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function isTransient(e) {
    const msg = String((e && (e.message || e.error_description)) || e);
    return /timeout|temporarily|deadlock|connection|network|fetch failed|failed to fetch|ECONN|undici|5[0-9]{2}/i.test(msg);
  }
  /* Tiempos: el fetch de Supabase no tiene timeout propio; una consulta
   * colgada dejaba la petición (y el sync del portal) congelada. Cada
   * intento se acota; el timeout cuenta como transitorio y reintenta. */
  const QUERY_TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS || 10000);
  /* Guarda de payload: una imagen/documento en base64 dentro de un documento
   * JSON puede pesar MBs; antes eso colgaba el upsert 20-40 s y rompía el sync. */
  const MAX_DOC_BYTES = Number(process.env.SUPABASE_MAX_DOC_BYTES || 6 * 1024 * 1024);
  function withTimeout(promise, what, ms) {
    let timer = null;
    const gate = new Promise((_, reject) => {
      const err = new Error('Supabase timeout (' + what + ', ' + (ms || QUERY_TIMEOUT_MS) + 'ms)');
      err.status = 503; // reintentable: la base está ocupada, el dato es válido
      timer = setTimeout(() => reject(err), ms || QUERY_TIMEOUT_MS);
    });
    return Promise.race([promise, gate]).finally(() => { if (timer) clearTimeout(timer); });
  }
  async function withRetry(fn, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        return await withTimeout(fn(), 'query');
      } catch (e) {
        lastErr = e;
        // 413 (documento enorme) no es transitorio: reintentarlo solo alarga la espera.
        if (e && e.status === 413) break;
        if (i === tries - 1 || !isTransient(e)) break;
        await sleep(400 * (i + 1));
      }
    }
    throw lastErr;
  }
  /* Auditoría es append-only: los doc_id ya persistidos no se re-suben ni
   * participan del borrado de ausentes. Cada escritura sube 1 fila nueva en
   * vez de re-escribir todas las entradas históricas (500+). */
  const auditSavedIds = new Set();
  let bucketReady = false; // el boot la llama por instancia serverless; basta 1 vez
  /* Cuántas entradas de auditoría se mantienen en caché y se leen por petición.
   * El histórico completo no se necesita para operar y era el 99% del peso de
   * la base (26 MB de 26.7 MB). */
  const AUDIT_KEEP = Number(process.env.AUDIT_KEEP || 300);

  /* Compacta cualquier valor para la auditoría: las entradas guardaban fotos
   * de usuario completas en base64 (una sola fila llegó a 1.65 MB). El
   * histórico se conserva como resumen legible, sin archivos. */
  const MAX_AUDIT_STR = 400;
  function compactAudit(v, depth) {
    depth = depth || 0;
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') {
      if (/^data:/i.test(v)) return '[archivo]';
      return v.length > MAX_AUDIT_STR ? v.slice(0, MAX_AUDIT_STR) + '…' : v;
    }
    if (typeof v !== 'object') return v;
    if (depth >= 3) return Array.isArray(v) ? '[…]' : '{…}';
    if (Array.isArray(v)) return v.slice(0, 25).map((x) => compactAudit(x, depth + 1));
    const out = {};
    for (const k of Object.keys(v)) out[k] = compactAudit(v[k], depth + 1);
    return out;
  }
  function compactAuditRow(data) {
    if (!data || typeof data !== 'object') return data;
    const out = { ...data };
    for (const k of Object.keys(out)) {
      if (k === 'id' || k === 'tipo' || k === 'fecha' || k === 'usuarioId' || k === 'usuarioNombre') continue;
      out[k] = compactAudit(out[k]);
    }
    return out;
  }

  async function loadDocuments() {
    const out = {};
    const objects = {}; // colecciones-objeto (doc_id __object__)
    let from = 0;
    const PAGE = 1000;
    const usersPromise = sb.from('app_users').select('*');
    for (;;) {
      const { data, error } = await sb.from('documents').select('collection,doc_id,data').range(from, from + PAGE - 1);
      if (error) throw new Error('Supabase documents: ' + error.message);        for (const row of data) {
          if (row.collection === 'auditoria') auditSavedIds.add('auditoria∅' + row.doc_id);
          if (row.doc_id === '__object__') {
            // Colección-objeto (settings/autoHub/inmPublica/…): data IS el objeto.
            objects[row.collection] = row.data || {};
            savedHash.set(row.collection + '∅__object__', h1(row.data || {}));
          } else {
            savedHash.set(row.collection + '∅' + row.doc_id, h1(row.data || {}));
            out[row.collection] = out[row.collection] || [];
            out[row.collection].push({ id: row.doc_id, ...(row.data || {}) });
          }
        }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // El objeto gana si hubiera filas mixtas (colección migrada de array→objeto).
    for (const [c, v] of Object.entries(objects)) out[c] = v;
    // Auditoría: solo las últimas AUDIT_KEEP (la app también la cota a 500).
    if (Array.isArray(out.auditoria) && out.auditoria.length > AUDIT_KEEP) {
      out.auditoria = out.auditoria.slice(-AUDIT_KEEP);
    }
    const { data: users, error: uerr } = await usersPromise;
    if (uerr) throw new Error('Supabase users: ' + uerr.message);
    out.users = (users || []).map(fromUserRow);
    return out;
  }

  /* Carga quirúrgica de solo las colecciones solicitadas (evita descargar toda
   * la tabla documents y app_users en cada POST/PUT/DELETE de una colección). */
  async function loadCollections(names) {
    const list = names || [];
    const wanted = list.filter((n) => n && n !== 'users');
    const out = {};
    const auditWanted = wanted.includes('auditoria');
    const rest = wanted.filter((n) => n !== 'auditoria');
    if (auditWanted) {
      /* Auditoría: NUNCA se pagina entera. Son cientos de filas históricas que
       * no cambian; descargarlas en cada escritura era el 26 MB que tumbaba el
       * guardado. Solo las últimas AUDIT_KEEP, por fecha. */
      const { data, error } = await sb.from('documents')
        .select('collection,doc_id,data')
        .eq('collection', 'auditoria')
        .order('updated_at', { ascending: false })
        .limit(AUDIT_KEEP);
      if (error) throw new Error('Supabase auditoria: ' + error.message);
      out.auditoria = (data || []).map((row) => {
        auditSavedIds.add('auditoria∅' + row.doc_id);
        return { id: row.doc_id, ...(row.data || {}) };
      }).reverse();
    }
    if (rest.length) {
      let from = 0;
      const PAGE = 1000;
      const objects = {};
      for (;;) {
        const { data, error } = await sb.from('documents')
          .select('collection,doc_id,data')
          .in('collection', rest)
          .range(from, from + PAGE - 1);
        if (error) throw new Error('Supabase loadCollections: ' + error.message);
        for (const row of data) {
          if (row.doc_id === '__object__') {
            objects[row.collection] = row.data || {};
            savedHash.set(row.collection + '∅__object__', h1(row.data || {}));
          } else {
            savedHash.set(row.collection + '∅' + row.doc_id, h1(row.data || {}));
            out[row.collection] = out[row.collection] || [];
            out[row.collection].push({ id: row.doc_id, ...(row.data || {}) });
          }
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      for (const [c, v] of Object.entries(objects)) out[c] = v;
    }
    if (list.includes('users')) {
      const { data: users, error: uerr } = await sb.from('app_users').select('*');
      if (uerr) throw new Error('Supabase users: ' + uerr.message);
      out.users = (users || []).map(fromUserRow);
    }
    return out;
  }

  /* ---- Archivos embebidos: garantía del lado del servidor ----
   * El frontend legacy a veces guarda el archivo como dataURL dentro del JSON
   * (settings.publicidad, convenciones, avatares…). Aunque el cliente intenta
   * moverlo a Storage antes de subir, un navegador con JS viejo o un upload
   * fallido lo reinyecta y el documento vuelve a pesar MBs (el problema que
   * tumbaba el guardado). Aquí, en el ÚLTIMO punto antes de escribir, todo
   * dataURL se sube al bucket y se reemplaza por su URL pública. */
  const DATAURL_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;
  const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };
  const MAX_INLINE_BYTES = 30 * 1024 * 1024;
  const MAX_INLINE_POR_GUARDADO = 10;

  async function subirInline(dataUrl, tag) {
    const m = String(dataUrl).match(DATAURL_RE);
    if (!m) return null;
    let buf;
    try { buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64'); } catch (e) { return null; }
    if (!buf || !buf.length || buf.length > MAX_INLINE_BYTES) return null;
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
    const ruta = 'inline/' + String(tag).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60)
      + '-' + hash + '.' + (MIME_EXT[m[1]] || 'bin');
    try {
      const { error } = await withTimeout(sb.storage.from(MEDIA_BUCKET).upload(ruta, buf, { contentType: m[1], upsert: true }), 'storage:inline', 15000);
      if (error && !/exists|duplicate|already/i.test(error.message)) throw new Error(error.message);
      return sb.storage.from(MEDIA_BUCKET).getPublicUrl(ruta).data.publicUrl;
    } catch (e) {
      console.warn('[backend] no se pudo externalizar archivo embebido:', e.message);
      return null;
    }
  }

  /* Archivo que solo existe en este equipo (/uploads/<nombre>): se sube al
   * bucket para que la URL sirva desde cualquier sitio. Nombre con huella para
   * no pisar otros archivos homónimos de otro equipo. */
  async function externalizarUploadLocal(nombre, buf) {
    if (!buf || !buf.length) return null;
    const mime = uploads.mimeDe(nombre);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const limpio = String(nombre).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
    const ruta = 'migrados/' + hash + '-' + limpio;
    try {
      const { error } = await withTimeout(
        sb.storage.from(MEDIA_BUCKET).upload(ruta, buf, { contentType: mime, upsert: true }),
        'storage:uploads-local', 15000);
      if (error && !/exists|duplicate|already/i.test(error.message)) throw new Error(error.message);
      return sb.storage.from(MEDIA_BUCKET).getPublicUrl(ruta).data.publicUrl;
    } catch (e) {
      console.warn('[backend] no se pudo migrar /uploads/' + nombre + ':', e.message);
      return null;
    }
  }

  /* Recorre el valor y reemplaza dataURLs por URLs de Storage. Muta `value`. */
  async function externalizarInline(value, tag) {
    let hechos = 0;
    const nodos = [];
    (function walk(node, depth) {
      if (!node || typeof node !== 'object' || depth > 6) return;
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'string') {
          if (v.length > 64 && v.startsWith('data:')) nodos.push({ node, k, v });
        } else if (v && typeof v === 'object') walk(v, depth + 1);
      }
    })(value, 0);
    for (const n of nodos) {
      if (hechos >= MAX_INLINE_POR_GUARDADO) break;
      const url = await subirInline(n.v, tag);
      if (url) { n.node[n.k] = url; hechos++; }
    }
    return hechos;
  }

  /* Ticker de versiones por colección (tabla pública collection_versions):
   * cada guardado avisa QUÉ cambió para que los otros PCs hagan pull
   * quirúrgico en tiempo real, sin exponer datos. Best-effort con timeout
   * corto: jamás rompe el guardado. */
  let versionsReady = null; // null = sin probar · true = tabla ok · false = usar public_feed

  /* Sin la tabla (migración no ejecutada) el ticker viaja por public_feed, que
   * YA está en la publicación realtime y es de lectura pública. Así el
   * "subo contenido y aparece en los otros equipos" funciona sin pedirle al
   * usuario que corra SQL a mano. */
  async function touchViaFeed(list) {
    const rows = list.map((c) => ({ kind: 'version:' + c, title: 'sync', body: '' }));
    const { error } = await withTimeout(sb.from('public_feed').insert(rows), 'touchFeed', 8000);
    if (error) throw new Error('Supabase version feed: ' + error.message);
    // Poda best-effort de las marcas viejas (el feed visible no las incluye).
    sb.from('public_feed').delete().like('kind', 'version:%')
      .lt('created_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString())
      .then(() => {}, () => {});
  }
  async function touchVersions(cols) {
    const list = (cols || []).filter(Boolean);
    if (!list.length) return;
    if (versionsReady === false) return touchViaFeed(list);
    const ts = new Date().toISOString();
    try {
      const { error } = await withTimeout(
        sb.from('collection_versions').upsert(
          list.map((c) => ({ collection: c, updated_at: ts })), { onConflict: 'collection' }),
        'touchVersions', 8000);
      if (error) throw new Error(error.message);
      versionsReady = true;
      return;
    } catch (e) {
      if (versionsReady === null) {
        console.warn('[backend] collection_versions ausente: ticker por public_feed —', e.message);
      }
      versionsReady = false;
      return touchViaFeed(list);
    }
  }

  /* ---- Estado compartido de una fila (cuota de IA, intentos de login) ----
   * Un documento por clave en `documents`: lo ven TODAS las instancias
   * serverless, que es justo lo que un contador en memoria no consigue. */
  async function getEstado(collection, docId) {
    const { data, error } = await withRetry(() => sb.from('documents')
      .select('data,updated_at').eq('collection', collection).eq('doc_id', String(docId)).maybeSingle());
    if (error) throw new Error('Supabase estado: ' + error.message);
    return data ? { ...(data.data || {}), _updatedAt: data.updated_at } : null;
  }

  async function putEstado(collection, docId, value) {
    const { error } = await withRetry(() => sb.from('documents').upsert(
      [{ collection, doc_id: String(docId), updated_at: new Date().toISOString(), data: value || {} }],
      { onConflict: 'collection,doc_id' }));
    if (error) throw new Error('Supabase estado (put): ' + error.message);
  }

  /* Incremento ATÓMICO de un contador (cuota IA / rate-limit).
   * La función SQL `bump_document_number` hace el UPSERT en una sola
   * sentencia, así Postgres serializa la fila y dos instancias no se pisan.
   * Si la migración no está aplicada, cae al GET+PUT de siempre: funciona,
   * pero bajo concurrencia puede perder incrementos. */
  let bumpRpcReady = null;
  async function bumpEstado(collection, docId, field, delta) {
    const n = Number(delta) || 0;
    if (bumpRpcReady !== false) {
      try {
        const { data, error } = await withRetry(() => sb.rpc('bump_document_number', {
          p_collection: collection,
          p_doc_id: String(docId),
          p_field: String(field),
          p_delta: n,
        }));
        if (error) throw new Error(error.message);
        bumpRpcReady = true;
        const row = Array.isArray(data) ? data[0] : data;
        return Number((row && row[field]) || 0);
      } catch (e) {
        if (bumpRpcReady === null) {
          console.warn('[backend] contador atómico no disponible; aplica supabase/migration_rate_limit.sql —', e.message);
        }
        bumpRpcReady = false;
      }
    }
    const cur = await getEstado(collection, docId);
    const base = { ...(cur || {}) };
    delete base._updatedAt;
    const next = Math.max(0, Number(base[field] || 0) + n);
    await putEstado(collection, docId, { ...base, [field]: next });
    return next;
  }

  /* Poda best-effort de filas de estado viejas (no rompe nada si falla). */
  async function pruneEstado(collection, antesDeMs) {
    try {
      await sb.from('documents').delete()
        .eq('collection', collection)
        .lt('updated_at', new Date(Number(antesDeMs) || 0).toISOString());
    } catch (e) { /* best-effort */ }
  }

  /* Acceso crudo para herramientas de mantenimiento (migraciones): leen y
   * escriben filas suelas, sin pasar por la caché del store. */
  async function loadRawDocuments() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await withRetry(
        () => sb.from('documents').select('collection,doc_id,data').range(from, from + 999));
      if (error) throw new Error('Supabase documents: ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function putRawDocument(collection, doc_id, data) {
    const { error } = await withRetry(() => sb.from('documents').upsert(
      [{ collection, doc_id, updated_at: new Date().toISOString(), data }],
      { onConflict: 'collection,doc_id' }));
    if (error) throw new Error('Supabase documents (put): ' + error.message);
  }

  async function saveDocuments(obj) {
    // Fallback total (seed/boot). Las rutas usan saveCollections (quirúrgico).
    const names = Object.keys(obj || {}).filter(
      (k) => k === 'users' || Array.isArray(obj[k]) || (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]))
    );
    await saveCollections(obj, names);
  }

  /* Persist quirúrgico: solo las colecciones tocadas. Cada mutación hace
   * refreshIfStale() antes, así la caché está fresca y el borrado de
   * "ausentes" se limita a la colección tocada: dos instancias tocando
   * colecciones distintas ya no se pisan (fin del write-through total). */
  async function saveCollections(obj, names) {
    const wanted = new Set(names || []);
    const seenRows = new Map();
    for (const [collection, items] of Object.entries(obj || {})) {
      if (!wanted.has(collection)) continue;
      if (collection === 'users') continue;
      if (Array.isArray(items)) {
        for (const item of items) {
          const doc_id = String(item.id ?? Date.now());
          // updated_at explícito: la tabla no tiene trigger, sin esto la fila
          // parece congelada en Supabase aunque el contenido cambie.
          const ts = new Date().toISOString();
          seenRows.set(collection + '∅' + doc_id, { collection, doc_id, updated_at: ts, data: { ...item, id: undefined } });
        }
      } else if (items && typeof items === 'object') {
        // Colección-objeto: UNA fila con el objeto completo (sin id que quitar).
        seenRows.set(collection + '∅__object__', { collection, doc_id: '__object__', updated_at: new Date().toISOString(), data: items });
      }
    }
    // Auditoría: se compacta antes de hashear/subir (nunca fotos completas).
    for (const [key, row] of seenRows) {
      if (row.collection === 'auditoria') seenRows.set(key, { ...row, data: compactAuditRow(row.data) });
    }
    /* Garantía: ningún documento se guarda con archivos dentro. Se hace antes
     * de la huella para que el hash describa lo que realmente se persiste. */
    for (const [key, row] of seenRows) {
      let json = '';
      try { json = JSON.stringify(row.data); } catch (e) { continue; }
      if (json.indexOf('data:') === -1) continue;
      const n = await externalizarInline(row.data, row.collection + '-' + row.doc_id);
      if (n) seenRows.set(key, { ...row, data: row.data });
    }
    /* Igual con las rutas /uploads/… del backend local: o se suben al bucket, o
     * se quitan. Así la base compartida nunca guarda una URL que solo existe en
     * el ordenador donde se subió (era el origen de las portadas en blanco).
     * Va antes de la huella para que el hash describa lo que se persiste. */
    for (const [key, row] of seenRows) {
      let json = '';
      try { json = JSON.stringify(row.data); } catch (e) { continue; }
      if (json.indexOf('/uploads/') === -1) continue;
      const r = await uploads.migrarValor(row.data, async (nombre) => {
        const buf = uploads.leerLocal(uploadsDir, nombre);
        return buf ? externalizarUploadLocal(nombre, buf) : null;
      });
      if (r.migradas || r.quitadas) {
        console.warn('[backend] ' + row.collection + '/' + row.doc_id + ': ' +
          r.migradas + ' archivo(s) local(es) migrados, ' + r.quitadas + ' referencia(s) muerta(s) retiradas');
      }
      seenRows.set(key, { ...row, data: row.data });
    }
    const seen = new Set();
    const pendingHash = new Map();
    let rows = [...seenRows.values()];
    // Filtro "sin cambios": si la huella coincide con lo ya persistido, la
    // fila no se re-suben pero cuenta como presente (no se borra del lote ausente).
    rows = rows.filter((r) => {
      const key = r.collection + '∅' + r.doc_id;
      const h = h1(r.data);
      if (savedHash.get(key) === h) { seen.add(key); return false; }
      pendingHash.set(key, h);
      return true;
    });
    // Auditoría incremental: filtra las entradas ya persistidas (siguen
    // "vistas" para que el borrado de ausentes no las toque).
    if (rows.some((r) => r.collection === 'auditoria')) {
      rows = rows.filter((r) => {
        if (r.collection !== 'auditoria') return true;
        return !auditSavedIds.has(r.collection + '∅' + r.doc_id);
      });
    }
    // Guarda anti-cuelgue: un documento con base64 embebido de MBs colgaba el
    // upsert (statement timeout) y rompía el sync. Los archivos van por /api/media.
    for (const r of rows) {
      let bytes = 0;
      try { bytes = Buffer.byteLength(JSON.stringify(r.data), 'utf8'); } catch (e) { /* no medible: pasa */ }
      if (bytes > MAX_DOC_BYTES) {
        const err = new Error('Documento ' + r.collection + '/' + r.doc_id + ' demasiado grande (' +
          (bytes / 1048576).toFixed(1) + ' MB, límite ' + (MAX_DOC_BYTES / 1048576).toFixed(0) +
          ' MB). Sube el archivo por /api/media en vez de foto embebida.');
        err.status = 413;
        throw err;
      }
    }
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      if (!chunk.length || !chunk[0].collection) continue;
      await withRetry(() => sb.from('documents').upsert(chunk, { onConflict: 'collection,doc_id' }), 3)
        .then(({ error }) => { if (error) throw new Error('Supabase upsert: ' + error.message); });
      chunk.forEach((r) => {
        const key = r.collection + '∅' + r.doc_id;
        seen.add(key);
        if (pendingHash.has(key)) savedHash.set(key, pendingHash.get(key));
        if (r.collection === 'auditoria') auditSavedIds.add(key);
      });
    }
    // La auditoría ya guardada nunca se considera "borrable": sus claves
    // cuentan como presentes aunque no se hayan re-subido en este lote.
    auditSavedIds.forEach((k) => seen.add(k));
    // Nota: el stale-delete solo corre para colecciones array/objeto normales;
    // auditoría (append-only) queda fuera.
    const touched = [...wanted].filter((c) => c !== 'users' && c !== 'auditoria');
    if (touched.length) {
      try {
        const { data: existing } = await withRetry(
          () => sb.from('documents').select('collection,doc_id').in('collection', touched), 2);
        const stale = (existing || []).filter((r) => !seen.has(r.collection + '∅' + r.doc_id));
        for (const r of stale) {
          try {
            await sb.from('documents').delete().eq('collection', r.collection).eq('doc_id', r.doc_id);
            savedHash.delete(r.collection + '∅' + r.doc_id);
          } catch (eDel) { /* no bloquea: el upsert nuevo ya está guardado */ }
        }
      } catch (eStale) { /* si el select de control falla, no revierte lo ya guardado */ }
    }
    // Usuarios: solo si se tocó 'users' (ruta /api/users). Upsert + borrado
    // de ausentes contra la lista completa (el caller hizo refresh antes).
    if (wanted.has('users')) {
      const users = Array.isArray(obj.users) ? obj.users : [];
      // Avatares en base64 → Storage (mismo motivo que los documentos).
      for (const u of users) {
        if (u && typeof u.avatar === 'string' && u.avatar.startsWith('data:') && u.avatar.length > 64) {
          const url = await subirInline(u.avatar, 'avatar-u' + u.id);
          if (url) u.avatar = url;
        }
      }
      if (users.length) {
        const { error } = await withRetry(() => sb.from('app_users').upsert(users.map(toUserRow), { onConflict: 'id' }))
          .then((r) => r);
        if (error) throw new Error('Supabase users upsert: ' + error.message);
      }
      const { data: eu, error: eSel } = await withRetry(() => sb.from('app_users').select('id'));
      if (eSel) throw new Error('Supabase users select: ' + eSel.message);
      const keep = new Set(users.map((u) => String(u.id)));
      const gone = (eu || []).map((r) => r.id).filter((id) => !keep.has(String(id)));
      /* Guarda: una lista vacía o que de golpe pierde casi todos los usuarios
       * casi siempre es una lectura fallida, no un borrado real. Se niega el
       * borrado masivo; el borrado puntual de DELETE /api/users/:id sí pasa
       * (deja solo un id ausente). */
      const masivo = gone.length > 1 && (users.length === 0 || gone.length > (eu || []).length / 2);
      if (masivo) throw new Error('Sync de usuarios bloqueado: borrado masivo sospechoso (' + gone.length + ' de ' + (eu || []).length + ')');
      if (gone.length) {
        const { error } = await withRetry(() => sb.from('app_users').delete().in('id', gone));
        if (error) throw new Error('Supabase users delete: ' + error.message);
      }
    }
    // Ticker realtime entre PCs (ver touchVersions): avisa qué cambió.
    const bump = [...wanted].filter((c) => c && c !== 'auditoria');
    if (bump.length) {
      try { await touchVersions(bump); } catch (e) { /* solo aviso */ }
    }
  }

  return {
    kind: 'supabase',
    cacheTtlMs: 30 * 1000, // caché cálida 30s; sesiones/usuarios auth siempre en directo y escrituras hacen refresh quirúrgico
    loadDocuments,
    loadCollections,
    saveDocuments,
    saveCollections,
    touchVersions,
    async pushAudit(entry) {
      const rec = entry || {};
      const doc_id = String(rec.id ?? Date.now());
      const key = 'auditoria∅' + doc_id;
      await withRetry(() => sb.from('documents').upsert(
        [{ collection: 'auditoria', doc_id, updated_at: new Date().toISOString(), data: { ...rec, id: undefined } }],
        { onConflict: 'collection,doc_id' }
      )).then(({ error }) => { if (error) throw new Error('Supabase audit: ' + error.message); });
      auditSavedIds.add(key);
      return rec;
    },
    async getUserByUsername(username) {
      const { data, error } = await sb.from('app_users').select('*')
        .ilike('username', String(username)).limit(1).maybeSingle();
      if (error) throw new Error('Supabase user: ' + error.message);
      return data ? fromUserRow(data) : null;
    },
    async getUserById(id) {
      const { data, error } = await sb.from('app_users').select('*').eq('id', String(id)).maybeSingle();
      if (error) throw new Error('Supabase user: ' + error.message);
      return data ? fromUserRow(data) : null;
    },
    async listUsers() {
      const { data, error } = await sb.from('app_users').select('*');
      if (error) throw new Error('Supabase users: ' + error.message);
      return (data || []).map(fromUserRow);
    },
    async upsertUser(row) {
      const { error } = await sb.from('app_users').upsert(toUserRow(row), { onConflict: 'id' });
      if (error) throw new Error('Supabase user upsert: ' + error.message);
    },
    async deleteUser(id) {
      const { error } = await sb.from('app_users').delete().eq('id', String(id));
      if (error) throw new Error('Supabase user delete: ' + error.message);
    },
    async getSession(token) {
      const { data, error } = await sb.from('app_sessions').select('*').eq('token', token).maybeSingle();
      if (error) throw new Error('Supabase session: ' + error.message);
      return data ? { userId: data.user_id, expiresAt: new Date(data.expires_at).getTime() } : null;
    },
    async setSession(token, s) {
      const { error } = await sb.from('app_sessions').upsert({
        token, user_id: String(s.userId), expires_at: new Date(s.expiresAt).toISOString(),
      }, { onConflict: 'token' });
      if (error) throw new Error('Supabase session save: ' + error.message);
    },
    async deleteSession(token) {
      await sb.from('app_sessions').delete().eq('token', token);
    },
    /* Poda de sesiones vencidas (una vez por hora y por instancia, ver
     * sessions.sweep). Devuelve cuántas filas borró; el conteo es best-effort
     * (`select('token')` da el número exacto sin descargar el resto). */
    async pruneSessions(beforeMs) {
      const iso = new Date(Number(beforeMs) || Date.now()).toISOString();
      const { data, error } = await sb.from('app_sessions')
        .delete()
        .lt('expires_at', iso)
        .select('token');
      if (error) throw new Error('Supabase session prune: ' + error.message);
      return Array.isArray(data) ? data.length : 0;
    },
    async pushFeed(item) {
      const base = { kind: item.kind || 'aviso', title: item.title || '', body: item.body || '' };
      const full = { ...base };
      if (item.image_url) full.image_url = item.image_url;
      if (item.media_kind) full.media_kind = item.media_kind;
      let { data, error } = await withTimeout(sb.from('public_feed').insert(full).select().single(), 'pushFeed');
      if (error && /image_url|media_kind|column/i.test(error.message)) {
        // Pre-migración (sin migration_media.sql): reintenta sin columnas nuevas.
        ({ data, error } = await sb.from('public_feed').insert(base).select().single());
      }
      if (error) throw new Error('Supabase feed: ' + error.message);
      /* Poda best-effort: el feed crecía sin cota (llegó a 5.000 filas).
       * Se conservan 7 días; las marcas del ticker ya se podan a las 12h. */
      sb.from('public_feed').delete()
        .lt('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
        .then(() => {}, () => {});
      return data;
    },
    async listFeed(limit) {
      // Fuera las marcas internas del ticker (kind 'version:…').
      const { data, error } = await sb.from('public_feed').select('*')
        .not('kind', 'like', 'version:%')
        .order('created_at', { ascending: false }).limit(Math.min(Number(limit) || 20, 50));
      if (error) throw new Error('Supabase feed list: ' + error.message);
      return data || [];
    },
    /* ---- Storage de archivos (bucket público; subidas firmadas) ---- */
    async ensureMediaBucket() {
      if (bucketReady) return;
      const { error } = await withTimeout(sb.storage.createBucket(MEDIA_BUCKET, { public: true }), 'storage:createBucket');
      if (error && !/exists|duplicate|already/i.test(error.message)) {
        throw new Error('Supabase bucket: ' + error.message);
      }
      bucketReady = true;
    },
    externalizarUploadLocal,
    getEstado,
    putEstado,
    bumpEstado,
    pruneEstado,
    loadRawDocuments,
    putRawDocument,
    async signUpload(storagePath) {
      const { data, error } = await sb.storage.from(MEDIA_BUCKET).createSignedUploadUrl(storagePath);
      if (error) throw new Error('Supabase sign: ' + error.message);
      return { uploadUrl: data.signedUrl, publicUrl: this.publicUrl(storagePath) };
    },
    publicUrl(storagePath) {
      return sb.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    },
    async storageExists(storagePath) {
      const dir = storagePath.split('/').slice(0, -1).join('/') || '';
      const name = storagePath.split('/').pop();
      const { data, error } = await sb.storage.from(MEDIA_BUCKET).list(dir || undefined, { search: name });
      if (error) throw new Error('Supabase storage list: ' + error.message);
      return (data || []).some((f) => f.name === name && (f.metadata?.size ?? 1) > 0);
    },
  };
}

module.exports = { createSupabaseAdapter };
