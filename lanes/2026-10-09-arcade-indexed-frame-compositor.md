## Arcade indexed frame compositor — 2026-10-09

Codex owns `lane/arcade-indexed-frame-20261009`, stacked on PR764. Implement
an internal indexed compositor for background and qualified sprite rasters,
with clipping, transparency, z/id ordering, camera and scaling. Compare full
pixel planes with original PXT. Preserve existing presentation and do not expose
screen snapshots until tile/renderable/HUD/speech/effect completeness passes.
Keep all screen and paint/shade import diagnostics. No producer change planned.
Checkpoint `3f6ad084c`:19 affected checks pass, including five complete original
PXT19200-pixel planes and two fresh extension bundles. Frame identity and scene
restoration pass. Initial S01 covers background/sprites only; tilemaps,
renderables, HUD, speech and effects remain explicit gaps. Hosted GUI pending.
