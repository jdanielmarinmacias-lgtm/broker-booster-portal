# Backend propio — Paso 2

Auth interno, sesiones HttpOnly, API por roles. Sin Supabase Auth ni proveedores
externos: tu sistema de usuarios y roles, ahora validado en el servidor.

## Arranque

```bash
cd backend
npm install
npm run seed     # solo la primera vez (7 usuarios semilla)
npm start        # http://localhost:3000 (sirve el frontend + API)
npm test         # 10 smoke tests (auth, roles, GM protegido, auditoría)
```

Variables (copiar `.env.example` a `.env`): `PORT`, `DATA_DIR`, `SESSION_TTL_HOURS`,
`SEED_PASSWORD`, `COOKIE_SECURE=true` en producción con HTTPS.

## Credenciales bootstrap

Los 7 usuarios semilla (`gmteo`, `gmmarin`, `gmvillegas`, `admin`, `maestro`,
`alumno`, `editor`) nacen con la clave de `SEED_PASSWORD` (default **`Cambiar123*`**)
en hash scrypt + `mustChangePassword=true`: al primer ingreso el portal exige
rotarla (mínimo 8 caracteres). Cambia `SEED_PASSWORD` antes de producción.

Traer tu base real del navegador:

```bash
# En la consola del portal actual:
copy(localStorage.getItem('pepes_v3_db'))  # pegar en respaldo.json
npm run import -- ./respaldo.json          # hashea claves en claro, conserva todo
```

## Qué protege HOY (verificado E2E en navegador)

- Login real contra API: `admin` entra, cambia clave temporal, navega a su panel;
  `alumno` entra a su campus. Sesión en cookie HttpOnly + SameSite (invisible a JS).
- Reglas en servidor: alumno recibe 403 al listar usuarios o escribir ventas;
  cuentas GM no las borra nadie (verificado en tests).
- Ninguna respuesta API incluye contraseñas ni hashes.
- Rate-limit de login (10 intentos FALLIDOS/10 min/IP; el éxito perdona: los
  usuarios legítimos jamás se bloquean), auditoría server-side, escritura
  atómica del `db.json`, cabeceras duras (`nosniff`, `DENY` frame, `no-store` en API).
- Sin backend (doble clic al `index.html`, otro hosting estático), el portal sigue
  funcionando en modo local legacy: paridad total, cero regresiones.

Detalle técnico: el legacy declara `let db` / `let currentUser` (bindings léxicos,
no `window.*`). Toda la capa nueva (`Store`, `userService`, `backend-shim`) los
referencia directos con guards — ver comentarios en el código.

## Qué NO protege todavía (honesto) y fase 2b

El JS privado aún viaja al navegador (Ctrl+U lo muestra). El blindaje total requiere:
1. **Dividir el bundle**: `public.js` (portada, abierto) vs `app.js` (privado, solo
   con sesión válida; sin sesión el servidor responde 401, no código).
2. **Migrar colecciones a la API** (`ventasService`, `chatService`… → `/api/data/*`,
   ya lista y con matriz de roles): al navegador llegan datos, no la base.
3. **Corte del `localStorage`** como fuente de verdad (queda como caché offline).
4. Build minificado + HTTPS + `COOKIE_SECURE` + rotación de `SEED_PASSWORD`.

Orden sugerido 2b: bundle público/privado → `users` UI contra API → colecciones
una por una (ventas → chat → resto) → apagar modo local.

---

# Paso 3 — Supabase (datos + realtime) + Vercel (hosting)

El backend ya habla con Supabase cuando existen `SUPABASE_URL` +
`SUPABASE_SERVICE_KEY`; si no, usa JSON local. Mismo código, tres adaptadores
(`src/adapters/`): `memory` (tests), `json` (tu máquina), `supabase` (producción).

## 1) Crear el proyecto Supabase (5 min, en tu navegador)

1. Entra a https://supabase.com → New project (guarda el DB password).
2. SQL Editor → pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql)
   (tablas `documents`, `app_users`, `app_sessions`, `public_feed` + RLS + realtime).
3. Project Settings → API: copia `Project URL`, `anon public` y `service_role`
   (o la nueva `sb_secret_*`: ambas sirven como service key).
