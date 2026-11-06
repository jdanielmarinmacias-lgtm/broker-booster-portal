/* Genera el icono de la app/PWA desde img/icon-frame.jpg (el cuadro verde y
 * dorado aprobado). Salidas:
 *   app-icon-192.png            launcher Android/Chrome (any)
 *   app-icon-512.png            launcher / splash (any)
 *   app-icon-maskable-512.png   adaptive Android con zona segura (80%)
 *   apple-touch-icon.png        iOS 180x180
 *
 * El JPEG trae un margen blanco y esquinas redondeadas blancas. Se recorta el
 * margen y se enmascara con un cuadrado redondeado sobre el verde del propio
 * marco: así iOS/Android no muestran filos blancos al recortar.
 * No toca favicons ni el logo interno del portal.
 *
 * Uso: node tools/gen-icons.cjs
 */
'use strict';
const path = require('path');
const sharp = require(path.join(__dirname, 'node_modules', 'sharp'));

const IMG = path.join(__dirname, '..', 'img');
const SRC = path.join(IMG, 'icon-frame.jpg');
const CROP = 24;

async function greenFromFrame() {
  const { data } = await sharp(SRC)
    .extract({ left: 40, top: 800, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  // Salvaguarda: si el punto cayera en el blanco exterior, usa el verde del marco.
  if (bg.r > 200 && bg.g > 200 && bg.b > 200) { bg.r = 1; bg.g = 65; bg.b = 48; }
  return bg;
}

/* Cuadrado del tamaño pedido, sin margen blanco y con las esquinas fuera del
 * radio rellenas de verde. */
async function roundedSquare(size, green) {
  const meta = await sharp(SRC).metadata();
  const side = Math.min(meta.width, meta.height) - CROP * 2;
  const base = await sharp(SRC)
    .extract({ left: CROP, top: CROP, width: side, height: side })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();
  const r = Math.round(size * 0.13);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).png().toBuffer();
  const rounded = await sharp(base)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: green } })
    .composite([{ input: rounded }])
    .png()
    .toBuffer();
}

async function main() {
  const green = await greenFromFrame();
  console.log('verde del marco:', `rgb(${green.r},${green.g},${green.b})`);

  for (const [size, name] of [[192, 'app-icon-192.png'], [512, 'app-icon-512.png'], [180, 'apple-touch-icon.png']]) {
    const img = await roundedSquare(size, green);
    await sharp(img).toFile(path.join(IMG, name));
    console.log('ok', name);
  }

  /* Maskable: el sistema recorta hasta un 20% por lado; el marco completo se
   * escala al 80% sobre el mismo verde para que no se pierda el borde. */
  const size = 512;
  const inner = Math.round(size * 0.8);
  const frame = await roundedSquare(inner, green);
  await sharp({ create: { width: size, height: size, channels: 3, background: green } })
    .composite([{ input: frame, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png()
    .toFile(path.join(IMG, 'app-icon-maskable-512.png'));
  console.log('ok app-icon-maskable-512.png');
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
