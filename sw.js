const cache_name = 'bells-v0.1'; // Update to force install a new cache

const files = [
  './',
  './index.html',
  './style.css',
  './out.js',
  './calendars.json',
  './manifest.json',
  './bells-qr.png',
  './images/GitHub-Mark-32px.png',
  './icons/bells-ico.svg',
  './icons/bells-ico-192.png',
  './icons/bells-ico-512.png',
];

async function setupNewCache() {
  const cache = await caches.open(cache_name);
  await Promise.all(
    files.map(async (asset) => {
      try {
        await cache.add(new Request(asset, { cache: 'reload' }));
      } catch (error) {
        console.warn('Failed to cache asset:', asset, error);
      }
    }),
  );
  await self.skipWaiting();
}

async function handleActivation(params) {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== cache_name).map((key) => caches.delete(key))); // Clear old caches
  await self.clients.claim();
}

async function handleCachedFetch(event) {

    let request = event.request;
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (request.mode === 'navigate') {
        try {
            const networkResponse = await fetch(request);
            const cache = await caches.open(cache_name);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        } catch {
            return (await caches.match('./index.html')) || (await caches.match('./'));
        }
    }

    if (isSameOrigin) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok) {
            const cache = await caches.open(cache_name);
            cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch {
            return Response.error();
        }
    }

    return fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(setupNewCache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(handleActivation());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(handleCachedFetch(event));
});
