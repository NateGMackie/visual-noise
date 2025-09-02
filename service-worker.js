/* Ambient Visual Noise – Service Worker */
const VERSION = 'avn-2025-09-02-v1';
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_FALLBACK = 'index.html'; // relative to SW scope

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
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
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => (k.startsWith('static-') && k !== STATIC_CACHE) ? caches.delete(k) : Promise.resolve())
    );
    await self.clients.claim();
  })());
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
         (request.method === 'GET' &&
          request.headers.get('accept')?.includes('text/html'));
}

function isStaticAsset(request) {
  if (request.method !== 'GET') return false;
  const { pathname } = new URL(request.url);
  return (
    pathname.endsWith('.js') || pathname.endsWith('.css') ||
    pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') || pathname.endsWith('.svg') ||
    pathname.endsWith('.woff') || pathname.endsWith('.woff2') || pathname.endsWith('.ttf')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) Skip non-HTTP(S) (e.g., chrome-extension:, data:, blob:)
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttp) return;

  // 2) Only handle same-origin for caching
  const sameOrigin = url.origin === self.location.origin;

  // --- Network-first for navigations ---
  if (sameOrigin && isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(OFFLINE_FALLBACK, fresh.clone());
        }
        return fresh;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(OFFLINE_FALLBACK);
        if (cached) return cached;
        const any = await caches.match(request);
        if (any) return any;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // --- Cache-first for static assets ---
  if (sameOrigin && isStaticAsset(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        // Background refresh (guarded)
        event.waitUntil((async () => {
          try {
            const resp = await fetch(request);
            if (resp.ok) await cache.put(request, resp.clone());
          } catch { /* ignore offline/extension issues */ }
        })());
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh.ok) await cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // --- Default pass-through for other HTTP(S) requests ---
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
