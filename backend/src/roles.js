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
  cotizaciones: { read: null, write: [...STAFF, 'editor', 'capacitador'] },
  siniestros:   { read: null, write: [...STAFF, 'agente_agencia', 'agente_desarrollo', 'editor', 'capacitador'] },
  lessons:      { read: null, write: TEACHERS },
  exams:        { read: null, write: TEACHERS },
  auditoria:    { read: ['admin', 'gm', 'desarrollador'], write: [] }, // solo el servidor escribe
};
const DEFAULT_RULE = { read: null, write: ALL_ROLES };

function canRead(actor, collection) {
  const rule = COLLECTION_RULES[collection] || DEFAULT_RULE;
  if (!rule.read) return true; // cualquier rol autenticado
  return hasRole(actor, rule.read);
}
function canWrite(actor, collection) {
  const rule = COLLECTION_RULES[collection] || DEFAULT_RULE;
  return hasRole(actor, rule.write);
}

module.exports = { ROLES, norm, hasRole, isGM, isAdmin, isTeacher, isStudent, isAgencia, canModifyUser, canRead, canWrite };
