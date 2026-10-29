'use strict';
/* API genérica por colección (async, stateless):
 * GET|POST /api/data/:collection · PUT|DELETE /api/data/:collection/:id
 * Permisos según matriz de roles. `users` excluido (ruta propia).
 * Publicaciones nuevas en colecciones escaparate → espejo a public_feed
 * (Realtime: la portada se entera en vivo).
 * Sin sesión: GET /api/public/portal y GET /api/public/config. */
const express = require('express');
const db = require('../db');
const roles = require('../roles');
const mw = require('../middleware');

/* loginAttempts es estado interno del servidor (rate-limit de login): no debe
 * salir en el bundle ni volver por la API desde el navegador. */
const FORBIDDEN = new Set(['users', 'sessions', 'loginAttempts', 'iaUso']);
/* Contenido que NUNCA viaja en el bundle inicial, ni siquiera para dirección:
 * son documentos grandes/config y el cliente los pide solo cuando abre su
 * pantalla (AI Lobby). Así una sesión normal no recibe la base de conocimiento
 * completa ni una eventual clave de Práctica. */
const EXCLUDE_FROM_BUNDLE = new Set(['guiaBase', 'practicaConfig']);
/* Escaparate (portada) + promotoría (encargados) + escuela/chat: todo lo nuevo
 * avisa en vivo por public_feed. El frontend re-hace pull de estas + toast. */
const FEED_COLLECTIONS = new Set([
  'inmPublica', 'autoHub', 'posts', 'carruselCirculares', 'media',
  'solicitudes', 'cotizaciones', 'ventas', 'siniestros',
  'messages', 'groupMessages', 'notifications',
  'lessons', 'liveClasses', 'exams',
  'chatGroups', 'forumPosts',
]);

/* Colecciones de conversación: se leen SIEMPRE frescas (bypass de la caché
 * cálida). Con caché de 30s por instancia, el receptor no veía mensajes
 * recientes hasta 30s después del envío — síntoma “no se envían”. */
const LIVE_FRESH_COLLECTIONS = new Set([
  'messages', 'groupMessages', 'chatGroups', 'forumPosts', 'notifications',
]);

const feedTitle = (collection, rec) => rec.titulo || rec.title || rec.nombre || rec.name
  || (`Nuevo en ${collection}`);

/* ===== MENSAJES / GRUPOS: reglas por grupo en el servidor =====
 * Grupos de chat (chatGroups): cualquiera autenticado puede crear; editar
 * (nombre/miembros/onlyAdminsPost) solo su creador, admins del grupo o staff.
 * Mensajes con toId 'grupo:<id>' / ids de canal: solo miembros; si el grupo
 * exige soloAdminsPost, únicamente admins/staff escriben. */
function chatGroupById(root, id) {
  const col = Array.isArray(root.chatGroups) ? root.chatGroups : [];
  return col.find((g) => g && String(g.id) === String(id));
}
function isStaffComunicacion(user) {
  const r = String((user && user.role) || '').toLowerCase();
  return ['gm', 'desarrollador', 'capacitador', 'admin'].includes(r);
}
function isGroupAdmin(record, user) {
  if (!record || !user) return false;
  const admins = [].concat(record.adminIds || []).map(String);
  const uid = String(user.id);
  // El frontend nombra el campo creadoPorId; el servidor, creatorId. Aceptamos ambos.
  return admins.includes(uid)
    || (record.creatorId !== undefined && String(record.creatorId) === uid)
    || (record.creadoPorId !== undefined && String(record.creadoPorId) === uid);
}
function isGroupMember(record, user) {
  if (!record || !user) return false;
  const members = [].concat(record.memberIds || [], record.adminIds || []).map(String);
  return members.includes(String(user.id));
}
/* message style guard: POST messages for groups and chats */
function resolveGroupKeyForMessage(root, toId) {
  const raw = String(toId || '');
  const gid = raw.startsWith('grupo:') ? raw.slice('grupo:'.length) : raw;
  return gid ? chatGroupById(root, gid) : null;
}
/* #5 espejas la asignación del frontend (puedeChatearCon): alumnos/agentes/
 * agencias/maestros solo escriben a sus asignados (tutor-student, misma
 * agencia o un grupo compartido). Staff conversa con todos. */
function asignados(a, b) {
  if (!a || !b) return false;
  const uid = String(b.id);
  return [].concat(a.students || []).map(String).includes(uid);
}
function puedeContactarDirecto(root, a, b) {
  if (!a || !b) return false;
  if (String(a.id) === String(b.id)) return true;
  if (asignados(a, b) || asignados(b, a)) return true;
  const agA = String(a.agenciaId ?? ''), agB = String(b.agenciaId ?? '');
  if (agA && agB && agA === agB) return true;
  const enGrupo = (g, x) => String(g.tutorId) === String(x.id)
    || [].concat(g.students || []).map(String).includes(String(x.id));
  return (Array.isArray(root.groups) ? root.groups : []).some((g) => g && enGrupo(g, a) && enGrupo(g, b));
}

/* ===== CHAT DE GRUPO DE ACADEMIA (groupMessages) =====
 * `groupId` apunta a `groups` (aula), no a chatGroups. El alumno entra por
 * inscripción (`enrollments`) o por la lista `students`; el tutor por tutorId. */
