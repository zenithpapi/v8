const DEFAULT_CACHE_PREFIX = 'my-app-cache-';
let CACHE_NAME = DEFAULT_CACHE_PREFIX + 'v1'; // fallback; can be updated by client message

// Optionally pre-cache core assets (uncomment and list files you want cached on install)
self.addEventListener('install', event => {
  // skipWaiting so new SW can activate quickly when requested by the page
  self.skipWaiting();
  // Example pre-cache (adjust as needed):
  // event.waitUntil(
  //   caches.open(CACHE_NAME).then(cache => cache.addAll(['/','/index.html','/assets/js/app.js']))
  // );
});

// Activate: delete old caches that match the prefix but not the current cache name
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (!key.startsWith(DEFAULT_CACHE_PREFIX)) return null;
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for JS/CSS, stale-while-revalidate for other GET requests
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isStaticAsset = isSameOrigin && (requestUrl.pathname.endsWith('.js') || requestUrl.pathname.endsWith('.css'));

  if (isStaticAsset) {
    event.respondWith((async () => {
      try {
        return await fetch(event.request, { cache: 'no-store' });
      } catch (err) {
        console.warn('Network fetch failed for static asset', event.request.url, err);
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const cached = await caches.match(event.request);

      // Always start network fetch to update cache in background
      const networkPromise = fetch(event.request).then(async response => {
        try {
          // Only cache successful, same-origin/non-opaque responses
          if (response && response.ok && response.type !== 'opaque') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
        } catch (e) {
          // ignore cache failures
          console.warn('Cache put failed for', event.request.url, e);
        }
        return response;
      }).catch(err => {
        // network failed
        console.warn('Network fetch failed for', event.request.url, err);
        return null;
      });

      // Return cached response if available immediately
      if (cached) return cached;

      // Otherwise wait for network and ensure a valid Response is returned
      const netResp = await networkPromise;
      if (netResp) return netResp;

      // Neither cache nor network available - return a generic error response
      return new Response('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
    } catch (err) {
      // Unexpected failure - return an error response instead of letting the promise resolve to undefined/null
      console.error('Service worker fetch handler error for', event.request.url, err);
      return new Response('Service worker error', { status: 500, statusText: 'SW Error' });
    }
  })());
});

// Message handler to allow client to update cache name and request cleanup/activation
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SET_CACHE_NAME' && data.cacheName) {
    CACHE_NAME = data.cacheName;
  }
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'CLEAR_OLD_CACHES' && data.currentCachePrefix) {
    const currentPrefix = data.currentCachePrefix;
    const keepName = data.keepName;
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => {
        if (k !== keepName && k.startsWith(currentPrefix)) return caches.delete(k);
        return null;
      })))
    );
  }
});
