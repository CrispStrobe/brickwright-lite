## Arcade sprite placement from the tile map painter — 2026-10-11

DONE candidate — Claude (opus), owner request ("fix it all"), branch
`lane/arcade-tilemap-placement-20261011`, stacked on Codex's painter stack
(PR793 → PR794) and agreed with Codex, who is not taking it. In the painter,
show where sprites are placed on the map and let the user place or move a
sprite on a cell: read and write the existing `arcade_placeOnTile` blocks with
an `arcade_tileLocation` (column, row) in the map's script, so the runtime,
MakeCode export and import already understand the result. Envelope: new
bw-makecode tilemap-placements.js, a placement section in tilemap-editor.jsx
(and its tracked twin, if any), focused tests, a dedicated
scripts/verify-arcade-tilemap-placement.mjs with its additive light-shard step
and budget registration in build.yml, Arcade docs and this ledger. No change to
Codex's tile identity, legacy layout or persistence code paths, circuit source
or pins; legacy colour-tile placement (`placeOnLegacyTile`) stays out of scope.
Done: Place sprite tool, placement list, markers and staged Save/Revert in the
painter; model lib/bw-makecode/tilemap-placements.js. Four model tests run
the real game and the MakeCode export (moved, added and removed placements;
the map's own placements only, up to the next map; stale lists refused); three
source mutants are caught. The new browser journey passes 17 of 17 twice
against a production build; the painter, tile identity and legacy layout
journeys still pass (19, 11, 8 checks).
