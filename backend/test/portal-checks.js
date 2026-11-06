'use strict';
/* Comprobaciones de despliegue del portal — sin navegador, sin red.
 *
 * Se ejecutan en cada push (`.github/workflows/checks.yml`, `npm test`) y
 * vigilan dos cosas que ya se rompieron y no dan error en consola:
 *
 *  1) La CSP que sirve Vercel: si falta `frame-src`, los iframes de YouTube,
 *     Drive, Docs, Vimeo y Calendar se bloquean con «Este contenido está
 *     bloqueado» (default-src 'self' se aplica a los marcos).
 *  2) El lector de lecciones: showModal envolvía el contenido en max-w-lg
 *     (512 px) y anulaba el max-w-4xl declarado; ahora debe abrir al doble.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
const VERCEL = path.join(RAIZ, 'vercel.json');
const MODAL_WIDTH = path.join(RAIZ, 'portal-modular', 'js', 'core', 'modal-width.js');
const LEGACY = path.join(RAIZ, 'portal-modular', 'js', 'legacy', '01-core-db-roles-portal.js');
const INDEX = path.join(RAIZ, 'portal-modular', 'index.html');
/* El campus privado vive en backend/campus-private (se sirve con sesión). */
const JS_DIRS = ['legacy', 'modules', 'core'].map((d) => path.join(RAIZ, 'portal-modular', 'js', d))
  .concat([path.join(RAIZ, 'backend', 'campus-private', 'legacy'), path.join(RAIZ, 'backend', 'campus-private', 'modules')]);
const roles = require(path.join(RAIZ, 'backend', 'src', 'roles.js'));

/* ---- utilidades ------------------------------------------------------- */

function cabeceraGlobal(nombre) {
  const vercel = JSON.parse(fs.readFileSync(VERCEL, 'utf8'));
  const bloque = (vercel.headers || []).find((h) => h.source === '/(.*)');
  assert.ok(bloque, 'vercel.json debe declarar cabeceras globales ("/(.*)")');
  const cab = (bloque.headers || []).find((h) => String(h.key).toLowerCase() === nombre.toLowerCase());
  assert.ok(cab, 'falta la cabecera ' + nombre);
  return cab.value;
}

/* CSP -> { directiva: [valores] } */
function directivasCsp(csp) {
  const mapa = {};
  String(csp).split(';').forEach((parte) => {
    const trozos = parte.trim().split(/\s+/).filter(Boolean);
    if (!trozos.length) return;
    mapa[trozos[0]] = trozos.slice(1);
  });
  return mapa;
}

/* Equivalencia en rem de los max-w-* que usan los modales de Tailwind. */
const REM = { 'max-w-lg': 32, 'max-w-4xl': 56, 'max-w-5xl': 64 };

/* ---- 1) CSP de producción -------------------------------------------- */

describe('CSP de producción (vercel.json)', () => {
  const csp = directivasCsp(cabeceraGlobal('Content-Security-Policy'));

  it('permite incrustar YouTube, Drive, Docs, Vimeo y Calendar', () => {
    const hosts = [
      'https://www.youtube.com',
      'https://www.youtube-nocookie.com',
      'https://drive.google.com',
      'https://docs.google.com',
      'https://player.vimeo.com',
      'https://calendar.google.com',
    ];
    const frame = csp['frame-src'] || [];
    hosts.forEach((host) => {
      assert.ok(frame.includes(host), 'frame-src no permite ' + host + ' (los iframes se bloquearían)');
    });
  });

  it('no permite Jitsi: la videoconferencia externa se abre en su propio sitio', () => {
    const frame = csp['frame-src'] || [];
    const script = csp['script-src'] || [];
    assert.ok(!frame.includes('https://meet.jit.si'), 'frame-src no debe permitir Jitsi');
    assert.ok(!script.includes('https://meet.jit.si'), 'script-src no debe permitir Jitsi');
  });

  it('no abre la CSP de más', () => {
    const frame = csp['frame-src'] || [];
    assert.ok(!frame.includes('*'), 'frame-src no debe usar comodín');
    assert.deepEqual(csp['default-src'], ["'self'"], 'default-src debe seguir en self');
    assert.deepEqual(csp['frame-ancestors'], ["'none'"], 'nadie debe poder incrustar el portal');
    assert.deepEqual(csp['object-src'], ["'none'"]);
  });

  it('sigue prohibiendo el JS inline', () => {
    assert.deepEqual(csp['script-src-attr'], ["'none'"], 'script-src-attr debe seguir en none');
    assert.ok(!(csp['script-src'] || []).includes("'unsafe-inline'"), 'script-src no debe permitir unsafe-inline');
    assert.ok(!(csp['script-src'] || []).includes("'unsafe-eval'"), 'script-src no debe permitir unsafe-eval');
  });

  it('mantiene el resto de cabeceras de seguridad', () => {
    assert.equal(cabeceraGlobal('X-Frame-Options'), 'DENY');
    assert.equal(cabeceraGlobal('X-Content-Type-Options'), 'nosniff');
    assert.equal(cabeceraGlobal('Referrer-Policy'), 'same-origin');
  });
});

describe('permisos de cámara y micrófono (vercel.json)', () => {
  const pp = cabeceraGlobal('Permissions-Policy');

  it('deja cámara y micrófono solo al propio portal', () => {
    ['camera', 'microphone'].forEach((feature) => {
      const m = pp.match(new RegExp(feature + '=\\(([^)]*)\\)'));
      assert.ok(m, 'falta ' + feature + ' en Permissions-Policy');
      assert.ok(m[1].includes('self'), feature + ' debe permitir el propio portal');
      assert.ok(!m[1].includes('meet.jit.si'), feature + ' no debe delegar en Jitsi');
    });
  });
});

