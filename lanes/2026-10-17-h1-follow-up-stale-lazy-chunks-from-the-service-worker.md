## H1 follow-up — stale lazy chunks from the service worker (#306) — 2026-10-17

CLAIMED — Claude (Lite Code tab lane), branch `lane/h1-sw-chunks-20261017`.
Read-only analysis found the likely cause of the owner's React #306 in the
Code tab: lazy chunks are unhashed (`chunks/[name].js`), the service worker
serves them stale-while-revalidate under a fixed cache name, so after a
deploy a page can receive the new entry with an OLD `pseudocode-importer`
chunk whose default export is undefined; a plain reload serves it again.
Own: `overlay/scratch-gui/sw.js` (network-first with cache fallback for
`/chunks/`, cache name bumped to purge stale entries), the H1 boundary's
Reload button in `containers/lazy-pseudocode-importer.jsx` calling the
existing `lib/hard-reload.js`, and a new stale-chunk scenario in
`scripts/verify-service-worker.mjs`. No webpack output naming, entry
caching, index.ejs recovery or offline-shell behaviour change otherwise.
