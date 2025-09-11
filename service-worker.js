/* eslint-env serviceworker, browser */

// ---------------------------------------------
// Ambient Visual Noise — Service Worker (robust)
// - Versioned runtime cache
// - Stale-while-revalidate for same-origin GETs
// - Network-first for navigation requests (with offline fallback)
// - Precache is tolerant: logs missing files, caches what succeeds
// ---------------------------------------------

const SW_VERSION = 'v51';
const RUNTIME_CACHE = `vn-runtime-${SW_VERSION}`;
const OFFLINE_CACHE = `vn-offline-${SW_VERSION}`;
const DEBUG = true;

/** Files to precache for offline navigations (keep small & correct) */
const OFFLINE_URLS = [
  'index.html',
  // Add these *only if they actually exist* at your scope:
  // "manifest.webmanifest",
  // "favicon.ico"
];

function scopeBase() {
  // Always resolve relative to the registration scope, which works at "/" or "/visual-noise/"
  return new URL(self.registration?.scope || self.location.href);
}

/**
 * Precache core offline files needed for basic offline navigation.
 * @returns {Promise<void>} Resolves after any successful entries are cached.
 */
async function precache() {
  const base = scopeBase();
  const cache = await caches.open(OFFLINE_CACHE);

  const urls = OFFLINE_URLS.map((rel) => new URL(rel, base).toString());

  // Fetch each URL individually so one failure doesn't crash the whole install.
  const results = await Promise.allSettled(
    urls.map(async (u) => {
      try {
        const req = new Request(u, { cache: 'reload', credentials: 'same-origin' });
        const resp = await fetch(req);
        if (!resp || (!resp.ok && resp.type !== 'opaque')) {
          throw new Error(`HTTP ${resp?.status}`);
        }
        await cache.put(req, resp.clone());
        if (DEBUG) console.info('[SW] precached:', u);
        return { url: u, ok: true };
      } catch (err) {
        if (DEBUG) console.warn('[SW] precache miss:', u, String(err));
        return { url: u, ok: false, err };
      }
    })
  );

  const failures = results.filter((r) => (r.status === 'fulfilled' ? !r.value.ok : true));
  if (failures.length && DEBUG) {
    console.warn(
      '[SW] precache finished with failures:',
      failures.map((f) => (f.value || f).url)
    );
  }
}

/**
 * Remove old versioned caches so storage doesn’t grow unbounded.
 * @returns {Promise<void>} Resolves after deletion completes.
 */
async function cleanupOldCaches() {
  const keep = new Set([RUNTIME_CACHE, OFFLINE_CACHE]);
  const names = await caches.keys();
  await Promise.all(
    names.map((name) => (keep.has(name) ? Promise.resolve() : caches.delete(name)))
  );
}

/**
 * Network-first strategy for page navigations with offline fallback to cached index.html.
 * @param {Request} request - The original navigation request (e.g., clicking a link).
 * @returns {Promise<Response>} The network response if available, otherwise the offline shell.
 */
async function handleNavigation(request) {
  try {
    const network = await fetch(request);
    // Cache the latest index.html for offline use
    const cache = await caches.open(OFFLINE_CACHE);
    const key = new URL('index.html', request.url);
    if (network && network.ok) {
      cache.put(key, network.clone());
    }
    return network;
  } catch {
    const cache = await caches.open(OFFLINE_CACHE);
    const cached = await cache.match(new URL('index.html', request.url));
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/**
 * Stale-while-revalidate strategy for same-origin GET assets (JS/CSS/images).
 * @param {Request} request - The asset fetch request to satisfy.
 * @returns {Promise<Response>} Cached response if present, otherwise the network response.
 */
async function handleAsset(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return fetch(request);
  }

  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResp) => {
      if (networkResp && networkResp.ok) cache.put(request, networkResp.clone());
      return networkResp;
    })
    .catch(() => undefined);

  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

// ---------------------------------------------
// Lifecycle events
// ---------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precache();
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await cleanupOldCaches();
      self.clients.claim();
    })()
  );
});

// ---------------------------------------------
// Fetch routing
// ---------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request));
});
