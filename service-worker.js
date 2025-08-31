
/* Ambient Visual Noise – Service Worker
 * Strategy:
 * - Navigation (HTML): network-first, fallback to cached index.html if offline
 * - Static assets (JS/CSS/fonts/images): cache-first with background refresh
 */
const VERSION = 'avn-2025-08-30-v1';
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_FALLBACK = 'index.html'; // resolved relative to SW scope

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Precache a minimal offline shell; icons are nice to have for splash
    await cache.addAll([
      OFFLINE_FALLBACK,
      'icons/icon-192.png',
      'icons/icon-256.png',
      'icons/icon-512.png'
    ]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean up old versions
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k.startsWith('static-') && k !== STATIC_CACHE) ? caches.delete(k) : Promise.resolve())
    );
    // Become the active SW immediately
    await self.clients.claim();
  })());
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
         (request.method === 'GET' &&
          request.headers.get('accept') &&
          request.headers.get('accept').includes('text/html'));
}

function isStaticAsset(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  const pathname = url.pathname;
  return (
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.woff') || pathname.endsWith('.woff2') || pathname.endsWith('.ttf')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1) Network-first for navigations (index.html shell)
  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(OFFLINE_FALLBACK, fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(OFFLINE_FALLBACK);
        if (cached) return cached;
        // final fallback: try the request from any cache
        const any = await caches.match(request);
        if (any) return any;
        throw err;
      }
    })());
    return;
  }

  // 2) Cache-first for static assets
  if (isStaticAsset(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        // update in the background (stale-while-revalidate-ish)
        event.waitUntil(fetch(request).then((resp) => cache.put(request, resp.clone())).catch(() => {}));
        return cached;
      }
      try {
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (err) {
        // if offline and not cached, just fail
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 3) Default: try network, fall back to cache
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
