'use strict';
/* ============================================================================
 * uploads.js — RUTAS LOCALES (/uploads/<archivo>) QUE NO EXISTEN EN EL SERVIDOR
 *
 * El backend local (adaptador JSON) guarda las subidas en disco y devuelve
 * `/uploads/<archivo>`. Esa ruta solo existe en el equipo donde se subió: si el
 * documento viaja a la base compartida (sync desde otro equipo o `npm run
 * import`), la imagen queda rota para todos los demás.
 *
 * Aquí se detectan esas referencias y se resuelven en el último punto antes de
 * escribir:
 *   1) si el archivo sigue en disco, se sube al Storage y se reemplaza por su
 *      URL pública (la imagen se conserva);
 *   2) si no está, se quita la referencia: la interfaz muestra su hueco en vez
 *      de una imagen rota, y el cambio queda registrado.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

/* /uploads/foto.png  ·  http://localhost:3000/uploads/foto.png */
const RELATIVA = /^\/uploads\/([^/?#]+)$/;
const ABSOLUTA = /^https?:\/\/[^/]+\/uploads\/([^/?#]+)$/;

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4', webm: 'video/webm',
};

/* Nombre de archivo de una ruta local, o null si no lo es. */
function nombreDeUpload(valor) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return null;
  const m = s.match(RELATIVA) || s.match(ABSOLUTA);
  if (!m) return null;
  let nombre = m[1];
  try { nombre = decodeURIComponent(nombre); } catch (e) { return null; }
  /* Sin traversal ni subrutas: es un nombre de archivo, no una ruta. */
  if (!nombre || nombre.includes('..') || nombre.includes('/') || nombre.includes('\\')) return null;
  return nombre;
}

function mimeDe(nombre) {
  const ext = String(nombre || '').split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

/* Recorre el valor (objetos y arrays anidados) y reemplaza cada ruta local por
 * lo que devuelva `resolver(nombre)`: una URL nueva o null (se quita).
 * Muta el valor recibido. Devuelve { migradas, quitadas, total }. */
async function migrarValor(valor, resolver, limite) {
  const nodos = [];
  (function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') {
        const nombre = nombreDeUpload(v);
        if (nombre) nodos.push({ node, k, nombre });
      } else if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  })(valor, 0);

  const max = Number(limite) > 0 ? Number(limite) : 30;
  let migradas = 0;
  let quitadas = 0;
  for (const n of nodos.slice(0, max)) {
    let url = null;
    try { url = await resolver(n.nombre); } catch (e) { url = null; }
    if (url) { n.node[n.k] = url; migradas++; } else { n.node[n.k] = ''; quitadas++; }
  }
  return { migradas, quitadas, total: nodos.length };
}

/* Lee el archivo del directorio de subidas local (o null si no está). */
function leerLocal(dir, nombre) {
  if (!dir || !nombre) return null;
  try {
    const p = path.join(dir, nombre);
    if (!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    return buf && buf.length ? buf : null;
  } catch (e) {
    return null;
  }
}

module.exports = { nombreDeUpload, mimeDe, migrarValor, leerLocal };
