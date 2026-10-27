'use strict';
/* ============================================================================
 * scripts/audit-data.js — Auditoría de integridad de la base real (SOLO LECTURA)
 *
 * Revisa: identificadores, usuarios, referencias cruzadas entre colecciones,
 * fechas inválidas, documentos vacíos, URLs de media inalcanzables, estado del
 * realtime (collection_versions), sesiones y tamaño por colección.
 *
 * Uso: cd backend && node scripts/audit-data.js
 * Salida: informe legible + backend/backups/audit-<fecha>.json
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { createClient } = require('@supabase/supabase-js');

const out = { generatedAt: new Date().toISOString(), problemas: [], resumen: {} };
const prob = (severidad, area, detalle) => out.problemas.push({ severidad, area, detalle });

(async () => {
  const sb = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });

  // ---------- 1. Documentos ----------
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents').select('collection,doc_id,data,updated_at').range(from, from + 999);
    if (error) { console.error('documents:', error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const root = {};
  const objects = {};
  for (const r of rows) {
    if (r.doc_id === '__object__') { objects[r.collection] = r.data || {}; continue; }
    (root[r.collection] = root[r.collection] || []).push({ id: r.doc_id, ...(r.data || {}) });
  }
  Object.assign(root, objects);

  const sizes = {};
  let totalBytes = 0;
  for (const r of rows) {
    const b = Buffer.byteLength(JSON.stringify(r.data || {}), 'utf8');
    totalBytes += b;
    sizes[r.collection] = sizes[r.collection] || { filas: 0, bytes: 0, mayor: 0 };
    sizes[r.collection].filas++;
    sizes[r.collection].bytes += b;
    sizes[r.collection].mayor = Math.max(sizes[r.collection].mayor, b);
  }
  out.resumen.totalBytes = totalBytes;
  out.resumen.filas = rows.length;
  out.resumen.colecciones = Object.keys(sizes).length;

  // Documentos gigantes (> 500 KB) que volverían a frenar el guardado
  for (const r of rows) {
    const b = Buffer.byteLength(JSON.stringify(r.data || {}), 'utf8');
    if (b > 500 * 1024) prob('alta', 'tamaño', `${r.collection}/${r.doc_id} pesa ${(b / 1048576).toFixed(2)} MB`);
  }
  // Archivos embebidos (base64) que deberían estar en Storage
  for (const r of rows) {
    if (r.collection === 'auditoria') continue;
    const n = (JSON.stringify(r.data || {}).match(/"data:[a-z]+\/[a-z0-9.+-]+;base64,/gi) || []).length;
    if (n) prob('alta', 'archivos', `${r.collection}/${r.doc_id}: ${n} archivo(s) en base64 dentro del JSON`);
  }

  // ---------- 2. Usuarios ----------
  const { data: userRows, error: uerr } = await sb.from('app_users').select('id,username,role,profile,password_hash,must_change');
  if (uerr) { console.error('app_users:', uerr.message); process.exit(1); }
  const users = userRows || [];
  out.resumen.usuarios = users.length;
  const userIds = new Set(users.map((u) => String(u.id)));
  const byUsername = {};
  for (const u of users) {
    const k = String(u.username || '').toLowerCase();
    if (!k) prob('alta', 'usuarios', `usuario ${u.id} sin username`);
    if (byUsername[k]) prob('alta', 'usuarios', `username duplicado: ${u.username}`);
    byUsername[k] = true;
    if (!u.role) prob('alta', 'usuarios', `usuario ${u.id} sin rol`);
    if (!u.password_hash) prob('alta', 'usuarios', `usuario ${u.username} sin contraseña (no puede entrar)`);
    if (!u.profile || !u.profile.name) prob('media', 'usuarios', `usuario ${u.username} sin nombre visible`);
    const av = u.profile && u.profile.avatar;
    if (typeof av === 'string' && av.startsWith('data:')) prob('alta', 'usuarios', `avatar de ${u.username} en base64 (${Math.round(av.length / 1024)} KB en cada /me)`);
  }

  // ---------- 3. Referencias entre colecciones ----------
  const refCheck = (col, rec, field, targetSet, label) => {
    const v = rec[field];
    if (v === undefined || v === null || v === '') return;
    const arr = Array.isArray(v) ? v : [v];
    for (const x of arr) {
      if (String(x) === '' || userIds.has(String(x))) continue;
      prob('media', 'referencias', `${col}/${rec.id}: ${label || field}=${x} no existe en usuarios`);
      return;
    }
  };
  for (const col of ['ventas', 'cotizaciones', 'siniestros', 'solicitudes', 'posts', 'messages', 'groupMessages', 'progress', 'enrollments', 'taskSubmissions', 'examAttempts', 'invitaciones']) {
    for (const rec of root[col] || []) {
      if (!rec || typeof rec !== 'object') continue;
      if (rec.id === undefined) prob('alta', 'integridad', `${col}: registro sin id`);
      ['usuarioId', 'agenteId', 'fromId', 'toId', 'authorId', 'userId', 'alumnoId', 'studentId', 'maestroId', 'creadoPorId', 'creatorId'].forEach((f) => {
        if (f === 'toId' && String(rec.toId || '').startsWith('grupo:')) return;
        if (f === 'toId' && String(rec.toId || '').startsWith('canal')) return;
        refCheck(col, rec, f, userIds, f);
      });
      refCheck(col, rec, 'students', userIds);
      refCheck(col, rec, 'memberIds', userIds);
      refCheck(col, rec, 'adminIds', userIds);
      refCheck(col, rec, 'readBy', userIds);
      // fechas
      ['fecha', 'createdAt', 'updatedAt', 'lastActive'].forEach((f) => {
        const v = rec[f];
        if (typeof v === 'string' && v && !/^\d{4}-\d{2}-\d{2}/.test(v) && isNaN(Date.parse(v))) {
          prob('baja', 'fechas', `${col}/${rec.id}: ${f} inválida (${String(v).slice(0, 30)})`);
        }
      });
    }
  }
  // Ids duplicados dentro de la misma colección
  for (const [col, items] of Object.entries(root)) {
    if (!Array.isArray(items)) continue;
    const seen = new Set();
    for (const it of items) {
      const k = String(it && it.id);
      if (seen.has(k)) prob('alta', 'integridad', `${col}: id duplicado ${k}`);
      seen.add(k);
    }
  }
  // Grupos de chat vs miembros
  for (const g of root.chatGroups || []) {
    const miembros = [].concat(g.memberIds || [], g.adminIds || [], g.creatorId || []);
    if (!miembros.length) prob('media', 'chat', `chatGroups/${g.id} sin miembros ni creador`);
    if (!g.name && !g.nombre) prob('baja', 'chat', `chatGroups/${g.id} sin nombre`);
  }
  // Mensajes a grupos inexistentes
  const groupIds = new Set((root.chatGroups || []).map((g) => String(g.id)));
  for (const m of root.messages || []) {
    const to = String(m.toId || '');
    if (to.startsWith('grupo:') && !groupIds.has(to.slice(6))) {
      prob('media', 'chat', `messages/${m.id} apunta al grupo inexistente ${to}`);
    }
  }

  // ---------- 4. Media (URLs alcanzables) ----------
  const mediaItems = root.media || [];
  let rotas = 0;
  for (const m of mediaItems.slice(-20)) {
    const u = m.url || '';
    if (!/^https?:\/\//.test(u)) { prob('media', 'media', `media/${m.id}: URL no absoluta (${String(u).slice(0, 40)})`); continue; }
    try {
      const res = await fetch(u, { method: 'HEAD' });
      if (!res.ok) { rotas++; prob('alta', 'media', `media/${m.id}: HTTP ${res.status} — ${u.slice(0, 80)}`); }
    } catch (e) { rotas++; prob('media', 'media', `media/${m.id}: no responde (${e.message})`); }
  }
  out.resumen.mediaRevisadas = Math.min(mediaItems.length, 20);
  out.resumen.mediaRotas = rotas;

  // ---------- 5. Realtime / sesiones ----------
  const { error: verr } = await sb.from('collection_versions').select('collection').limit(1);
  out.resumen.collectionVersions = verr ? 'AUSENTE (se usa public_feed como ticker)' : 'OK';
  if (verr) prob('info', 'realtime', 'tabla collection_versions ausente: el ticker usa public_feed (funciona)');
  const { data: feed } = await sb.from('public_feed').select('id,kind,created_at').order('created_at', { ascending: false }).limit(1000);
  const marcadores = (feed || []).filter((f) => String(f.kind || '').startsWith('version:')).length;
  out.resumen.feed = { total: (feed || []).length, marcadores };
  if (marcadores > 200) prob('media', 'realtime', `${marcadores} marcas 'version:*' acumuladas en public_feed`);
  const { data: ses } = await sb.from('app_sessions').select('token,expires_at');
  const expiradas = (ses || []).filter((s) => new Date(s.expires_at).getTime() < Date.now());
  out.resumen.sesiones = { total: (ses || []).length, expiradas: expiradas.length };
  if (expiradas.length) prob('baja', 'sesiones', `${expiradas.length} sesiones expiradas sin borrar`);

  // ---------- 6. Configuración esperada ----------
  const st = objects.settings || {};
  ['institutionName', 'logo'].forEach((k) => { if (!st[k]) prob('baja', 'config', `settings.${k} vacío`); });
  if (!Array.isArray(root.rolePermissions) && !objects.rolePermissions) {
    prob('media', 'config', 'rolePermissions ausente: el portal usa la matriz por defecto');
  }

  out.resumen.tamanos = Object.fromEntries(Object.entries(sizes)
    .map(([k, v]) => [k, { filas: v.filas, mb: +(v.bytes / 1048576).toFixed(3) }])
    .sort((a, b) => b[1].mb - a[1].mb));

  // ---------- Informe ----------
  const porSeveridad = { alta: [], media: [], baja: [], info: [] };
  out.problemas.forEach((p) => porSeveridad[p.severidad].push(p));
  console.log('=== AUDITORÍA DE DATOS ===');
  console.log('Filas:', out.resumen.filas, '· colecciones:', out.resumen.colecciones, '· peso:', (totalBytes / 1048576).toFixed(2), 'MB');
  console.log('Usuarios:', out.resumen.usuarios, '· media rotas:', out.resumen.mediaRotas, '· ticker:', out.resumen.collectionVersions);
  console.log('Sesiones:', JSON.stringify(out.resumen.sesiones), '· feed:', JSON.stringify(out.resumen.feed));
  for (const sev of ['alta', 'media', 'baja', 'info']) {
    if (!porSeveridad[sev].length) continue;
    console.log(`\n--- ${sev.toUpperCase()} (${porSeveridad[sev].length}) ---`);
    porSeveridad[sev].slice(0, 40).forEach((p) => console.log(` [${p.area}] ${p.detalle}`));
  }
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'audit-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('\nInforme completo:', file);
})().catch((e) => { console.error(e); process.exit(1); });
