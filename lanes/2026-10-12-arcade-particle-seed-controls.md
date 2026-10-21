## Arcade particle seed controls — 2026-10-12

DONE candidate — Codex SPIKE integration, `fix/arcade-particle-test-seeds-20261012`.
Envelope: `test/makecode-arcade-particle-effects.test.mjs` and this ledger only.
The existing 8x8 dissolve assertion depends on an unrecorded random seed;
two valid generated rectangles can both fall outside the image. Set the
specific image effect's seed in the positive fixture, retain its image-change,
particle, lifespan and handler assertions, and add an off-canvas seed control
for cloning and destruction semantics. Preserve generated PXT/runtime bytes,
original failed CI and all independently owned Arcade source/GUI lanes.
Both affected controls pass under Node 22.23.3. Setting the positive fixture
to the off-canvas seed fails its retained pixel assertion; suppressing the image
effect fails both pixel-change and clone assertions. Hosted checks remain pending.
