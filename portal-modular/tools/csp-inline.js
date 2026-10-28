/* ============================================================================
 * tools/csp-inline.js — MIGRADOR DE MANEJADORES INLINE → ACCIONES DELEGADAS
 *
 * Convierte  onclick="cuerpo"  en  data-bx-click="aN" [data-p0="…"]
 * y genera js/core/bx-actions.js con el cuerpo ORIGINAL de cada manejador
 * como función real (sin eval), sustituyendo cada interpolación ${expr} por
 * un parámetro tipado ${bxE(function(){return expr})} (ver js/core/actions.js).
 *
 *   node tools/csp-inline.js          # migra y reescribe bx-actions.js
 *   node tools/csp-inline.js --check  # no escribe; falla si quedan inline
 *
 * Idempotente: un archivo ya migrado (sin on*=") no se toca. Los manejadores
 * cuyo atributo está partido por concatenación, los de cuerpo dinámico
 * (onclick="${x}") y los de comentarios se dejan intactos y se reportan.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const REGISTRY = path.join(JS_DIR, 'core', 'bx-actions.js');
/* Archivos de infraestructura: contienen atributos en su documentación. */
const PROPIOS = new Set([REGISTRY, path.join(JS_DIR, 'core', 'actions.js'), path.join(JS_DIR, 'core', 'bx-manual.js')]);
const CHECK = process.argv.includes('--check');

const EVENTOS = ['click', 'change', 'input', 'dblclick', 'keydown', 'submit', 'error', 'ended'];
const ATTR = new RegExp('\\bon(' + EVENTOS.join('|') + ')="([^"]*)"', 'g');
const VAR = 'bx';

/* --- utilidades de escaneo (sin dependencias) ------------------------------ */

/* Índice del '}' que cierra la interpolación abierta en `startBrace`
 * (apunta al '{'), respetando cadenas y llaves anidadas. -1 si no cierra. */
function finInterpolacion(s, startBrace) {
  let prof = 0;
  for (let i = startBrace; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s.charCodeAt(i) === 92) i++;
        i++;
      }
      continue;
    }
    if (c === '{') prof++;
    else if (c === '}') {
      prof--;
      if (prof === 0) return i;
    }
  }
  return -1;
}

/* Cuerpo sintácticamente completo: comillas cerradas y paréntesis/llaves
 * equilibrados. Un atributo partido por concatenación
 * (onclick="fn(' + id + ')") deja el cuerpo abierto → no pasa. */
function cuerpoCompleto(s) {
  let prof = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s.charCodeAt(i) === 92) i++;
        i++;
      }
      if (i >= s.length) return false;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') prof++;
    if (c === ')' || c === ']' || c === '}') {
      prof--;
      if (prof < 0) return false;
    }
  }
  return prof === 0;
}

/* ¿El atributo encontrado está dentro de un comentario del archivo? Los
 * comentarios de documentación mencionan onclick="…" y no deben migrarse (se
 * registraría una acción que nunca se dispara y se falsearía el recuento).
 * Se decide por el INICIO DE LÍNEA — '*' de un bloque, '/*' o '//' — que es
 * determinista; analizar bloques por posición confundiría '/*' dentro de una
 * cadena y podría saltarse un manejador real. */
function enComentario(src, offset) {
  const inicio = src.lastIndexOf('\n', offset);
  const linea = src.slice(inicio + 1, offset);
  return /^\s*(\*|\/\*|\/\/)/.test(linea);
}

/* Convierte el cuerpo de un manejador inline en código de función.
 * Devuelve { code, params:[expr…] } o { error }. */
function compilar(cuerpo) {
  const params = [];
  let out = '';
  let i = 0;
  const param = (expr) => {
    params.push(expr.trim());
    return VAR + (params.length - 1);
  };
  /* Vuelca el parámetro en el código que se está armando. Si viene precedido
   * de un punto (propiedad DINÁMICA: window.${attr} = …) se cambia a acceso
   * por corchetes — window[bx0] — porque window.(bx0) no es sintaxis válida. */
  const emitir = (expr) => {
    const nombre = param(expr);
    if (out.endsWith('.')) out = out.slice(0, -1) + '[' + nombre + ']';
    else out += '(' + nombre + ')';
  };
  while (i < cuerpo.length) {
    const c = cuerpo[i];
    const escapado = i > 0 && cuerpo.charCodeAt(i - 1) === 92;
    /* '${x}' / "${x}": la interpolación es TODO el contenido de la cadena; se
     * reemplaza la cadena entera por el parámetro (si no, quedaría 'bx0', es
     * decir el texto "bx0" en vez del valor). */
    if (!escapado && (c === '"' || c === "'") && cuerpo.startsWith('${', i + 1)) {
      /* i = comilla · i+1 = '$' · i+2 = '{' → la expresión empieza en i+3. */
      const cierre = finInterpolacion(cuerpo, i + 2);
      if (cierre > 0 && cuerpo[cierre + 1] === c) {
        emitir(cuerpo.slice(i + 3, cierre));
        i = cierre + 2;
        continue;
      }
    }
    if (!escapado && c === '$' && cuerpo[i + 1] === '{') {
      const cierre = finInterpolacion(cuerpo, i + 1);
      if (cierre < 0) return { error: 'interpolación sin cerrar' };
      emitir(cuerpo.slice(i + 2, cierre));
      i = cierre + 1;
      continue;
    }
    out += c;
    i++;
  }
  if (out.includes('${')) return { error: 'interpolación anidada' };
  return { code: out, params };
}

