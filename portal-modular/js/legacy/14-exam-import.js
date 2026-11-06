/* ============================================================================
 * 14-exam-import.js — Importar reactivos desde Word, PDF o texto.
 *
 * El banco de preguntas vive en db.exams[].questions y hoy se captura reactivo
 * por reactivo; para exámenes largos (400+) eso no escala. Aquí:
 *   1. Se lee el documento en el navegador (mammoth para .docx, PDF.js local
 *      para .pdf, texto plano para .txt). El archivo no sale del equipo.
 *   2. Se detectan los pares pregunta/respuesta de los formatos habituales.
 *   3. Se generan 3 opciones incorrectas por reactivo con las respuestas de
 *      los demás reactivos (mismo tipo y longitud similar), sin servicios
 *      externos ni gasto de IA.
 *   4. Se importan en bloque: un solo guardado y un solo repintado del modal,
 *      en lugar de re-renderizar por cada pregunta.
 *
 * API: window.ExamImport.mount(exam, onImported)
 *      window.ExamImport.parsearTexto(texto)     (expuesto para pruebas)
 *      window.ExamImport.construirPreguntas(...) (expuesto para pruebas)
 * ========================================================================== */
(function () {
  'use strict';

  var MAX_PREGUNTAS = 2000;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function clave(v) {
    return norm(v).toLowerCase().replace(/^[¿¡\s]+/, '').replace(/[\s¿?¡!.,;:]+$/g, '');
  }

  /* ------------------------------ Lectura ------------------------------- */

  function cargarScript(url, global) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { window[global] ? resolve(window[global]) : reject(new Error('lector no disponible')); };
      s.onerror = function () { reject(new Error('no se pudo cargar el lector de Word')); };
      document.head.appendChild(s);
    });
  }

  async function obtenerPdfJs() {
    if (typeof window.pdfJsListo === 'function') return window.pdfJsListo();
    if (window.BBApp && window.BBApp.pdf) return window.BBApp.pdf.cargar();
    if (window.pdfjsLib) return window.pdfjsLib;
    throw new Error('El lector de PDF no está disponible. Recarga la página e inténtalo de nuevo.');
  }

  async function leerPdf(file, onStatus) {
    var pdfjs = await obtenerPdfJs();
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    var lineas = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      if (onStatus) onStatus('Leyendo PDF… página ' + p + ' de ' + pdf.numPages);
      var page = await pdf.getPage(p);
      var contenido = await page.getTextContent();
      var filas = [];
      (contenido.items || []).forEach(function (it) {
        if (!it || !it.str || !it.str.trim()) return;
        var tr = it.transform || [];
        var y = Math.round(tr[5] || 0);
        var x = tr[4] || 0;
        var fila = null;
        for (var i = 0; i < filas.length; i++) {
          if (Math.abs(filas[i].y - y) <= 2) { fila = filas[i]; break; }
        }
        if (!fila) { fila = { y: y, partes: [] }; filas.push(fila); }
        fila.partes.push({ x: x, s: it.str });
      });
      filas.sort(function (a, b) { return b.y - a.y; });
      filas.forEach(function (f) {
        f.partes.sort(function (a, b) { return a.x - b.x; });
        var texto = f.partes.map(function (x) { return x.s; }).join(' ').replace(/\s+/g, ' ').trim();
        if (texto) lineas.push(texto);
      });
      lineas.push('');
    }
    return lineas.join('\n');
  }

  async function leerDocx(file) {
    var mammoth = window.mammoth;
    if (!mammoth) {
      mammoth = typeof window.cargarLectorOffice === 'function'
        ? await window.cargarLectorOffice('mammoth')
        : await cargarScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth');
    }
    if (!mammoth) throw new Error('No se pudo cargar el lector de Word.');
    var buf = await file.arrayBuffer();
    if (typeof mammoth.extractRawText === 'function') {
      var r = await mammoth.extractRawText({ arrayBuffer: buf });
      return (r && r.value) || '';
    }
    var h = await mammoth.convertToHtml({ arrayBuffer: buf });
    var doc = new DOMParser().parseFromString(String((h && h.value) || ''), 'text/html');
    return Array.prototype.map.call(doc.querySelectorAll('p,li,h1,h2,h3,td'), function (n) {
      return n.textContent;
    }).join('\n');
  }

  async function leerArchivo(file, onStatus) {
    var nombre = String(file.name || '').toLowerCase();
    if (/\.pdf$/.test(nombre)) return leerPdf(file, onStatus);
    if (/\.docx$/.test(nombre)) {
      if (onStatus) onStatus('Leyendo Word…');
      return leerDocx(file);
    }
    if (/\.(txt|md|csv)$/.test(nombre)) {
      if (onStatus) onStatus('Leyendo texto…');
      return file.text();
    }
    throw new Error('Formato no compatible. Usa un archivo .docx, .pdf o .txt.');
  }

  /* ------------------------------ Parseo -------------------------------- */

  var RX_NUM = /^(\d{1,4})\s*[.)\-:]\s+(.+)$/;
  var RX_MARCA = /^(?:pregunta|question|reactivo|q|p)\s*(\d{1,4})?\s*[:.)\-]\s*(.+)$/i;
  var RX_RESPUESTA = /^(?:r|resp|respuesta|answer|correcta|soluci[oó]n)\s*[:.)\-]\s*(.+)$/i;
  var RX_OPCION = /^\(?([a-dA-D])\)?\s*[.)\-]\s+(.+)$/;

  function cortarPorIndices(lineas, indices) {
    var bloques = [];
    for (var i = 0; i < indices.length; i++) {
      var ini = indices[i];
      var fin = i + 1 < indices.length ? indices[i + 1] : lineas.length;
      var bloque = [];
      for (var j = ini; j < fin; j++) {
        if (norm(lineas[j])) bloque.push(lineas[j]);
      }
      if (bloque.length) bloques.push(bloque);
    }
    return bloques;
  }

  function detectarBloques(lineas) {
    var candidatos = [];
    lineas.forEach(function (l, i) {
      if (!l) return;
      var m = l.match(RX_NUM);
      if (m) { candidatos.push({ i: i, n: parseInt(m[1], 10) }); return; }
      m = l.match(RX_MARCA);
      if (m) candidatos.push({ i: i, n: m[1] ? parseInt(m[1], 10) : null });
    });

    /* La numeración válida avanza de 1 en 1; así una respuesta que empieza
     * con "1969." no se confunde con un reactivo nuevo. */
    var mejor = [];
    var actual = [];
    candidatos.forEach(function (c) {
      if (!actual.length) { actual = [c]; return; }
      var prev = actual[actual.length - 1];
      if (c.n != null && prev.n != null && c.n === prev.n + 1) actual.push(c);
      else {
        if (actual.length > mejor.length) mejor = actual;
        actual = [c];
      }
    });
    if (actual.length > mejor.length) mejor = actual;
    if (mejor.length >= 2) return cortarPorIndices(lineas, mejor.map(function (c) { return c.i; }));

    var preguntas = [];
    lineas.forEach(function (l, i) { if (/[?¿]/.test(l)) preguntas.push(i); });
    if (preguntas.length >= 2) return cortarPorIndices(lineas, preguntas);

    var bloques = [];
    var actualB = [];
    lineas.forEach(function (l) {
      if (!l) {
        if (actualB.length) { bloques.push(actualB); actualB = []; }
        return;
      }
      actualB.push(l);
    });
    if (actualB.length) bloques.push(actualB);
    if (bloques.length >= 2) return bloques;

    var sueltas = lineas.filter(function (l) { return !!l; });
    if (sueltas.length >= 4 && sueltas.length % 2 === 0) {
      var pares = [];
      for (var i = 0; i < sueltas.length; i += 2) pares.push([sueltas[i], sueltas[i + 1]]);
      return pares;
    }
    return sueltas.length ? [sueltas] : [];
  }

  function limpiarPregunta(texto) {
    return norm(texto)
      .replace(/^\d{1,4}\s*[.)\-:]\s+/, '')
      .replace(/^(?:pregunta|question|reactivo|q|p)\s*\d*\s*[:.)\-]\s*/i, '')
      .replace(/^[-•*]\s*/, '')
      .trim();
  }

  function limpiarRespuesta(texto) {
    return norm(texto)
      .replace(/^[-•*]\s*/, '')
      .replace(/\s*[-–—|]+\s*$/, '')
      .trim();
  }

  /* ------------------- Formato "Pregunta N · categoría" ------------------ */

  /* Exportaciones de banco de preguntas (GNP/CNSF y similares): cada bloque
   * trae "Pregunta 12 · Categoría" seguido del enunciado, la respuesta
   * correcta y una explicación. El texto puede venir en una sola línea o con
   * saltos de página, así que se trabaja sobre el documento normalizado. */
  var CATEGORIAS_EXAMEN = [
    'Accidentes y Enfermedades — Personas',
    'Matemáticas y Cálculos Financieros',
    'Jurídicos',
    'Vida Individual',
    'Hogar — Casa Habitación',
    'Prevención de Lavado de Dinero (PLD)',
    'Automóviles — Seguro Individual',
    'Sistema Financiero Mexicano',
    'Técnicos',
    'Embarcaciones Menores de Placer'
  ];

  function escaparRegex(v) {
    return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizarPlano(texto) {
    return String(texto || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buscarRespuestaCorrecta(texto, desde) {
    var re = /(?:✓|✔|√)?\s*Respuesta\s+correcta\s*:\s*/gi;
    re.lastIndex = Math.max(0, desde || 0);
    var m = re.exec(texto);
    return m ? { index: m.index, end: re.lastIndex } : null;
  }

  function quitarCategoriaExamen(texto) {
    var t = norm(texto);
    for (var i = 0; i < CATEGORIAS_EXAMEN.length; i++) {
      var partes = CATEGORIAS_EXAMEN[i].split(/\s+/).map(escaparRegex).join('\\s+').replace(/—/g, '[—–-]');
      var m = t.match(new RegExp('^' + partes + '(?:\\s+|$)', 'i'));
      if (m) return t.slice(m[0].length).trim();
    }
    var q = t.indexOf('¿');
    if (q > 0 && q <= 100 && !/[.!?]/.test(t.slice(0, q))) return t.slice(q).trim();
    return t;
  }

  function limpiarPreguntaExamen(texto) {
    var s = norm(texto);
    s = s.replace(/\s*(?:[✗✘xX]\s*)?Tu\s+respuesta\s*:[\s\S]*$/i, '');
    s = s.replace(/\s*(?:✓|✔|√)?\s*Respuesta\s+correcta\s*:[\s\S]*$/i, '');
    s = s.replace(/\s*💡?\s*Explicaci[oó]n\s*:[\s\S]*$/i, '');
    s = s.replace(/\s*\bFuente\s*:[\s\S]*$/i, '');
    s = s.replace(/^Pregunta\s+\d{1,4}\s*[·•]\s*/i, '');
    s = quitarCategoriaExamen(s);
    return s.replace(/\s*[✗✘✓✔√]\s*$/, '').trim();
  }

  function limpiarRespuestaExamen(texto) {
    var s = norm(texto);
    s = s.replace(/^[✓✔√]\s*/, '');
    s = s.replace(/^[A-Ea-e][).\-]\s+/, '');
    s = s.replace(/\s*(?:💡\s*)?Explicaci[oó]n\s*:[\s\S]*$/i, '');
    s = s.replace(/\s*\bFuente\s*:[\s\S]*$/i, '');
    return s.replace(/\s*[✓✔√]\s*$/, '').trim();
  }

  function parecePregunta(texto) {
    var t = norm(texto);
    if (t.length < 8 || t.length > 600) return false;
    if (!/[?:]\s*$/.test(t)) return false;
    if (/^(?:Explicaci[oó]n|Fuente)\b/i.test(t)) return false;
    return /^(?:¿|¡|[A-ZÁÉÍÓÚÑ]|que\b|qué\b|cual\b|cuál\b|cuando\b|cuándo\b|como\b|cómo\b|donde\b|dónde\b|quien\b|quién\b)/i.test(t);
  }

  /* El PDF puede perder el marcador "Pregunta N ·" de un reactivo y dejar su
   * enunciado dentro del bloque anterior. Se busca la última oración que
   * termine en ? o : antes del siguiente "Respuesta correcta". */
  function extraerPreguntaHuerfana(texto) {
    var s = norm(texto);
    s = s.replace(/^.*?Explicaci[oó]n\s*:\s*/i, '').trim();
    s = s.replace(/\bFuente\s*:[^.?!]*(?:[.?!]|$)\s*/gi, '').trim();
    var re = /[.!?]\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/g;
    var cortes = [0], m;
    while ((m = re.exec(s))) {
      var pos = m.index + m[0].length;
      if (pos > 0 && pos < s.length) cortes.push(pos);
    }
    for (var i = cortes.length - 1; i >= 0; i--) {
      var cand = s.slice(cortes[i]).replace(/^[\s.]+/, '').trim();
      if (parecePregunta(cand)) return cand;
    }
    return '';
  }

  function agregarItemExamen(items, vistos, pregunta, respuesta, numero) {
    var q = norm(pregunta);
    var a = norm(respuesta);
    if (q.length < 3 || !a) return false;
    var k = clave(q);
    if (!k || vistos[k]) return false;
    vistos[k] = 1;
    items.push({ question: q, answer: a, options: null, correct: null, numero: numero });
    return true;
  }

  function parsearFormatoExamen(texto) {
    var plano = normalizarPlano(texto);
    var marcas = [];
    var re = /Pregunta\s+(\d{1,4})\s*[·•]\s*/gi;
    var m;
    while ((m = re.exec(plano))) marcas.push({ index: m.index, fin: re.lastIndex, numero: parseInt(m[1], 10) });
    if (!marcas.length) return null;

    var items = [];
    var descartadas = [];
    var vistos = {};

    marcas.forEach(function (marca, i) {
      var finBloque = i + 1 < marcas.length ? marcas[i + 1].index : plano.length;
      var bloque = plano.slice(marca.fin, finBloque);
      var r1 = buscarRespuestaCorrecta(bloque, 0);
      if (!r1) {
        descartadas.push({ linea: 'Pregunta ' + marca.numero, motivo: 'sin respuesta correcta' });
        return;
      }

      var pregunta = limpiarPreguntaExamen(bloque.slice(0, r1.index));
      var respuesta = limpiarRespuestaExamen(bloque.slice(r1.end));
      var agregada = agregarItemExamen(items, vistos, pregunta, respuesta, marca.numero);
      if (!agregada) {
        descartadas.push({
          linea: 'Pregunta ' + marca.numero,
          motivo: !pregunta ? 'sin enunciado' : (!respuesta ? 'sin respuesta' : 'duplicada')
        });
      }

      /* Marcadores perdidos: cada "Respuesta correcta" extra dentro del mismo
       * bloque corresponde a un reactivo cuyo encabezado no se extrajo. */
      var prevEnd = r1.end;
      while (true) {
        var r2 = buscarRespuestaCorrecta(bloque, prevEnd);
        if (!r2) break;
        var qH = extraerPreguntaHuerfana(bloque.slice(prevEnd, r2.index));
        var r3 = buscarRespuestaCorrecta(bloque, r2.end);
        var aH = limpiarRespuestaExamen(bloque.slice(r2.end, r3 ? r3.index : bloque.length));
        var okH = agregarItemExamen(items, vistos, qH, aH, marca.numero + 0.1);
        if (!okH) {
          descartadas.push({
            linea: 'Reactivo sin marcador tras ' + marca.numero,
            motivo: qH ? 'sin respuesta o duplicado' : 'sin enunciado'
          });
        }
        prevEnd = r2.end;
        if (!r3) break;
      }
    });

    if (!items.length) return null;
    return { items: items, descartadas: descartadas, totalLineas: 1, formato: 'pregunta-categoria' };
  }

  function interpretarBloque(lineas) {
    if (!lineas.length) return null;
    var pregunta = limpiarPregunta(lineas[0]);
    var resto = lineas.slice(1);
    var respuesta = '';
    var opciones = null;
    var correcta = null;

    var inline = pregunta.match(/\s+(?:→|=>|=|\||—|–)\s+(.+)$/);
    if (inline) {
      respuesta = inline[1];
      pregunta = pregunta.slice(0, inline.index).trim();
    }

    /* Opciones a) b) c) d), con la correcta marcada con * o (correcta). */
    var opts = [];
    resto.forEach(function (l) {
      var m = l.match(RX_OPCION);
      if (!m) return;
      var texto = m[2].trim();
      var marcada = /^\*/.test(texto) || /\*\s*$/.test(texto) || /\((correcta|correct|respuesta)\)\s*$/i.test(texto) || /\[x\]/i.test(texto);
      texto = texto.replace(/^\*+/, '').replace(/\*+$/, '')
        .replace(/\s*\((correcta|correct|respuesta)\)\s*$/i, '')
        .replace(/\s*\[x\]\s*$/i, '')
        .trim();
      if (texto) opts.push({ texto: texto, marcada: marcada });
    });

    var marcador = '';
    resto.forEach(function (l) {
      if (marcador) return;
      var m = l.match(RX_RESPUESTA);
      if (m) marcador = m[1].trim();
    });

    if (opts.length >= 2) {
      var marcadas = opts.filter(function (o) { return o.marcada; });
      if (marcadas.length === 1) {
        opciones = opts.map(function (o) { return o.texto; });
        correcta = opts.indexOf(marcadas[0]);
      } else if (marcador) {
        var buscada = clave(marcador).replace(/^[a-d]\)\s*/, '');
        var idx = -1;
        opts.forEach(function (o, i) {
          if (idx < 0 && clave(o.texto) === buscada) idx = i;
        });
        if (idx >= 0) { opciones = opts.map(function (o) { return o.texto; }); correcta = idx; }
      }
    }

    if (!opciones) {
      if (!respuesta) respuesta = marcador || resto.join(' ');
      respuesta = limpiarRespuesta(respuesta);
    } else if (!respuesta) {
      respuesta = opciones[correcta];
    }

    if (pregunta.length < 3 || !respuesta) return null;
    return { question: pregunta, answer: respuesta, options: opciones, correct: correcta };
  }

  function parsearTexto(texto) {
    var crudo = String(texto || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    var especial = parsearFormatoExamen(crudo);
    if (especial) return especial;
    var lineas = crudo.split('\n').map(function (l) {
      return l.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\t+/g, ' | ').replace(/\s+/g, ' ').trim();
    });
    var items = [];
    var descartadas = [];
    var vistos = {};
    var bloques = detectarBloques(lineas);

    bloques.forEach(function (bloque) {
      var item = interpretarBloque(bloque);
      if (!item) {
        descartadas.push({ linea: bloque[0] || '', motivo: 'sin respuesta reconocible' });
        return;
      }
      var k = clave(item.question);
      if (!k || vistos[k]) return;
      vistos[k] = 1;
      items.push(item);
    });

    return { items: items, descartadas: descartadas, totalLineas: lineas.length };
  }

  /* -------------------------- Opciones incorrectas ---------------------- */

  function generador(semilla) {
    var s = 2166136261;
    var texto = String(semilla || '');
    for (var i = 0; i < texto.length; i++) {
      s ^= texto.charCodeAt(i);
      s = Math.imul(s, 16777619);
    }
    s = s >>> 0 || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function mezclar(lista, rnd) {
    var copia = lista.slice();
    for (var i = copia.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia;
  }

  function esNumerica(v) {
    return /^[\s\d.,%$€()+-]+$/.test(v);
  }

  function elegirDistractores(correcta, pool, rnd) {
    var base = pool.filter(function (a) { return clave(a) !== clave(correcta); });
    var mismoTipo = base.filter(function (a) { return esNumerica(a) === esNumerica(correcta); });
    var fuente = mismoTipo.length >= 3 ? mismoTipo : base;
    var orden = fuente.map(function (a) {
      return { a: a, peso: Math.abs(a.length - correcta.length) + rnd() * 12 };
    }).sort(function (x, y) { return x.peso - y.peso; });

    var salida = [];
    orden.forEach(function (o) {
      if (salida.length < 3 && !salida.some(function (x) { return clave(x) === clave(o.a); })) salida.push(o.a);
    });
    var relleno = ['Ninguna de las anteriores', 'Todas las anteriores', 'No se menciona en el documento'];
    relleno.forEach(function (r) {
      if (salida.length < 3 && clave(r) !== clave(correcta) && !salida.some(function (x) { return clave(x) === clave(r); })) salida.push(r);
    });
    return salida.slice(0, 3);
  }

  function unicas(lista) {
    var out = [], vistos = {};
    lista.forEach(function (v) {
      var t = norm(v);
      if (!t) return;
      var k = clave(t);
      if (vistos[k]) return;
      vistos[k] = 1;
      out.push(t);
    });
    return out;
  }

  function construirPreguntas(items, respuestasExtra, preguntasExistentes) {
    var pool = [];
    (items || []).forEach(function (it) {
      pool.push(it.correct != null && it.options ? it.options[it.correct] : it.answer);
    });
    (respuestasExtra || []).forEach(function (a) { pool.push(a); });
    pool = unicas(pool);

    var existentes = {};
    (preguntasExistentes || []).forEach(function (t) { existentes[clave(t)] = 1; });

    var salida = [];
    (items || []).forEach(function (it) {
      var pregunta = norm(it.question);
      if (!pregunta || existentes[clave(pregunta)]) return;
      existentes[clave(pregunta)] = 1;

      var rnd = generador(clave(pregunta));
      var correcta = norm(it.correct != null && it.options ? it.options[it.correct] : it.answer);
      if (!correcta) return;

      var opciones;
      if (it.options && it.options.length >= 2 && it.correct != null) {
        opciones = unicas(it.options);
        if (opciones.indexOf(correcta) < 0) opciones.unshift(correcta);
        if (opciones.length < 4) {
          elegirDistractores(correcta, pool, rnd).forEach(function (d) {
            if (opciones.length < 4 && !opciones.some(function (o) { return clave(o) === clave(d); })) opciones.push(d);
          });
        }
        opciones = mezclar(opciones, rnd);
      } else {
        opciones = mezclar([correcta].concat(elegirDistractores(correcta, pool, rnd)), rnd);
      }

      var posicion = -1;
      opciones.forEach(function (o, i) { if (posicion < 0 && clave(o) === clave(correcta)) posicion = i; });
      if (posicion < 0) return;

      salida.push({ question: pregunta, options: opciones, correct: posicion, type: 'multiple' });
    });
    return salida;
  }

  /* --------------------------------- UI --------------------------------- */

  function panelHtml() {
    return '<div id="exam-import-panel" hidden class="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">'
      + '<div class="flex items-start justify-between gap-3">'
      + '<div><p class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Análisis con IA</p>'
      + '<p class="text-xs text-slate-600 mt-1">Sube el examen en Word (.docx), PDF o texto (.txt). Tomamos la respuesta correcta de cada pregunta y generamos 3 opciones incorrectas con las respuestas de los demás reactivos, sin capturarlas a mano.</p></div>'
      + '<button type="button" id="exam-import-close" class="text-slate-400 hover:text-slate-600" aria-label="Cerrar importador"><i class="fas fa-times"></i></button>'
      + '</div>'
      + '<div class="grid gap-2 md:grid-cols-2">'
      + '<label class="text-xs font-semibold text-slate-600">Documento (PDF o Word)'
      + '<input id="exam-import-file" type="file" accept=".pdf,.docx,.txt,.md" class="mt-1 block w-full text-xs bg-white border border-slate-300 rounded-lg p-2">'
      + '</label>'
      + '<label class="text-xs font-semibold text-slate-600">…o pega el texto'
      + '<textarea id="exam-import-text" rows="2" class="mt-1 w-full text-xs bg-white border border-slate-300 rounded-lg p-2 text-slate-900" placeholder="1. ¿Pregunta? = Respuesta"></textarea>'
      + '</label>'
      + '</div>'
      + '<div class="flex items-center gap-2 flex-wrap">'
      + '<button type="button" id="exam-import-analizar" class="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Analizar documento</button>'
      + '<span id="exam-import-status" class="text-xs text-slate-500"></span>'
      + '</div>'
      + '<p id="exam-import-error" class="text-xs text-rose-600" hidden></p>'
      + '<div id="exam-import-preview" class="space-y-2"></div>'
      + '</div>';
  }

  function mount(exam, onImported) {
    var host = document.getElementById('exam-import-host');
    var toggle = document.getElementById('exam-import-toggle');
    if (!host || !toggle || !exam) return;

    host.innerHTML = panelHtml();

    var panel = document.getElementById('exam-import-panel');
    var fileInput = document.getElementById('exam-import-file');
    var textarea = document.getElementById('exam-import-text');
    var btnAnalizar = document.getElementById('exam-import-analizar');
    var btnCerrar = document.getElementById('exam-import-close');
    var statusEl = document.getElementById('exam-import-status');
    var errorEl = document.getElementById('exam-import-error');
    var preview = document.getElementById('exam-import-preview');
    var pendientes = null;

    function setStatus(t) { if (statusEl) statusEl.textContent = t || ''; }
    function setError(t) {
      if (!errorEl) return;
      errorEl.textContent = t || '';
      errorEl.hidden = !t;
    }

    toggle.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) fileInput.focus();
    });
    btnCerrar.addEventListener('click', function () { panel.hidden = true; });

    function respuestasExistentes() {
      return (exam.questions || []).map(function (q) { return q && q.options ? q.options[q.correct] : ''; });
    }

    async function analizar() {
      setError('');
      pendientes = null;
      preview.innerHTML = '';
      btnAnalizar.disabled = true;
      setStatus('');

      try {
        var texto = '';
        var file = fileInput.files && fileInput.files[0];
        if (file) texto = await leerArchivo(file, setStatus);
        else texto = textarea.value;

        if (!norm(texto)) throw new Error('Elige un archivo o pega el texto del examen.');

        var parsed = parsearTexto(texto);
        if (!parsed.items.length) {
          throw new Error('No encontré preguntas con respuesta. Revisa que cada reactivo tenga su respuesta debajo o separada por =, | o —.');
        }
        if (parsed.items.length > MAX_PREGUNTAS) {
          throw new Error('El documento trae ' + parsed.items.length + ' reactivos; el máximo por importación es ' + MAX_PREGUNTAS + '.');
        }

        var generadas = construirPreguntas(parsed.items, respuestasExistentes(), (exam.questions || []).map(function (q) { return q.question; }));
        if (!generadas.length) throw new Error('Todos los reactivos del documento ya están en este examen.');

        pendientes = generadas;
        var yaExistian = parsed.items.length - generadas.length;
        var repetidas = (parsed.descartadas || []).filter(function (d) {
          return /duplicada/i.test(d.motivo);
        }).length;
        var sinDatos = (parsed.descartadas || []).length - repetidas;
        var detalleOmitidas = (parsed.descartadas || []).slice(0, 6).map(function (d) {
          return d.linea + ' (' + d.motivo + ')';
        }).join(' · ');
        var filas = generadas.slice(0, 5).map(function (q) {
          return '<div class="rounded-lg border border-slate-200 bg-white p-2">'
            + '<p class="text-xs font-medium text-slate-800">' + esc(q.question) + '</p>'
            + '<p class="text-[11px] text-emerald-700 mt-1">Correcta: ' + esc(q.options[q.correct]) + '</p>'
            + '<p class="text-[11px] text-slate-500">Incorrectas: ' + esc(q.options.filter(function (_, i) { return i !== q.correct; }).join(' · ')) + '</p>'
            + '</div>';
        }).join('');

        preview.innerHTML = '<div class="rounded-lg border border-indigo-200 bg-white p-3 space-y-2">'
          + '<p class="text-xs text-slate-700"><b>' + generadas.length + '</b> reactivos listos, cada uno con 4 opciones. '
          + (yaExistian > 0 ? ' <span class="text-amber-700">' + yaExistian + ' ya existían en este examen.</span>' : '')
          + (sinDatos > 0 ? ' <span class="text-amber-700">' + sinDatos + ' sin enunciado o sin respuesta.</span>' : '')
          + (repetidas > 0 ? ' <span class="text-amber-700">' + repetidas + ' repetidos en el documento.</span>' : '')
          + '</p>'
          + (detalleOmitidas ? '<p class="text-[11px] text-amber-700">Omitidas: ' + esc(detalleOmitidas) + (sinDatos > 6 ? '…' : '') + '</p>' : '')
          + '<div class="space-y-2 max-h-48 overflow-y-auto">' + filas + '</div>'
          + (generadas.length > 5 ? '<p class="text-[11px] text-slate-400">Vista previa de los primeros 5.</p>' : '')
          + '<button type="button" id="exam-import-run" class="px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700">'
          + 'Importar ' + generadas.length + ' preguntas al examen</button>'
          + '</div>';

        setStatus('');
        document.getElementById('exam-import-run').addEventListener('click', function () {
          if (!pendientes || !pendientes.length) return;
          var total = pendientes.length;
          pendientes.forEach(function (q) { exam.questions.push(q); });
          pendientes = null;
          if (typeof onImported === 'function') onImported(total);
        });
      } catch (e) {
        setStatus('');
        setError(e && e.message ? e.message : 'No se pudo leer el documento.');
      } finally {
        btnAnalizar.disabled = false;
      }
    }

    btnAnalizar.addEventListener('click', analizar);
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) analizar();
    });
  }

  window.ExamImport = {
    mount: mount,
    parsearTexto: parsearTexto,
    construirPreguntas: construirPreguntas
  };
})();
