'use strict';
/* ============================================================================
 * guiaSecciones.js — contexto de sesiones, apps y exámenes para Gu-IA
 *
 * Se ejecuta en el servidor, con la sesión autenticada. Aplica los mismos
 * filtros que la interfaz:
 *  - Sesiones: docencia/staff ve todas; el resto, solo las asignadas a su
 *    usuario o a sus grupos, más las transmisiones activas.
 *  - Apps: se respeta la lectura de `externalApps` (prospecto no la tiene).
 *  - Exámenes: el alumno solo ve los asignados y NUNCA recibe preguntas ni
 *    respuestas correctas. Docencia/staff recibe el detalle para gestionar.
 *
 * Los listados simples se responden sin llamar al modelo. El contexto se
 * inyecta solo cuando la conversación trata de esas secciones.
 * ========================================================================== */

const roles = require('./roles');

const MAX_CONTEXTO = 14000;
const MAX_SESIONES = 24;
const MAX_AGENDA = 10;
const MAX_APPS = 24;
const MAX_EXAMENES = 16;
const MAX_PREGUNTAS_CONTEXTO = 30;
const MAX_PREGUNTAS_RESPUESTA = 30;
const MAX_DESCRIPCION = 200;

/* Copia de la app fija del portal. Las apps nuevas viven en `externalApps`. */
const BUILTIN_APPS = [
  {
    id: 'vertice',
    name: 'Vértice',
    description: 'Videoconferencias seguras con agenda, salas protegidas por contraseña, lobby de acceso y minutas automáticas con IA.',
    url: 'https://sumitims.base44.app',
    tag: 'Base44',
    note: 'Los anfitriones inician sesión con su cuenta de Base44. Los invitados entran con la liga y la contraseña de la sala, sin crear cuenta.',
  },
];

const ANALISIS_RE = /(recomienda|recomiéndame|recomiendame|sugiere|sugiéreme|sugiereme|aconseja|analiza|análisis|analisis|compara|comparación|comparacion|opina|evalúa|evalua|organiza|prioriza|planifica|mejora|resume)/;

function limpiar(valor) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
}

function normalizar(valor) {
  return limpiar(valor).toLowerCase();
}

function ids(valor) {
  return [].concat(valor == null ? [] : valor).map(String);
}

function fecha(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fechaTexto(valor) {
  const d = fecha(valor);
  if (!d) return 'Fecha no indicada';
  try {
    return d.toLocaleString('es-MX', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
    });
  } catch (e) {
    return d.toISOString();
  }
}

function nombreUsuario(root, id) {
  if (!root || !Array.isArray(root.users)) return '';
  const u = root.users.find((x) => x && String(x.id) === String(id));
  return u ? limpiar(u.name || u.username) : '';
}

function nombreGrupo(root, id) {
  if (!root || !Array.isArray(root.groups)) return '';
  const g = root.groups.find((x) => x && String(x.id) === String(id));
  return g ? limpiar(g.name || g.nombre) : '';
}

function etiquetaRol(user) {
  const key = String((user && user.role) || '').toLowerCase();
  return (roles.ROLES[key] && roles.ROLES[key].label) || key || 'Sin rol';
}

function recortar(texto, max) {
  const t = String(texto || '');
  return t.length > max
    ? t.slice(0, max - 100) + '\n[Contexto truncado; consulta la sección del portal para el detalle completo.]\n=== FIN DEL BLOQUE ==='
    : t;
}

function temasDeSecciones(texto) {
  const t = normalizar(texto);
  const general = /(resumen (?:del|de el) portal|estado (?:del|general) del portal|mi d[ií]a|qu[eé] tengo (?:pendiente|hoy)|todas las secciones|analiza el portal)/.test(t);
  return {
    general,
    sesiones: general || /\bsesi[oó]n(?:es)?\b|\bclases?\b|\bagenda\b|\bcalendario\b|\bpendientes?\b|\bpr[oó]xim[oa]s?\b/.test(t),
    apps: general || /\bapps?\b|\baplicaciones?\b|\bherramientas?\b|\bgadgets?\b/.test(t),
    examenes: general || /\bex[aá]men(?:es)?\b|\bevaluaci[oó]n(?:es)?\b|\breactivos?\b/.test(t),
  };
}