/* ---- 2) Lector de lecciones ------------------------------------------ */

describe('lector de lecciones', () => {
  const { anchoContenedor } = require(MODAL_WIDTH);
  const legacy = fs.readFileSync(LEGACY, 'utf8');

  /* Primer div del showModal de openLesson: ahí se declara el ancho. */
  function clasesLector() {
    const inicio = legacy.indexOf('function openLesson(lessonId)');
    assert.ok(inicio > -1, 'no se encontró openLesson en el legacy');
    const trozo = legacy.slice(inicio, inicio + 6000);
    const m = trozo.match(/showModal\(`<div class="([^"]+)"/);
    assert.ok(m, 'no se encontró el showModal de la lección');
    return m[1];
  }

  it('el modal de la lección declara el doble de ancho', () => {
    const clases = clasesLector();
    assert.ok(/modal-large/.test(clases), 'falta la marca modal-large: showModal volvería a max-w-lg');
    const declarado = (clases.match(/max-w-[^\s"]+/) || [])[0];
    assert.equal(declarado, 'max-w-5xl', 'el lector debe declarar max-w-5xl');
    assert.equal(REM[declarado], REM['max-w-lg'] * 2, 'max-w-5xl debe ser el doble de max-w-lg');
  });

  it('showModal adopta ese ancho para el lector y deja el resto igual', () => {
    assert.equal(anchoContenedor('<div class="' + clasesLector() + '">'), 'w-full max-w-5xl');
    assert.equal(anchoContenedor('<form class="p-6">'), 'w-full max-w-lg', 'el modal estándar sigue en 512 px');
    assert.equal(anchoContenedor('<div class="modal-large">'), '', 'modal-large sin max-w-* no impone tope');
    assert.equal(anchoContenedor('<div class="modal-large max-w-7xl">'), 'w-full max-w-7xl');
    assert.equal(anchoContenedor(''), 'w-full max-w-lg');
  });

  it('index.html carga modal-width.js antes del legacy', () => {
    const html = fs.readFileSync(INDEX, 'utf8');
    const helper = html.indexOf('js/core/modal-width.js');
    const core = html.indexOf('js/legacy/01-core-db-roles-portal.js');
    assert.ok(helper > -1, 'index.html no carga modal-width.js');
    assert.ok(core > -1, 'index.html no carga el core del portal');
    assert.ok(helper < core, 'modal-width.js debe cargarse antes del legacy (showModal lo usa)');
  });
});

/* ---- 3) Una sola X por modal ------------------------------------------ */

describe('una sola X por modal', () => {
  /* showModal añade su X flotante cuando el contenido NO trae un botón de
   * cierre accionable etiquetado "Cerrar". Los cierres propios sin etiqueta
   * producían dos X (la del modal y la flotante). */
  /* Dos formas de cierre propio: la X de cabecera grande (text-lg/xl) y
   * cualquier X que dispare closeModal (data-bx-click="a1"), que es la que
   * usan los modales de ficha/estado de cuenta. Ambas deben ir etiquetadas. */
  const BOTON_X = /<button\b([^>]*)>\s*<i class="[^"]*fa-(?:times(?![\w-])|xmark)[^"]*"[^>]*>\s*<\/i>\s*<\/button>/gi;
  const esCierre = (attrs, html) => /data-bx-click="a1"/.test(attrs) || /text-(?:lg|xl)/.test(html);

  function cierresSinEtiqueta() {
    const fallos = [];
    JS_DIRS.forEach((dir) => {
      fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
        const s = fs.readFileSync(path.join(dir, f), 'utf8');
        let m;
        BOTON_X.lastIndex = 0;
        while ((m = BOTON_X.exec(s))) {
          if (esCierre(m[1], m[0]) && !/(?:aria-label|title)=["'][^"']*cerrar/i.test(m[1])) {
            fallos.push(f + ':' + (s.slice(0, m.index).split('\n').length));
          }
        }
      });
    });
    return fallos;
  }

  it('todo cierre propio de modal está etiquetado (si no, showModal añade otra X)', () => {
    assert.deepEqual(cierresSinEtiqueta(), [], 'cierres de modal sin aria-label/title="Cerrar"');
  });
});

/* ---- 4) Permisos de grupos (Mensajes y Academia) ---------------------- */

describe('permisos de grupos', () => {
  it('Academia: solo docencia y staff escriben grupos e inscripciones', () => {
    ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'agencia', 'editor'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'groups'), true, role + ' debería gestionar grupos de Academia');
      assert.equal(roles.canWrite({ role }, 'enrollments'), true, role + ' debería inscribir alumnos');
    });
    ['alumno', 'agente_agencia', 'agente_desarrollo', 'prospecto'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'groups'), false, role + ' no debería escribir grupos de Academia');
      assert.equal(roles.canWrite({ role }, 'enrollments'), false, role + ' no debería inscribir ni quitar alumnos');
    });
  });

  it('Academia: el catálogo (generaciones, planes, categorías) es de docencia y staff', () => {
    ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'editor'].forEach((role) => {
      ['generations', 'planes', 'categories'].forEach((col) => {
        assert.equal(roles.canWrite({ role }, col), true, role + ' debería escribir ' + col);
      });
    });
    ['alumno', 'agente_agencia', 'agente_desarrollo', 'prospecto', 'agencia'].forEach((role) => {
      ['generations', 'planes', 'categories'].forEach((col) => {
        assert.equal(roles.canWrite({ role }, col), false, role + ' no debería escribir ' + col);
      });
    });
  });

  it('el rol maestro ve Grupos, Generaciones y Formación en el menú', () => {
    const legacy = fs.readFileSync(LEGACY, 'utf8');
    const paginas = ['formacion', 'generations', 'groups'];
    const porDefecto = legacy.match(/maestro:\s*\['dashboard'([^\]]*)\]/);
    assert.ok(porDefecto, 'no se encontró la lista por defecto de maestro');
    paginas.forEach((p) => assert.ok(porDefecto[1].includes("'" + p + "'"), 'falta ' + p + ' en defaultPerms.maestro'));
    const desde = legacy.indexOf('const maestroItems');
    const hasta = legacy.indexOf('const alumnoItems');
    assert.ok(desde > -1 && hasta > desde, 'no se encontraron las listas de navegación');
    const bloque = legacy.slice(desde, hasta);
    paginas.forEach((p) => assert.ok(bloque.includes("id: '" + p + "'"), 'falta ' + p + ' en maestroItems'));
  });

  it('Mensajes: los grupos del equipo no los crea cualquier rol', () => {
    ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'agencia'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'chatGroups'), true, role + ' debería crear grupos del equipo');
    });
    ['alumno', 'agente_agencia', 'agente_desarrollo', 'prospecto'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'chatGroups'), false, role + ' no debería crear grupos del equipo');
    });
  });
});

/* ---- 4b) Catálogo de apps externas ---------------------------------- */

describe('catálogo de apps externas', () => {
  it('lo lee el equipo interno y solo contenido/dirección lo edita', () => {
    ['admin', 'gm', 'desarrollador', 'editor'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'externalApps'), true, role + ' debería editar el catálogo');
    });
    ['alumno', 'maestro', 'capacitador', 'agencia', 'agente_agencia', 'agente_desarrollo', 'prospecto'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'externalApps'), false, role + ' no debería editar el catálogo');
    });
    ['admin', 'maestro', 'alumno'].forEach((role) => {
      assert.equal(roles.canRead({ role }, 'externalApps'), true, role + ' debería ver el catálogo');
    });
    assert.equal(roles.canRead({ role: 'prospecto' }, 'externalApps'), false);
  });
});

/* ---- 4c) Apps externas: editar descripción -------------------------- */

describe('apps externas: editar descripción', () => {
  const APPS = path.join(RAIZ, 'portal-modular', 'js', 'legacy', '13-apps.js');
  const CSS = path.join(RAIZ, 'portal-modular', 'css', 'apps.css');
  const apps = fs.readFileSync(APPS, 'utf8');

  it('cada tarjeta ofrece editar la descripción a quien administra', () => {
    assert.ok(/data-apps-edit=/.test(apps), 'falta el botón de editar en la tarjeta');
    assert.ok(/id="apps-edit-description"/.test(apps), 'falta el campo de descripción editable');
    assert.ok(/function openEdit\(/.test(apps), 'falta abrir el formulario de edición');
    assert.ok(fs.readFileSync(CSS, 'utf8').includes('.apps-edit'), 'falta el estilo del botón editar');
  });

  it('las apps fijas guardan su descripción sin duplicar la tarjeta', () => {
    assert.ok(/overrideOf/.test(apps), 'la descripción editada de una app fija debe guardarse aparte');
    assert.ok(/app\.overrideOf \|\| !app\.name/.test(apps), 'las descripciones guardadas no deben pintarse como apps nuevas');
    assert.ok(/pushCollectionsImmediate\(\['externalApps'\]\)/.test(apps), 'la edición debe sincronizarse');
  });
});

/* ---- 5) Mis Clientes: estatus, comisiones y evidencia ---------------- */

describe('Mis Clientes', () => {
  const MODULO_D = path.join(RAIZ, 'backend', 'campus-private', 'legacy', '04-modulo-d.js');
  const src = fs.readFileSync(MODULO_D, 'utf8');

  it('el alta y el kanban usan los cinco estatus de la póliza', () => {
    const m = src.match(/const ESTATUS_CLIENTE = \[([^\]]+)\]/);
    assert.ok(m, 'no se encontró ESTATUS_CLIENTE en Mis Clientes');
    const etapas = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    assert.deepEqual(etapas, ['Propuesta', 'Emitido', 'Pagado', 'Siniestrado', 'Cancelado']);
    assert.ok(/id="estatus-cliente"/.test(src), 'el alta debe incluir el selector de estatus');
    assert.ok(/const etapas = ESTATUS_CLIENTE/.test(src), 'el kanban debe pintar una columna por estatus');
  });

  it('la comisión se calcula sobre la prima total con porcentaje elegible por póliza', () => {
    assert.ok(!src.includes('(#13 y #5)'), 'quedó el texto (#13 y #5) en el estado de cuenta');
    assert.ok(/const prima=Number\(c\.primaTotal\)\|\|Number\(c\.primaNeta\)\|\|0;/.test(src), 'la comisión debe partir de la prima total');
    assert.ok(/const comAnual=prima\*pct;/.test(src), 'la comisión debe multiplicar la prima por el porcentaje elegido');
    assert.ok(/PCT_COMISION_OPCIONES/.test(src), 'falta el selector de porcentaje de comisión');
    assert.ok(/cambiarComisionCliente/.test(src), 'el selector debe guardar el porcentaje por póliza');
  });

  it('la evidencia repara la URL sin extensión y se pinta sin iframe', () => {
    assert.ok(/async function resolverUrlEvidencia/.test(src), 'falta la reparación de URLs de evidencia');
    assert.ok(/urlEvidenciaConExtension/.test(src), 'falta el candidato con extensión');
    const inicio = src.indexOf('async function verEvidenciaCliente(id)');
    assert.ok(inicio > -1, 'verEvidenciaCliente debe poder esperar a la URL reparada');
    const fin = src.indexOf('function borrarCliente', inicio);
    const bloque = src.slice(inicio, fin > inicio ? fin : inicio + 6000);
    assert.ok(!/<iframe\s/.test(bloque), 'la evidencia debe previsualizarse sin iframe');
    assert.ok(/renderEvidenciaPdf/.test(bloque), 'los PDF deben pintarse con PDF.js en canvas');
  });

  it('la evidencia nueva se sube a Storage en vez de guardarse como base64', () => {
    assert.ok(/async function prepararEvidenciaCliente/.test(src));
    assert.ok(/Media\.subir\(file, \{scope:'clientes'/.test(src), 'la evidencia debe subir al Storage con su extensión');
  });
});

/* ---- 6) PDFs de Biblioteca sin iframe -------------------------------- */

describe('PDFs de Biblioteca', () => {
  const CORE = path.join(RAIZ, 'portal-modular', 'js', 'legacy', '01-core-db-roles-portal.js');
  const core = fs.readFileSync(CORE, 'utf8');

  it('no incrusta el PDF de Storage en un iframe (CSP frame-src / Supabase)', () => {
    /* El iframe nativo bloquea el hilo de la página y, al redirigir /media al
     * Storage, la CSP lo rechaza y llena la consola. Debe pintarse con PDF.js. */
    const marca = core.indexOf('isPdfFile ?');
    assert.ok(marca > -1, 'no se encontró la rama de PDF de Biblioteca');
    assert.ok(!/<iframe/.test(core.slice(marca, marca + 600)), 'el PDF de Biblioteca volvió a usar iframe');
    assert.ok(/id="library-pdf-preview"/.test(core), 'falta el contenedor de la vista previa PDF');
    assert.ok(/previsualizarPdfMaterial/.test(core), 'falta el render de PDF con PDF.js');
  });
});

/* ---- 6b) Mi Agenda: no repetir la serie semanal --------------------- */

describe('Mi Agenda: sesiones semanales', () => {
  const AGENDA = path.join(RAIZ, 'backend', 'campus-private', 'legacy', '04-modulo-d.js');
  const agenda = fs.readFileSync(AGENDA, 'utf8');

  it('solo incluye las próximas ocurrencias de la semana en curso', () => {
    assert.ok(/function ccSemanaActual\(/.test(agenda), 'falta el recorte a la semana actual');
    assert.ok(/ccOcurrencias\(userId, 1\)/.test(agenda), 'debe pedir solo una semana de ocurrencias');
    assert.ok(/rango\.ini < ccSemana\.fin && rango\.fin > ccSemana\.inicio/.test(agenda), 'debe omitir las semanas fuera del periodo visible');
    assert.ok(!/ccOcurrencias\(currentUser\.id, semanas\)/.test(agenda), 'no debe clonar la serie para todas las semanas de la vista');
  });
});

/* ---- 6d) Importador de exámenes largos ------------------------------ */

describe('importador de exámenes', () => {
  const IMPORT = path.join(RAIZ, 'portal-modular', 'js', 'legacy', '14-exam-import.js');
  const src = fs.readFileSync(IMPORT, 'utf8');
  const api = new Function('window', src + '\nreturn window.ExamImport;')({});

  it('detecta pares pregunta/respuesta numerados', () => {
    const r = api.parsearTexto(
      '1. ¿Qué es una póliza?\nEs el contrato con la aseguradora y sus condiciones.\n' +
      '2. ¿Qué cubre el seguro de auto?\nDaños materiales y responsabilidad civil.'
    );
    assert.equal(r.items.length, 2);
    assert.equal(r.items[0].question, '¿Qué es una póliza?');
    assert.equal(r.items[0].answer, 'Es el contrato con la aseguradora y sus condiciones.');
    assert.equal(r.items[1].answer, 'Daños materiales y responsabilidad civil.');
  });

  it('también acepta pregunta y respuesta en la misma línea', () => {
    const r = api.parsearTexto('1. ¿Qué es un deducible? = Lo que paga el asegurado antes de la cobertura.');
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].answer, 'Lo que paga el asegurado antes de la cobertura.');
  });

  it('entiende el formato Pregunta N · categoría con Respuesta correcta y explicación', () => {
    const real = [
      'Pregunta 1 · Accidentes y Enfermedades — Personas ¿Cuál gasto está EXCLUIDO? ✗ Tu respuesta: Honorarios del anestesiólogo ✓ Respuesta correcta: Cirugía plástica con fines estéticos 💡 Explicación: Los tratamientos estéticos se excluyen.',
      'Pregunta 2 · Matemáticas y Cálculos Financieros ¿Cuál es la diferencia entre notación decimal y porcentual? ✓ Respuesta correcta: La porcentual multiplica por 100 la decimal 💡 Explicación: Ambas representan el mismo valor. Fuente: SistemayMercadosFinancieros.',
      'Pregunta 35 · Embarcaciones Menores de Placer ✓ Respuesta correcta: Daños físicos a la embarcación 💡 Explicación: La cobertura básica del casco.',
      'Pregunta 36 · Vida Individual En un seguro de vida, ¿qué se requiere para cambiar al beneficiario? ✓ Respuesta correcta: B) El consentimiento del beneficiario irrevocable 💡 Explicación: Se necesita su consentimiento expreso.',
      'Pregunta 60 · Embarcaciones Menores de Placer ✓ Respuesta correcta: Generalmente cubre el motor 💡 Explicación: El motor está cubierto como parte de la embarcación.',
      'Pregunta 111 · Jurídicos ¿Qué sucede si el asegurado comete suicidio? ✓ Respuesta correcta: C) Se paga después de 2 años 💡 Explicación: Lo establece el artículo 172. En materia de PLD, se considera operación relevante aquella que se realiza: ✓ Respuesta correcta: Con billetes o divisas por 10,000 dólares 💡 Explicación: Así lo definen las Disposiciones.',
      'Pregunta 113 · Hogar — Casa Habitación La reposición a valor de nuevo significa que: ✓ Respuesta correcta: B) Se repone el bien por uno nuevo similar 💡 Explicación: No se aplica depreciación.'
    ].join(' ');
    const r = api.parsearTexto(real);
    assert.equal(r.items.length, 6, 'deben quedar 6 reactivos válidos');
    assert.equal(r.descartadas.length, 2, '35 y 60 no tienen enunciado');
    assert.deepEqual(r.descartadas.map((d) => d.motivo), ['sin enunciado', 'sin enunciado']);
    assert.equal(r.items.find((x) => x.numero === 1).question, '¿Cuál gasto está EXCLUIDO?');
    assert.equal(r.items.find((x) => x.numero === 1).answer, 'Cirugía plástica con fines estéticos');
    assert.equal(r.items.find((x) => x.numero === 36).answer, 'El consentimiento del beneficiario irrevocable');
    const recuperada = r.items.find((x) => x.question.startsWith('En materia de PLD'));
    assert.ok(recuperada, 'debe recuperar el reactivo sin marcador Pregunta 112');
    assert.ok(recuperada.answer.startsWith('Con billetes'));
    assert.ok(!r.items.some((x) => /Explicación|Respuesta correcta|Fuente:/.test(x.question + ' ' + x.answer)));
    const qs = api.construirPreguntas(r.items, []);
    assert.equal(qs.length, 6);
    qs.forEach((q) => assert.equal(q.options.length, 4));
  });

  it('descarta reactivos sin enunciado y preguntas repetidas del documento', () => {
    const r = api.parsearTexto(
      'Pregunta 1 · Técnicos ¿Qué es el riesgo? ✓ Respuesta correcta: La posibilidad de pérdida 💡 Explicación: Uno. ' +
      'Pregunta 2 · Técnicos ¿Qué es el riesgo? ✓ Respuesta correcta: La posibilidad de pérdida 💡 Explicación: Dos. ' +
      'Pregunta 3 · Técnicos ✓ Respuesta correcta: Sin pregunta 💡 Explicación: Tres.'
    );
    assert.equal(r.items.length, 1);
    assert.equal(r.descartadas.filter((d) => d.motivo === 'duplicada').length, 1);
    assert.equal(r.descartadas.filter((d) => d.motivo === 'sin enunciado').length, 1);
  });

  it('soporta 410 reactivos del mismo formato sin perder ninguno', () => {
    let bulk = '';
    for (let i = 1; i <= 410; i++) {
      bulk += 'Pregunta ' + i + ' · Técnicos ¿Pregunta de prueba ' + i + '? ✓ Respuesta correcta: Respuesta de prueba ' + i + ' 💡 Explicación: Explicación ' + i + '. ';
    }
    const r = api.parsearTexto(bulk);
    assert.equal(r.items.length, 410);
    const qs = api.construirPreguntas(r.items, []);
    assert.equal(qs.length, 410);
    qs.forEach((q) => assert.equal(q.options.length, 4));
  });

  it('genera 4 opciones con una sola correcta por reactivo', () => {
    const items = ['uno', 'dos', 'tres', 'cuatro'].map((a, i) => ({ question: 'Pregunta ' + (i + 1), answer: 'Respuesta ' + a }));
    const qs = api.construirPreguntas(items, []);
    assert.equal(qs.length, 4);
    qs.forEach((q) => {
      assert.equal(q.options.length, 4);
      assert.ok(q.correct >= 0 && q.correct < 4);
      assert.equal(q.options.filter((o) => o === q.options[q.correct]).length, 1);
      assert.equal(q.type, 'multiple');
    });
  });

  it('no duplica preguntas que ya están en el examen', () => {
    const qs = api.construirPreguntas([{ question: 'Pregunta 1', answer: 'x' }], [], ['Pregunta 1']);
    assert.equal(qs.length, 0);
  });

  it('el modal ofrece importar y no guarda preguntas barajadas', () => {
    const CORE = fs.readFileSync(LEGACY, 'utf8');
    const INDEX = fs.readFileSync(path.join(RAIZ, 'portal-modular', 'index.html'), 'utf8');
    assert.ok(!/_shuffled/.test(CORE), 'las preguntas barajadas no deben guardarse dentro de db.exams');
    assert.ok(/window\.ExamImport\.mount\(/.test(CORE), 'el modal de examen debe montar el importador');
    assert.ok(/js\/legacy\/14-exam-import\.js/.test(INDEX), 'falta cargar 14-exam-import.js en index.html');
  });
});

/* ---- 7) Worker de PDF.js del mismo origen ---------------------------- */

describe('worker de PDF.js', () => {
  const LAZY = path.join(RAIZ, 'portal-modular', 'js', 'core', 'lazy-app.js');
  const API = path.join(RAIZ, 'portal-modular', 'js', 'vendor', 'pdf.min.js');
  const WORKER = path.join(RAIZ, 'portal-modular', 'js', 'vendor', 'pdf.worker.min.js');
  const lazy = fs.readFileSync(LAZY, 'utf8');

  it('se sirve desde el portal y coincide con la versión de la API', () => {
    assert.ok(/GlobalWorkerOptions\.workerSrc/.test(lazy), 'falta configurar GlobalWorkerOptions.workerSrc');
    assert.ok(/js\/vendor\/pdf\.worker\.min\.js/.test(lazy), 'el worker debe apuntar a /js/vendor/');
    assert.ok(!/cdnjs[^"']*pdf\.worker/.test(lazy), 'el worker no debe apuntar al CDN');
    assert.ok(/js\/vendor\/pdf\.min\.js\?v=/.test(lazy), 'la API de PDF.js también debe ser local y versionada');
    assert.ok(fs.existsSync(API), 'falta portal-modular/js/vendor/pdf.min.js');
    assert.ok(fs.existsSync(WORKER), 'falta portal-modular/js/vendor/pdf.worker.min.js');
    assert.ok(fs.statSync(WORKER).size > 500000, 'worker local vacío o truncado');
    assert.ok(fs.readFileSync(API, 'utf8').includes('3.11.174'), 'la API local no es la versión esperada');
    assert.ok(fs.readFileSync(WORKER, 'utf8').includes('3.11.174'), 'el worker no coincide con la versión de la API');
  });

  it('la CSP sigue sin abrir worker-src a un CDN', () => {
    const csp = directivasCsp(cabeceraGlobal('Content-Security-Policy'));
    assert.deepEqual(csp['worker-src'], ["'self'", 'blob:']);
  });

  it('ningún lector del portal vuelve a pedir PDF.js al CDN', () => {
    /* El legacy apuntaba GlobalWorkerOptions.workerSrc a cdnjs/jsdelivr en
     * cada apertura de PDF, pisando la configuración local. Con
     * `worker-src 'self' blob:` el worker remoto se bloquea y PDF.js cae al
     * fake worker: aviso en consola y página bloqueada con PDFs grandes. */
    const CDN_PDF = /https?:\/\/[^\s'"`]*(?:pdf\.min\.js|pdf\.worker[^\s'"`]*|pdfjs-dist)/;
    const fallos = [];
    JS_DIRS.forEach((dir) => {
      fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
        const s = fs.readFileSync(path.join(dir, f), 'utf8');
        if (CDN_PDF.test(s)) fallos.push(f);
      });
    });
    assert.deepEqual(fallos, [], 'estos archivos siguen cargando PDF.js desde un CDN');

    const legacy = fs.readFileSync(LEGACY, 'utf8');
    assert.ok(/async function pdfJsListo\(\)/.test(legacy), 'falta el punto único pdfJsListo()');
    const usos = (legacy.match(/pdfJsListo\(\)/g) || []).length;
    assert.ok(usos >= 6, 'los lectores de PDF del legacy deben usar pdfJsListo() (hay ' + usos + ')');
    assert.ok(/pdf:\s*\{\s*api:\s*PDF_API,\s*worker:\s*PDF_WORKER,\s*configurar:\s*configurarPdfWorker,\s*cargar:\s*cargarPdf\s*\}/.test(lazy),
      'BBApp debe exponer la API y el worker locales para el legacy');
    assert.ok(/function cargarPdf\(\)/.test(lazy), 'falta la carga bajo demanda de la API local');
  });
});

