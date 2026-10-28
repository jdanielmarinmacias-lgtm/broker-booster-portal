/* tools/rebuild-index.js — Reconstruye index.html + css/styles.css desde portal.html
 * de forma DETERMINISTA (por rangos de línea, no regex), para paridad visual total.
 * Uso: node tools/rebuild-index.js   (correr desde portal-modular/)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ORIG = path.join(ROOT, '..', 'portal.html');

const src = fs.readFileSync(ORIG, 'utf8');
const L = src.split('\n');

// Rangos 1-indexed INCLUSIVE verificados contra portal.html (1.7MB / 17424 líneas)
const SCRIPT_RANGES = [
  [7, 8],       // tailwind CDN (tag multilínea)
  [9, 89],      // head utils -> 00-head-utils.js
  [397, 9771],  // core DB+roles+portal -> 01
  [9820, 11133],
  [11135, 11208],
  [11210, 14820],
  [14823, 15800],
  [15802, 16010],
  [16013, 16431],
  [16435, 16450],
  [16460, 16917],
  [16920, 17404],
  [17406, 17422],
];
const STYLE_RANGES = [
  [100, 157], [158, 291], [9773, 9819], [16454, 16458],
];
const inRanges = (n, rs) => rs.some(([a, b]) => n >= a && n <= b);
const isRemoved = (n) => inRanges(n, SCRIPT_RANGES) || inRanges(n, STYLE_RANGES);

// Tailwind ya NO viene del CDN: se compila a css/tailwind.min.css
// (`npm run build:css`). El rebuild inserta ese <link> antes de styles.css.
const TAILWIND_LINK = '    <link rel="stylesheet" href="css/tailwind.min.css">';

// CDN en orden original
const CDN = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
];

// 1) styles.css determinista
let css = '/* portal-modular/css/styles.css — EXTRAÍDO de portal.html (Paso 1, por líneas) */\n';
STYLE_RANGES.forEach(([a, b], i) => {
  css += `\n/* ---------- bloque <style> líneas ${a}-${b} ---------- */\n` + L.slice(a, b - 1).join('\n').trim() + '\n';
});
fs.writeFileSync(path.join(ROOT, 'css', 'styles.css'), css);

// 2) head = líneas 1..298 sin scripts/styles + nuestro link + CDNs
const headKept = [];
for (let n = 1; n <= 298; n++) if (!isRemoved(n)) headKept.push(L[n - 1]);
let head = headKept.join('\n');
head = head.replace('</head>',
  TAILWIND_LINK + '\n' +
  '    <link rel="stylesheet" href="css/styles.css">\n' +
  CDN.map((u) => `    <script src="${u}"><\/script>`).join('\n') + '\n</head>');

// 3) body = líneas 299..17423 sin scripts/styles
const bodyKept = [];
for (let n = 299; n <= 17423; n++) if (!isRemoved(n)) bodyKept.push(L[n - 1]);
const body = bodyKept.join('\n');

// 4) ensamblar
const legacy = ['00-head-utils.js', '01-core-db-roles-portal.js', '02-modulo-b.js',
  '03-config-73l.js', '04-modulo-d.js', '05-modulo-e.js', '06-modulo-f.js',
  '07-modulo-g.js', '08-snippet-h.js', '09-modulo-i.js', '10-modulo-j.js'];
const core = ['store.js', 'backend.js', 'media.js', 'realtime.js']; // backend.js: autodetecta API (Paso 2) · media.js: subida de archivos (Paso 4) · realtime.js: feed Supabase (Paso 3+4), todos inocuos sin servidor
const modules = ['auth-custom.js', 'dashboard.js', 'chat.js', 'ventas.js', 'inventario.js'];
const shim = ['backend-shim.js', 'sync.js']; // puente login legacy<->API + sync offline-first: solo actúan si hay backend
const html = head + '\n' + body + '\n' +
  '    <!-- Paso 1: JS modular (mismo orden que el monolito) -->\n' +
  core.map((f) => `    <script src="js/core/${f}"><\/script>`).join('\n') + '\n' +
  '    <script src="js/services/rolesService.js"><\/script>\n' +
  '    <script src="js/services/userService.js"><\/script>\n' +
  '    <script src="js/services/repository.js"><\/script>\n' +
  legacy.map((f) => `    <script src="js/legacy/${f}"><\/script>`).join('\n') + '\n' +
  modules.map((f) => `    <script src="js/modules/${f}"><\/script>`).join('\n') + '\n' +
  shim.map((f) => `    <script src="js/core/${f}"><\/script>`).join('\n') + '\n' +
  '    <script src="js/legacy/11-init.js"><\/script>\n' +
  L[17423]; // </html>

fs.writeFileSync(path.join(ROOT, 'index.html'), html);

// 5) verificaciones automáticas
const checks = [];
checks.push(['tailwind compilado presente', html.includes('css/tailwind.min.css')]);
checks.push(['sin Tailwind CDN', !/<script[^>]+cdn\.tailwindcss\.com/i.test(html)]);
checks.push(['sin JS filtrado (saveDB original)', !html.includes('function saveDB() { localStorage')]);
checks.push(['sin document.write filtrado', !html.includes('w.document.write')]);
checks.push(['sin <style> inline restante', !/<style[^>]*>/i.test(html.replace('<link rel="stylesheet" href="css/styles.css">', ''))]);
checks.push(['modal-container presente', html.includes('id="modal-container"')]);
checks.push(['main-content presente', html.includes('id="main-content"')]);
checks.push(['login-screen presente', html.includes('id="login-screen"')]);
checks.push(['cierra </html>', html.trimEnd().endsWith('</html>')]);
// paridad: nº de líneas de body estático vs original sin scripts/styles
let origStatic = 0;
for (let n = 299; n <= 17423; n++) if (!isRemoved(n)) origStatic++;
checks.push(['body estático completo (' + bodyKept.length + ' vs ' + origStatic + ')', bodyKept.length === origStatic]);

let fail = 0;
checks.forEach(([name, ok]) => { console.log((ok ? 'OK   ' : 'FAIL ') + name); if (!ok) fail++; });
console.log('index.html bytes:', html.length, '| css bytes:', css.length);
process.exit(fail ? 1 : 0);
