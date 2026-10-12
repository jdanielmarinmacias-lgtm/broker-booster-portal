# Paso 1 — Desacople y modularización del portal (sin romper nada)

Origen: `portal.html` (1.7 MB, 17 424 líneas, 428 funciones, 12 bloques JS inline, 4 bloques CSS reales).
Destino: `portal-modular/` — misma app, código separado por responsabilidad.
`portal.html` **no se tocó**: queda como referencia/canónico hasta el corte final.

## 1. Estructura creada

```
portal-modular/
├── index.html                  # HTML limpio: solo vistas + <link>/<script src> (mismo orden que el monolito)
├── css/
│   └── styles.css              # Los 4 <style> reales extraídos verbatim (12 KB)
├── js/
│   ├── core/
│   │   └── store.js            # ★ CAPA DE DATOS: único punto que toca localStorage ('pepes_v3_db')
│   ├── services/               # ★ MOCK API: userService, RolesService + 20 servicios por dominio
│   │   ├── rolesService.js     # Sistema propio de roles (copia canónica intacta, sin Auth externo)
│   │   ├── userService.js      # crearUsuario/actualizar/eliminar/login interno + auditoría
│   │   └── repository.js       # courses, exams, chat, notifications, ventas, inventarios, etc.
│   ├── modules/                # Fachadas por área (delegan al legacy; aquí se migra la lógica)
│   │   ├── auth-custom.js      # Login/logout/sesión interna + puede(permiso)
│   │   ├── dashboard.js        # Ranking + métricas (versión con servicios ya incluida)
│   │   ├── chat.js             # Grupos + mensajes
│   │   ├── ventas.js           # Ventas/metas/solicitudes con reglas de permiso intactas
│   │   └── inventario.js       # Autos / financiera / inmuebles (+ escaparates au*/inm*)
│   └── legacy/                 # Extracción VERBATIM del monolito (NO editar, solo vaciar por migración)
│       ├── 00-head-utils.js            # 81 líneas: exportarEquipoCSV, borrar/editarVenta, auditoría
│       ├── 01-core-db-roles-portal.js  # 9 375 líneas: DB + ROLES + portal + ranking + práctica...
│       ├── 02-modulo-b.js ... 10-modulo-j.js, 03-config-73l.js, 08-snippet-h.js
│       └── 11-init.js                  # init final
└── MIGRACION-PASO-1.md (este archivo)
```

Verificado: `node --check` OK en los 9 archivos nuevos, 22/22 referencias de `index.html` resuelven,
smoke test de Store+servicios OK (roles, crearUsuario, permisos, ventas, notificaciones, persistencia).

## 2. Mapa del monolito (para saber qué migrar)

- **Auth/roles propios** (`01-core`, ~líneas 401–532): `DB_KEY`, `db`, `currentUser`, `defaultDB`
  (users seed: gmteo/gmmarin/gmvillegas/admin/maestro/alumno/editor), `ROLES` (11 roles),
  `hasRole/isGM/isAdmin/isTeacher/isStudent/isAgencia/canModifyUser` (GM protegido).
- **Persistencia**: 113 refs a `localStorage`, solo 5 a `'pepes_v3_db'` directo
  (`saveDB`, `loadDB`, `psGetDB/psSaveDB`, `vcSave`) + prefs UI sueltas
  (`metaTab`, `newsHidden`, `teo_*`, `groq_api_key`...) — esas prefs NO van a Store, se quedan.
- **Colecciones** (40+): users, lessons, categories, exams, examAttempts, enrollments, progress,
  liveClasses, groups, groupMessages, messages, posts, notifications, ventas, metas, convenciones,
  clientes, solicitudes, cotizaciones, siniestros, autoHub/autoCartera, finCartera,
  inmCartera/inmPublica, tasks, taskSubmissions, library, generations, planes, cierresComunidad,
  carruselCirculares, glossary*, practicaSesiones, settings, rolePermissions, auditoria...
- **Navegación**: `navigateTo(page)` + `window.lastPage` + `render()`; ~30 vistas
  (dashboard, editor, my-aula, live-classes, practica-sesiones, cotizaciones, solicitudes,
  leaderboard, users, categories, glossary, carrusel-circulares, autos, inmuebles...).
- **CDN externos** (se conservan en `index.html`): tailwind, chart.js, fullcalendar,
  pdf.js, jspdf, jspdf-autotable, font-awesome, Google Fonts (Inter/Poppins).

## 3. Cómo probarlo (sin riesgo)

1. Servir la carpeta: `cd portal-modular && npx serve .`
   (o `python -m http.server` — debe ser HTTP, no `file://`, por los `<script src>`).
2. Abrir `index.html`: debe verse **idéntico** al `portal.html` (misma DB `pepes_v3_db`,
   mismos usuarios seed, mismos roles).
3. Probar login con `admin`, `maestro`, `alumno`, `gmteo` → verificar dashboards por rol.
4. Si algo falla: comparar contra `portal.html` (intacto) y revisar orden de scripts.
5. **Login**: los usuarios seed del `defaultDB` NO traen contraseña y `login()` exige
   `username + password` exactos → con DB fresca verás "Credenciales incorrectas"
   (verificado: el original hace exactamente lo mismo). Entra con un usuario de tu
   `pepes_v3_db` real (misma clave, mismo origin si sirves desde la misma carpeta)
   o crea uno con contraseña desde el panel de usuarios.

## 4. Cómo seguir migrando (micro-pasos, uno por vez)

Patrón de migración de CADA función legacy → módulo (ejemplo: `renderRanking`):

1. Copia la función a `js/modules/dashboard.js` adaptando `db.x` → `ventasService`/`userService`
   y `localStorage` → `Store`.
2. En el legacy deja solo el shim: `function renderRanking(){ return DashboardModule.renderRanking(); }`.
3. Recarga, prueba esa vista con 2 roles, confirma que `pepes_v3_db` sigue igual.
4. Commit. Repetir con la siguiente función.

Orden sugerido: `auth-custom` (login/crearUsuario/roles) → `dashboard` (ranking) →
`chat` (lectura, luego envío) → `ventas` (lectura, luego borrar/editar) →
`inventario` (vitrinas au*/inm*) → resto (exámenes, live-classes, práctica, cotizaciones...).

## 5. Reglas del Paso 1 (no negociables)

- ❌ Nada de Supabase Auth ni backends todavía. Auth = sistema propio (`userService`+`RolesService`).
- ❌ No renombrar funciones globales ni `onclick="..."` — el HTML los invoca por nombre.
- ❌ No cambiar la forma de `pepes_v3_db` — el Store persiste el mismo JSON.
- ✅ Todo `localStorage('pepes_v3_db')` nuevo pasa por `Store`; prefs UI sueltas se quedan como están.
- ✅ Cada micro-paso deja la app funcionando (verificación manual por vista+rol).

## 6. Preparación para backend propio (Paso 2, cuando toque)

Solo se reimplementan los métodos `[ADAPTER]` de `store.js`
(`load/save` → `fetch('/api/...')`); la firma CRUD no cambia, los 20+ servicios
y los 5 módulos no se tocan. Colecciones = futuras tablas; `rolePermissions` = futura tabla de permisos.
