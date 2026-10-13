/* ============================================================================
 * js/core/sync.js — SINCRONIZACIÓN OFFLINE-FIRST LEGACY ↔ API (fase 2b)
 * Cargar DESPUÉS de backend-shim (usa window.Backend + window.saveDB final).
 * Solo actúa con backend disponible Y sesión válida. Sin eso: paridad local.
 *
 * - pull(): trae colecciones + usuarios del servidor y los escribe en el `db`
 *   vivo del legacy (arrays por splice para no romper referencias). Se llama
 *   al entrar (login / sesión restaurada) y ante eventos realtime.
 * - push: envuelve window.saveDB (debounce propio 1.5s): difumina `db` contra
 *   una sombra y sube creados (POST/upsert por id), editados (PUT) y borrados
 *   (DELETE). `users` va por /api/users (crea con hash en servidor; el cliente
 *   jamás ve ni guarda hashes). `auditoria` y `sessions` no se suben.
 * - Conflictos: last-write-wins por registro (documentado en README).
 * ========================================================================== */
(function () {
  'use strict';

  var SKIP = { users: 1, sessions: 1, auditoria: 1 };
  var SHOWCASE = ['inmPublica', 'autoHub', 'posts', 'carruselCirculares', 'media'];
  /* Promotoría + escuela + chat: si otro equipo publica, el encargado lo ve
   * en vivo (el backend espeja estas al public_feed). */
  var LIVE_WORK = ['solicitudes', 'cotizaciones', 'ventas', 'siniestros',
    'messages', 'groupMessages', 'notifications', 'lessons', 'liveClasses', 'exams'];
  var KIND_TO_COL = {
    solicitudes: 'solicitudes', cotizaciones: 'cotizaciones', ventas: 'ventas',
    siniestros: 'siniestros', messages: 'messages', groupMessages: 'groupMessages',
    notifications: 'notifications', lessons: 'lessons', liveClasses: 'liveClasses',
    exams: 'exams', posts: 'posts', inmPublica: 'inmPublica', autoHub: 'autoHub',
    carruselCirculares: 'carruselCirculares', media: 'media'
  };
  var KIND_TOAST = {
    solicitudes: '🔔 Nueva solicitud de cotización',
    cotizaciones: '📑 Cotización actualizada',
    ventas: '💰 Nueva venta registrada',
    siniestros: '🚨 Nuevo siniestro reportado',
    messages: '💬 Nuevo mensaje',
    groupMessages: '👥 Mensaje grupal nuevo',
    lessons: '📚 Nuevo contenido de escuela',
    liveClasses: '🎥 Nueva clase en vivo',
    exams: '📝 Nuevo examen disponible'
  };
  var pushTimer = null;
  var shadow = null; // {col: [{...}]} última foto DEL SERVIDOR (solo lo traído por pull)
  var pulled = {}; // colecciones confirmadas desde el servidor en el último pull
  var usersPulled = false;
  var active = false;

  function legDb() {
    try {
      // eslint-disable-next-line no-undef
      return (typeof db !== 'undefined' && db) || null;
    } catch (e) { return null; }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Colecciones-OBJETO: settings, autoHub, inmPublica, carruselCirculares,
   * prospectos, expedientesProspectos, notifications, rolePermissions.
   * Antes sólo viajaban arrays: ban/publicidad/capacitaciones/clientes/autos/
   * inmuebles guardados dentro de estos objetos NO se compartían entre
   * equipos (y el pull los reemplazaba por [] vacío = pérdida). */
  function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /* El legacy vive en mundo numérico (id: 1, students: [3], === estricto) pero
   * Supabase devuelve TEXT ("1"). Sin normalizar, find/filter con === fallan
   * (ej. openChat: otro usuario undefined → el chat no abre). Se reconvierte
   * a Number todo id numérico al traer del servidor; el push ya tolera ambos.
   * OJO: solo claves id/…Id y arrays conocidos — jamás phone, títulos, etc. */
  var ID_ARRAYS = { students: 1, assignedTo: 1, readBy: 1, views: 1, participants: 1, members: 1 };
  function numIfNumeric(v) {
    if (typeof v === 'string' && v !== '' && /^[0-9]+$/.test(v)) {
      const n = Number(v);
      if (Number.isSafeInteger(n)) return n;
    }
    return v;
  }
  function normIds(node) {
    if (Array.isArray(node)) { node.forEach(normIds); return node; }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (k) {
        const v = node[k];
        if ((k === 'id' || /Id$/.test(k)) && typeof v !== 'object') node[k] = numIfNumeric(v);
        else if (ID_ARRAYS[k] && Array.isArray(v)) node[k] = v.map(numIfNumeric);
        else normIds(v);
      });
    }
    return node;
  }

  async function get(path) {
    const res = await fetch(path, { credentials: 'same-origin' });
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error('no-json'); }
    if (!res.ok) { const err = new Error((json && json.error) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
    return json;
  }

  async function send(method, path, body) {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* vacío */ }
    if (!res.ok) { const err = new Error((json && json.error) || ('HTTP ' + res.status)); err.status = res.status; err.json = json; throw err; }
    return json;
  }

  function replaceArray(dst, src) {
    dst.length = 0;
    (src || []).forEach(function (x) { dst.push(x); });
  }

  /* Trae una colección; 403 (sin permiso) => null (se conserva lo local).
   * Detecta la forma por RESPUESTA: {items:[…]} array · {object:{…}} objeto. */
  async function pullCollection(name) {
    try {
      const r = await get('/api/data/' + encodeURIComponent(name));
      if (Array.isArray(r.items)) return { shape: 'array', items: r.items };
      if (r.object && typeof r.object === 'object') return { shape: 'object', value: r.object };
      return null;
    } catch (e) {
      if (e.status === 403 || e.status === 404) return null;
      throw e;
    }
  }

  async function pullNames(names) {
    const db = legDb();
    if (!db) return false;
    const jobs = names.map(function (n) {
      return pullCollection(n).then(function (v) { return { n, v }; });
    });
    const results = await Promise.all(jobs);
    let changed = false;
    results.forEach(function ({ n, v }) {
      if (!v) return; // sin permiso: no tocar
      if (v.shape === 'array') {
        if (!Array.isArray(db[n])) db[n] = [];
        replaceArray(db[n], normIds(v.items));
      } else {
        // Objeto: reemplaza por claves (el objeto puede almacenar arrays adentro:
        // settings.publicidad, comparisons... tocar in-place preserva referencias).
        if (!isPlain(db[n])) db[n] = {};
        Object.keys(db[n]).forEach(function (k) { delete db[n][k]; });
        Object.assign(db[n], normIds(v.value));
      }
      pulled[n] = true; // verdad del servidor: entra a la sombra
      changed = true;
    });
    return changed;
  }

  async function pullUsers() {
    const db = legDb();
    if (!db) return false;
    try {
      const users = await window.Backend.listUsers();
      if (!Array.isArray(users)) return false;
      if (!Array.isArray(db.users)) db.users = [];
      replaceArray(db.users, normIds(users));
      usersPulled = true;
      return true;
    } catch (e) { return false; } // sin permiso de listar: espejo local
  }

  function snapshot() {
    // Solo lo confirmado del servidor. Lo solo-local queda FUERA para que el
    // próximo push lo suba (si entrara a la sombra, se volvería invisible).
    const db = legDb();
    if (!db) return;
    shadow = {};
    Object.keys(pulled).forEach(function (k) {
      if (Array.isArray(db[k]) || isPlain(db[k])) shadow[k] = clone(db[k]);
    });
    if (usersPulled && Array.isArray(db.users)) shadow.users = clone(db.users);
  }

  // Mutex: los pulls nunca se intercalan (un pull que reemplaza mientras otro
  // fusiona perdía lo solo-local). pullAll() es la única entrada.
  let pullChain = Promise.resolve();
  function pullAll() {
    pullChain = pullChain.then(pullInner).catch(function () { return false; });
    return pullChain;
  }

  async function pullInner() {
    if (!window.Backend || !window.Backend.available) return false;
    try { await window.Backend.me(); }
    catch (e) { active = false; return false; } // sin sesión: no tocar nada
    active = true;
    let idx;
    try { idx = await get('/api/data'); }
    catch (e) { return false; }
    const db = legDb();
    if (!db) return false;
    // Foto local previa SIEMPRE: lo que solo existe en este equipo se fusiona
    // y se sube (el servidor gana ante mismo id). Así no se pierde lo offline.
    // Objetos (settings/autoHub/…) también participan: sus claves top-level
    // que no existan en el servidor se re-agregan y suben.
    const pre = {};
    Object.keys(db).forEach(function (n) {
      if (SKIP[n] || n === 'users') return;
      if (Array.isArray(db[n]) || isPlain(db[n])) pre[n] = clone(db[n]);
    });
    const names = (idx.collections || []).filter(function (n) { return !SKIP[n]; });
    pulled = {}; usersPulled = false;
    await pullNames(names);
    await pullUsers(); // users: el servidor es la verdad (sin merge)
    snapshot(); // foto del servidor ANTES de fusionar lo local
    let merged = 0;
    Object.keys(pre).forEach(function (n) {
      if (Array.isArray(db[n])) {
        const have = {};
        db[n].forEach(function (x) { have[String(x.id)] = true; });
        pre[n].forEach(function (x) {
          if (x && x.id !== undefined && !have[String(x.id)]) { db[n].push(x); merged++; }
        });
      } else if (isPlain(db[n])) {
        let added = false;
        Object.keys(pre[n]).forEach(function (k) {
          if (!(k in db[n])) { db[n][k] = pre[n][k]; added = true; }
        });
        if (added) merged++;
      }
    });
    // Lo solo-local (en db pero fuera de la sombra) siempre se sube; el diff
    // no encuentra nada que hacer en lo ya sincronizado.
    if (merged) pushSoon();
    return true;
  }

  function byIdMap(arr) {
    const m = {};
    (arr || []).forEach(function (x) { m[String(x.id)] = x; });
    return m;
  }

  function stripUser(u) {
    const c = Object.assign({}, u);
    delete c.password; delete c.passwordHash; delete c.password_hash;
    delete c.mustChangePassword; delete c.must_change;
    return c;
  }

  async function pushUsers(local, old) {
    const oldMap = byIdMap(old);
    const seen = {};
    // Reintento: usuarios que nacieron sin id (form legacy sin guardar) reciben
    // id local aquí mismo para que el diff los vea y el servidor los cree.
    let minted = false;
    for (const u of local) {
      if (u.id === undefined || u.id === null || u.id === '') { u.id = Date.now() + Math.floor(Math.random() * 1000); minted = true; }
    }
    if (minted) { try { window.saveDB && window.saveDB.__syncWrapped ? null : null; } catch (e) {} }
    for (const u of local) {
      const id = String(u.id);
      seen[id] = true;
      const prev = oldMap[id];
      try {
        if (!prev) {
          if (!u.password || u.passwordHash || u.password_hash) continue; // sin clave en claro: no se puede crear en servidor
          const r = await send('POST', '/api/users', {
            id: u.id, username: u.username, password: u.password,
            role: u.role, name: u.name, email: u.email, phone: u.phone, avatar: u.avatar,
          });
          Object.keys(u).forEach(function (k) { delete u[k]; });
          Object.assign(u, r.user); // récord canónico (sin hash) + mismo id
        } else if (JSON.stringify(stripUser(u)) !== JSON.stringify(stripUser(prev))) {
          const body = stripUser(u);
          delete body.id; delete body.username;
          const r = await send('PUT', '/api/users/' + encodeURIComponent(u.id), body);
          Object.keys(u).forEach(function (k) { delete u[k]; });
          Object.assign(u, r.user, { password: undefined });
          delete u.password;
        }
      } catch (e) {
        if (e.status === 403 || e.status === 404 || e.status === 409) {
          await pullUsers(); // el servidor manda (GM protegida, duplicado…)
          if (window.showToast) window.showToast(pushErrorMsg(e, 'usuarios'), 'warning');
          return;
        }
        throw e;
      }
    }
    for (const id of Object.keys(oldMap)) {
      if (seen[id]) continue;
      try { await send('DELETE', '/api/users/' + encodeURIComponent(id), null); }
      catch (e) {
        await pullUsers();
        if (window.showToast) window.showToast('No se pudo borrar usuario: ' + e.message, 'warning');
        return;
      }
    }
  }

  async function pushCollection(name, local, old) {
    // Colección-OBJETO: diff por CLAVE top-level (última escritura gana POR
    // CLAVE, no por objeto entero → dos equipos editando apartados distintos
    // de settings no se pisan). PUT /:col/:clave {value} · DELETE /:col/:clave.
    if (isPlain(local)) {
      const oldObj = (old && isPlain(old)) ? old : {};
      for (const k of Object.keys(local)) {
        if (JSON.stringify(local[k]) === JSON.stringify(oldObj[k])) continue;
        try {
          await send('PUT', '/api/data/' + encodeURIComponent(name) + '/' + encodeURIComponent(k), { value: local[k] });
        } catch (e) {
          if (e.status === 403 || e.status === 404) {
            await pullNames([name]);
            if (window.showToast) window.showToast(pushErrorMsg(e, name), 'warning');
            return;
          }
          throw e;
        }
      }
      for (const k of Object.keys(oldObj)) {
        if (!(k in local)) {
          try { await send('DELETE', '/api/data/' + encodeURIComponent(name) + '/' + encodeURIComponent(k)); }
          catch (e) { await pullNames([name]); return; }
        }
      }
      return;
    }
    // Arrays: igual que users: registros sin id se acuñan para el diff.
    for (const rec of local) {
      if (!rec) continue;
      if (rec.id === undefined || rec.id === null || rec.id === '') rec.id = Date.now() + Math.floor(Math.random() * 1000);
    }
    const oldMap = byIdMap(old);
    const seen = {};
    for (const rec of local) {
      const id = String(rec.id);
      seen[id] = true;
      const prev = oldMap[id];
      const same = prev && JSON.stringify(rec) === JSON.stringify(prev);
      if (same) continue;
      try {
        if (!prev) await send('POST', '/api/data/' + encodeURIComponent(name), rec);
        else await send('PUT', '/api/data/' + encodeURIComponent(name) + '/' + encodeURIComponent(rec.id), rec);
      } catch (e) {
        if (e.status === 403 || e.status === 404) {
          await pullNames([name]);
          if (window.showToast) window.showToast(pushErrorMsg(e, name), 'warning');
          return;
        }
        throw e;
      }
    }
    for (const id of Object.keys(oldMap)) {
      if (seen[id]) continue;
      try { await send('DELETE', '/api/data/' + encodeURIComponent(name) + '/' + encodeURIComponent(id), null); }
      catch (e) { await pullNames([name]); return; }
    }
  }

  async function pushNow() {
    if (!active || !shadow) return;
    const db = legDb();
    if (!db) return;
    // Unión sombra+local: las colecciones solo-locales (nunca en servidor) también suben.
    const set = {};
    // users va por /api/users (pushUsers); jamás por /api/data (404).
    Object.keys(shadow).forEach(function (n) { if (n !== 'users' && !SKIP[n]) set[n] = true; });
    Object.keys(db).forEach(function (n) {
      if (SKIP[n] || n === 'users') return;
      if (Array.isArray(db[n]) || isPlain(db[n])) set[n] = true;
    });
    const names = Object.keys(set);
    const failed = [];
    // Aislado por colección: una que falle no bloquea a las demás. La sombra
    // solo avanza en las que sí se sincronizaron (si no, se volverían invisibles).
    for (const n of names) {        try { await pushCollection(n, db[n] || [], shadow[n] || []);
        shadow[n] = clone(db[n] || []);
      } catch (e) { failed.push(n); }
    }
    if (Array.isArray(db.users)) {
      try {
        await pushUsers(db.users, shadow.users || []);
        shadow.users = clone(db.users);
      } catch (e) { failed.push('users'); }
    }
    if (failed.length && window.showToast) {
      const hint = failed.map(function (n) {
        return n;
      }).join(', ');
      window.showToast('Sin sincronizar (' + hint + '): revisa tu sesión o el tamaño de fotos', 'warning');
    }
  }

  function pushSoon() {
    if (!active) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }

  /* Envuelve el saveDB final del legacy (respeta sus wrappers previos). */
  /* Traduce fallos de red a mensajes accionables (no "Sin conexión" genérico). */
  function pushErrorMsg(e, what) {
    if (e && e.status === 413) return what + ' demasiado grande: usa Subir archivo en vez de foto embebida';
    if (e && e.status === 403) return 'Sin permiso en servidor para ' + what + ' (se conserva local)';
    if (e && e.status === 401) return 'Sesión vencida: reingresa para sincronizar ' + what;
    return 'Sin conexión al servidor, ' + what + ' en este equipo';
  }

  function hookSave() {
    try {
      if (typeof window.saveDB !== 'function' || window.saveDB.__syncWrapped) return;
      const orig = window.saveDB;
      const wrapped = function () {
        let r;
        try {
          r = orig.apply(this, arguments);
        } catch (e) {
          // localStorage lleno o corrupto: avisa y aun así intenta el servidor.
          if (window.showToast) window.showToast('No se pudo guardar local: ' + (e.message || e), 'warning');
          r = undefined;
        }
        try { pushSoon(); } catch (e) { /* nunca romper el guardado local */ }
        return r;
      };
      wrapped.__syncWrapped = true;
      window.saveDB = wrapped;
    } catch (e) { /* legacy aún no cargó */ }
  }

  async function boot() {
    try { if (!(window.Backend && await window.Backend.detect())) return; }
    catch (e) { return; }
    hookSave();
    // Sesión restaurada (incógnito con cookie, otro navegador ya logueado…).
    try {
      const me = await window.Backend.me();
      if (me && me.user) {
        if (await pullAll()) {
          try { if (typeof window.render === 'function') window.render(); } catch (e) {}
        }
      }
    } catch (e) { /* sin sesión: el login hará pull */ }
    // Novedades de otros usuarios → re-pull escaparate + trabajo + re-render.
    // Ej: agente carga solicitud → el cotizador la ve en ese momento + toast.
    document.addEventListener('public-feed', function (e) {
      if (!active) return;
      var kind = e && e.detail && e.detail.kind;
      var cols = SHOWCASE.slice();
      var target = kind && KIND_TO_COL[kind];
      if (target && cols.indexOf(target) === -1 && LIVE_WORK.indexOf(target) !== -1) cols.push(target);
      if (!target) cols = cols.concat(LIVE_WORK.filter(function (c) { return cols.indexOf(c) === -1; }));
      pullNames(cols).then(function () {
        try { if (typeof window.render === 'function') window.render(); } catch (e2) {}
        // Chat abierto + mensaje nuevo → refresca la conversación al instante
        // (además del polling de 2.5s que cubre el caso sin realtime).
        if (kind === 'messages' || kind === 'groupMessages') {
          try { if (typeof window.chatLiveRefresh === 'function') window.chatLiveRefresh(); } catch (e4) {}
        }
        if (kind && KIND_TOAST[kind] && window.showToast) {
          try { window.showToast(KIND_TOAST[kind], 'info'); } catch (e3) {}
        }
      }).catch(function () {});
    });
  }

  window.BackendSync = {
    normUser: function (u) { return normIds(u) || u; },
    pull: pullAll,
    pullShowcase: function () { return pullNames(SHOWCASE); },
    pullCollections: function (names) { return pullNames(names || []); },
    hookSave,
    get active() { return active; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // El legacy puede redefinir saveDB después: re-engancha con retraso.
  setTimeout(hookSave, 3000);
})();
