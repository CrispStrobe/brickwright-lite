## Arcade tile map painter — 2026-10-11

DONE — Claude (opus), owner request (imported Arcade levels must be editable
in our graphics editors), branch `lane/arcade-tilemap-painter-20261011`, merged
#790 (`513b0caac`, tree equals the reviewed merge prediction; all enabled
checks green; also gained New tile map and the CI light-shard browser check,
which touched build.yml and browser-gate-readings.json). Ledger
U03 first slice: a painter in the Costumes tab for every `set Arcade tilemap`
block (tile palette, paint/erase/fill, separate wall layer, map size, tile size,
add/remove/edit tiles as pixels, undo/redo), written back into that block.
Envelope: new lib/bw-makecode/tilemap-editor.js, new tilemap-editor.jsx (+css),
costume-tab.jsx (overlay + tracked twins), their tests, conversion docs, this
ledger. Not in scope: legacy color-coded maps, tile names, Stage backdrops.