function pideLista(texto) {
  const t = normalizar(texto);
  return /(cu[aá]les|nombres?|lista(?:do)?|cat[aá]logo|catalogo|cu[aá]nt[oa]s|hay|existen|tengo|pendientes?|pr[oó]xim[oa]s?|disponibles?|preguntas?|respuestas?|resultados?)/.test(t)
    || /(?:qu[eé]|que)\s+(?:sesiones|clases|apps|aplicaciones|ex[aá]menes|evaluaciones|preguntas)\b/.test(t)
    || /(?:dime|dame|muéstrame|muestrame)\s+(?:las|los|todas|todos|nombres|la lista|el listado)\b/.test(t);
}

function esConsultaListaSecciones(consulta) {
  const t = normalizar(consulta);
  return pideLista(t) && !ANALISIS_RE.test(t);
}

function sesionesVisibles(root, user) {
  const live = Array.isArray(root && root.liveClasses) ? root.liveClasses.filter(Boolean) : [];
  const now = Date.now();
  const uid = String((user && user.id) || '');
  const docente = roles.isTeacher(user);
  const grupos = new Set((Array.isArray(root && root.enrollments) ? root.enrollments : [])
    .filter((e) => e && String(e.userId) === uid)
    .map((e) => String(e.groupId)));

  return live.filter((c) => {
    const fin = fecha(c.end);
    if (!fin || fin.getTime() < now) return false;
    if (docente) return true;
    const propia = ids(c.assignedTo).includes(uid)
      || ids(c.assignedToGroup).some((g) => grupos.has(g));
    const activa = Array.isArray(c.participantesReales) && c.participantesReales.length > 0;
    const nueva = c.esEnVivoNuevo || c.tipo === 'en_vivo_studio';
    return propia || activa || nueva;
  }).sort((a, b) => {
    const fa = fecha(a.start), fb = fecha(b.start);
    return (fa ? fa.getTime() : Infinity) - (fb ? fb.getTime() : Infinity);
  });
}

function agendaVisible(root, user) {
  const uid = String((user && user.id) || '');
  const raw = root && root.guiaAgenda && root.guiaAgenda[uid];
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw.filter((e) => e && fecha(e.inicio) && fecha(e.inicio).getTime() >= now)
    .sort((a, b) => fecha(a.inicio).getTime() - fecha(b.inicio).getTime());
}

function estadoSesion(c) {
  const inicio = fecha(c.start), fin = fecha(c.end), now = Date.now();
  if (inicio && fin && now >= inicio.getTime() && now <= fin.getTime()) return 'En vivo';
  return 'Programada';
}

function lineaSesion(root, c) {
  const grupos = ids(c.assignedToGroup).map((id) => nombreGrupo(root, id)).filter(Boolean).join(', ');
  const instructor = nombreUsuario(root, c.instructorId || c.createdBy);
  return '- **' + (limpiar(c.title) || 'Clase sin título') + '**'
    + ' | Inicio: ' + fechaTexto(c.start)
    + ' | Fin: ' + fechaTexto(c.end)
    + ' | Estado: ' + estadoSesion(c)
    + (instructor ? ' | Instructor: ' + instructor : '')
    + (grupos ? ' | Grupo: ' + grupos : '');
}

function construirBloqueSesiones(root, user) {
  const hayLive = Array.isArray(root && root.liveClasses);
  const clases = sesionesVisibles(root, user);
  const agenda = agendaVisible(root, user);
  const lineas = [];
  const rol = etiquetaRol(user);

  if (!hayLive) {
    lineas.push('No se pudo leer el calendario de clases en este momento. No inventes sesiones.');
  } else if (!clases.length) {
    lineas.push('No hay clases próximas visibles para este usuario.');
  } else {
    lineas.push('Clases próximas visibles (' + clases.length + '):');
    clases.slice(0, MAX_SESIONES).forEach((c) => lineas.push(lineaSesion(root, c)));
    if (clases.length > MAX_SESIONES) lineas.push('- … y ' + (clases.length - MAX_SESIONES) + ' clases más.');
  }

  if (agenda.length) {
    lineas.push('');
    lineas.push('Agenda personal próxima (' + agenda.length + '):');
    agenda.slice(0, MAX_AGENDA).forEach((e) => {
      lineas.push('- **' + (limpiar(e.titulo) || 'Evento') + '**'
        + ' | Inicio: ' + fechaTexto(e.inicio)
        + ' | Duración: ' + (Number(e.durMin) || 30) + ' min');
    });
    if (agenda.length > MAX_AGENDA) lineas.push('- … y ' + (agenda.length - MAX_AGENDA) + ' eventos más.');
  }

  return '=== SESIONES PENDIENTES — DATOS REALES DEL PORTAL (filtrado por rol: ' + rol + ') ===\n'
    + 'Regla: estas son las únicas sesiones visibles para este usuario. No inventes clases, fechas, instructores ni enlaces.\n'
    + lineas.join('\n') + '\n=== FIN SESIONES ===';
}