/* --- archivos a migrar ---------------------------------------------------- */
function archivos(dir, acc) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) archivos(p, acc);
    else if (/\.js$/.test(f) && !PROPIOS.has(p)) acc.push(p);
  }
  return acc;
}

const lista = archivos(JS_DIR, []);
lista.push(path.join(ROOT, 'index.html'));

/* --- migración ------------------------------------------------------------ */
const registro = new Map(); // evento\0cuerpo → id
const acciones = [];        // { id, code, params, origen }
let total = 0;
const pendientes = [];

for (const file of lista) {
  const src = fs.readFileSync(file, 'utf8');
  const esHTML = file.endsWith('.html');
  const rel = path.relative(ROOT, file);
  let tocado = false;
  let linea = 0;

  const dst = src.replace(ATTR, (completo, ev, cuerpo, offset, original) => {
    if (enComentario(original, offset)) return completo;
    /* El atributo vive dentro de una cadena JS: \' es una comilla literal.
     * Se desescapa para analizar y para el cuerpo de la acción (un manejador
     * inline real nunca ve la barra invertida). */
    const plano = cuerpo.replace(/\\'/g, "'").replace(/\\"/g, '"');
    const c = compilar(plano);
    if (c.error) {
      pendientes.push([rel, ev, c.error, cuerpo.slice(0, 70)]);
      return completo;
    }
    /* La comprobación de equilibrio se hace sobre el código YA compilado: las
     * interpolaciones pueden contener comillas (replace(/'/g,…)) que, vistas
     * en el texto crudo, parecen una cadena sin cerrar. */
    if (!cuerpoCompleto(c.code)) {
      pendientes.push([rel, ev, 'atributo partido (concatenación)', cuerpo.slice(0, 70)]);
      return completo;
    }
    /* Concatenación de render ('a'+variable): el valor solo se conoce al
     * pintar, así que el cuerpo no se puede mover tal cual a una función. */
    if (/['"]\s*\+\s*[A-Za-z_$[\]]|[A-Za-z0-9_$\])]\s*\+\s*['"]/.test(c.code || '')) {
      pendientes.push([rel, ev, 'concatenación de render', cuerpo.slice(0, 70)]);
      return completo;
    }
    /* onclick="${expr}": el atributo ENTERO es dinámico (el código solo se
     * conoce al pintar). Sin eval no se puede ejecutar → se reporta. */
    if (c.params.length === 1 && /^\s*\(bx0\)\s*$/.test(c.code)) {
      pendientes.push([rel, ev, 'cuerpo dinámico', cuerpo.slice(0, 70)]);
      return completo;
    }
    /* `this` y `event` solo existen al disparar el evento; dentro de la
     * expresión de un parámetro se evalúan al pintar → valores falsos. */
    const usaContexto = c.params.some((p) => /(^|[^\w$.])(this|event)([^\w$]|$)/.test(p));
    if (usaContexto) {
      pendientes.push([rel, ev, 'parámetro usa this/event', cuerpo.slice(0, 70)]);
      return completo;
    }
    if (esHTML && c.params.length) {
      pendientes.push([rel, ev, 'parámetro en HTML estático', cuerpo.slice(0, 70)]);
      return completo;
    }
    tocado = true;
    total++;
    const clave = ev + '\u0000' + cuerpo;
    let id = registro.get(clave);
    if (!id) {
      id = 'a' + (acciones.length + 1);
      registro.set(clave, id);
      linea = original.slice(0, offset).split('\n').length;
      acciones.push({ id, code: c.code, params: c.params.length, origen: rel + ':' + linea + ' · ' + ev });
    }
    let salida = 'data-bx-' + ev + '="' + id + '"';
    c.params.forEach((expr, i) => {
      salida += ' data-p' + i + '="${bxE(function(){return ' + expr + '})}"';
    });
    return salida;
  });
  if (tocado && !CHECK) fs.writeFileSync(file, dst);
}

/* --- registro generado ---------------------------------------------------- */
const cabecera = [
  '/* GENERADO por tools/csp-inline.js — NO EDITAR A MANO.',
  ' * Cada función es el cuerpo original de un manejador inline del portal, ya',
  ' * sin atributos on*: los dispara la delegación de js/core/actions.js.',
  ' * El comentario de cada acción dice de qué archivo y línea salió. */',
  'window.__bx = window.__bx || {};',
  '',
].join('\n');

const cuerpoRegistro = acciones.map((a) => {
  const args = ['event'].concat(a.params ? Array.from({ length: a.params }, (_, i) => VAR + i) : []);
  return '/* ' + a.origen + ' */\nwindow.__bx.' + a.id + ' = function (' + args.join(', ') + ') { ' + a.code + ' };';
}).join('\n\n');

if (!CHECK) fs.writeFileSync(REGISTRY, cabecera + cuerpoRegistro + '\n');

/* --- informe -------------------------------------------------------------- */
console.log('manejadores migrados:', total);
console.log('acciones únicas:', acciones.length);
console.log('pendientes:', pendientes.length);
pendientes.forEach((p) => console.log('  PENDIENTE', p[0], p[1], '-', p[2], '|', p[3]));
if (CHECK) {
  console.log(total ? 'quedan manejadores inline' : 'sin manejadores inline');
  process.exit(total || pendientes.length ? 1 : 0);
}
process.exit(pendientes.length ? 1 : 0);
