'use strict';
/* ============================================================================
 * mediaProxy.js — SIRVE LAS IMÁGENES DE SUPABASE DESDE NUESTRO PROPIO DOMINIO
 *
 * El problema: Supabase responde `Cache-Control: private, no-cache` a los
 * objetos públicos del bucket (se comprobó también subiendo con cacheControl),
 * así que el navegador revalida cada imagen en cada visita: una petición de
 * red por imagen, aunque el cuerpo conteste 304.
 *
 * La solución, en dos piezas que se complementan:
 *   1) `/media/<ruta>` — proxy de solo lectura hacia el Storage que responde
 *      con `Cache-Control: public, max-age=31536000, immutable` y con
 *      `Vercel-CDN-Cache-Control` para que el CDN guarde el objeto.
 *   2) `relativizarUrls()` — reescribe, al salir, cualquier URL pública del
 *      bucket dentro de las respuestas JSON. Los documentos de la base siguen
 *      guardando la URL absoluta (los correos y PDFs del servidor la
 *      necesitan); solo el navegador recibe la ruta corta.
 *
 * Salvaguardas: nunca inventa un 404. Si la ruta no valida, responde 400; si
 * el archivo no es una imagen o pesa demasiado (límite de respuesta de las
 * funciones de Vercel), redirige al original de Supabase.
 * ========================================================================== */
const { Readable } = require('stream');
const config = require('./config');

const BUCKET = 'portal-media';
const RUTA_BASE = '/media/';
const MAX_BYTES = 8 * 1024 * 1024; // por encima: redirige (no pasa por la función)
const TIMEOUT_MS = 15000;
const IMG_RE = /\.(jpe?g|png|webp|gif|avif|svg|bmp|ico)$/i;

/* Prefijo de las URLs públicas. Se reconoce cualquier proyecto de Supabase
 * (no solo el configurado) para que la reescritura no dependa del entorno. */
const RE_SUPABASE_MEDIA = /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/portal-media\//gi;

function urlBase() {
  if (!config.supabaseUrl) return null;
  return String(config.supabaseUrl).replace(/\/+$/, '') + `/storage/v1/object/public/${BUCKET}/`;
}

function urlPublica(ruta) {
  const base = urlBase();
  if (!base) return null;
  return base + String(ruta).split('/').map(encodeURIComponent).join('/');
}

/* Ruta relativa de un objeto a partir de su URL pública (o null). */
function rutaDeUrl(url) {
  const s = String(url || '');
  const m = s.match(/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/portal-media\/(.+)$/i);
  return m ? m[1] : null;
}

/* Valida lo que llega por la URL. Permisivo con acentos y espacios (hay
 * archivos viejos con nombres raros) pero cerrado a todo lo demás: sin `..`,
 * sin barras invertidas, sin dobles barras, longitud acotada. */
function normalizarRuta(cruda) {
  let p = String(cruda || '').split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch (e) { return null; }
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!p || p.length > 300) return null;
  if (p.includes('..') || p.includes('\\') || p.includes('//')) return null;
  // letras (con acentos), dígitos, espacio y los signos habituales de archivo
  if (!/^[\w.\-/ áéíóúÁÉÍÓÚñÑüÜ()+,]+$/.test(p)) return null;
  return p;
}

function esImagen(ruta) {
  return IMG_RE.test(String(ruta || ''));
}

async function servirMedia(req, res, rutaCruda) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }
  const ruta = normalizarRuta(rutaCruda);
  const destino = ruta ? urlPublica(ruta) : null;
  if (!destino) {
    // Sin Storage configurado (modo local) o ruta inválida: no hay nada que servir.
    return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });
  }
  if (!esImagen(ruta)) {
    // Videos, PDF y Office: mejor el original que atravesar la función.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.redirect(302, destino);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const arriba = await fetch(destino, {
      method: req.method,
      signal: ctrl.signal,
      headers: { accept: 'image/*' },
    });
    if (!arriba.ok) {
      clearTimeout(timer);
      res.setHeader('Cache-Control', 'no-store');
      /* El Storage responde 400 con {"error":"not_found"} cuando el objeto no
       * existe (no 404 como cabría esperar). Al navegador le damos 404, que es
       * lo semánticamente correcto para un archivo inexistente. */
      if (arriba.status === 400 || arriba.status === 404 || arriba.status === 410) {
        return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });
      }
      return res.status(502).json({ ok: false, error: 'No se pudo leer el archivo original' });
    }

    const bytes = Number(arriba.headers.get('content-length') || 0);
    if (bytes > MAX_BYTES) {
      clearTimeout(timer);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, destino);
    }

    res.status(200);
    res.setHeader('Content-Type', arriba.headers.get('content-type') || 'application/octet-stream');
    if (bytes) res.setHeader('Content-Length', String(bytes));
    const etag = arriba.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);
    const modificado = arriba.headers.get('last-modified');
    if (modificado) res.setHeader('Last-Modified', modificado);
    /* Un año: los nombres de archivo son únicos (marca de tiempo + azar), así
     * que un objeto nunca cambia de contenido. Si se reemplaza, es otro nombre. */
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /* Un SVG del bucket abierto directamente en /media/... podría traer script
     * y ejecutarse en NUESTRO origen (mismo dominio = sin barrera). Esta CSP
     * deja el documento inerte sin afectar al render como <img>. */
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");

    if (req.method === 'HEAD' || !arriba.body) return res.end();
    const flujo = Readable.fromWeb(arriba.body);
    flujo.on('error', () => { try { res.destroy(); } catch (e) { /* ya cerrado */ } });
    res.on('close', () => { try { flujo.destroy(); } catch (e) { /* nada */ } });
    flujo.pipe(res);
  } catch (e) {
    clearTimeout(timer);
    if (res.headersSent) return res.end();
    if (e && e.name === 'AbortError') return res.status(504).json({ ok: false, error: 'El Storage no respondió a tiempo' });
    return res.status(502).json({ ok: false, error: 'No se pudo leer el archivo original' });
  } finally {
    clearTimeout(timer);
  }
}

/* Reescribe las URLs del bucket dentro de las respuestas JSON: el navegador
 * pide /media/... y el CDN lo guarda. El documento guardado no se toca. */
function relativizarUrls() {
  return function (req, res, next) {
    const jsonOriginal = res.json.bind(res);
    res.json = function (cuerpo) {
      try {
        if (cuerpo && typeof cuerpo === 'object') {
          const texto = JSON.stringify(cuerpo);
          if (texto.includes('/storage/v1/object/public/portal-media/')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(texto.replace(RE_SUPABASE_MEDIA, RUTA_BASE));
          }
        }
      } catch (e) { /* payload circular: se responde normal */ }
      return jsonOriginal(cuerpo);
    };
    next();
  };
}

/* Rutas de Express. Se monta antes del estático para que /media/ no acabe
 * en un 404 del servidor de archivos. */
function montar(app) {
  app.use(relativizarUrls());
  // `all` (no `get`) para que un POST reciba 405 explícito en vez de un 404
  // despistante; el handler filtra el método.
  app.all('/media/*', (req, res) => servirMedia(req, res, req.params[0]));
}

module.exports = {
  montar,
  servirMedia,
  relativizarUrls,
  normalizarRuta,
  rutaDeUrl,
  urlPublica,
  RUTA_BASE,
  RE_SUPABASE_MEDIA,
};