function urlSegura(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
  } catch (e) { return ''; }
}

function appsVisibles(root, user) {
  if (!roles.canRead(user, 'externalApps')) return null;
  const externas = Array.isArray(root && root.externalApps) ? root.externalApps.filter(Boolean) : [];
  const overrides = new Map();
  externas.forEach((app) => {
    if (app && app.overrideOf) overrides.set(String(app.overrideOf), app);
  });
  const apps = BUILTIN_APPS.map((base) => {
    const override = overrides.get(String(base.id));
    return override && override.description
      ? { ...base, description: override.description }
      : { ...base };
  });
  externas.forEach((app) => {
    if (!app || app.overrideOf || !limpiar(app.name)) return;
    const url = urlSegura(app.url);
    if (!url) return;
    apps.push({
      id: app.id,
      name: limpiar(app.name),
      description: limpiar(app.description),
      url,
      tag: limpiar(app.tag),
    });
  });
  return apps.slice(0, MAX_APPS);
}

function construirBloqueApps(root, user) {
  const apps = appsVisibles(root, user);
  const rol = etiquetaRol(user);
  const cabecera = '=== APPS DEL EQUIPO — DATOS REALES DEL PORTAL (filtrado por rol: ' + rol + ') ===\n'
    + 'Regla: usa solo estas apps y sus URLs. No inventes aplicaciones, enlaces ni funciones.\n';
  if (apps === null) {
    return cabecera + 'Este rol no tiene acceso al catálogo de apps.\n=== FIN APPS ===';
  }
  if (!apps.length) return cabecera + 'No hay apps cargadas en el catálogo.\n=== FIN APPS ===';
  return cabecera
    + apps.map((app) => '- **' + app.name + '**'
      + (app.tag ? ' [' + app.tag + ']' : '')
      + (app.description ? ' — ' + app.description.slice(0, MAX_DESCRIPCION) : '')
      + ' | URL: ' + app.url).join('\n')
    + '\n=== FIN APPS ===';
}

function examenesVisibles(root, user) {
  if (!root || !Array.isArray(root.exams)) return null;
  const todos = root.exams.filter(Boolean);
  if (!roles.isStudent(user)) return todos;
  const uid = String((user && user.id) || '');
  return todos.filter((e) => ids(e.assignedTo).includes(uid));
}

function nombreCategoria(root, id) {
  if (!root || !Array.isArray(root.categories)) return '';
  const c = root.categories.find((x) => x && String(x.id) === String(id));
  return c ? limpiar(c.name || c.nombre) : '';
}

function intentosDe(root, exam, user) {
  const uid = String((user && user.id) || '');
  return (Array.isArray(root && root.examAttempts) ? root.examAttempts : [])
    .filter((a) => a && String(a.userId) === uid && String(a.examId) === String(exam.id))
    .sort((a, b) => (fecha(b.date) ? fecha(b.date).getTime() : 0) - (fecha(a.date) ? fecha(a.date).getTime() : 0));
}

function respuestaCorrecta(q) {
  if (!q) return '';
  const opciones = Array.isArray(q.options) ? q.options : [];
  const idx = Number(q.correct);
  if (Number.isInteger(idx) && opciones[idx] !== undefined) return limpiar(opciones[idx]);
  if (typeof q.correct === 'string' && q.correct.trim()) return limpiar(q.correct);
  if (typeof q.answer === 'string' && q.answer.trim()) return limpiar(q.answer);
  return '';
}

function lineaExamen(root, exam, user) {
  const categoria = nombreCategoria(root, exam.categoryId);
  const preguntas = Array.isArray(exam.questions) ? exam.questions.length : 0;
  const intentos = roles.isStudent(user) ? intentosDe(root, exam, user) : [];
  const ultimo = intentos[0];
  return '- **' + (limpiar(exam.title) || 'Examen sin título') + '**'
    + (categoria ? ' | Categoría: ' + categoria : ' | Sin categoría')
    + ' | Duración: ' + (Number(exam.duration) || 'No indicada') + ' min'
    + ' | Preguntas: ' + preguntas
    + (exam.passPercent !== undefined ? ' | Aprobar: ' + exam.passPercent + '%' : '')
    + (ultimo ? ' | Último intento: ' + (limpiar(ultimo.result) || 'sin resultado') + ' (' + (Number(ultimo.score) || 0) + '%)' : '');
}

