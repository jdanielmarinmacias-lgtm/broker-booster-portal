'use strict';
/* ============================================================================
 * guiaPortal.js — datos reales del portal para Gu-IA (servidor)
 *
 * Gu-IA solo recibía documentos de AI Lobby y algunos contadores. Por eso
 * inventaba capacitaciones: nunca veía `db.planes`. Este módulo construye un
 * bloque compacto con el catálogo real de Formación Académica y, para las
 * preguntas de listado, devuelve una respuesta determinista sin llamar al
 * modelo. Los nombres salen de la base, no de la imaginación del proveedor.
 *
 * No cambia la clave ni el modelo: se ejecuta antes de /api/ia/chat.
 * ========================================================================== */

const MAX_CONTEXTO = 12000;
const MAX_DESCRIPCION = 220;
const MAX_GENERACIONES_POR_PLAN = 6;

function limpiar(valor) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
}

function normalizar(valor) {
  return limpiar(valor).toLowerCase();
}

/* Palabras de la sección. Se usan límites de palabra para que "información"
 * no active Formación Académica por contener "formación". */
function esTemaFormacion(texto) {
  const t = normalizar(texto);
  if (!t) return false;
  return /\bformaci[oó]n(?:es)?\b|\bcapacitaci[oó]n(?:es)?\b|\bplanes?\b|\bcursos?\b|\btalleres?\b|\bcertificaci[oó]n(?:es)?\b|\bgeneraci[oó]n(?:es)?\b/.test(t);
}

/* Preguntas de catálogo: "cuáles", "nombres", "lista", "qué capacitaciones
 * hay"... No se atienden aquí las peticiones de análisis o recomendación:
 * esas necesitan el contexto y el criterio del modelo. */
function esConsultaListaFormacion(texto) {
  const t = normalizar(texto);
  if (!esTemaFormacion(t)) return false;
  if (/(recomienda|recomiéndame|recomiendame|sugiere|sugiéreme|sugiereme|aconseja|analiza|análisis|analisis|compara|comparación|comparacion|opina|evalúa|evalua|temario|plan de estudio|mejorar)/.test(t)) return false;

  const coleccion = /(capacitaciones|planes|cursos|talleres|certificaciones|formaciones|generaciones)/.test(t);
  if (!coleccion) return false;

  return /(cu[aá]les|nombres?|lista(?:do)?|cat[aá]logo|catalogo|cu[aá]nt[oa]s|todas|todos)/.test(t)
    || /(?:qué|que)\s+(?:capacitaciones|planes|cursos|talleres|certificaciones|formaciones|generaciones)\b/.test(t)
    || /(?:dime|dame|muéstrame|muestrame)\s+(?:las|los|todas|todos|nombres|la lista|el listado)\b/.test(t)
    || /\b(?:hay|existen)\s+(?:capacitaciones|planes|cursos|talleres|certificaciones|formaciones|generaciones)\b/.test(t)
    || (/(?:capacitaciones|planes|cursos|talleres|certificaciones|formaciones|generaciones)/.test(t) && /\bdisponibles?\b/.test(t));
}

function listaPlanes(root) {
  if (!root || !Array.isArray(root.planes)) return null;
  return root.planes.filter((p) => p && limpiar(p.nombre));
}

function listaGeneraciones(root) {
  if (!root || !Array.isArray(root.generations)) return [];
  return root.generations.filter((g) => g && limpiar(g.name || g.nombre));
}

function generacionesDelPlan(root, plan) {
  return listaGeneraciones(root).filter((g) => String(g.planId) === String(plan.id));
}

function etiquetaTipo(plan) {
  return limpiar(plan.tipo) || 'Sin tipo';
}

function etiquetaDuracion(plan) {
  return limpiar(plan.duracion) || 'No indicada';
}

function descripcionCorta(plan) {
  const d = limpiar(plan.descripcion);
  return d ? d.slice(0, MAX_DESCRIPCION) : 'Sin descripción cargada.';
}

/* Filtro por tipo cuando la pregunta lo pide expresamente. "capacitaciones"
 * a secas no filtra: en el portal los planes pueden ser capacitación, curso,
 * taller o certificación. */