/* ---- 8) Portada de los grupos de Mensajes ---------------------------- */

describe('portada de grupos', () => {
  const core = fs.readFileSync(LEGACY, 'utf8');

  it('el editor ofrece una vista previa pequeña y sube la imagen al guardar', () => {
    ['id="grupo-portada-input"', 'id="grupo-portada-preview"', 'w-20 h-12',
      'elegirPortadaGrupo', 'quitarPortadaGrupo', 'grp.portada = portada'].forEach((s) => {
      assert.ok(core.includes(s), 'falta ' + s + ' en el editor de grupos');
    });
    assert.ok(core.includes("Media.subir(window._grupoPortadaFile"), 'la portada debe subirse al Storage al guardar');
    assert.ok(core.includes('/^data:/i.test(portada)'), 'la portada nunca debe guardarse como dataURL');
  });

  it('la tarjeta y la cabecera del chat la muestran en tamaño compacto', () => {
    assert.ok(core.includes('const portada = String(gr.portada'), 'la tarjeta no lee gr.portada');
    assert.ok(core.includes('-mx-3.5 -mt-3.5 mb-2 h-14'), 'la banda de la tarjeta debe medir 56 px');
    assert.ok(core.includes('const avatarGrupo = grp.portada'), 'la cabecera del chat no usa la portada');
  });

  it('guardar el grupo repinta sin variables sin declarar', () => {
    /* `edit` no existía en saveGrupoModal: el ReferenceError llegaba después de
     * guardar y antes de render(), así que la portada no se veía hasta el
     * siguiente repintado y saltaba un aviso de error. */
    const desde = core.indexOf('window.saveGrupoModal = async function');
    const hasta = core.indexOf('window.eliminarGrupo', desde);
    assert.ok(desde > -1 && hasta > desde, 'no se encontró saveGrupoModal');
    const bloque = core.slice(desde, hasta);
    assert.ok(!/\bedit\b/.test(bloque), 'saveGrupoModal usa "edit" sin declararla');
    assert.ok(/showToast\(editId \?/.test(bloque), 'el aviso debe decidir con editId');
  });
});

/* ---- 9) Fase 0: secretos fuera del bundle ---------------------------- */

describe('secretos fuera del bundle (Fase 0)', () => {
  /* Formatos reales de claves de proveedor: si alguna vez se pega una en el
   * portal, el despliegue se corta aquí en vez de publicarla al mundo. */
  const CLAVE = /\b(?:gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|hf_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;

  function fuentesServidas() {
    const out = [path.join(RAIZ, 'portal.html'), path.join(RAIZ, 'portal-modular', 'index.html')];
    const recorrer = (dir) => {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        if (e.name === 'vendor' || e.name === 'node_modules' || e.name === 'test') return;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.(?:js|html)$/i.test(e.name)) out.push(p);
      });
    };
    recorrer(path.join(RAIZ, 'portal-modular'));
    /* El servidor también se despliega: una clave pegada en backend/src o en
     * la función de Vercel quedaría en el repositorio igual que en el portal. */
    recorrer(path.join(RAIZ, 'backend', 'src'));
    recorrer(path.join(RAIZ, 'api'));
    return out;
  }

  it('ningún archivo desplegado incrusta una clave de proveedor', () => {
    const fallos = [];
    fuentesServidas().forEach((file) => {
      const lineas = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lineas.forEach((linea, i) => {
        if (CLAVE.test(linea)) fallos.push(path.relative(RAIZ, file) + ':' + (i + 1));
      });
    });
    assert.deepEqual(fallos, [], 'hay una clave real incrustada en el portal');
  });

  it('guiaBase y practicaConfig no viajan en el bundle inicial', () => {
    const src = fs.readFileSync(path.join(RAIZ, 'backend', 'src', 'routes', 'collections.js'), 'utf8');
    const linea = src.split(/\r?\n/).find((l) => l.includes('EXCLUDE_FROM_BUNDLE')) || '';
    assert.ok(linea.includes("'guiaBase'") && linea.includes("'practicaConfig'"),
      'EXCLUDE_FROM_BUNDLE debe excluir guiaBase y practicaConfig');
  });

  it('solo dirección puede leer la guía y la configuración de Práctica', () => {
    ['alumno', 'maestro', 'capacitador', 'agencia', 'prospecto'].forEach((role) => {
      assert.equal(roles.canRead({ role }, 'guiaBase'), false, role + ' no debe leer guiaBase');
      assert.equal(roles.canRead({ role }, 'practicaConfig'), false, role + ' no debe leer practicaConfig');
    });
    ['gm', 'admin', 'desarrollador'].forEach((role) => {
      assert.equal(roles.canRead({ role }, 'guiaBase'), true, role + ' sí debe leer guiaBase');
      assert.equal(roles.canRead({ role }, 'practicaConfig'), true, role + ' sí debe leer practicaConfig');
    });
  });
});

