/* tools/move-scripts-head.js — Pasa los scripts de la app de después de </body>
 * al <head> con `defer`, conservando el ORDEN exacto.
 *
 * Por qué: los <script> al final del documento solo se descubren cuando el
 * parser llega a ellos (~360 ms con la página entera por delante), así que el
 * núcleo de 1,28 MB empezaba a descargarse tarde. En el <head> se descubren al
 * instante y bajan en paralelo al HTML; con `defer` se ejecutan después del
 * parseo y EN ORDEN, igual que antes.
 *
 * Uso: node tools/move-scripts-head.js            (informe)
 *      node tools/move-scripts-head.js --aplicar
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, '..', 'index.html');
const APLICAR = process.argv.includes('--aplicar');
const html = fs.readFileSync(ARCHIVO, 'utf8');

// Bloque a mover: del comentario "Paso 1" hasta el último <script> antes de </html>.
const inicio = html.indexOf('<!-- Paso 1: JS modular');
const fin = html.lastIndexOf('</html>');
if (inicio === -1 || fin === -1 || fin < inicio) {
  console.error('No encontré el bloque de scripts esperado. Abortado.');
  process.exit(1);
}
const bloque = html.slice(inicio, fin);
const etiquetas = bloque.match(/<script[^>]*src="[^"]+"[^>]*><\/script>/g) || [];
if (etiquetas.length < 20) {
  console.error(`Solo encontré ${etiquetas.length} etiquetas; parece otro formato. Abortado.`);
  process.exit(1);
}
const yaDefer = etiquetas.filter((t) => /\bdefer\b/.test(t)).length;
console.log(`etiquetas a mover: ${etiquetas.length} (ya con defer: ${yaDefer})`);

const conDefer = etiquetas.map((t) => (/\bdefer\b/.test(t) ? t : t.replace('<script ', '<script defer ')));
const nuevoBloqueHead = '    <!-- JS de la app: `defer` respeta el orden y no bloquea el parseo. -->\n'
  + conDefer.map((t) => '    ' + t.replace('<script defer ', '<script defer ')).join('\n') + '\n';

if (!APLICAR) {
  console.log(nuevoBloqueHead.trim().split('\n').slice(0, 3).join('\n'));
  console.log('...');
  return;
}

// 1) Quitar el bloque viejo (deja </body> justo antes de </html>).
const sinBloque = html.slice(0, inicio) + html.slice(fin);
// 2) Insertarlo en el head, antes de </head>.
const salida = sinBloque.replace('</head>', nuevoBloqueHead + '</head>');
fs.writeFileSync(ARCHIVO, salida);
console.log('aplicado. script en head:', /<head>[\s\S]*?js\/legacy\/11-init\.js[\s\S]*?<\/head>/.test(salida));
console.log('scripts tras </body>:', (salida.slice(salida.indexOf('</body>')).match(/<script /g) || []).length);
