#!/usr/bin/env bash
# Vercel build for the permissive base: vendor the pinned BSD-3/Apache Scratch sources,
# install scratch-gui, and webpack it. Output lands in packages/scratch-gui/build, which
# vercel.json serves. Root-hosted on *.vercel.app, so no base-path rewriting needed.
set -euo pipefail
node scripts/vendor.mjs
node scripts/integrate.mjs
# The heavy simulation tier's engine (labwired-wasm, ~20 MB / 2 MB brotli).
# Deployed as a static asset, NOT bundled: lib/labwired-engine.js fetches it at
# runtime and only when someone selects that engine, so it costs nothing at
# first paint and the build does not depend on it. Same-origin on purpose —
# a GitHub-hosted runtime fetch would be zero deploy bytes and would break the
# PWA offline, since the service worker only caches our own GETs.
# Non-fatal: a network hiccup here must not take the whole site down; the
# engine simply is not offered, which lib/labwired-engine.js already handles.
node scripts/sync-labwired-wasm.mjs || echo "labwired-wasm unavailable — the heavy tier will not be offered"
cd packages/scratch-gui
npm install --ignore-scripts --legacy-peer-deps --no-audit --no-fund
cd ../.. && node scripts/apply-vm-overlay.mjs && node scripts/apply-paint-overlay.mjs && cd packages/scratch-gui
NODE_ENV=production CI=true NODE_OPTIONS=--max-old-space-size=2560 npm run build
