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
const JS_DIRS = ['legacy', 'modules', 'core'].map((d) => path.join(RAIZ, 'portal-modular', 'js', d));
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
    ['admin', 'gm', 'desarrollador', 'maestro', 'capacitador', 'agencia'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'groups'), true, role + ' debería gestionar grupos de Academia');
      assert.equal(roles.canWrite({ role }, 'enrollments'), true, role + ' debería inscribir alumnos');
    });
    ['alumno', 'agente_agencia', 'agente_desarrollo', 'prospecto', 'editor'].forEach((role) => {
      assert.equal(roles.canWrite({ role }, 'groups'), false, role + ' no debería escribir grupos de Academia');
      assert.equal(roles.canWrite({ role }, 'enrollments'), false, role + ' no debería inscribir ni quitar alumnos');
    });
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
