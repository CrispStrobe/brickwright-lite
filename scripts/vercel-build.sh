#!/usr/bin/env bash
# Vercel build for the permissive base: vendor the pinned BSD-3/Apache Scratch sources,
# install scratch-gui, and webpack it. Output lands in packages/scratch-gui/build, which
# vercel.json serves. Root-hosted on *.vercel.app, so no base-path rewriting needed.
set -euo pipefail
node scripts/vendor.mjs
cd packages/scratch-gui
npm install --legacy-peer-deps --no-audit --no-fund
NODE_ENV=production CI=true NODE_OPTIONS=--max-old-space-size=6144 npm run build
