'use strict';
/* Adaptador Supabase (producción en Vercel + realtime).
 * Usa la SERVICE key (o la nueva `sb_secret_*`) SOLO en servidor: bypass RLS.
 * El navegador jamás la ve; solo recibe la ANON key vía /api/public/config
 * y RLS le permite leer únicamente `public_feed`.
 * Tablas (ver supabase/schema.sql): documents, app_users, app_sessions, public_feed. */
const { createClient } = require('@supabase/supabase-js');

const toUserRow = (u) => ({
  id: String(u.id),
  username: u.username,
  role: u.role,
  profile: {
    name: u.name, email: u.email, phone: u.phone, avatar: u.avatar,
    xp: u.xp, students: u.students, level: u.level, streak: u.streak, badges: u.badges,
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
  passwordHash: r.password_hash,
  mustChangePassword: !!r.must_change,
});

const MEDIA_BUCKET = 'portal-media';

function createSupabaseAdapter({ url, serviceKey }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  async function loadDocuments() {
    const out = {};
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await sb.from('documents').select('collection,doc_id,data').range(from, from + PAGE - 1);
      if (error) throw new Error('Supabase documents: ' + error.message);
      for (const row of data) {
        out[row.collection] = out[row.collection] || [];
        out[row.collection].push({ id: row.doc_id, ...(row.data || {}) });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const { data: users, error: uerr } = await sb.from('app_users').select('*');
    if (uerr) throw new Error('Supabase users: ' + uerr.message);
    out.users = (users || []).map(fromUserRow);
    return out;
  }

  async function saveDocuments(obj) {
    // Write-through completo (escala del portal: decenas de filas por mutación).
    // Dedup por (collection, doc_id): el legacy puede traer ids repetidos
    // (Date.now) y Postgres aborta el upsert si un conflicto se toca 2 veces.
    const seenRows = new Map();
    for (const [collection, items] of Object.entries(obj || {})) {
      if (collection === 'users') continue;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const doc_id = String(item.id ?? Date.now());
        seenRows.set(collection + '∅' + doc_id, { collection, doc_id, data: { ...item, id: undefined } });
      }
    }
    const rows = [...seenRows.values()];
    const seen = new Set();
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows[i].collection ? rows.slice(i, i + 500) : [];
      const { error } = await sb.from('documents').upsert(chunk, { onConflict: 'collection,doc_id' });
      if (error) throw new Error('Supabase upsert: ' + error.message);
      chunk.forEach((r) => seen.add(r.collection + '∅' + r.doc_id));
    }
    // Borra lo que ya no existe en caché.
    const { data: existing } = await sb.from('documents').select('collection,doc_id');
    const stale = (existing || []).filter((r) => !seen.has(r.collection + '∅' + r.doc_id));
    for (let i = 0; i < stale.length; i += 200) {
      const chunk = stale.slice(i, i + 200);
      for (const r of chunk) {
        await sb.from('documents').delete().eq('collection', r.collection).eq('doc_id', r.doc_id);
      }
    }
    // Usuarios: upsert + borrado de ausentes.
    const users = Array.isArray(obj.users) ? obj.users : [];
    if (users.length) {
      const { error } = await sb.from('app_users').upsert(users.map(toUserRow), { onConflict: 'id' });
      if (error) throw new Error('Supabase users upsert: ' + error.message);
    }
    const { data: eu } = await sb.from('app_users').select('id');
    const keep = new Set(users.map((u) => String(u.id)));
    const gone = (eu || []).map((r) => r.id).filter((id) => !keep.has(String(id)));
    if (gone.length) {
      const { error } = await sb.from('app_users').delete().in('id', gone);
      if (error) throw new Error('Supabase users delete: ' + error.message);
    }
  }

  return {
    kind: 'supabase',
    cacheTtlMs: 10 * 1000, // caché cálida 10s; sesiones/usuarios auth siempre en directo
    loadDocuments,
    saveDocuments,
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
