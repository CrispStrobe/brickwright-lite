/* Brickwright PWA service worker.
 *
 * ## The bug this was rewritten to fix (2026-08-09)
 *
 * The first version was stale-while-revalidate for EVERY same-origin GET —
 * `return cached || network` — including `index.html` and the hashed entry
 * bundle. That breaks the app on the second deploy, and it broke it in
 * production:
 *
 *   1. A visit caches index.html and gui.<oldhash>.js.
 *   2. A new build deploys. Chunk hashes change; the old chunk files are gone,
 *      because a deploy replaces the whole tree.
 *   3. The next visit is served the CACHED index.html, which names the CACHED
 *      old entry. The app runs a build that no longer exists on the server.
 *   4. The moment that old entry lazily imports a chunk the user had not
 *      visited before — the C tab, the debugger — it requests a hash that is
 *      404 and fails with "Loading chunk NNN failed".
 *
 * Reported as: `Can't show as c: Loading chunk 596 failed
 * (.../chunks/sb3-creator.fa965b005eea503da2a1.js)`. Confirmed by fetching the
 * deployed entry: it names `sb3-creator.8972d337850ada585ee3.js`, which is 200,
 * and contains the failing hash zero times. The browser was running a stale
 * entry against a fresh tree.
 *
 * Bumping CACHE would not have helped on its own, because nobody bumps a
 * constant on every deploy — and a scheme that needs a human step on every
 * release is a scheme that fails on the release someone forgets.
 *
 * ## The rule
 *
 * **The document is the one thing that must never be stale**, because it names
 * every hashed asset. Everything it names is content-addressed and therefore
 * safe to cache forever.
 *
 *   navigation / index.html  -> network first, cache only as an offline fallback
 *   hashed assets            -> cache first (immutable: the hash IS the version)
 *   everything else          -> stale-while-revalidate
 */
/* v3: bumped after the 2026-08-10 stale-client incident — a browser that was
 * last served by the v1 worker (stale-first documents) kept running a build
 * whose chunks had been deleted from the server, indefinitely. Activating v3
 * deletes every older cache outright, so the first visit after this deploy
 * starts clean even for those clients. */
// v4: a deploy served a mismatched tree, so v3 caches can hold entries for assets that 404'd.
// Hashed assets are cache-first and are never revalidated, so those entries would be permanent.
// The activate handler deletes every cache that is not the current one, which means renaming is
// the only thing that actually recovers a browser that is already broken.
const CACHE = 'brickwright-v4';

/** `gui.aeeed7e4.js`, `chunks/sb3-creator.8972d337850ada585ee3.js`, `static/…` */
const HASHED = /\.[a-f0-9]{8,32}\.(js|css)$/;

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
    if (url.origin !== self.location.origin) return; // the extension gallery goes to the network

    const isDocument = req.mode === 'navigate' || req.destination === 'document' ||
        url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

    // Example data is unhashed and edited often; a stale-first policy here
    // means a user keeps seeing last week's gallery until a background
    // revalidation they never observe. Small files — treat like the document.
    const isLiveData = url.pathname.includes('/examples/');

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);

        // The document names the build. Always ask the network first; fall back
        // to cache only when there is no network at all, which is the case the
        // PWA exists for.
        if (isDocument || isLiveData) {
            try {
                const fresh = await fetch(req, {cache: 'no-cache'});
                if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
                return fresh;
            } catch {
                return (await cache.match(req)) || Response.error();
            }
        }

        const cached = await cache.match(req);

        // A hashed asset can never change under its own name, so a hit is always correct — but
        // only if the hit is a USABLE response. A cached failure would otherwise be permanent,
        // because cache-first never revalidates it.
        if (cached && cached.ok && HASHED.test(url.pathname)) return cached;

        // Must always settle to a Response. `respondWith` REJECTS the request if its promise
        // resolves to undefined, and the browser reports that as "a ServiceWorker intercepted
        // the request and an unexpected error occurred" — the script then never loads at all.
        // The previous version ended in `.catch(() => cached)` and `return cached || network`,
        // so a fetch rejection with nothing cached resolved to undefined and took the whole app
        // down with a white screen. A network failure must degrade to a network failure, not to
        // a service worker exception.
        const fromNetwork = (async () => {
            try {
                const resp = await fetch(req);
                if (resp && resp.status === 200 && resp.type === 'basic') {
                    cache.put(req, resp.clone());
                }
                return resp;
            } catch {
                return null;
            }
        })();

        if (cached) {
            // Stale-while-revalidate: serve the hit, refresh behind it. waitUntil keeps the
            // worker alive for the refresh after the response has already gone out.
            event.waitUntil(fromNetwork);
            return cached;
        }
        return (await fromNetwork) || Response.error();
    })());
});