function grupoAcademia(root, id) {
  return (Array.isArray(root.groups) ? root.groups : [])
    .find((g) => g && String(g.id) === String(id)) || null;
}
function esMiembroAcademia(root, grupo, user) {
  if (!grupo || !user) return false;
  const uid = String(user.id);
  if (String(grupo.tutorId) === uid) return true;
  if ([].concat(grupo.students || []).map(String).includes(uid)) return true;
  return (Array.isArray(root.enrollments) ? root.enrollments : []).some(
    (e) => e && String(e.groupId) === String(grupo.id) && String(e.userId) === uid
  );
}
/* Docencia/staff que administra el aula. `isTeacher` es exactamente el mismo
 * reparto que puede gestionar grupos, así que ve el chat en el detalle de
 * cualquier grupo (no solo el suyo); el alumno sigue limitado a su aula. */
const esStaffAula = (user) => roles.isTeacher(user);

/* ===== LECTURA: filtro por propietario ===== 
 * Antes, cualquier sesión leía ventas/cotizaciones/siniestros/mensajes de todos
 * (y bundle las devolvía enteras). Ahora el personal con visión completa ve
 * todo; el resto solo ve lo suyo. */
const FULL_READ_ROLES = ['admin', 'gm', 'desarrollador', 'agencia', 'maestro', 'capacitador', 'editor'];
const OWNED_COLLECTIONS = new Set(['ventas', 'cotizaciones', 'siniestros']);
/* Objetos { [userId]: … } donde cada quien escribe y lee SOLO su clave. Antes
 * un alumno podía sobrescribir la agenda o el historial de Gu-IA de otro con
 * un PUT a /api/data/agendas/<id ajeno>. */
const RESTRICTED_OBJECTS = new Set(['prospectos', 'expedientesProspectos', 'agendas', 'guiaAgenda', 'guiaChats']);
/* Registros personales: cada fila pertenece a un usuario. El dueño (y la
 * autoridad de su área) puede escribirla; nadie más, aunque conozca el id. */
const CARTERA_AUTORIDAD = (u) => roles.hasRole(u, ['admin', 'gm', 'desarrollador', 'agencia']);
const OWNED_RECORD_FIELDS = {
  taskSubmissions: 'studentId',
  progress: 'userId',
  examAttempts: 'userId',
  practicaSesiones: 'usuarioId',
  clientes: 'agenteId',
  autoCartera: 'agenteId',
  finCartera: 'agenteId',
  inmCartera: 'agenteId',
};
const REGISTRO_AUTORIDAD = {
  taskSubmissions: (u) => roles.isTeacher(u),
  progress: (u) => roles.isTeacher(u),
  examAttempts: (u) => roles.isTeacher(u),
  practicaSesiones: (u) => roles.isTeacher(u),
  clientes: CARTERA_AUTORIDAD,
  autoCartera: CARTERA_AUTORIDAD,
  finCartera: CARTERA_AUTORIDAD,
  inmCartera: CARTERA_AUTORIDAD,
};
function campoDueno(collection) { return OWNED_RECORD_FIELDS[collection] || null; }
function administraRegistros(collection, user) {
  const f = REGISTRO_AUTORIDAD[collection];
  return !!f && f(user);
}
function esRegistroAjeno(collection, rec, user) {
  const campo = campoDueno(collection);
  if (!campo || !rec) return false;
  if (administraRegistros(collection, user)) return false;
  return String(rec[campo]) !== String(user && user.id);
}
const canReadAll = (user) => FULL_READ_ROLES.includes(String((user && user.role) || '').toLowerCase());

/* Objetos privados por usuario (prospectos/expedientesProspectos se guardan
 * como { [userId]: datos }). Antes, a quien no era staff se le devolvía 403 en
 * la LECTURA: su propio expediente quedaba en el servidor pero nunca volvía
 * (en otra computadora aparecía vacío). Ahora recibe SOLO su clave. */
function filtrarObjetoPrivado(user, obj) {
  const uid = String(user && user.id);
  if (!obj || typeof obj !== 'object') return {};
  return obj[uid] !== undefined ? { [uid]: obj[uid] } : {};
}
const soloSuyaLaClave = (user, clave) => canReadAll(user) || String(clave) === String(user && user.id);

/* ===== NOTIFICACIONES: privacidad por destinatario =====
 * Antes, `notifications` se entregaba completa a cualquier sesión: un alumno
 * recibía también las notificaciones personales de los demás (userId/agente),
 * incluidas las de invitaciones y cotizaciones. Ahora el servidor decide:
 *   · destinatario explícito (userId/paraId/agente/…) → solo ese usuario;
 *   · paraRoles/roles → solo los roles indicados;
 *   · aviso general (readBy/leidoPor, sin destinatario) → todos, como antes;
 *   · forma desconocida → solo staff (no se filtra nada personal por error).
 * Se aplica ANTES del atajo de staff: ser admin no da derecho a leer el aviso
 * privado de otra persona. */
const NOTIF_DESTINO_CAMPOS = ['userId', 'paraId', 'destinoId', 'usuarioId', 'toId', 'agente'];
const NOTIF_ROLES_CAMPOS = ['paraRoles', 'roles'];
function idDeDestino(v) {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return null;
  if (typeof v === 'object') return v.id === undefined || v.id === null ? null : String(v.id);
  return String(v);
}
function notificacionVisible(user, n) {
  if (!n || typeof n !== 'object') return false;
  const uid = String(user && user.id);
  const role = String((user && user.role) || '').toLowerCase();
  let tieneDestino = false;
  for (const campo of NOTIF_DESTINO_CAMPOS) {
    const valor = n[campo];
    if (Array.isArray(valor)) {
      if (!valor.length) continue;
      tieneDestino = true;
      if (valor.map(String).includes(uid)) return true;
      continue;
    }
    const id = idDeDestino(valor);
    if (id === null) continue;
    /* `agente` a veces guarda el NOMBRE del agente (legacy ventas): un nombre
     * no puede ser destinatario, así que no debe ocultar el aviso al resto. */
    if (campo === 'agente' && !/^\d+$/.test(id)) continue;
    tieneDestino = true;
    if (id === uid) return true;
  }
  for (const campo of NOTIF_ROLES_CAMPOS) {
    const valor = n[campo];
    if (valor === undefined || valor === null) continue;
    const lista = [].concat(valor).map((x) => String(x).toLowerCase());
    if (!lista.length) continue;
    tieneDestino = true;
    if (lista.includes(role)) return true;
  }
  if (tieneDestino) return false;
  // Aviso general del portal (la app lo marca con readBy/leidoPor).
  if (Array.isArray(n.readBy) || Array.isArray(n.leidoPor)) return true;
  return canReadAll(user);
}

