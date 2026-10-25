## Arcade indexed tile layers — 2026-10-09

Codex owns `lane/arcade-frame-tiles-20261009`, stacked on PR765. Add modern
and legacy tile rasters to the internal indexed frame, track tile renderable
creation identity and compare original full pixel planes at z=-1 ties, map
replacement/clear, camera offsets and cached legacy art. Keep screen and render
callback diagnostics until the remaining layers are complete. No producer change.
Checkpoint `79ee6b89f`:13 tile full-frame/original-ID checks and19 regression
checks pass without skips. Coverage now background/tilemap/sprites; renderables,
HUD, speech and effects remain open. Exact existing terrain diagnostic retained.
Hosted controller-pane indexed tile check is prepared and pending.
