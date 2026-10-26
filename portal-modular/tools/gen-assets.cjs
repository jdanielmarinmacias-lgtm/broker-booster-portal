/* Genera iconos + favicon + splashes iOS desde img/splash-source.webp.
 * El splash de iOS ahora va "cover" (pantalla completa, sin franjas blancas):
 * se extiende el mármol del fondo hacia abajo hasta el ratio del dispositivo
 * iOS más ancho (750x1334 = 0.5625) para no recortar jamás el logo. */
const path = require('path');
const sharp = require(path.join(__dirname, 'node_modules', 'sharp'));

const SRC = path.join(__dirname, '..', 'img', 'splash-source.webp');
const OUT = path.join(__dirname, '..', 'img');

(async () => {
  const meta = await sharp(SRC).metadata();
  const W = meta.width, H = meta.height;
  console.log('fuente:', W + 'x' + H, meta.format);

  // --- Splash iOS (portrait): imagen completa sobre pantalla completa ---
  // Canvas extendida: mármol duplicado del fondo abajo, hasta ratio 0.5625.
  const SAFE_RATIO = 0.5625;
  const extH = Math.max(H, Math.round(W / SAFE_RATIO));
  const bandH = extH - H;
  let full;
  if (bandH > 0) {
    const band = await sharp(SRC)
      .extract({ left: 0, top: H - bandH, width: W, height: bandH })
      .png().toBuffer();
    const base = await sharp(SRC).png().toBuffer();
    full = await sharp({
      create: { width: W, height: extH, channels: 3, background: '#ffffff' },
    }).composite([
      { input: base, left: 0, top: 0 },
      { input: band, left: 0, top: H },
    ]).png().toBuffer();
  } else {
    full = await sharp(SRC).png().toBuffer();
  }
  console.log('canvas splash: ' + W + 'x' + extH);

  const sizes = [
    [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
    [828, 1792], [750, 1334], [2732, 2732], // incluye iPad
  ];
  for (const [w, h] of sizes) {
    const name = (w > h) ? `splash-${h}x${w}-landscape.jpg` : `splash-${w}x${h}.jpg`;
    await sharp(full).resize(w, h, { fit: 'cover', position: 'north' })
      .jpeg({ mozjpeg: true }).toFile(path.join(OUT, name));
    console.log('ok', name);
  }

  // --- Icono: recorte cuadrado centrado en el escudo (logo superior) ---
  const side = Math.min(W, Math.round(H * 0.5));
  const left = Math.max(0, Math.min(W - side, Math.round(W * 0.59 - side / 2)));
  const top = Math.max(0, Math.round(H * 0.36 - side / 2));
  const crop = { left, top, width: side, height: side };
  console.log('crop icono:', JSON.stringify(crop));
  for (const [size, name] of [
    [512, 'logo-icon-512.png'], [192, 'logo-icon-192.png'],
    [180, 'apple-touch-icon.png'], [48, 'favicon-48.png'], [32, 'favicon-32.png'],
  ]) {
    await sharp(SRC).extract(crop).resize(size, size, { fit: 'cover' }).png().toFile(path.join(OUT, name));
    console.log('ok', name);
  }

  // --- Íconos PWA Android: arte enmarcado del logo (icon-frame.jpg) ---
  // La fuente preferida es el cuadro verde con filo dorado que el cliente
  // aprobó; si no existe, cae al recorte cuadrado del wallpaper.
  const FRAME = path.join(__dirname, '..', 'img', 'icon-frame.jpg');
  const ICON_SRC = require('fs').existsSync(FRAME) ? FRAME : SRC;
  console.log('íconos desde:', path.basename(ICON_SRC));
  await sharp(ICON_SRC).resize(512, 512, { fit: 'cover' })
    .png().toFile(path.join(OUT, 'android-splash-512.png'));
  console.log('ok android-splash-512.png');
  await sharp(ICON_SRC).resize(192, 192, { fit: 'cover' })
    .png().toFile(path.join(OUT, 'android-splash-192.png'));
  console.log('ok android-splash-192.png');
  // Maskable: mismo arte, opaco, lleno el canvas.
  await sharp(ICON_SRC).resize(512, 512, { fit: 'cover' })
    .png().toFile(path.join(OUT, 'logo-icon-maskable-512.png'));
  console.log('ok logo-icon-maskable-512.png');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