function lineaPregunta(q, numero) {
  const opciones = Array.isArray(q.options) ? q.options : [];
  const correcta = respuestaCorrecta(q);
  return '  ' + numero + '. ' + (limpiar(q.question) || 'Pregunta sin texto')
    + (opciones.length ? ' | Opciones: ' + opciones.map((o, i) => String.fromCharCode(65 + i) + ') ' + limpiar(o)).join('; ') : '')
    + (correcta ? ' | Correcta: ' + correcta : '');
}

function construirBloqueExamenes(root, user) {
  const visibles = examenesVisibles(root, user);
  const rol = etiquetaRol(user);
  const alumno = roles.isStudent(user);
  const cabecera = '=== EXÁMENES — DATOS REALES DEL PORTAL (filtrado por rol: ' + rol + ') ===\n'
    + 'Regla: usa solo estos exámenes. No inventes títulos, preguntas ni respuestas. '
    + (alumno ? 'Para el rol de alumno no se incluyen preguntas ni respuestas correctas.' : 'Incluye el detalle de preguntas solo para docencia/staff.') + '\n';

  if (visibles === null) {
    return cabecera + 'No se pudo leer el catálogo de exámenes en este momento. No inventes exámenes.\n=== FIN EXÁMENES ===';
  }
  if (!visibles.length) {
    return cabecera + (alumno
      ? 'No hay exámenes asignados a este usuario.\n=== FIN EXÁMENES ==='
      : 'No hay exámenes cargados en el portal.\n=== FIN EXÁMENES ===');
  }

  const lineas = ['Exámenes visibles (' + visibles.length + '):'];
  let restantes = MAX_PREGUNTAS_CONTEXTO;
  visibles.slice(0, MAX_EXAMENES).forEach((exam) => {
    lineas.push(lineaExamen(root, exam, user));
    if (alumno) return;
    const preguntas = Array.isArray(exam.questions) ? exam.questions : [];
    if (!preguntas.length) {
      lineas.push('  Sin preguntas cargadas.');
      return;
    }
    const limite = Math.min(8, restantes, preguntas.length);
    for (let i = 0; i < limite; i++) {
      lineas.push(lineaPregunta(preguntas[i], i + 1));
      restantes--;
    }
    if (preguntas.length > limite) {
      lineas.push('  … ' + (preguntas.length - limite) + ' preguntas más (no incluidas en este contexto).');
    }
  });
  if (visibles.length > MAX_EXAMENES) lineas.push('- … y ' + (visibles.length - MAX_EXAMENES) + ' exámenes más.');

  return cabecera + lineas.join('\n') + '\n=== FIN EXÁMENES ===';
}

function construirContextoSecciones(root, user, consulta) {
  const temas = temasDeSecciones(consulta);
  if (!temas.sesiones && !temas.apps && !temas.examenes) return '';
  const bloques = [];
  if (temas.sesiones) bloques.push(construirBloqueSesiones(root, user));
  if (temas.apps) bloques.push(construirBloqueApps(root, user));
  if (temas.examenes) bloques.push(construirBloqueExamenes(root, user));
  return recortar('=== SECCIONES DEL PORTAL — DATOS REALES (filtrados por rol) ===\n'
    + 'Estos bloques son la fuente de verdad para sesiones, apps y exámenes. Si falta un dato, dilo; no lo inventes.\n\n'
    + bloques.join('\n\n'), MAX_CONTEXTO);
}

function respuestaSesiones(root, user) {
  const hayLive = Array.isArray(root && root.liveClasses);
  const clases = sesionesVisibles(root, user);
  const agenda = agendaVisible(root, user);
  if (!hayLive) {
    return 'No pude leer el calendario de sesiones en este momento. No voy a inventar clases ni fechas.';
  }
  const partes = [];
  if (!clases.length) {
    partes.push('No hay clases próximas asignadas o visibles para tu rol.');
  } else {
    partes.push('Según **Sesiones y clases del portal**, estas son las próximas (' + clases.length + '):');
    clases.slice(0, MAX_SESIONES).forEach((c) => {
      partes.push('- **' + (limpiar(c.title) || 'Clase sin título') + '** — '
        + fechaTexto(c.start) + ' a ' + fechaTexto(c.end)
        + (nombreUsuario(root, c.instructorId || c.createdBy) ? ' · ' + nombreUsuario(root, c.instructorId || c.createdBy) : ''));
    });
    if (clases.length > MAX_SESIONES) partes.push('- … y ' + (clases.length - MAX_SESIONES) + ' más.');
  }
  if (agenda.length) {
    partes.push('');
    partes.push('En tu agenda personal:');
    agenda.slice(0, MAX_AGENDA).forEach((e) => {
      partes.push('- **' + (limpiar(e.titulo) || 'Evento') + '** — ' + fechaTexto(e.inicio));
    });
  }
  return partes.join('\n');
}