describe('Voces de práctica', () => {
  it('carga voces tardías y reproduce la voz elegida, incluso antes de iniciar sesión', async () => {
    const vm = require('node:vm');
    const src = fs.readFileSync(LEGACY, 'utf8');
    const bloque = src.slice(src.indexOf('/* ==================== VOCES ==================== */'), src.indexOf('/* ==================== MOTOR DE RESPUESTA'));
    let disponible = [];
    let hablada = null;
    const selector = { value: 'auto', innerHTML: '' };
    const mensaje = { textContent: '' };
    const synth = { getVoices: () => disponible, cancel() {}, speak(u) { hablada = u; } };
    const contexto = {
      window: { speechSynthesis: synth, psVoiceOn: true }, speechSynthesis: synth,
      document: { getElementById(id) { return id === 'ps-voz' ? selector : id === 'ps-voz-info' ? mensaje : null; } },
      psEscape: (s) => String(s), showToast: () => {}, SpeechSynthesisUtterance: function(text) { this.text = text; },
      fetch: async () => ({ ok: true, json: async () => ({ disponible: true, voces: [{ id: 'vozA', nombre: 'Voz A' }, { id: 'vozB', nombre: 'Voz B' }] }) }),
    };
    vm.createContext(contexto);
    vm.runInContext(bloque, contexto);
    contexto.psLoadVoices();
    assert.ok(!selector.innerHTML.includes('Voz tardía'));
    disponible = [{ name: 'Voz tardía', lang: 'es-MX', voiceURI: 'voz-es' }];
    contexto.psLoadVoices();
    assert.ok(selector.innerHTML.includes('Voz tardía'));
    selector.value = 'browser:voz-es';
    contexto.psElegirVoz();
    contexto.psSpeak('Prueba');
    assert.equal(hablada.voice.voiceURI, 'voz-es');
    await contexto.psCargarVocesNaturales();
    assert.ok(selector.innerHTML.includes('Voz A') && selector.innerHTML.includes('Voz B'));
    assert.equal(selector.value, 'browser:voz-es', 'conserva la selección al cargar voces naturales');
  });

  it('envía la voz natural elegida y divide el texto sin perder contenido', async () => {
    const vm = require('node:vm');
    const src = fs.readFileSync(LEGACY, 'utf8');
    const bloque = src.slice(src.indexOf('/* ==================== VOCES ==================== */'), src.indexOf('/* ==================== MOTOR DE RESPUESTA'));
    const selector = { value: 'eleven:vozB' };
    const pedidos = [];
    const contexto = {
      window: { psVoiceOn: true }, document: { getElementById: () => selector },
      psEscape: String, showToast: (msg) => { throw new Error(msg); }, AbortController,
      URL: { createObjectURL: () => 'blob:prueba', revokeObjectURL: () => {} },
      Audio: function() { this.pause = () => {}; this.play = () => { setImmediate(() => this.onended()); return Promise.resolve(); }; },
      fetch: async (url, opts) => { pedidos.push(JSON.parse(opts.body)); return { ok: true, blob: async () => ({}) }; },
    };
    vm.createContext(contexto);
    vm.runInContext(bloque, contexto);
    const texto = 'palabra '.repeat(100).trim();
    await new Promise((resolve) => contexto.psSpeak(texto, resolve));
    assert.ok(pedidos.length > 1);
    assert.ok(pedidos.every((p) => p.voz === 'vozB' && p.texto.length <= 500));
    assert.equal(pedidos.map((p) => p.texto.trim()).join(' '), texto);
  });
});

