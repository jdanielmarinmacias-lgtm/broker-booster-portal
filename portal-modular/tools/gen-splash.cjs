/* Genera el splash de carga (web + app/PWA) a partir del arte 16:9.
 *
 * Fuente preferida: img/splash-nuevo.jpg (la imagen aprobada).
 * Si no existe, compone el 16:9 desde el splash vertical anterior
 * (img/splash-source.webp): mármol inferior de fondo + bloque del logo
 * centrado. Así el mismo comando funciona ahora y cuando llegue el archivo
 * definitivo.
 *
 * Salidas:
 *   img/splash-landscape.webp  1600x900  → escritorio / tablet horizontal
 *   img/splash-portrait.webp   1290x2796 → móvil / PWA / iOS
 *   img/splash-<w>x<h>.jpg     7 tamaños  → apple-touch-startup-image
 *
 * No toca iconos ni favicons (eso sigue en gen-assets.cjs).
 *
 * Uso: node tools/gen-splash.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, 'node_modules', 'sharp'));

const IMG = path.join(__dirname, '..', 'img');
const NEW = path.join(IMG, 'splash-nuevo.jpg');
const OLD = path.join(IMG, 'splash-source.webp');
const LAND_OUT = path.join(IMG, 'splash-landscape.webp');
const PORT_OUT = path.join(IMG, 'splash-portrait.webp');

const LAND_W = 1600;
const LAND_H = 900;
const PORT_W = 1290;
const PORT_H = 2796;

/* Máscara con borde difuminado: evita que se vea el rectángulo del bloque
 * recortado sobre el mármol del fondo. */
async function feathered(buf, w, h, pad, radius) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + `<rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${h - pad * 2}" rx="${radius}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(Math.round(pad * 0.6)).png().toBuffer();
  return sharp(buf)
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/* Máscara radial: el bloque queda opaco en el centro y se disuelve en el
 * mármol del fondo, sin el borde rectangular del recorte. */
async function radialMask(w, h, opaque, fadeEnd) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + `<defs><radialGradient id="r" cx="50%" cy="50%" r="50%">`
    + `<stop offset="${opaque}" stop-color="#fff" stop-opacity="1"/>`
    + `<stop offset="${fadeEnd}" stop-color="#fff" stop-opacity="1"/>`
    + `<stop offset="1" stop-color="#fff" stop-opacity="0"/>`
    + `</radialGradient></defs><rect width="${w}" height="${h}" fill="url(#r)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/* 16:9 a partir del splash vertical anterior. */
async function landscapeFromPortrait() {
  const meta = await sharp(OLD).metadata();
  const W = meta.width;
  const H = meta.height;
  // Zona de mármol limpio (debajo del logo) como fondo.
  const marbleTop = Math.round(H * 0.49);
  const bg = await sharp(OLD)
    .extract({ left: 0, top: marbleTop, width: W, height: H - marbleTop })
    .resize(LAND_W, LAND_H, { fit: 'cover', position: 'center' })
    .modulate({ brightness: 1.01 })
    .png()
    .toBuffer();
  // Bloque logo + BROKER BOOSTER, con margen.
  const crop = {
    left: Math.round(W * 0.10),
    top: Math.round(H * 0.085),
    width: Math.round(W * 0.80),
    height: Math.round(H * 0.37),
  };
  const block = await sharp(OLD).extract(crop).png().toBuffer();
  const fgH = 610;
  const fgW = Math.round(crop.width * fgH / crop.height);
  const fg = await feathered(block, fgW, fgH, 26, 34);
  return sharp(bg)
    .composite([{ input: fg, left: Math.round((LAND_W - fgW) / 2), top: Math.round((LAND_H - fgH) / 2) }])
    .png()
    .toBuffer();
}

async function main() {
  let landscape;
  if (fs.existsSync(NEW)) {
    console.log('fuente:', path.basename(NEW));
    landscape = await sharp(NEW)
      .resize(LAND_W, LAND_H, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();
  } else {
    console.log('fuente:', path.basename(OLD), '(compuesto 16:9; guarda splash-nuevo.jpg para usar el original)');
    landscape = await landscapeFromPortrait();
  }

  await sharp(landscape).webp({ quality: 88, effort: 5 }).toFile(LAND_OUT);
  console.log('ok', path.basename(LAND_OUT));

  /* Vertical: bloque del logo centrado sobre mármol suave. El 16:9 completo
   * solo ocuparía una franja y dejaría un rectángulo visible; recortar el
   * bloque y ampliarlo da una pantalla de carga propia de móvil. */
  const marble = await sharp(landscape)
    .extract({ left: 0, top: 0, width: Math.round(LAND_W * 0.22), height: Math.round(LAND_H * 0.22) })
    .resize(PORT_W, PORT_H, { fit: 'cover', position: 'center' })
    .blur(22)
    .modulate({ brightness: 1.05, saturation: 0.9 })
    .png()
    .toBuffer();
  const blockCrop = {
    left: Math.round(LAND_W / 2 - 550),
    top: Math.round(LAND_H / 2 - 420),
    width: 1100,
    height: 840,
  };
  const block = await sharp(landscape).extract(blockCrop).png().toBuffer();
  const fgW = 1080;
  const fgH = Math.round(blockCrop.height * fgW / blockCrop.width);
  const mask = await radialMask(fgW, fgH, 0.58, 0.8);
  const fg = await sharp(block)
    .resize(fgW, fgH, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const portrait = await sharp(marble)
    .composite([{ input: fg, left: Math.round((PORT_W - fgW) / 2), top: Math.round(PORT_H * 0.46 - fgH / 2) }])
    .png()
    .toBuffer();
  await sharp(portrait).webp({ quality: 86, effort: 5 }).toFile(PORT_OUT);
  console.log('ok', path.basename(PORT_OUT));

  const sizes = [
    [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
    [828, 1792], [750, 1334], [2732, 2732],
  ];
  for (const [w, h] of sizes) {
    const name = (w > h) ? `splash-${h}x${w}-landscape.jpg` : `splash-${w}x${h}.jpg`;
    await sharp(portrait)
      .resize(w, h, { fit: 'cover', position: 'center' })
      .jpeg({ mozjpeg: true, quality: 88 })
      .toFile(path.join(IMG, name));
    console.log('ok', name);
  }
  console.log('splash listo');
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
