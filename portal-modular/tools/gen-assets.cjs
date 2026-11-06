/* Genera iconos + favicon desde img/splash-source.webp.
 * El splash de carga (web + app/PWA) se genera aparte con tools/gen-splash.cjs:
 * ese script produce el 16:9 de escritorio y el vertical de móvil/iOS. */
const path = require('path');
const sharp = require(path.join(__dirname, 'node_modules', 'sharp'));

const SRC = path.join(__dirname, '..', 'img', 'splash-source.webp');
const OUT = path.join(__dirname, '..', 'img');

(async () => {
  const meta = await sharp(SRC).metadata();
  const W = meta.width, H = meta.height;
  console.log('fuente:', W + 'x' + H, meta.format);

  // El splash (web + app) vive en tools/gen-splash.cjs: no se toca aquí para
  // que regenerar iconos no revierta el arte de carga.

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