function filtroTipo(texto) {
  const t = normalizar(texto);
  if (/administrativ/.test(t)) return /administrativ/i;
  if (/comercial/.test(t)) return /comercial/i;
  if (/\bcursos?\b/.test(t)) return /^curso$/i;
  if (/\btalleres?\b/.test(t)) return /^taller$/i;
  if (/\bcertificaci[oó]n(?:es)?\b/.test(t)) return /^certificaci[oó]n$/i;
  return null;
}

function nombresExactos(planes) {
  return planes.map((p) => '"' + limpiar(p.nombre) + '"').join(', ');
}

/* Contexto para el modelo. Se inyecta solo cuando la conversación reciente
 * trata de Formación Académica. */
function construirContextoFormacion(root, consulta) {
  if (!esTemaFormacion(consulta)) return '';

  const planes = listaPlanes(root);
  const cabecera = '=== FORMACIÓN ACADÉMICA — DATOS REALES DEL PORTAL (fuente única para nombres de capacitaciones) ===\n'
    + 'Regla: para preguntas sobre capacitaciones, planes, cursos, talleres, certificaciones o generaciones, usa exclusivamente los datos de este bloque. No agregues nombres que no aparezcan aquí. Si un dato no está, dilo; no lo inventes. Este bloque prevalece sobre AI Lobby y sobre conocimiento general.\n';

  if (planes === null) {
    return cabecera
      + 'No se pudo leer el catálogo real de Formación Académica en este momento. No inventes nombres: pide al usuario que reintente o que abra Formación Académica.\n'
      + '=== FIN FORMACIÓN ACADÉMICA ===';
  }
  if (!planes.length) {
    return cabecera
      + 'No hay planes/capacitaciones cargados en Formación Académica. No inventes nombres ni cursos.\n'
      + '=== FIN FORMACIÓN ACADÉMICA ===';
  }

  const lineas = planes.map((plan) => {
    const gens = generacionesDelPlan(root, plan);
    const nombresGens = gens.slice(0, MAX_GENERACIONES_POR_PLAN).map((g) => {
      const estado = limpiar(g.status) ? ' — ' + limpiar(g.status) : '';
      return limpiar(g.name || g.nombre) + estado;
    }).join('; ');
    const extra = gens.length > MAX_GENERACIONES_POR_PLAN
      ? '; +' + (gens.length - MAX_GENERACIONES_POR_PLAN) + ' más'
      : '';
    return '- **' + limpiar(plan.nombre) + '** | Tipo: ' + etiquetaTipo(plan)
      + ' | Duración: ' + etiquetaDuracion(plan)
      + ' | Generaciones: ' + gens.length + (nombresGens ? ' (' + nombresGens + extra + ')' : '')
      + '\n  Descripción: ' + descripcionCorta(plan);
  });

  const generaciones = listaGeneraciones(root);
  const bloqueGeneraciones = generaciones.length
    ? '\nGeneraciones cargadas:\n' + generaciones.slice(0, 40).map((g) => {
      const plan = planes.find((p) => String(p.id) === String(g.planId));
      const fechas = [limpiar(g.startDate), limpiar(g.endDate)].filter(Boolean).join(' → ');
      return '- **' + limpiar(g.name || g.nombre) + '**'
        + (plan ? ' | Plan: ' + limpiar(plan.nombre) : ' | Sin plan asignado')
        + (fechas ? ' | ' + fechas : '')
        + (limpiar(g.status) ? ' | Estado: ' + limpiar(g.status) : '');
    }).join('\n')
    : '\nNo hay generaciones cargadas.';

  const texto = cabecera
    + 'Total de planes/capacitaciones: ' + planes.length + '.\n'
    + 'Nombres exactos: ' + nombresExactos(planes) + '\n\n'
    + lineas.join('\n')
    + '\n' + bloqueGeneraciones
    + '\n=== FIN FORMACIÓN ACADÉMICA ===';

  return texto.length > MAX_CONTEXTO
    ? texto.slice(0, MAX_CONTEXTO - 90) + '\n[Contexto truncado; para listados exactos consulta el catálogo de Formación Académica.]\n=== FIN FORMACIÓN ACADÉMICA ==='
    : texto;
}

