/* ============================================================
   DR. XIAOMI · SERVICE WORKER UNIFICADO
   - Caché para catálogo offline
   - Notificaciones para el panel admin
   ============================================================ */

const CACHE = 'drxiaomi-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './imagenes/0000.jpg',
  './imagenes/0001.jpg',
  './imagenes/0002.jpg',
  './imagenes/0003.jpg',
  './imagenes/web-app-manifest-192x192.png',
  './imagenes/web-app-manifest-512x512.png',
  './imagenes/apple-touch-icon.png',
  './imagenes/favicon.ico',
  './imagenes/favicon.svg',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

// Rutas que NO debe manejar el service worker para caché
const EXCLUDED_PATHS = ['/app/', '/login/', '/cliente/', '/api/'];

function isExcluded(url) {
  return EXCLUDED_PATHS.some(p => url.pathname.startsWith(p));
}

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ============================================================
   ACTIVATE
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ============================================================
   🔥 NOTIFICACIONES PUSH (NUEVO)
   ============================================================ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NOTIFICACION') {
    const { titulo, cuerpo, icono, cantidad } = event.data;
    
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: icono || '/img/logo1.png',
      badge: '/img/logo1.png',
      vibrate: [200, 100, 200],
      tag: 'dr-xiaomi-notif',
      renotify: true
    });

    // Actualizar el número en el icono (Badge)
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(cantidad || 1).catch(console.error);
    }
  }
});

/* ============================================================
   FETCH (CACHÉ)
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No interceptar rutas de la app
  if (isExcluded(url)) return;

  // No interceptar peticiones a otros dominios
  if (url.origin !== self.location.origin) return;

  // Imágenes: cache-first
  const isImage = req.destination === 'image' || 
                  /\.(jpg|jpeg|png|webp|svg|gif|ico)$/i.test(url.pathname);
  if (isImage) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => {
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
      })
    );
    return;
  }

  // Navegación (HTML): network-first, fallback a caché
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          return caches.match('./index.html').then((cached) => {
            if (cached) return cached;
            return new Response(
              '<html><body><h1>Sin conexión</h1></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // Resto: cache-first con fallback a network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => {
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});