function filtrarLectura(user, collection, items, root) {
  if (collection === 'notifications') {
    return items.filter((n) => notificacionVisible(user, n));
  }
  if (canReadAll(user)) return items;
  const uid = String(user.id);
  /* Avance, entregas, intentos y cartera: el alumno/agente ve solo lo suyo. */
  const campo = campoDueno(collection);
  if (campo) return items.filter((x) => x && String(x[campo]) === uid);
  if (OWNED_COLLECTIONS.has(collection)) {
    /* cotizaciones guarda al solicitante en `creadoPor.id` (no en agenteId):
     * sin leer esa ruta, un agente que pedía una cotización no la volvía a ver
     * al entrar desde otra computadora (el servidor filtraba su propio
     * registro). */
    return items.filter((x) => x && (
      String(x.agenteId ?? x.agente ?? x.usuarioId ?? '') === uid
      || String((x.creadoPor && x.creadoPor.id) ?? '') === uid
    ));
  }
  if (collection === 'messages') {
    return items.filter((m) => {
      if (!m) return false;
      if (String(m.fromId ?? '') === uid || String(m.toId ?? '') === uid) return true;
      const gid = String(m.toId ?? '');
      if (gid.startsWith('grupo:')) {
        const g = chatGroupById(root, gid.slice('grupo:'.length));
        return !!g && isGroupMember(g, user);
      }
      return false;
    });
  }
  /* Chat de aula: el alumno ve los mensajes del grupo al que está inscrito.
   * Antes se comparaba fromId/toId y groupMessages guarda authorId/groupId:
   * el alumno no veía NINGÚN mensaje de su grupo. */
  if (collection === 'groupMessages') {
    return items.filter((m) => m && (
      String(m.authorId ?? '') === uid
      || esMiembroAcademia(root, grupoAcademia(root, m.groupId), user)
    ));
  }
  return items;
}

/* Detección de duplicado de post: mismo contenido + autor + grupo. Devuelve
 * índice en el array o -1. Normaliza espacio y comparación por String para
 * tolerar tipos int/Autor mezclados entre versiones del frontend. */
function findPostDupe(col, body) {
  const content = String(body.content ?? body.texto ?? '').replace(/\s+/g, ' ').trim();
  if (!content) return -1;
  const author = String(body.authorId ?? body.userId ?? '');
  const group = String(body.groupId ?? body.grupoId ?? '');
  return col.findIndex((x) => !x || typeof x !== 'object' ? -1 : (
    String(x.content ?? x.texto ?? '').replace(/\s+/g, ' ').trim() === content
    && String(x.authorId ?? x.userId ?? '') === author
    && String(x.groupId ?? x.grupoId ?? '') === group
  ));
}

/* COLECCIONES-OBJETO: el legacy guarda varias secciones COMO OBJETO, no array
 * (settings.publicidad, settings.comparadorProductos/casosExito/comisiones,
 * autoHub.unidades/clientes/publicidad/practica/guion, inmPublica.props,
 * carruselCirculares, prospectos, expedientesProspectos, notifications).
 * Antes el sync API sólo entendía arrays: las reemplazaba por [] (pérdida
 * de contenido, p. ej. publicidad/capacitaciones/clientes no viajaban).
 * Ahora: GET devuelve { object } · PUT/:clave escribe una clave top-level
 * (granular, last-write-wins POR CLAVE, no por objeto completo) ·
 * DELETE/:clave borra la clave · POST mergea claves (no coacciona a []). */
const KNOWN_OBJECTS = new Set([
  'settings', 'autoHub', 'inmPublica', 'carruselCirculares',
  'prospectos', 'expedientesProspectos', 'rolePermissions',
  'guiaBase', // {docs:[]} — Gu-IA: base de conocimiento del comercial (legacy 3148)
  'guiaChats', // {[userId]: [...]} — historial de conversaciones Gu-IA por usuario
  'practicaConfig', // configuración del simulador de práctica con cliente
  'oferta_valor', // configuración de slides y video de Oferta de Valor
  /* Objetos por usuario que el cliente guarda como { [userId]: … } y el
   * servidor trataba como ARRAY: cada clave respondía 404 y el dato se
   * quedaba en el equipo. */
  'agendas', // Mi Agenda: notas por usuario
  'guiaAgenda', // agenda del prospecto (Gu-IA)
]);
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/* `practicaConfig` es configuración LOCAL del simulador (proveedor, URL,
 * modelo). Las claves de API jamás deben guardarse en la base compartida: si
 * un cliente viejo las manda, se descartan antes de persistir y nunca se
 * devuelven en una lectura. */
const CAMPOS_SECRETOS_CONFIG = /^(apiKey|api_key|secret|token|password|authorization)$/i;
function sinSecretosConfig(obj) {
  if (!isPlain(obj)) return { valor: obj, quitados: 0 };
  const out = { ...obj };
  let quitados = 0;
  for (const k of Object.keys(out)) {
    if (CAMPOS_SECRETOS_CONFIG.test(k)) { delete out[k]; quitados++; }
  }
  return { valor: out, quitados };
}

