/* Configuración de Tailwind COMPILADO (antes se cargaba cdn.tailwindcss.com en
 * tiempo de ejecución: ~120 KB de JS + un <style> gigante generado en cada
 * visita). Aquí solo se escanean los archivos que de verdad se sirven.
 *
 * Uso:  npm run build:css
 * Salida: portal-modular/css/tailwind.min.css (se versiona y se sirve estático).
 */
module.exports = {
  content: ['./portal-modular/**/*.html', './portal-modular/js/**/*.js'],
  theme: { extend: {} },
  /* El portal arma algunas clases en tiempo de ejecución (no aparecen como
   * texto literal en el fuente). Estas son las que el escáner no puede ver;
   * las que sí existen como literal (mapas COT_ESTADO_COLOR, colors, mapa…)
   * las detecta solo. Mantener corto: cada patrón extra pesa en el CSS. */
  safelist: [
    { pattern: /^grid-cols-[1-6]$/ },
    { pattern: /^(bg|text|border|ring)-(emerald|blue)-(50|100|200|700|800)$/ },
  ],
  plugins: [],
};