4. Con esas 3 variables, levanta local apuntando a Supabase y corre seed/import:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run seed   # 7 usuarios
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run import -- ./respaldo.json
```

Seguridad: RLS niega a `anon`/`authenticated` todo lo privado; el navegador solo
puede LEER `public_feed` (portada en vivo) con la ANON key. La SERVICE key jamás
sale del servidor (solo `process.env` / Vercel env).

## 2) Desplegar en Vercel

1. Sube este repo a GitHub y crea proyecto en Vercel (framework: Other).
2. Vercel ya trae [`vercel.json`](../vercel.json): estático desde `portal-modular/`,
   `/api/*` → [`api/index.js`](../api/index.js) (el Express exportado como Function).
3. Environment Variables (Production): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_KEY`, `SEED_PASSWORD`, `COOKIE_SECURE=true`.
4. Deploy. Verifica `https://tu-app.vercel.app/api/salud` →
   `{"store":"supabase","realtime":true}`.

Notas serverless: sin estado en memoria (sesiones y datos en Supabase), caché de
colecciones con TTL 10s, rate-limit de login por instancia (suficiente + auditoría).

## Realtime verificado (diseño)

Al publicar en `inmPublica`/`autoHub`/`posts`, el backend inserta en `public_feed`
→ Supabase emite `postgres_changes` → [`js/core/realtime.js`](../portal-modular/js/core/realtime.js)
muestra toast y actualiza contadores en vivo. Tests: `public/config` anuncia
`realtime:false` sin Supabase; con Supabase, `true` + URL/anon key.

---

# Paso 4 — Archivos compartidos en vivo (fotos, videos, documentos)

Las imágenes ya no viajan en base64 dentro del JSON: viven en Supabase Storage
(bucket público `portal-media`, creado solo por el backend al arrancar) y todos
los usuarios las ven en el strip **Novedades en vivo** de la portada.

## Migración SQL (1 min, en tu navegador)

SQL Editor → pega y ejecuta [`supabase/migration_media.sql`](supabase/migration_media.sql)
(agrega `image_url` + `media_kind` a `public_feed`). Sin ella todo funciona igual
pero los eventos llegan sin imagen (el backend reintenta sin esas columnas).

## Cómo funciona

1. El navegador pide `POST /api/media/sign` {filename, mime, size, scope}
   (requiere sesión + permiso de escritura del scope; máx 50MB:
   `MEDIA_MAX_MB`; solo imagen/video/PDF/Office/texto).
2. El backend firma una URL y el navegador sube el archivo **directo a Supabase**
   con PUT (los bytes nunca pasan por Vercel: sin límite de 4.5MB).
3. `POST /api/media/confirm` {path, …} verifica que el archivo exista, guarda
   metadata en la colección `media` (+ auditoría) y publica el evento realtime.
4. `GET /api/public/feed` (público, caché 15s) alimenta el strip inicial;
   el socket realtime antepone cada novedad con foto/video/documento + toast.
5. Sin Supabase (dev local): `POST /api/media` multipart guarda en
   `data/uploads` (servido en `/uploads` solo en local).

Sync offline-first ([`js/core/sync.js`](../portal-modular/js/core/sync.js)): al entrar
trae colecciones+usuarios al `db` legacy; cada `saveDB` difunde el diff a la API
(POST upsert por id / PUT / DELETE; `users` por `/api/users` con hash en servidor).
Supabase devuelve TEXT pero el legacy compara con `===` numérico: al traer se
normalizan `id`/`…Id`/`students`/`readBy`… a Number (sin esto reventaba Mensajes).
Conflictos: last-write-wins por registro; pulls serializados con mutex.

Frontend: [`js/core/media.js`](../portal-modular/js/core/media.js) (`Media.subir` /
`subirMuchos`, con fallback a base64 si no hay backend). Los formularios de
propiedades (`propsFoto`), aseguradoras/logos (`uploadImageBase64`) y autos
(`auGuardarUnidad`, `auPautaGuardar`) suben al servidor primero y caen a base64
si falla. Permisos: un `alumno` recibe 403 al subir (matriz de roles del servidor).