module.exports = (store, config) => {
  const r = express.Router();

  let publicPortalCache = null;
  let publicPortalCacheAt = 0;

  /* ¿La portada trae algo que mostrar? Si no, es preferible reintentar la
   * lectura completa antes de servir una página en blanco. */
  const portalTieneContenido = (d) => !!d && (
    (d.settings && Object.keys(d.settings).length > 0)
    || (Array.isArray(d.autoHub) && d.autoHub.length > 0)
    || (Array.isArray(d.inmPublica) && d.inmPublica.length > 0)
  );

  r.get('/public/portal', async (req, res, next) => {
    try {
      let data = store.get();
      if (typeof store.isWarm === 'function' && !store.isWarm() && typeof store.adapter.loadCollections === 'function') {
        if (publicPortalCache && Date.now() - publicPortalCacheAt < 30000) {
          data = publicPortalCache;
        } else {
          data = await store.adapter.loadCollections(['settings', 'autoHub', 'inmPublica']);
          /* Nunca se guarda un recorte vacío: envenenaba 30 s de portada. */
          if (portalTieneContenido(data)) {
            publicPortalCache = data;
            publicPortalCacheAt = Date.now();
          }
        }
      } else {
        await store.refreshIfStale(); // lectura: el TTL basta (eventual consistency)
        data = store.get();
      }
      /* Instancia recién arrancada con el recorte vacío (credenciales que aún
       * no ven las colecciones, caché parcial…): se reintenta por la vía
       * completa en vez de devolver la portada sin logo ni vehículos. */
      if (!portalTieneContenido(data)) {
        try {
          if (typeof store.refreshForWrite === 'function') {
            await store.refreshForWrite(['settings', 'autoHub', 'inmPublica']);
          } else {
            await store.refreshIfStale();
          }
          const completo = store.get();
          if (portalTieneContenido(completo)) data = completo;
        } catch (e) { /* se sirve lo que haya */ }
      }
      const settings = data.settings || {};
      const rawAutos = Array.isArray(data.autoHub)
        ? data.autoHub
        : (data.autoHub && Array.isArray(data.autoHub.unidades) ? data.autoHub.unidades : []);
      const rawProps = Array.isArray(data.inmPublica)
        ? data.inmPublica
        : (data.inmPublica && Array.isArray(data.inmPublica.props) ? data.inmPublica.props : []);
      const autosPublicos = rawAutos.filter((u) => u && (!u.estado || u.estado === 'Disponible' || u.estado === 'Reservada'));
      const propsPublicas = rawProps.filter((p) => p && !p.vendida && p.estado !== 'Vendida');
      res.json({
        ok: true,
        portal: {
          institutionName: settings.institutionName || 'Broker Booster',
          logo: settings.logo || null,
          autosDisponibles: autosPublicos.length,
          propiedadesPublicadas: propsPublicas.length,
          autos: autosPublicos,
          propiedades: propsPublicas,
          hero: settings.hero || null,
          caminos: settings.caminos || null,
          comisiones: settings.comisiones || null,
          historias: settings.historias || null,
          aseguradoras: settings.aseguradoras || null,
          servicios: settings.servicios || null,
          blog: settings.blog || null,
          privacidad: settings.privacidad || null,
          ctaFinal: settings.ctaFinal || null,
          empresa: settings.empresa || null,
        },
      });
    } catch (e) { next(e); }
  });

  /* La IA del portal vive en /api/ia (proxy con cupo). Aquí ya no se entrega
   * ninguna clave: tenerla en el navegador permitía gastarla fuera del portal. */

  /* Config pública para el realtime del frontend (la ANON key es pública por
   * diseño; RLS solo le permite leer public_feed). */
  r.get('/public/config', (req, res) => {
    const realtime = !!(config.supabaseUrl && config.supabaseAnonKey);
    res.json({
      ok: true,
      realtime,
      supabaseUrl: realtime ? config.supabaseUrl : null,
      anonKey: realtime ? config.supabaseAnonKey : null,
    });
  });

  const api = express.Router();
  api.use(mw.requireAuth);

  /* Índice de colecciones sincronizables (el frontend hace pull de estas).
   * Excluye users/sessions (rutas propias) y todo lo que no sea array.
   * Incluye VACÍAS conocidas para que incógnito también las pida (si el
   * servidor aún no las tiene, el GET devuelve [] y no se pierde nada). */
  const KNOWN_EMPTY = ['ventas', 'metas', 'solicitudes', 'cotizaciones', 'siniestros',
    'lessons', 'liveClasses', 'exams', 'library', 'messages', 'groupMessages',
    'notifications', 'posts', 'auditoria', 'chatGroups', 'forumPosts', 'invitaciones',
    'convenciones', 'clientes', 'progress', 'enrollments', 'taskSubmissions', 'examAttempts',
    'concursos', 'cierresComunidad'];
  api.get('/', async (req, res, next) => {
    try {
      await store.refreshIfStale(); // lectura: el TTL basta
      const data = store.get();
      const set = new Set(Object.keys(data).filter(
        (k) => !FORBIDDEN.has(k) && (Array.isArray(data[k]) || isPlain(data[k]))
      ));
      for (const k of KNOWN_EMPTY) if (!FORBIDDEN.has(k)) set.add(k);
      for (const k of KNOWN_OBJECTS) if (!FORBIDDEN.has(k)) set.add(k);
      res.json({ ok: true, collections: [...set] });
    } catch (e) { next(e); }
  });

  /* Endpoint Batch (/api/data/bundle): devuelve todas las colecciones legibles
   * por el usuario en UNA sola petición HTTP (elimina la cascada de ~18 GETs
   * al iniciar sesión o recargar). */
  api.get('/bundle', async (req, res, next) => {
    try {
      await store.refreshIfStale();
      const data = store.get();
      const set = new Set(Object.keys(data).filter(
        (k) => !FORBIDDEN.has(k) && (Array.isArray(data[k]) || isPlain(data[k]))
      ));
      for (const k of KNOWN_EMPTY) if (!FORBIDDEN.has(k)) set.add(k);
      for (const k of KNOWN_OBJECTS) if (!FORBIDDEN.has(k)) set.add(k);
      const bundle = {};
      for (const col of set) {
        if (EXCLUDE_FROM_BUNDLE.has(col)) continue;
        if (!roles.canRead(req.user, col)) continue;
        if (isPlain(data[col])) {
          bundle[col] = {
            shape: 'object',
            value: RESTRICTED_OBJECTS.has(col) && !canReadAll(req.user)
              ? filtrarObjetoPrivado(req.user, data[col])
              : data[col],
          };
        } else if (!data[col] && KNOWN_OBJECTS.has(col)) {
          bundle[col] = { shape: 'object', value: {} };
        } else {
          bundle[col] = { shape: 'array', items: filtrarLectura(req.user, col, Array.isArray(data[col]) ? data[col] : [], data) };
        }
      }
      // Todos los usuarios autenticados reciben el directorio de usuarios seguros
      // (sin passwordHash) para poder ver contactos reales en Mensajes/Chat y Ranking
      // sin disparar GET /api/users (403 para alumnos/agentes).
      let users = db.collection(data, 'users').map(db.safeUser);
      if (!users.length) {
        /* Una instancia serverless puede tener la caché de usuarios vacía (se
         * hidrató solo una colección). Mandar `users: []` hacía que el cliente
         * borrara su directorio y volviera a empujar usuarios que ya existían:
         * de ahí el PUT al usuario en cada carga. Si la caché no tiene
         * usuarios, se leen frescos; si tampoco, se omite la clave y el cliente
         * conserva el directorio que ya tenía. */
        try {
          const fresh = await store.adapter.listUsers();
          if (Array.isArray(fresh) && fresh.length) users = fresh.map(db.safeUser);
        } catch (e) { /* se omite la clave */ }
      }
      res.json(users.length ? { ok: true, bundle, users } : { ok: true, bundle });
    } catch (e) { next(e); }
  });

  api.get('/:collection', async (req, res, next) => {
    try {
      const { collection } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      if (!roles.canRead(req.user, collection)) return res.status(403).json({ ok: false, error: 'Sin permiso de lectura' });
      // Conversación: lectura FRESCA desde el adapter (sin caché cálida de
      // instancia). Así el receptor ve el mensaje al instante y el cliente
      // no reinventa lo ya guardado (duplicados por divergencia).
      if (LIVE_FRESH_COLLECTIONS.has(collection)) {
        await store.refreshForWrite([collection]); // revalida esa colección en caché
      }
      /* Refresco SOLO de lo que esta respuesta necesita. Antes se recargaba la
       * tabla documents completa (~27 MB) en cada GET: latencia alta, timeouts
       * y los 500/401 en cascada que dejaban los cambios sin subir. */
      const deps = (collection === 'messages' || collection === 'groupMessages')
        ? [collection, 'chatGroups', 'groups']
        : [collection];
      if (typeof store.refreshCollections === 'function') await store.refreshCollections(deps);
      else await store.refreshIfStale();
      const root = store.get();
      /* Configuración de Práctica: se entrega saneada y solo a dirección
       * (roles.canRead ya lo exige arriba). Nunca incluye apiKey/token. */
      if (collection === 'practicaConfig') {
        return res.json({ ok: true, object: sinSecretosConfig(root[collection]).valor || {} });
      }
      // Objeto: NUNCA pasar por db.collection (coaccionaría a []).
      if (RESTRICTED_OBJECTS.has(collection) && !canReadAll(req.user)) {
        return res.json({ ok: true, object: filtrarObjetoPrivado(req.user, root[collection]) });
      }
      if (isPlain(root[collection])) {
        return res.json({ ok: true, object: root[collection] });
      }
      // Objeto conocido aún vacío: se entrega {} (incógnito/primera vez).
      if (!root[collection] && KNOWN_OBJECTS.has(collection)) {
        return res.json({ ok: true, object: {} });
      }
      let items = Array.isArray(root[collection]) ? root[collection].slice() : [];
      items = filtrarLectura(req.user, collection, items, root);
      if (req.query.q) {
        const q = String(req.query.q).toLowerCase();
        items = items.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
      }
      res.json({ ok: true, items });
    } catch (e) { next(e); }
  });

  api.post('/:collection', async (req, res, next) => {
    try {
      const { collection } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      /* settings: el equipo de contenido puede escribir SUS claves aunque no
       * tenga permiso sobre el objeto completo (ver roles.canWriteSettingsKey). */
      const clavesPermitidas = collection === 'settings'
        ? Object.keys(req.body || {}).filter((k) => roles.canWriteSettingsKey(req.user, k))
        : [];
      if (!roles.canWrite(req.user, collection) && !clavesPermitidas.length) {
        return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      }
      // ORDEN CRÍTICO: refrescar ANTES de resolver la colección. Si se resuelve
      // antes, `col` apunta a la caché vieja y el push muta un objeto que el
      // persist ya no guarda (respuesta 201 pero dato perdido en producción).
      /* Sin 'auditoria': es append-only y pesaba 26 MB. Se escribe por
       * entrada con adapter.pushAudit (ver store.persistCollections). */
      await store.refreshForWrite([collection]);
      const root = store.get();
      let body = req.body || {};
      /* Nunca persistir claves de API en la configuración compartida. */
      if (collection === 'practicaConfig') {
        const limpio = sinSecretosConfig(body);
        if (limpio.quitados && !Object.keys(limpio.valor || {}).length) {
          return res.status(400).json({ ok: false, error: 'No se guardan claves de API en la configuración compartida' });
        }
        body = limpio.valor;
      }
      /* Guardas de comunidad Mensajes (chatGroups + mensajes a grupos). */
      if (collection === 'chatGroups' && !isStaffComunicacion(req.user)) {
        const existente = chatGroupById(root, body.id);
        if (existente) {
          if (!isGroupAdmin(existente, req.user)) {
            return res.status(403).json({ ok: false, error: 'Solo admins del grupo pueden modificarlo' });
          }
        } else {
          // Creación: el creador queda como admin del grupo.
          body.creatorId = req.user.id;
          const admins = new Set([].concat(body.adminIds || []).map(String));
          admins.add(String(req.user.id));
          body.adminIds = [...admins];
        }
      }
      if (collection === 'messages') {
        const grupo = resolveGroupKeyForMessage(root, body.toId);
        if (grupo) {
          // Solo se exige membresía si el grupo tiene lista de miembros
          // (canales sembrados quedan abiertos, como los viejos #canales).
          const exigeMembresia = Array.isArray(grupo.memberIds) && grupo.memberIds.length > 0;
          if (exigeMembresia && !isGroupMember(grupo, req.user) && !isStaffComunicacion(req.user)) {
            return res.status(403).json({ ok: false, error: 'No eres miembro de este grupo' });
          }
          if (grupo.onlyAdminsPost && !isGroupAdmin(grupo, req.user) && !isStaffComunicacion(req.user)) {
            return res.status(403).json({ ok: false, error: 'Solo los admins del grupo pueden publicar aquí' });
          }
        } else if (!grupo && body.toId !== undefined && body.toId !== null) {
          // Mensaje DIRECTO: quien no es staff solo escribe a sus asignados.
          const fromU = (Array.isArray(root.users) ? root.users : []).find((u) => String(u.id) === String(req.user.id));
          const toU = (Array.isArray(root.users) ? root.users : []).find((u) => String(u.id) === String(body.toId));
          if (fromU && toU && !isStaffComunicacion(req.user) && !puedeContactarDirecto(root, fromU, toU)) {
            return res.status(403).json({ ok: false, error: 'Solo puedes escribir a los usuarios asignados' });
          }
        }
      }
      /* Chat del aula: solo miembros (o staff) publican; el autor SIEMPRE es
       * la sesión. Sin esto cualquier alumno escribía en el grupo de otro. */
      if (collection === 'groupMessages') {
        const existente = body.id !== undefined && body.id !== null
          ? (Array.isArray(root.groupMessages) ? root.groupMessages : [])
            .find((x) => x && String(x.id) === String(body.id))
          : null;
        const grupo = grupoAcademia(root, body.groupId);
        if (!grupo && !existente) {
          return res.status(403).json({ ok: false, error: 'Grupo no encontrado' });
        }
        if (!esStaffAula(req.user)) {
          if (existente) {
            if (String(existente.authorId) !== String(req.user.id)) {
              return res.status(403).json({ ok: false, error: 'Solo el autor puede editar este mensaje' });
            }
          } else if (!esMiembroAcademia(root, grupo, req.user)) {
            return res.status(403).json({ ok: false, error: 'No eres miembro de este grupo' });
          }
        }
        // El autor de un mensaje nuevo siempre es la sesión (nadie lo suplanta).
        if (!existente) body.authorId = req.user.id;
      }
      /* Registros personales: el dueño sale de la sesión, no del cuerpo. */
      const campoRegistro = campoDueno(collection);
      if (campoRegistro) {
        const existente = body.id !== undefined && body.id !== null
          ? (Array.isArray(root[collection]) ? root[collection] : [])
            .find((x) => x && String(x.id) === String(body.id))
          : null;
        if (esRegistroAjeno(collection, existente, req.user)) {
          return res.status(403).json({ ok: false, error: 'Solo puedes escribir tus propios registros' });
        }
        if (!administraRegistros(collection, req.user)) {
          if (body[campoRegistro] !== undefined && String(body[campoRegistro]) !== String(req.user.id)) {
            return res.status(403).json({ ok: false, error: 'Solo puedes escribir tus propios registros' });
          }
          body[campoRegistro] = req.user.id;
        }
      }
      // Objeto: merge por claves top-level (protege el objeto; jamás []).
      if (isPlain(root[collection]) || (!root[collection] && KNOWN_OBJECTS.has(collection))) {
        root[collection] = root[collection] || {};
        let merged = 0;
        for (const [k, v] of Object.entries(body)) {
          // Objetos privados: cada usuario solo escribe su propia clave.
          if (RESTRICTED_OBJECTS.has(collection) && !soloSuyaLaClave(req.user, k)) {
            return res.status(403).json({ ok: false, error: 'Solo puedes editar tu propio expediente' });
          }
          // settings: cada rol solo puede tocar las claves que le corresponden.
          if (collection === 'settings' && !roles.canWriteSettingsKey(req.user, k)) continue;
          if (v !== undefined) { root[collection][k] = v; merged++; }
        }
        if (collection === 'settings' && !merged) {
          return res.status(403).json({ ok: false, error: 'Sin permiso sobre esa sección de configuración' });
        }
        db.audit(store.get(), `edicion_${collection}`, req.user, { claves: Object.keys(body) });
        await store.persistCollections([collection, 'auditoria']);
        if (FEED_COLLECTIONS.has(collection)) {
          store.pushFeed({ kind: collection, title: `Actualización en ${collection}` }).catch(() => {});
        }
        return res.json({ ok: true, item: root[collection], merged });
      }
      const col = db.collection(store.get(), collection);
      // Upsert por id: el frontend crea con id local (Date.now) y sincroniza.
      // Si el id ya existe se reemplaza (200); si no, se crea (201).
      if (body.id !== undefined && body.id !== null) {
        const ix = col.findIndex((x) => String(x.id) === String(body.id));
        if (ix >= 0) {
          col[ix] = { ...body, id: col[ix].id };
          db.audit(store.get(), `edicion_${collection}`, req.user, { id: col[ix].id });
          await store.persistCollections([collection, 'auditoria']);
          return res.json({ ok: true, item: col[ix], upserted: true });
        }
        // El cliente manda el mismo contenido con id nuevo (dispositivo sin
        // sincronidad): en vez de duplicar el post cada día, se actualiza la
        // fila existente conservando su id y createdAt originales.
        const dupe = collection === 'posts' ? findPostDupe(col, body) : -1;
        if (dupe >= 0) {
          col[dupe] = { ...body, id: col[dupe].id, createdAt: col[dupe].createdAt || body.createdAt || new Date().toISOString() };
          db.audit(store.get(), `edicion_posts`, req.user, { id: col[dupe].id, dedupe: true });
          await store.persistCollections([collection, 'auditoria']);
          return res.json({ ok: true, item: col[dupe], upserted: true, deduped: true });
        }
      }
      // POST de post idéntico (mismo autor y grupo): actualiza el existente
      // en vez de crear otra copia que contamine el muro público.
      const dupe = collection === 'posts' ? findPostDupe(col, body) : -1;
      if (dupe >= 0) {
        col[dupe] = { ...body, id: col[dupe].id, createdAt: col[dupe].createdAt || body.createdAt || new Date().toISOString() };
        db.audit(store.get(), `edicion_posts`, req.user, { id: col[dupe].id, dedupe: true });
        await store.persistCollections([collection, 'auditoria']);
        return res.json({ ok: true, item: col[dupe], deduped: true });
      }
      const rec = { ...body, id: body.id ?? db.newId() };
      col.push(rec);
      db.audit(store.get(), `creacion_${collection}`, req.user, { id: rec.id });
      await store.persistCollections([collection, 'auditoria']);
      if (FEED_COLLECTIONS.has(collection)) {
        store.pushFeed({ kind: collection, title: feedTitle(collection, rec) }).catch(() => {});
      }
      res.status(201).json({ ok: true, item: rec });
    } catch (e) { next(e); }
  });

  api.put('/:collection/:id', async (req, res, next) => {
    try {
      const { collection, id } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      /* settings: escribir una CLAVE concreta basta con permiso de contenido
       * (publicidad, casos de éxito, comparador…), sin ser admin de marca. */
      const claveSettings = collection === 'settings' && roles.canWriteSettingsKey(req.user, id);
      if (!roles.canWrite(req.user, collection) && !claveSettings) {
        return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      }
      /* Sin 'auditoria': es append-only y pesaba 26 MB. Se escribe por
       * entrada con adapter.pushAudit (ver store.persistCollections). */
      await store.refreshForWrite([collection]);
      const root = store.get();
      // Objeto: :id es la CLAVE top-level a escribir/crear. { value }
      if (isPlain(root[collection]) || (!root[collection] && KNOWN_OBJECTS.has(collection))) {
        root[collection] = root[collection] || {};
        if (!('value' in (req.body || {}))) {
          return res.status(400).json({ ok: false, error: 'Se espera { value }' });
        }
        if (collection === 'practicaConfig' && CAMPOS_SECRETOS_CONFIG.test(String(id))) {
          return res.status(400).json({ ok: false, error: 'No se guardan claves de API en la configuración compartida' });
        }
        if (RESTRICTED_OBJECTS.has(collection) && !soloSuyaLaClave(req.user, id)) {
          return res.status(403).json({ ok: false, error: 'Solo puedes editar tu propio expediente' });
        }
        let valor = req.body.value === null ? null : req.body.value;
        if (collection === 'practicaConfig') valor = sinSecretosConfig(valor).valor;
        root[collection][id] = valor;
        db.audit(store.get(), `edicion_${collection}`, req.user, { clave: id });
        await store.persistCollections([collection, 'auditoria']);
        if (FEED_COLLECTIONS.has(collection)) {
          store.pushFeed({ kind: collection, title: `Actualización en ${collection}` }).catch(() => {});
        }
        return res.json({ ok: true, value: root[collection][id] });
      }
      const col = db.collection(store.get(), collection);
      const rec = db.byId(col, id);
      if (!rec) return res.status(404).json({ ok: false, error: 'No encontrado' });
      // groupMessages: editar solo el autor o staff.
      if (collection === 'groupMessages' && !esStaffAula(req.user)
        && String(rec.authorId) !== String(req.user.id)) {
        return res.status(403).json({ ok: false, error: 'Solo el autor puede editar este mensaje' });
      }
      // Registros personales: no se transfiere el dueño ni se edita el ajeno.
      const campoRegistroPut = campoDueno(collection);
      if (campoRegistroPut) {
        if (esRegistroAjeno(collection, rec, req.user)) {
          return res.status(403).json({ ok: false, error: 'Solo puedes escribir tus propios registros' });
        }
        if (!administraRegistros(collection, req.user)) {
          req.body = req.body || {};
          req.body[campoRegistroPut] = req.user.id;
        }
      }
      // chatGroups: editar solo creador/admins/grupo staff.
      if (collection === 'chatGroups' && !isStaffComunicacion(req.user) && !isGroupAdmin(rec, req.user)) {
        return res.status(403).json({ ok: false, error: 'Solo admins del grupo pueden modificarlo' });
      }
      // messages a grupo: si el grupo es "solo admins publican" el autor no-admin no puede editar su mensaje.
      if (collection === 'messages') {
        const grupo = resolveGroupKeyForMessage(store.get(), rec.toId);
        if (grupo && grupo.onlyAdminsPost && !isGroupAdmin(grupo, req.user) && !isStaffComunicacion(req.user) && String(rec.fromId) !== String(req.user.id)) {
          return res.status(403).json({ ok: false, error: 'Solo los admins del grupo pueden publicar aquí' });
        }
      }
      Object.assign(rec, req.body || {}, { id: rec.id });
      db.audit(store.get(), `edicion_${collection}`, req.user, { id: rec.id });
      await store.persistCollections([collection, 'auditoria']);
      // PUT en arrays también avisa en vivo (antes solo POST/objetos). El
      // ticker de versiones ya cubre todo, esto mantiene el toast del feed.
      if (FEED_COLLECTIONS.has(collection)) {
        store.pushFeed({ kind: collection, title: `Actualización en ${collection}` }).catch(() => {});
      }
      res.json({ ok: true, item: rec });
    } catch (e) { next(e); }
  });

  api.delete('/:collection/:id', async (req, res, next) => {
    try {
      const { collection, id } = req.params;
      if (FORBIDDEN.has(collection)) return res.status(404).json({ ok: false, error: 'No disponible' });
      const claveSettingsDel = collection === 'settings' && roles.canWriteSettingsKey(req.user, id);
      if (!roles.canWrite(req.user, collection) && !claveSettingsDel) {
        return res.status(403).json({ ok: false, error: 'Sin permiso de escritura' });
      }
      /* Sin 'auditoria': es append-only y pesaba 26 MB. Se escribe por
       * entrada con adapter.pushAudit (ver store.persistCollections). */
      await store.refreshForWrite([collection]);
      const data = store.get();
      // Objeto: borra la CLAVE top-level (diff del frontend baja borrados).
      if (isPlain(data[collection])) {
        if (RESTRICTED_OBJECTS.has(collection) && !soloSuyaLaClave(req.user, id)) {
          return res.status(403).json({ ok: false, error: 'Solo puedes editar tu propio expediente' });
        }
        if (collection === 'settings' && !roles.canWriteSettingsKey(req.user, id)) {
          return res.status(403).json({ ok: false, error: 'Sin permiso sobre esa sección de configuración' });
        }
        if (!(id in data[collection])) return res.status(404).json({ ok: false, error: 'Clave no encontrada' });
        delete data[collection][id];
        db.audit(data, `borrado_${collection}`, req.user, { clave: id });
        await store.persistCollections([collection, 'auditoria']);
        return res.json({ ok: true });
      }
      /* Chat del aula: el tutor puede limpiar mensajes al borrar su grupo; el
       * alumno solo los propios. Sin esto, cualquiera borraba el chat ajeno. */
      if (collection === 'groupMessages') {
        const msg = (data.groupMessages || []).find((x) => x && String(x.id) === String(id));
        if (msg && !esStaffAula(req.user)
          && String(msg.authorId) !== String(req.user.id)) {
          const grupo = grupoAcademia(data, msg.groupId);
          const esTutor = grupo && String(grupo.tutorId) === String(req.user.id);
          if (!esTutor) {
            return res.status(403).json({ ok: false, error: 'Solo el autor o el tutor puede borrar este mensaje' });
          }
        }
      }
      // Registros personales: borrar solo lo propio (o con autoridad del área).
      if (campoDueno(collection)) {
        const recDel = (data[collection] || []).find((x) => x && String(x.id) === String(id));
        if (!recDel) return res.status(404).json({ ok: false, error: 'No encontrado' });
        if (esRegistroAjeno(collection, recDel, req.user)) {
          return res.status(403).json({ ok: false, error: 'Solo puedes borrar tus propios registros' });
        }
      }
      const before = (data[collection] || []).length;
      /* chatGroups: el portal solo ofrece la papelera a un GM (regla de
       * producto). Antes el servidor aceptaba el borrado de cualquier staff o
       * del creador/admin del grupo: la UI lo ocultaba pero la API no. */
      if (collection === 'chatGroups') {
        if (String(id).startsWith('canal:')) {
          return res.status(400).json({ ok: false, error: 'Los canales base del equipo no se pueden eliminar' });
        }
        if (!roles.isGM(req.user)) {
          return res.status(403).json({ ok: false, error: 'Solo un GM puede eliminar grupos' });
        }
      }
      data[collection] = (data[collection] || []).filter((x) => String(x.id) !== String(id));
      if (data[collection].length === before) return res.status(404).json({ ok: false, error: 'No encontrado' });
      db.audit(data, `borrado_${collection}`, req.user, { id });
      await store.persistCollections([collection, 'auditoria']);
      if (FEED_COLLECTIONS.has(collection)) {
        store.pushFeed({ kind: collection, title: `Actualización en ${collection}` }).catch(() => {});
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.use('/data', api);
  return r;
};
