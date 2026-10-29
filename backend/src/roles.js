'use strict';
/* Sistema propio de roles — espejo SERVIDOR (fuente de verdad para la API).
 * Definiciones idénticas a js/services/rolesService.js. Sin Auth externo.
 * Regla: el cliente puede decir quién es; el servidor decide qué puede hacer. */

const ROLES = {
  admin:             { key: 'admin',             label: 'Admin',               level: 90 },
  editor:            { key: 'editor',            label: 'Editor',              level: 70 },
  maestro:           { key: 'maestro',           label: 'Maestro',             level: 60 },
  alumno:            { key: 'alumno',            label: 'Alumno',              level: 20 },
  gm:                { key: 'gm',                label: 'GM',                  level: 100 },
  desarrollador:     { key: 'desarrollador',     label: 'Desarrollador',       level: 80 },
  capacitador:       { key: 'capacitador',       label: 'Capacitador',         level: 60 },
  agencia:           { key: 'agencia',           label: 'Agencia',             level: 55 },
  agente_agencia:    { key: 'agente_agencia',    label: 'Agente de Agencia',   level: 25 },
  agente_desarrollo: { key: 'agente_desarrollo', label: 'Agente en Desarrollo', level: 20 },
  prospecto:         { key: 'prospecto',         label: 'Prospecto',           level: 10 },
};

const norm = (u) => String((u && u.role) || '').toLowerCase();
const hasRole = (u, rs) => rs.includes(norm(u));
const isGM = (u) => hasRole(u, ['gm']);
const isAdmin = (u) => hasRole(u, ['admin', 'gm', 'desarrollador']);
const isTeacher = (u) => hasRole(u, ['maestro', 'capacitador', 'agencia', 'admin', 'gm', 'desarrollador']);
const isStudent = (u) => hasRole(u, ['alumno', 'agente_desarrollo', 'agente_agencia', 'prospecto']);
const isAgencia = (u) => hasRole(u, ['agencia', 'admin', 'gm', 'desarrollador']);

/* Cuentas GM protegidas (lógica intacta del legacy canModifyUser). */
function canModifyUser(actor, target) {
  if (!actor || !target) return false;
  if (isGM(target)) return isGM(actor) && String(actor.id) === String(target.id);
  return !isGM(target);
}

/* Matriz de permisos finos por colección para la API genérica.
 * read: roles que pueden leer · write: roles que pueden crear/editar/borrar. */
/* Promotoría + escuela: agentes crean solicitudes/ventas/siniestros y chatean;
 * cotizar/procesar queda en cotizadores (maestro/agencia/admin…). Todos los
 * autenticados leen lo suyo (read null). Escuela: lessons/exams solo docentes. */
const ALL_ROLES = ['admin', 'gm', 'desarrollador', 'editor', 'maestro', 'capacitador', 'agencia', 'agente_agencia', 'agente_desarrollo', 'alumno', 'prospecto'];
const STAFF = ['admin', 'gm', 'desarrollador', 'agencia', 'maestro'];
const TEACHERS = ['admin', 'gm', 'desarrollador', 'editor', 'maestro', 'capacitador'];
const COLLECTION_RULES = {
  ventas:       { read: null, write: [...STAFF, 'agente_agencia', 'agente_desarrollo', 'editor', 'capacitador'] },
  metas:        { read: null, write: STAFF },
  solicitudes:  { read: null, write: ALL_ROLES },
  cotizaciones: { read: null, write: [...STAFF, 'agente_agencia', 'agente_desarrollo', 'editor', 'capacitador'] },
  siniestros:   { read: null, write: [...STAFF, 'agente_agencia', 'agente_desarrollo', 'editor', 'capacitador'] },
  lessons:      { read: null, write: TEACHERS },
  exams:        { read: null, write: TEACHERS },
  /* Academia: crear/editar/borrar grupos es de docencia y staff. Sin regla
   * propia caía en DEFAULT_RULE y un alumno podía reescribirlos por la API. */
  groups:       { read: null, write: ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'agencia'] },
  /* Inscripciones: las mueve quien gestiona el grupo (mismos roles). Antes
   * cualquier alumno podía inscribirse o quitar compañeros por la API. */
  enrollments:  { read: null, write: ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'agencia'] },
  /* Mensajes: «Nuevo grupo» es para agencia/GM/maestro/capacitador (mismo
   * reparto que puedeCrearGrupoEquipo en el portal). El borrado se limita a
   * GM dentro del handler DELETE, porque depende del grupo concreto. */
  chatGroups:   { read: null, write: ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'agencia'] },
  auditoria:    { read: ['admin', 'gm', 'desarrollador'], write: [] }, // solo el servidor escribe
};
/* Colecciones de configuración del portal (lo que ve el público y la matriz de
 * permisos): solo staff puede escribirlas. Antes caían en DEFAULT_RULE y
 * cualquier alumno podía reescribirlas por la API genérica. */