function respuestaGeneraciones(root, consulta) {
  const planes = listaPlanes(root);
  const generaciones = listaGeneraciones(root);
  if (planes === null) {
    return 'No pude leer el catálogo real de Formación Académica en este momento. No voy a inventar nombres: abre Formación Académica o inténtalo de nuevo.';
  }
  if (!generaciones.length) {
    return 'Según **Formación Académica**, no hay generaciones cargadas en el portal ahora mismo.';
  }
  const filtro = filtroTipo(consulta);
  const filtradas = filtro
    ? generaciones.filter((g) => {
      const plan = planes.find((p) => String(p.id) === String(g.planId));
      return plan && filtro.test(etiquetaTipo(plan));
    })
    : generaciones;

  if (!filtradas.length) {
    return 'Según **Formación Académica**, no hay generaciones cargadas para ese tipo. No voy a inventar nombres.';
  }

  const lineas = filtradas.map((g, i) => {
    const plan = planes.find((p) => String(p.id) === String(g.planId));
    const fechas = [limpiar(g.startDate), limpiar(g.endDate)].filter(Boolean).join(' → ');
    return (i + 1) + '. **' + limpiar(g.name || g.nombre) + '**'
      + (plan ? ' — ' + limpiar(plan.nombre) + ' (' + etiquetaTipo(plan) + ')' : ' — Sin plan asignado')
      + (fechas ? ' · ' + fechas : '')
      + (limpiar(g.status) ? ' · ' + limpiar(g.status) : '');
  });

  return 'Según **Formación Académica**, estas son las generaciones reales del portal (' + filtradas.length + '):\n\n'
    + lineas.join('\n')
    + '\n\nEstos son los nombres exactos cargados en el portal.';
}

/* Respuesta determinista para listados. Devuelve null cuando la pregunta no
 * es un listado de Formación y debe seguir el camino normal del modelo. */
function respuestaCatalogoFormacion(root, consulta) {
  if (!esConsultaListaFormacion(consulta)) return null;

  const t = normalizar(consulta);
  const pideGeneraciones = /\bgeneraci[oó]n(?:es)?\b/.test(t)
    && !/\b(?:capacitaciones|planes|cursos|talleres|certificaciones|formaciones)\b/.test(t);
  if (pideGeneraciones) return respuestaGeneraciones(root, consulta);

  const planes = listaPlanes(root);
  if (planes === null) {
    return 'No pude leer el catálogo real de Formación Académica en este momento. No voy a inventar nombres: abre Formación Académica o inténtalo de nuevo.';
  }
  if (!planes.length) {
    return 'Según **Formación Académica**, no hay capacitaciones ni planes cargados en el portal ahora mismo. No voy a inventar nombres.';
  }

  const filtro = filtroTipo(consulta);
  const filtrados = filtro ? planes.filter((p) => filtro.test(etiquetaTipo(p))) : planes;

  if (!filtrados.length) {
    return 'Según **Formación Académica**, no hay capacitaciones de ese tipo cargadas en el portal. No voy a inventar nombres.';
  }

  const lineas = filtrados.map((p, i) => {
    const gens = generacionesDelPlan(root, p);
    return (i + 1) + '. **' + limpiar(p.nombre) + '** — ' + etiquetaTipo(p)
      + ' · Duración: ' + etiquetaDuracion(p)
      + ' · ' + gens.length + (gens.length === 1 ? ' generación' : ' generaciones');
  });

  const titulo = filtro
    ? 'Según **Formación Académica**, estas son las capacitaciones de ese tipo (' + filtrados.length + '):'
    : 'Según **Formación Académica**, estas son las capacitaciones/planes reales del portal (' + filtrados.length + '):';

  return titulo + '\n\n' + lineas.join('\n')
    + '\n\nEstos son los nombres exactos cargados en el portal.';
}

module.exports = {
  esTemaFormacion,
  esConsultaListaFormacion,
  construirContextoFormacion,
  respuestaCatalogoFormacion,
};
