/* ============================================================================
 * sw.js — Service Worker PWA con caché de App Shell y soporte offline
 * - API (/api/*): network-only (nunca sirve datos viejos de la API)
 * - Navegación HTML: network-first con fallback a index.html en caché
 * - App Shell (CSS, JS, manifest, iconos): stale-while-revalidate
 * ========================================================================== */
const CACHE_NAME = 'broker-booster-shell-v20261027f';
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'ui-avatars.com'
];
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './img/favicon-32.png',
  './img/apple-touch-icon.png',
  './img/logo-icon-192.png',
  './img/logo-icon-512.png',
  './img/splash-source.webp',
  './css/styles.css',
  './js/core/store.js',
  './js/core/backend.js',
  './js/core/media.js',
  './js/core/realtime.js',
  './js/core/backend-shim.js',
  './js/core/sync.js',
  './js/services/rolesService.js',
  './js/services/userService.js',
  './js/services/repository.js',
  './js/legacy/00-head-utils.js',
  './js/legacy/01-core-db-roles-portal.js',
  './js/legacy/02-modulo-b.js',
  './js/legacy/03-config-73l.js',
  './js/legacy/04-modulo-d.js',
  './js/legacy/05-modulo-e.js',
  './js/legacy/06-modulo-f.js',
  './js/legacy/07-modulo-g.js',
  './js/legacy/08-snippet-h.js',
  './js/legacy/09-modulo-i.js',
  './js/legacy/10-modulo-j.js',
  './js/legacy/11-init.js',
  './js/modules/auth-custom.js',
  './js/modules/dashboard.js',
  './js/modules/chat.js',
  './js/modules/ventas.js',
  './js/modules/inventario.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        APP_SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE_NAME) return caches.delete(k);
          return Promise.resolve();
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (!req || req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Ignorar esquemas no HTTP(S) y peticiones a la API o endpoints de tiempo real
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/realtime')) {
    return;
  }

  // 1) Navegación (documentos HTML): Network-First con fallback a index.html en caché
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(function (networkRes) {
          if (networkRes && networkRes.ok) {
            var copy = networkRes.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put('./index.html', copy).catch(function () {});
            });
          }
          return networkRes;
        })
        .catch(function () {
          return caches.match(req, { ignoreSearch: true }).then(function (cached) {
            return cached || caches.match('./index.html', { ignoreSearch: true });
          });
        })
    );
    return;
  }

  // 2) Recursos del mismo origen (CSS, JS, manifest, imágenes locales)
  /* FIX 2026-10: antes se hacía match con ignoreSearch, lo que servía el body de
   * una versión ?v= anterior aunque la página pidiera la nueva. Ahora si el
   * body cacheado NO es exactamente de la URL pedida (otra ?v=) se prefiere la
   * red, con fallback al caché viejo solo si estás sin conexión. */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (cached) {
        var exacto = !!(cached && cached.url === req.url);
        var fetchPromise = fetch(req)
          .then(function (networkRes) {
            if (networkRes && networkRes.ok) {
              var copy = networkRes.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(req, copy).catch(function () {});
              });
            }
            return networkRes;
          })
          .catch(function () {
            return cached;
          });
        // Misma versión cacheada: stale-while-revalidate clásico.
        if (exacto && cached) return cached || fetchPromise;
        // Versión distinta (?v= nueva) o sin caché: network-first.
        return fetchPromise;
      })
    );
    return;
  }

  // 3) CDNs estáticos (fuentes, íconos FontAwesome, librerías PDF/Chart): Stale-While-Revalidate
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var fetchPromise = fetch(req)
          .then(function (networkRes) {
            if (networkRes && (networkRes.ok || networkRes.type === 'opaque')) {
              var copy = networkRes.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(req, copy).catch(function () {});
              });
            }
            return networkRes;
          })
          .catch(function () {
            return cached;
          });
        return cached || fetchPromise;
      })
    );
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