const CONTENT_WRITE = ['admin', 'gm', 'desarrollador', 'editor', 'capacitador', 'maestro', 'agencia'];
const CONFIG_WRITE = ['admin', 'gm', 'desarrollador', 'editor'];
const CONFIG_RULES = {
  rolePermissions: { read: null, write: ['admin', 'gm', 'desarrollador'] },
  settings:        { read: null, write: CONFIG_WRITE },
  autoHub:         { read: null, write: CONTENT_WRITE },
  inmPublica:      { read: null, write: CONTENT_WRITE },
  carruselCirculares: { read: null, write: CONFIG_WRITE },
  guiaBase:        { read: null, write: CONFIG_WRITE },
  practicaConfig:  { read: null, write: CONFIG_WRITE },
  oferta_valor:    { read: null, write: CONFIG_WRITE },
  guiaChats:       { read: null, write: ALL_ROLES }, // cada usuario guarda su historial
  prospectos:      { read: null, write: [...CONTENT_WRITE, 'agente_agencia', 'agente_desarrollo'] },
  expedientesProspectos: { read: null, write: [...CONTENT_WRITE, 'agente_agencia', 'agente_desarrollo'] },
  posts:           { read: null, write: ALL_ROLES },
  media:           { read: null, write: ALL_ROLES },
  library:         { read: null, write: TEACHERS },
  liveClasses:     { read: null, write: TEACHERS },
  notifications:   { read: null, write: ALL_ROLES },
};
Object.assign(COLLECTION_RULES, CONFIG_RULES);
const DEFAULT_RULE = { read: null, write: ALL_ROLES };

/* Claves de `settings` que edita el equipo de contenido — exactamente las
 * secciones que el portal muestra a esos roles (Publicidad, Casos de Éxito,
 * Comparador, Convenios, Historias…). El resto (marca, logo, hero, privacidad)
 * sigue en CONFIG_WRITE. Antes, maestro/capacitador/agencia editaban su
 * sección y el servidor respondía 403: el cambio se quedaba local. */
const CONTENT_SETTINGS_KEYS = new Set([
  'publicidad', 'casosExito', 'comparadorProductos', 'convencionCompanias',
  'capacitaciones', 'blog', 'servicios', 'historias', 'comisiones',
  'aseguradoras', 'caminos', 'ctaFinal', 'empresa', 'hero',
  'portalContent', 'auditoriaContenido',
]);
function canWriteSettingsKey(actor, key) {
  if (hasRole(actor, CONFIG_WRITE)) return true;
  return CONTENT_SETTINGS_KEYS.has(String(key)) && hasRole(actor, CONTENT_WRITE);
}

function canRead(actor, collection) {
  const rule = COLLECTION_RULES[collection] || DEFAULT_RULE;
  if (!rule.read) return true; // cualquier rol autenticado
  return hasRole(actor, rule.read);
}
function canWrite(actor, collection) {
  const rule = COLLECTION_RULES[collection] || DEFAULT_RULE;
  return hasRole(actor, rule.write);
}

module.exports = { ROLES, norm, hasRole, isGM, isAdmin, isTeacher, isStudent, isAgencia, canModifyUser, canRead, canWrite, canWriteSettingsKey, CONTENT_SETTINGS_KEYS };