describe('Gu-IA: controles del chat', () => {
  function entorno() {
    const vm = require('node:vm');
    const src = fs.readFileSync(LEGACY, 'utf8');
    const bloque = src.slice(src.indexOf('function guiaMount(){'), src.indexOf('\nfunction cmCategorias(){'));
    const elementos = {};
    function elemento(id) {
      return elementos[id] || (elementos[id] = {
        id, innerHTML: '', value: '', placeholder: '', disabled: false, listeners: {}, attrs: {},
        classList: { add() {}, remove() {} },
        setAttribute(k,v) { this.attrs[k] = v; }, addEventListener(k,fn) { this.listeners[k] = fn; },
        focus() {}, appendChild() {}, remove() {},
      });
    }
    const avisos = [], guardado = [], copias = [];
    const ctx = {
      window: { confirm: () => true, Backend: { available: true }, IA: { chat: async () => ({ ok: false, status: 429, json: async () => ({ error: 'límite' }) }) } },
      document: { getElementById: elemento, createElement: () => elemento('creado'), body: { appendChild() {} } },
      navigator: { clipboard: { writeText: async (t) => copias.push(t) } },
      guiaGetChat: () => guardado.slice(), guiaSaveChat: (v) => { guardado.splice(0, guardado.length, ...v); },
      guiaRegistrar() {}, guiaContexto: () => '', guiaBaseContexto: () => '',
      psEscape: (t) => String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
      showToast: (t) => avisos.push(t), GUIA_SYS: '', GUIA_MODEL: 'test', setTimeout,
    };
    vm.createContext(ctx);
    vm.runInContext("let guiaEl=null, guiaOpen=false, guiaMsgs=null, guiaBusy=false, guiaRecognition=null, guiaMicOn=false, guiaDocText='';\n" + bloque, ctx);
    return { ctx, elementos, elemento, avisos, guardado, copias };
  }

  it('prepara un atajo sin enviarlo, copia respuestas y permite quitar adjuntos', async () => {
    const vm = require('node:vm');
    const {ctx, elemento, copias} = entorno();
    // Simula que el contenedor todavía no existe para montar los controles.
    const get = ctx.document.getElementById; let primera = true;
    ctx.document.getElementById = (id) => id === 'guia-fab' && primera ? (primera = false, null) : get(id);
    ctx.guiaMount();
    const texto = 'Ayúdame a preparar un primer contacto con un prospecto.';
    elemento('guia-msgs').listeners.click({target:{closest: (s) => s === '[data-guia-prompt]' ? { getAttribute: () => texto } : null}});
    assert.equal(elemento('guia-input').value, texto);
    vm.runInContext("guiaMsgs=[{rol:'guia',texto:'Respuesta ficticia'}]; guiaDocText='contenido';", ctx);
    await ctx.guiaCopiarRespuesta(0);
    assert.deepEqual(copias, ['Respuesta ficticia']);
    ctx.guiaQuitarDocumento();
    assert.equal(vm.runInContext('guiaDocText', ctx), '');
  });

  it('muestra el error de cuota y reactiva el envío', async () => {
    const {ctx, elemento, guardado} = entorno();
    elemento('guia-input').value = 'Hola';
    await ctx.guiaSend();
    assert.match(guardado[1].texto, /muchas consultas/);
    assert.equal(elemento('guia-send').disabled, false);
  });
});

/* ---- 10) Teo: presupuesto para el razonamiento ----------------------- */

describe('Teo con el modelo de razonamiento', () => {
  const teo = fs.readFileSync(path.join(RAIZ, 'backend', 'campus-private', 'legacy', '05-modulo-e.js'), 'utf8');

  it('reserva tokens y pide esfuerzo bajo para no devolver texto vacío', () => {
    const desde = teo.indexOf('async function callGroq');
    const hasta = teo.indexOf('function addMessage', desde);
    assert.ok(desde > -1 && hasta > desde, 'no se encontró callGroq');
    const bloque = teo.slice(desde, hasta);
    const max = bloque.match(/max_tokens:\s*(\d+)/);
    assert.ok(max && Number(max[1]) >= 400, 'max_tokens debe dejar espacio para la respuesta');
    assert.match(bloque, /reasoning_effort:\s*'low'/);
  });
});