function respuestaApps(root, user) {
  const apps = appsVisibles(root, user);
  if (apps === null) return 'Tu rol no tiene acceso al catálogo de apps del portal.';
  if (!apps.length) return 'Según **Apps del equipo**, no hay apps cargadas en el catálogo.';
  return 'Según **Apps del equipo**, estas son las apps disponibles (' + apps.length + '):\n\n'
    + apps.map((app, i) => (i + 1) + '. **' + app.name + '**'
      + (app.tag ? ' [' + app.tag + ']' : '')
      + (app.description ? ' — ' + app.description.slice(0, MAX_DESCRIPCION) : '')
      + '\n   ' + app.url).join('\n')
    + '\n\nEstos son los nombres y enlaces exactos del catálogo.';
}

function examenDeConsulta(root, user, consulta) {
  const visibles = examenesVisibles(root, user) || [];
  const t = normalizar(consulta);
  return visibles.find((e) => {
    const titulo = normalizar(e.title);
    return titulo && t.includes(titulo);
  }) || (visibles.length === 1 ? visibles[0] : null);
}

function respuestaExamenes(root, user, consulta) {
  const visibles = examenesVisibles(root, user);
  if (visibles === null) return 'No pude leer el catálogo de exámenes en este momento. No voy a inventar exámenes.';
  if (!visibles.length) {
    return roles.isStudent(user)
      ? 'No tienes exámenes asignados en el portal.'
      : 'No hay exámenes cargados en el portal.';
  }

  const t = normalizar(consulta);
  const pidePreguntas = /(preguntas?|reactivos?|respuestas?|contenido|temario)/.test(t);
  if (pidePreguntas) {
    if (roles.isStudent(user)) {
      return 'No puedo mostrarte ni responder las preguntas o respuestas correctas de un examen desde el chat. Solo puedo consultar tus exámenes asignados y tus resultados.';
    }
    const exam = examenDeConsulta(root, user, consulta);
    if (!exam) {
      return 'Necesito el nombre exacto del examen para mostrar sus preguntas. Estos son los exámenes disponibles:\n'
        + visibles.map((e) => '- ' + (limpiar(e.title) || 'Examen sin título')).join('\n');
    }
    const preguntas = Array.isArray(exam.questions) ? exam.questions : [];
    if (!preguntas.length) return 'El examen **' + (limpiar(exam.title) || 'sin título') + '** no tiene preguntas cargadas.';
    return 'Preguntas reales de **' + (limpiar(exam.title) || 'Examen sin título') + '** (' + preguntas.length + '):\n\n'
      + preguntas.slice(0, MAX_PREGUNTAS_RESPUESTA).map((q, i) => lineaPregunta(q, i + 1).trim()).join('\n')
      + (preguntas.length > MAX_PREGUNTAS_RESPUESTA ? '\n… ' + (preguntas.length - MAX_PREGUNTAS_RESPUESTA) + ' preguntas más.' : '');
  }

  return 'Según **Exámenes del portal**, estos son los exámenes visibles para tu rol (' + visibles.length + '):\n\n'
    + visibles.slice(0, MAX_EXAMENES).map((exam, i) => (i + 1) + '. ' + lineaExamen(root, exam, user).replace(/^- /, '')).join('\n')
    + (visibles.length > MAX_EXAMENES ? '\n… y ' + (visibles.length - MAX_EXAMENES) + ' exámenes más.' : '')
    + (roles.isStudent(user) ? '\n\nNo se incluyen preguntas ni respuestas correctas para alumnos.' : '');
}

function respuestaCatalogoSecciones(root, user, consulta) {
  const temas = temasDeSecciones(consulta);
  if (!temas.sesiones && !temas.apps && !temas.examenes) return null;
  if (!esConsultaListaSecciones(consulta)) return null;
  const partes = [];
  if (temas.sesiones) partes.push(respuestaSesiones(root, user));
  if (temas.apps) partes.push(respuestaApps(root, user));
  if (temas.examenes) partes.push(respuestaExamenes(root, user, consulta));
  return partes.length ? partes.join('\n\n') : null;
}

module.exports = {
  temasDeSecciones,
  construirContextoSecciones,
  respuestaCatalogoSecciones,
  sesionesVisibles,
  appsVisibles,
  examenesVisibles,
};
