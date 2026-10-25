### Arcade bundled factory qualification — 2026-10-09

Root owns `lane/arcade-bundle-factories-20261009`, stacked on PR747.
Scope: reproduce hosted image-decoder failure under actual GUI Babel and
production minification; preserve dependency closures across the extension
adapter, qualify indexed SVG reads and engine operations, and repair affected
browser report/setup barriers. Preserve parent failures and fresh production
qualification boundaries. No corpus input or consumer pin changes.

Compiled factory source `e4aa00d77ca2ae3af3551d980953566a581ce423` reproduces and fixes the Babel-created helper loss with explicit module dependencies.67 affected checks pass, zero skips; production-minified indexed reads, generated engines and legacy/shared-value controls pass. Source-injected speech/controller proof in the older reference GUI passes; full fresh production remains pending. Fresh184 hash-verified import-only census stays104/79/1, zero changed diagnostics. [Receipt](docs/receipts/2026-10-09-arcade-bundle-factories.json).

Tile asset identity lane qualification update (2026-10-11): named tiles retain qualified IDs and display labels through map editing and SB3, and export real `tilemap.g.jres`/`tilemap.g.ts` resources. Original PXT reads edited pixels. The image codec now respects 32-bit column padding. A dedicated real-control browser journey covers rename/edit/save/reopen/export/reimport; its exact-source hosted result is pending. The additive browser gate also owns its generated `docs/generated/browser-gate-readings.json` registration. No circuit, persistence-journey or dependency-pin changes.

Tile identity followup remains in PR793 and the same claimed files: synchronize edited named assets across matching map uses; preserve divergent copies; refuse stale/ambiguous saves before writes. Dedicated browser fixture now checks two shared uses. No legacy or circuit implementation is claimed.
