/* Brickwright PWA service worker.
 * Runtime cache-then-network (stale-while-revalidate) for same-origin GET requests, so after the
 * first visit the editor loads offline. No precache manifest is needed — webpack chunk names are
 * hashed, and this caches each asset as it is first fetched. Bump CACHE to invalidate old assets. */
const CACHE = 'brickwright-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // let cross-origin (e.g. the extension gallery) hit the network

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req).then(resp => {
            if (resp && resp.status === 200 && resp.type === 'basic') cache.put(req, resp.clone());
            return resp;
        }).catch(() => cached);
        return cached || network;
    })());
});
