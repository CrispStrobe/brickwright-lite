## Arcade tile names and MakeCode asset identity — 2026-10-11

CLAIMED — Codex, separate worktree and branch
`lane/arcade-tile-asset-identity-20261011`, while PR792 persistence CI queues.
Preserve named tile identity through import, JSON Blocks/SB3, painter edits and
MakeCode project export/reimport. Emit real MakeCode tile resource/declaration
files so named tiles appear in its asset list, rather than merely inlining art.
Envelope: bw-makecode tilemap-values/editor/assets/translate/export modules,
new tile resource helper, namespace-bindings.js source-path metadata,
tilemap-editor.jsx and tracked twin when present, focused tile asset/editor/
original-compiler tests, dedicated scripts/verify-arcade-tile-identity.mjs and
its additive light-shard step in build.yml, Arcade docs and this ledger. No persistence browser
script, circuit source/pins or legacy-map/sprite-placement implementation.
Review the original pinned resource format and resolve duplicate names/images
explicitly; never silently alias distinct edited tiles to one exported asset.
