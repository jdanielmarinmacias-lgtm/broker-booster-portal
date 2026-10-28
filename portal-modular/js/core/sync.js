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

  /* loginAttempts: colección interna del servidor (rate-limit de login). El
   * frontend la recibía en el bundle y la devolvía en cada push, donde el
   * servidor respondía 401/404. Nunca debe viajar desde el navegador. */
  var SKIP = { users: 1, sessions: 1, auditoria: 1, loginAttempts: 1 };
  var SHOWCASE = ['inmPublica', 'autoHub', 'posts', 'carruselCirculares', 'media'];
  /* Promotoría + escuela + chat: si otro equipo publica, el encargado lo ve
   * en vivo (el backend espeja estas al public_feed). */
  var LIVE_WORK = ['solicitudes', 'cotizaciones', 'ventas', 'siniestros',
    'messages', 'groupMessages', 'notifications', 'lessons', 'liveClasses', 'exams',
    'chatGroups', 'forumPosts', 'invitaciones'];
  var KIND_TO_COL = {
    solicitudes: 'solicitudes', cotizaciones: 'cotizaciones', ventas: 'ventas',
    siniestros: 'siniestros', messages: 'messages', groupMessages: 'groupMessages',
    notifications: 'notifications', lessons: 'lessons', liveClasses: 'liveClasses',
    exams: 'exams', posts: 'posts', inmPublica: 'inmPublica', autoHub: 'autoHub',
    carruselCirculares: 'carruselCirculares', media: 'media',
    chatGroups: 'chatGroups', forumPosts: 'forumPosts', invitaciones: 'invitaciones'
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
    exams: '📝 Nuevo examen disponible',
    forumPosts: '🗣️ Nueva participación en el Foro',
    chatGroups: '👥 Grupos actualizados'
  };
  var pushTimer = null;
  var lastNoSessToast = 0; // limita el aviso de sesión vencida (1/min)
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
   * prospectos, expedientesProspectos, rolePermissions, guiaBase, guiaChats,
   * practicaConfig, oferta_valor. */
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

  async function pullBundle(fallbackNames) {
    const db = legDb();
    if (!db) return false;
    try {
      const r = await get('/api/data/bundle');
      if (r && r.bundle && typeof r.bundle === 'object') {
        let hayPendienteLocal = false;
        Object.keys(r.bundle).forEach(function (n) {
          if (SKIP[n]) return;
          const v = r.bundle[n];
          if (!v) return;
          if (v.shape === 'array') {
            if (!Array.isArray(db[n])) db[n] = [];
            /* Igual que pullNames: conservar registros optimistas creados
             * localmente y aún no subidos (evita perder mensajes_rápidos si un
             * bundle aterriza entre el save local y el push). */
            const prevLocal = db[n].slice();
            const prevShadowArr = (shadow && Array.isArray(shadow[n])) ? shadow[n] : [];
            const wasOnServer = {};
            prevShadowArr.forEach(function (x) { if (x && x.id !== undefined) wasOnServer[String(x.id)] = true; });
            const serverItems = normIds(v.items);
            if (shadow) shadow[n] = clone(serverItems);
            replaceArray(db[n], serverItems);
            const have = {};
            db[n].forEach(function (x) { if (x && x.id !== undefined) have[String(x.id)] = true; });
            prevLocal.forEach(function (x) {
              if (x && x.id !== undefined && !have[String(x.id)] && !wasOnServer[String(x.id)]) {
                db[n].push(x);
                hayPendienteLocal = true;
              }
            });
          } else if (v.shape === 'object') {
            if (!isPlain(db[n])) db[n] = {};
            const prevLocalObj = clone(db[n]);
            const prevShadowObj = (shadow && isPlain(shadow[n])) ? shadow[n] : null;
            const serverVal = normIds(v.value);
            if (shadow) shadow[n] = clone(serverVal);
            Object.keys(db[n]).forEach(function (k) { delete db[n][k]; });
            Object.assign(db[n], serverVal);
            Object.keys(prevLocalObj).forEach(function (k) {
              if (!(k in db[n]) && !(prevShadowObj && (k in prevShadowObj))) {
                db[n][k] = prevLocalObj[k];
                hayPendienteLocal = true;
              }
            });
          }
          pulled[n] = true;
        });
        if (hayPendienteLocal) pushSoon();
        /* Solo se reemplaza el directorio si el servidor manda algo: una
         * respuesta vacía (instancia con caché fría) borraba la lista local y
         * hacía que el portal volviera a subir usuarios que ya existían. */
        if (Array.isArray(r.users) && r.users.length) {
          if (!Array.isArray(db.users)) db.users = [];
          /* Conservar altas locales aún no subidas: reemplazar la lista entera
           * borraba al usuario recién creado en este equipo antes de su push. */
          const prevLocalUsers = db.users.slice();
          const prevShadowUsers = (shadow && Array.isArray(shadow.users)) ? shadow.users : [];
          const wasOnServer = {};
          prevShadowUsers.forEach(function (u) { if (u && u.id !== undefined) wasOnServer[String(u.id)] = true; });
          replaceArray(db.users, normIds(r.users));
          const haveU = {};
          db.users.forEach(function (u) { if (u && u.id !== undefined) haveU[String(u.id)] = true; });
          prevLocalUsers.forEach(function (u) {
            if (u && u.id !== undefined && !haveU[String(u.id)] && !wasOnServer[String(u.id)] && u.password) {
              db.users.push(u);
              hayPendienteLocal = true;
            }
          });
          usersPulled = true;
        }
        return true;
      }
    } catch (e) { /* fallback individual */ }
    return pullNames(fallbackNames || []);
  }
  /* Un solo viaje por colección aunque varias pantallas la pidan a la vez.
   * El carrusel se descargaba 4 veces al abrir el portal por esto. */
  var pullInFlight = {};
  function pullCollectionOnce(name) {
    const key = String(name);
    if (!pullInFlight[key]) {
      pullInFlight[key] = pullCollection(key).then(function (v) {
        delete pullInFlight[key];
        return v;
      }, function (e) {
        delete pullInFlight[key];
        throw e;
      });
    }
    return pullInFlight[key];
  }

  async function pullNames(names) {
    const db = legDb();
    if (!db) return false;
    const jobs = names.map(function (n) {
      return pullCollectionOnce(n).then(function (v) { return { n, v }; });
    });
    const results = await Promise.all(jobs);
    let changed = false;
    let hadPendingLocal = false;
    results.forEach(function ({ n, v }) {
      if (!v) return; // sin permiso: no tocar
      if (v.shape === 'array') {
        if (!Array.isArray(db[n])) db[n] = [];
        const prevLocal = db[n].slice();
        const prevShadowArr = (shadow && Array.isArray(shadow[n])) ? shadow[n] : [];
        const wasOnServer = {};
        prevShadowArr.forEach(function (x) { if (x && x.id !== undefined) wasOnServer[String(x.id)] = true; });
        const serverItems = normIds(v.items);
        if (shadow) shadow[n] = clone(serverItems);
        replaceArray(db[n], serverItems);
        const have = {};
        db[n].forEach(function (x) { if (x && x.id !== undefined) have[String(x.id)] = true; });
        prevLocal.forEach(function (x) {
          // Conservar registros optimistas recién creados localmente que aún no suben al servidor
          if (x && x.id !== undefined && !have[String(x.id)] && !wasOnServer[String(x.id)]) {
            db[n].push(x);
            hadPendingLocal = true;
          }
        });
      } else {
        // Objeto: reemplaza por claves (el objeto puede almacenar arrays adentro:
        // settings.publicidad, comparisons... tocar in-place preserva referencias).
        if (!isPlain(db[n])) db[n] = {};
        const prevLocalObj = clone(db[n]);
        const prevShadowObj = (shadow && isPlain(shadow[n])) ? shadow[n] : null;
        const serverVal = normIds(v.value);
        if (shadow) shadow[n] = clone(serverVal);
        Object.keys(db[n]).forEach(function (k) { delete db[n][k]; });
        Object.assign(db[n], serverVal);
        Object.keys(prevLocalObj).forEach(function (k) {
          if (!(k in db[n]) && !(prevShadowObj && (k in prevShadowObj))) {
            db[n][k] = prevLocalObj[k];
            hadPendingLocal = true;
          }
        });
      }
      pulled[n] = true; // verdad del servidor: entra a la sombra
      changed = true;
    });
    if (hadPendingLocal) pushSoon();
    return changed;
  }

  async function pullUsers() {
    const db = legDb();
    if (!db) return false;
    try {
      const users = await window.Backend.listUsers();
      if (!Array.isArray(users) || !users.length) return false;
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
    const prevShadow = shadow ? clone(shadow) : null;
    pulled = {}; usersPulled = false;
    try {
      await pullBundle();
    } catch (e) { return false; }
    if (!usersPulled) {
      await pullUsers(); // fallback si el servidor no adjuntó users en /api/data/bundle
    }
    try { if (typeof window.ensureDbDefaults === 'function') window.ensureDbDefaults(); } catch (e0) {}
    snapshot(); // foto del servidor ANTES de fusionar lo local
    /* Racha diaria: ahora que db.users tiene la verdad del servidor (y la
     * sombra ya está alineada), se evalúa aquí. Si es otro día, esto sí es un
     * cambio real y se sube; el resto de cargas no escriben nada. */
    try { if (typeof window.checkDailyStreak === 'function') window.checkDailyStreak(); } catch (e0) {}
    let merged = 0;
    Object.keys(pre).forEach(function (n) {
      if (Array.isArray(db[n])) {
        const have = {};
        db[n].forEach(function (x) { have[String(x.id)] = true; });
        const wasOnServer = {};
        if (prevShadow && Array.isArray(prevShadow[n])) {
          prevShadow[n].forEach(function (x) { if (x && x.id !== undefined) wasOnServer[String(x.id)] = true; });
        }
        pre[n].forEach(function (x) {
          // #2 Refuerzo (lápidas/tombstones): si el registro ya existía en la sombra previa
          // del servidor y ahora el servidor no lo trae, fue borrado en otro equipo → no resucitarlo.
          if (x && x.id !== undefined && !have[String(x.id)] && !wasOnServer[String(x.id)]) {
            db[n].push(x); merged++;
          }
        });
      } else if (isPlain(db[n])) {
        let added = false;
        const prevObj = (prevShadow && isPlain(prevShadow[n])) ? prevShadow[n] : null;
        Object.keys(pre[n]).forEach(function (k) {
          if (!(k in db[n]) && !(prevObj && (k in prevObj))) { db[n][k] = pre[n][k]; added = true; }
        });
        if (added) merged++;
      }
    });
    // Lo solo-local (en db pero fuera de la sombra) siempre se sube; el diff
    // no encuentra nada que hacer en lo ya sincronizado.
    try { if (typeof window.flushSaveDB === 'function') window.flushSaveDB(); } catch (e1) {}
    if (merged) pushSoon();
    /* Cura única por sesión: los documentos ya guardados con imágenes en
     * base64 (publicidad, carrusel, academia…) se envían al Storage y se
     * reemplazan por su URL. Sin esto, el documento seguiría pesando MBs, el
     * guardado seguiría dando HTTP 500 y la portada tardaría en cargar.
     * Solo se hace una vez por sesión y no bloquea el render. */
    if (!healedOnce) {
      healedOnce = true;
      sanearBase64().catch(function () {});
    }
    return true;
  }

  var healedOnce = false;
  /* Colecciones donde el legacy guardó archivos embebidos. El escaparate y la
   * academia son las que más pesaban (tarjetas con la imagen dentro del JSON). */
  var HEAVY = ['settings', 'carruselCirculares', 'autoHub', 'inmPublica',
    'lessons', 'library', 'posts', 'media', 'categories'];
  async function sanearBase64() {
    if (!(window.Media && typeof window.Media.desbase64 === 'function')) return 0;
    const db = legDb();
    if (!db) return 0;
    let total = 0;
    for (const n of HEAVY) {
      if (!db[n] || typeof db[n] !== 'object') continue;
      try { total += await window.Media.desbase64(db[n], n); } catch (e) { /* siguiente */ }
    }
    if (total) {
      if (window.showToast) {
        window.showToast(total + (total === 1 ? ' archivo movido' : ' archivos movidos') + ' al Storage: la próxima carga será más rápida', 'success');
      }
      pushSoon();
    }
    return total;
  }

  function byIdMap(arr) {
    const m = {};
    (arr || []).forEach(function (x) { m[String(x.id)] = x; });
    return m;
  }

  /* ── Comparación tolerante ─────────────────────────────────────────────────
   * El legacy normaliza el `db` al cargar (ids numéricos, `streak: 0`,
   * `lastStudy: null`…). Comparar con JSON.stringify marcaba eso como cambio:
   * cada carga "veía" 10 usuarios editados y escribía en la base sin que nadie
   * hubiera tocado nada, y ese PUT despertaba a todos los equipos por realtime.
   * Aquí null y ausente son lo mismo, y 5 y "5" también. */
  function mismoValor(a, b) {
    const na = (a === undefined) ? null : a;
    const nb = (b === undefined) ? null : b;
    if (na === nb) return true;
    if (na === null || nb === null) return false;
    if (typeof na === 'object' || typeof nb === 'object') {
      try { return JSON.stringify(na) === JSON.stringify(nb); } catch (e) { return false; }
    }
    if (typeof na === 'number' || typeof nb === 'number') return String(na) === String(nb);
    return na === nb;
  }

  function registrosIguales(a, b) {
    if (!a || !b) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return mismoValor(a, b);
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of keys) { if (!mismoValor(a[k], b[k])) return false; }
    return true;
  }

  /* Default que el servidor todavía no guardó (0, null, '', [], false) no es
   * una edición del usuario: se queda en memoria y no se escribe. */
  function esValorPorDefecto(v) {
    if (v === null || v === undefined) return true;
    if (v === '' || v === 0 || v === false) return true;
    return Array.isArray(v) && v.length === 0;
  }

  /* Presencia: se envía como mucho cada 10 min, no en cada carga. */
  const CAMPOS_LATIDO = ['lastActive', 'lastConnection'];
  const LATIDO_MIN_MS = 10 * 60 * 1000;

  function stripUser(u) {
    const c = Object.assign({}, u);
    delete c.password; delete c.passwordHash; delete c.password_hash;
    delete c.mustChangePassword; delete c.must_change;
    return c;
  }

  async function pushUsers(local, old) {
    /* Avatares subidos desde el portal llegan como dataURL: a Storage. */
    if (window.Media && typeof window.Media.desbase64 === 'function') {
      try { await window.Media.desbase64(local, 'avatars'); } catch (e) {}
    }
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
          const createBody = Object.assign({}, stripUser(u), {
            id: u.id, username: u.username, password: u.password,
          });
          const r = await send('POST', '/api/users', createBody);
          const canon = normIds(r.user);
          Object.keys(u).forEach(function (k) { delete u[k]; });
          Object.assign(u, canon); // récord canónico (sin hash) + mismo id numérico
        } else if (
          !registrosIguales(stripUser(u), stripUser(prev))
          || (typeof u.password === 'string' && u.password.trim() !== '')
        ) {
          /* Solo los CAMPOS que cambiaron. Antes se enviaba el usuario completo:
           * el servidor veía un cuerpo con role/students/agencia y respondía 403
           * "Permisos insuficientes" a cualquier no-admin que solo editó su
           * perfil ("Sin permiso en servidor para usuarios"), y ese usuario se
           * quedaba sin guardar en la base. */
          const ahora = stripUser(u);
          const antes = stripUser(prev);
          const body = {};
          Object.keys(ahora).forEach(function (k) {
            if (k === 'id') return;
            if (mismoValor(ahora[k], antes[k])) return;
            if (!(k in antes) && esValorPorDefecto(ahora[k])) return;
            body[k] = ahora[k];
          });
          // Si se desasignó agencia/equipo en local, enviar null explícito para que el servidor limpie la clave
          ['agenciaId', 'agencia', 'parentId', 'assignedTo'].forEach(function (fk) {
            if (prev[fk] !== undefined && u[fk] === undefined) body[fk] = null;
          });
          // Sin cambios reales (solo el hash de la clave): no molestar al servidor.
          if (!Object.keys(body).length && !(typeof u.password === 'string' && u.password.trim() !== '')) continue;
          /* Si lo único que cambió es la presencia (lastActive/lastConnection),
           * no se escribe hasta que el latido guardado tenga 10 minutos. Antes
           * cada carga reescribía el usuario y avisaba a todos los equipos. */
          if (window.__syncDebug) console.warn('[SYNC-DIFF] user', u.username, 'campos:', Object.keys(body).join(','));
          const soloLatido = Object.keys(body).every(function (k) { return CAMPOS_LATIDO.indexOf(k) !== -1; });
          if (soloLatido) {
            const ultimoLatido = Number(prev && prev.lastActive) || 0;
            if (Date.now() - ultimoLatido < LATIDO_MIN_MS) continue;
          }
          if (typeof u.password === 'string' && u.password.trim() !== '') {
            body.password = u.password.trim();
          }
          const r = await send('PUT', '/api/users/' + encodeURIComponent(u.id), body);
          const canon = normIds(r.user);
          Object.keys(u).forEach(function (k) { delete u[k]; });
          Object.assign(u, canon);
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
    /* Cura de base64 antes de subir: si el documento trae dataURLs grandes
     * (imágenes de publicidad/academia guardadas por el legacy), se suben al
     * Storage y se reemplazan por su URL. Es lo que evita el HTTP 500 por
     * documento gigante y los 401 en cascada que dejaban todo en local. */
    if (window.Media && typeof window.Media.desbase64 === 'function') {
      try {
        const n = await window.Media.desbase64(local, name);
        if (n && window.showToast) {
          window.showToast(n + (n === 1 ? ' imagen movida' : ' imágenes movidas') + ' al Storage', 'success');
        }
      } catch (e) { /* se intenta el guardado igual */ }
    }
    // Notifications siempre debe ser Array; si una versión previa la dejó como {} vacío, ignorar o normalizar
    if (name === 'notifications' && !Array.isArray(local)) {
      return;
    }
    // Colección-OBJETO: diff por CLAVE top-level (última escritura gana POR
    // CLAVE, no por objeto entero → dos equipos editando apartados distintos
    // de settings no se pisan). PUT /:col/:clave {value} · DELETE /:col/:clave.
    if (isPlain(local)) {
      const oldObj = (old && isPlain(old)) ? old : {};
      for (const k of Object.keys(local)) {
        if (mismoValor(local[k], oldObj[k])) continue;
        // Clave nueva que solo trae el valor por defecto del panel: no se escribe.
        if (!(k in oldObj) && esValorPorDefecto(local[k])) continue;
        if (window.__syncDebug) console.warn('[SYNC-DIFF]', name + '.' + k, 'sombra:', JSON.stringify(oldObj[k]).slice(0, 120), 'local:', JSON.stringify(local[k]).slice(0, 120));
        try {
          await send('PUT', '/api/data/' + encodeURIComponent(name) + '/' + encodeURIComponent(k), { value: local[k] });
        } catch (e) {
          if (e.status === 403 || e.status === 404) {
            await pullNames([name]);
            if (window.showToast) window.showToast(pushErrorMsg(e, name), 'warning');
            return;
          }
          // Si el servidor aún no reconoce la ruta /:clave (400), caer a POST merge del objeto
          if (e.status === 400) {
            await send('POST', '/api/data/' + encodeURIComponent(name), local);
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
      const same = prev && registrosIguales(rec, prev);
      if (same) continue;
      try {
        if (!prev) await send('POST', '/api/data/' + encodeURIComponent(name), rec);
        else {
          try {
            await send('PUT', '/api/data/' + encodeURIComponent(name) + '/' + encodeURIComponent(rec.id), rec);
          } catch (ePut) {
            /* El registro está en la sombra local pero ya no en el servidor
             * (se borró en otro equipo, o su POST falló una vez y quedó como
             * "existente"): se vuelve a crear. Antes el PUT respondía 404,
             * se abortaba la colección y el registro quedaba bloqueado
             * para siempre. */
            if (!ePut || ePut.status !== 404) throw ePut;
            await send('POST', '/api/data/' + encodeURIComponent(name), rec);
          }
        }
      } catch (e) {
        // Registro no aceptado: se conserva local y se avisa; no se descarta.
        if (e.status === 403 || e.status === 404 || e.status === 413) {
          if (window.showToast) window.showToast(pushErrorMsg(e, name), 'error');
          throw e;
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
    if (!window.Backend || !window.Backend.available) return;
    if (!active || !shadow) {
      // Backend sí, sesión no (expiró): intenta recuperarla una vez; si no,
      // avisa (limitado) en vez de guardar solo-local en silencio.
      let me = null;
      try { me = await window.Backend.me(true); } catch (e) { me = null; }
      if (me && me.user) {
        active = true;
        if (!(await pullAll())) return;
      } else {
        const now = Date.now();
        if (now - lastNoSessToast > 60000) {
          lastNoSessToast = now;
          if (window.showToast) window.showToast('Sesión vencida: reingresa para sincronizar (guardado solo en este equipo)', 'warning');
        }
        return;
      }
    }
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
    for (const n of names) {
      try { await pushCollection(n, db[n] || [], shadow[n] || []);
        shadow[n] = clone(db[n] || []);
      } catch (e) {
        failed.push(n + ' (' + motivoFallo(e) + ')');
        /* 401: puede ser la sesión vencida de verdad O una consulta de sesión
         * que falló por lentitud de la base. Antes se apagaba el sync para
         * siempre y TODO quedaba en localStorage hasta reingresar a mano.
         * Ahora se confirma con /api/auth/me: si la sesión sigue viva, es un
         * fallo pasajero y se reintenta; si no, se avisa una vez. */
        if (e && e.status === 401) {
          let viva = false;
          try {
            const me = await window.Backend.me(true);
            viva = !!(me && me.user);
          } catch (e2) { viva = false; }
          if (!viva) { active = false; break; }
          retrySoon(12000);
          continue;
        }
        // 500/503/red: la base estaba lenta u ocupada; reintenta con espera.
        if (!e || !e.status || e.status >= 500) retrySoon();
      }
    }
    if (Array.isArray(db.users)) {
      try {
        await pushUsers(db.users, shadow.users || []);
        shadow.users = clone(db.users);
      } catch (e) { failed.push('users (' + motivoFallo(e) + ')'); }
    }
    if (failed.length && window.showToast) {
      window.showToast('Sin sincronizar: ' + failed.join(', '), 'warning');
    }
  }

  /* Motivo concreto de un fallo de sincronización, para mostrarlo en el aviso. */
  function motivoFallo(e) {
    if (e && e.status === 401) return 'sesión vencida, reingresa';
    if (e && e.status === 503) return 'base de datos ocupada, reintentando';
    if (e && e.status === 500) return 'servidor ocupado, reintentando';
    if (e && e.status) return 'HTTP ' + e.status + (e.message ? ': ' + e.message : '');
    return (e && e.message) || 'error de red';
  }

  /* Reintento con espera ante sobrecarga de la base (no por error del dato). */
  function retrySoon(ms) {
    if (!active) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, ms || 8000);
  }

  function pushSoon() {
    if (!active) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }

  /* Envuelve el saveDB final del legacy (respeta sus wrappers previos). */
  /* Traduce fallos de red a mensajes accionables (no "Sin conexión" genérico). */
  function pushErrorMsg(e, what) {
    if (e && /demasiado grande/i.test(e.message || '')) return e.message;
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

  async function pullPublicShowcase() {
    try {
      const r = await get('/api/public/portal');
      if (!r || !r.portal) return false;
      const db = legDb();
      if (!db) return false;
      const p = r.portal;
      if (Array.isArray(p.autos)) {
        if (!isPlain(db.autoHub)) db.autoHub = { unidades: [], clientes: [], metas: [], ventas: [], guion: null, publicidad: [], practica: [] };
        if (!Array.isArray(db.autoHub.unidades)) db.autoHub.unidades = [];
        replaceArray(db.autoHub.unidades, normIds(p.autos));
      }
      if (Array.isArray(p.propiedades)) {
        if (!isPlain(db.inmPublica)) db.inmPublica = { props: [] };
        if (!Array.isArray(db.inmPublica.props)) db.inmPublica.props = [];
        replaceArray(db.inmPublica.props, normIds(p.propiedades));
      }
      if (db.settings && isPlain(db.settings)) {
        ['hero', 'caminos', 'comisiones', 'historias', 'aseguradoras', 'servicios', 'blog', 'privacidad', 'ctaFinal', 'empresa'].forEach(function (k) {
          if (p[k]) db.settings[k] = p[k];
        });
      }
      return true;
    } catch (e) { return false; }
  }

  try { window.__syncDebug = /(\?|&)debugsync=1/.test(location.search); } catch (e) {}

  var bootDone = false;
  async function boot() {
    if (bootDone) return;
    let ok = false;
    try { ok = !!(window.Backend && await window.Backend.detect()); } catch (e) { ok = false; }
    if (!ok) return; // backend caído/desplegando: el intervalo de abajo reintenta
    bootDone = true;
    hookSave();
    // Revisar si hay sesión activa primero: si hay sesión, pullAll() ya trae
    // autoHub, inmPublica y settings en un solo viaje (/api/data/bundle),
    // ahorrando la petición extra a /api/public/portal.
    let hasSession = false;
    try {
      const me = await window.Backend.me();
      hasSession = !!(me && me.user);
    } catch (e) { hasSession = false; }

    if (hasSession) {
      /* Este boot corre en paralelo al del backend-shim: si hay sesión, espera
       * el campus diferido antes de renderizar (las secciones se cargan al
       * entrar; sin esto, render() podría pedir funciones que aún no existen). */
      try { if (window.BBApp && typeof window.BBApp.cargar === 'function') await window.BBApp.cargar(); } catch (e0) {}
      try {
        if (await pullAll()) {
          try { if (typeof window.applyBranding === 'function') window.applyBranding(); } catch (e0) {}
          try { if (typeof window.render === 'function') window.render(); } catch (e1) {}
          const pp = document.getElementById('public-portal');
          if (pp && !pp.classList.contains('hidden') && typeof window.renderPublicPortal === 'function') {
            try { window.renderPublicPortal(); } catch (e2) {}
          }
        }
      } catch (e) {}
    } else {
      // Visitante sin sesión: hidratar solo el escaparate público (autos + propiedades).
      try {
        if (await pullPublicShowcase()) {
          const pp = document.getElementById('public-portal');
          if (pp && !pp.classList.contains('hidden') && typeof window.renderPublicPortal === 'function') {
            window.renderPublicPortal();
          }
        }
      } catch (e) {}
    }
    /* Re-render prudente tras un pull en vivo (compartido por feed y ticker). */
    function liveRender(kind) {
      // Evitar re-render completo si el menú desplegable está abierto o el usuario escribe en un campo o tiene un modal abierto
      var sbEl = document.getElementById('sidebar');
      var sbOpen = sbEl && !sbEl.classList.contains('-translate-x-full');
      var mcEl = document.getElementById('modal-container');
      var modalOpen = mcEl && mcEl.innerHTML.trim() !== '';
      var ae = document.activeElement;
      var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
      if (!sbOpen && !modalOpen && !typing) {
        try { if (typeof window.render === 'function') window.render(); } catch (e2) {}
      } else {
        try { if (typeof window.renderNav === 'function') window.renderNav(); } catch (e2) {}
      }
      const pp = document.getElementById('public-portal');
      if (pp && !pp.classList.contains('hidden') && typeof window.renderPublicPortal === 'function') {
        try { window.renderPublicPortal(); } catch (e5) {}
      }
      // Chat abierto + mensaje nuevo → refresca la conversación al instante
      // (además del polling de 2.5s que cubre el caso sin realtime).
      if (kind === 'messages' || kind === 'groupMessages') {
        try { if (typeof window.chatLiveRefresh === 'function') window.chatLiveRefresh(); } catch (e4) {}
      }
      if (kind && KIND_TOAST[kind] && window.showToast) {
        try { window.showToast(KIND_TOAST[kind], 'info'); } catch (e3) {}
      }
    }
    // Novedades de otros usuarios → re-pull escaparate + trabajo + re-render.
    // Ej: agente carga solicitud → el cotizador la ve en ese momento + toast.
    document.addEventListener('public-feed', function (e) {
      var kind = e && e.detail && e.detail.kind;
      // Marca del ticker por colección: se atiende en 'collection-version'.
      if (kind && String(kind).indexOf('version:') === 0) return;
      if (!active) {
        if (kind === 'autoHub' || kind === 'inmPublica' || kind === 'settings') {
          pullPublicShowcase().then(function (ok) {
            const pp = document.getElementById('public-portal');
            if (ok && pp && !pp.classList.contains('hidden') && typeof window.renderPublicPortal === 'function') {
              try { window.renderPublicPortal(); } catch (e0) {}
            }
          });
        }
        return;
      }
      var target = kind && KIND_TO_COL[kind];
      // Pull quirúrgico en Realtime: si sabemos qué colección cambió, solo
      // descargamos esa colección en vez de volver a bajar las 5 de SHOWCASE.
      var cols = target ? [target] : SHOWCASE.concat(LIVE_WORK.filter(function (c) { return SHOWCASE.indexOf(c) === -1; }));
      pullNames(cols).then(function () { liveRender(kind); }).catch(function () {});
    });
    // Ticker de versiones (TODAS las colecciones, ediciones y borrados
    // incluidos): pull quirúrgico de lo que cambió en otro equipo.
    document.addEventListener('collection-version', function (e) {
      var col = e && e.detail && e.detail.collection;
      if (!col) return;
      if (!active) {
        // Visitante sin sesión: solo refresca el escaparate público.
        if (col === 'autoHub' || col === 'inmPublica' || col === 'settings') {
          pullPublicShowcase().then(function (ok) {
            const pp = document.getElementById('public-portal');
            if (ok && pp && !pp.classList.contains('hidden') && typeof window.renderPublicPortal === 'function') {
              try { window.renderPublicPortal(); } catch (e0) {}
            }
          });
        }
        return;
      }
      if (col === 'users') {
        pullUsers().then(function () { liveRender(col); }).catch(function () {});
        return;
      }
      pullNames([col]).then(function () { liveRender(col); }).catch(function () {});
    });
  }

  async function pushCollectionsImmediate(names) {
    if (!active || !shadow) {
      if (window.showToast) window.showToast('Sin sesión: los cambios se guardaron solo en este navegador', 'warning');
      return false;
    }
    const db = legDb();
    if (!db) return false;
    for (const n of (names || [])) {
      if (SKIP[n] || n === 'users') continue;
      try {
        await pushCollection(n, db[n] || [], shadow[n] || []);
        shadow[n] = clone(db[n] || []);
      } catch (e) {
        if (window.showToast) window.showToast(pushErrorMsg(e, n) + ' — reintentando', 'warning');
      }
    }
    return true;
  }

  window.BackendSync = {
    normUser: function (u) { return normIds(u) || u; },
    pull: pullAll,
    pullPublicShowcase,
    pullShowcase: function () { return pullNames(SHOWCASE); },
    pullCollections: function (names) { return pullNames(names || []); },
    pushCollectionsImmediate,
    pushNow,
    hookSave,
    get active() { return active; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // El legacy puede redefinir saveDB después: re-engancha con retraso y cada
  // 5s (si el hook se pierde, el push muere en silencio y todo queda local).
  setTimeout(hookSave, 3000);
  setInterval(function () { if (bootDone) hookSave(); }, 5000);
  // Si el backend no estaba al cargar (caído/desplegando), reintenta cada
  // 30s y engancha el sync en cuanto aparezca, sin recargar la página.
  setInterval(function () {
    if (bootDone || !window.Backend || !window.Backend.redetect) return;
    try {
      window.Backend.redetect().then(function (ok) { if (ok) boot(); }).catch(function () {});
    } catch (e) {}
  }, 30000);
})();
