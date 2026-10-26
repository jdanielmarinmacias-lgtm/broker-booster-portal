'use strict';
/* Adaptador Supabase (producción en Vercel + realtime).
 * Usa la SERVICE key (o la nueva `sb_secret_*`) SOLO en servidor: bypass RLS.
 * El navegador jamás la ve; solo recibe la ANON key vía /api/public/config
 * y RLS le permite leer únicamente `public_feed`.
 * Tablas (ver supabase/schema.sql): documents, app_users, app_sessions, public_feed. */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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

function createSupabaseAdapter({ url, serviceKey }) {
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
  async function withRetry(fn, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
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

  async function loadDocuments() {
    const out = {};
    const objects = {}; // colecciones-objeto (doc_id __object__)
    let from = 0;
    const PAGE = 1000;
    const usersPromise = sb.from('app_users').select('*');
    for (;;) {
      const { data, error } = await sb.from('documents').select('collection,doc_id,data').range(from, from + PAGE - 1);
      if (error) throw new Error('Supabase documents: ' + error.message);        for (const row of data) {
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
    if (wanted.length) {
      let from = 0;
      const PAGE = 1000;
      const objects = {};
      for (;;) {
        const { data, error } = await sb.from('documents')
          .select('collection,doc_id,data')
          .in('collection', wanted)
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
      if (users.length) {
        const { error } = await withRetry(() => sb.from('app_users').upsert(users.map(toUserRow), { onConflict: 'id' }))
          .then((r) => r);
        if (error) throw new Error('Supabase users upsert: ' + error.message);
      }
      const { data: eu, error: eSel } = await withRetry(() => sb.from('app_users').select('id'));
      if (eSel) throw new Error('Supabase users select: ' + eSel.message);
      const keep = new Set(users.map((u) => String(u.id)));
      const gone = (eu || []).map((r) => r.id).filter((id) => !keep.has(String(id)));
      if (gone.length) {
        const { error } = await withRetry(() => sb.from('app_users').delete().in('id', gone));
        if (error) throw new Error('Supabase users delete: ' + error.message);
      }
    }
  }

  return {
    kind: 'supabase',
    cacheTtlMs: 30 * 1000, // caché cálida 30s; sesiones/usuarios auth siempre en directo y escrituras hacen refresh quirúrgico
    loadDocuments,
    loadCollections,
    saveDocuments,
    saveCollections,
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
    async pushFeed(item) {
      const base = { kind: item.kind || 'aviso', title: item.title || '', body: item.body || '' };
      const full = { ...base };
      if (item.image_url) full.image_url = item.image_url;
      if (item.media_kind) full.media_kind = item.media_kind;
      let { data, error } = await sb.from('public_feed').insert(full).select().single();
      if (error && /image_url|media_kind|column/i.test(error.message)) {
        // Pre-migración (sin migration_media.sql): reintenta sin columnas nuevas.
        ({ data, error } = await sb.from('public_feed').insert(base).select().single());
      }
      if (error) throw new Error('Supabase feed: ' + error.message);
      return data;
    },
    async listFeed(limit) {
      const { data, error } = await sb.from('public_feed').select('*')
        .order('created_at', { ascending: false }).limit(Math.min(Number(limit) || 20, 50));
      if (error) throw new Error('Supabase feed list: ' + error.message);
      return data || [];
    },
    /* ---- Storage de archivos (bucket público; subidas firmadas) ---- */
    async ensureMediaBucket() {
      const { error } = await sb.storage.createBucket(MEDIA_BUCKET, { public: true });
      if (error && !/exists|duplicate|already/i.test(error.message)) {
        throw new Error('Supabase bucket: ' + error.message);
      }
    },
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
