/* Genera iconos + favicon + splashes iOS desde img/splash-source.webp.
 * Temporal: corre con sharp instalado en .tmp-sharp; sus productos sí se
 * publican (portal-modular/img). */
const path = require('path');
const sharp = require(path.join(__dirname, 'node_modules', 'sharp'));

const SRC = path.join(__dirname, '..', 'portal-modular', 'img', 'splash-source.webp');
const OUT = path.join(__dirname, '..', 'portal-modular', 'img');

(async () => {
  const img = sharp(SRC);
  const m = await img.metadata();
  console.log('fuente:', m.width + 'x' + m.height, m.format);

  // --- Icono: recorte cuadrado centrado en el logo ---
  // Logo ocupa aprox. el centro-superior; recorte cuadrado con margen.
  const side = Math.min(m.width, Math.round(m.height * 0.46)); // ~925px si 1152x2012
  const left = Math.round((m.width - side) / 2);
  const top = Math.round(m.height * 0.02); // logo arranca pronto (y~13%)
  const crop = { left, top: Math.max(0, top), width: side, height: side };
  for (const [size, name] of [
    [512, 'logo-icon-512.png'], [192, 'logo-icon-192.png'],
    [180, 'apple-touch-icon.png'], [48, 'favicon-48.png'], [32, 'favicon-32.png'],
  ]) {
    await sharp(SRC).extract(crop).resize(size, size, { fit: 'cover' }).png().toFile(path.join(OUT, name));
    console.log('ok', name);
  }

  // --- Splash iOS (portrait): imagen completa sobre fondo blanco con contain ---
  const sizes = [
    [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
    [828, 1792], [750, 1334], [2732, 2732], // incluye iPad cuadrado
  ];
  for (const [w, h] of sizes) {
    const name = (w > h) ? `splash-${h}x${w}-landscape.png` : `splash-${w}x${h}.png`;
    await sharp(SRC).resize(w, h, { fit: 'contain', background: '#ffffff' })
      .png({ quality: 90 }).toFile(path.join(OUT, name));
    console.log('ok', name);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
