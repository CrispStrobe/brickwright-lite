# SAMD native game engine adoption — 2026-10-26

Owner: Codex SAMD continuation. Status: CLAIMED.
Base: `8bf40b2c3d2`. Branch: `lane/samd-game-adoption-20261026`.

Carry the qualified no-ASF SAMD runtime and engine through representative native
and WASM game measurements, then the directly consumed Lite engine package.
Source/model changes land in the owned supplier first. A pin bump alone cannot
qualify the old PyBadge descriptor's peripheral stubs or display attachment.

Envelope: this claim; `scripts/sync-labwired-wasm.mjs` engine PIN/TAG/EXPECT;
matching engine identity in `.github/workflows/target-performance.yml`;
new `scripts/verify-samd-native-game.mjs` and focused test; a new scoped
`docs/SAMD-NATIVE-GAME-ADOPTION.md`; affected engine selection/config loading in
`scripts/lib/makecode-run.mjs` and the existing pseudocode importer plus tracked
twin only if required by demonstrated native guest acceptance. Preserve other
owners' importer edits and package boundaries. No board/compiler/circuit pins.

Qualification: source/configuration/firmware/package hashes; a real native game
with moving frames and button responses rather than idle spin; startup/frame/
input and memory measurements in native and WASM, with unchanged correctness
bounds. Reproducible producer build and all enabled exact-head checks precede
normal landing. Actual browser and installed own-guest acceptance is mandatory
for adoption. Preserve original failures; do not claim physical panel colour,
electrical timing, full hardware fidelity or universal real-time speed.

If a prerequisite cannot be qualified, retain its exact actionable scope and
failure evidence and keep this claim active. Do not report adoption complete.
