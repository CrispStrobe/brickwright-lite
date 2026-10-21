## Arcade art editable in the paint editor — 2026-10-11

DONE — Claude (opus), owner request ("sprites/backgrounds must be editable in
our pixel graphics editor"), branch `lane/arcade-editable-art-audit-20261011`,
merged #789 (`074edb8d5`, tree equals the reviewed merge prediction; all
enabled checks green on attempt 3 after two light-shard failures in the
unrelated green-flag first-write journey and one PXT palette timing flake).
Imported MakeCode Arcade art already lands as costumes and edits reach the game;
this lane makes it legible and organised: helper art sprites get readable names
from the code (`hero`, `background`, `coinAnimation`) instead of `__arcadeTemplateN`,
costumes are named instead of all `costume1`, and an inline image array becomes
one sprite with one costume per frame. Envelope: arcade-translate.js,
pseudocode-importer.jsx (overlay + tracked twin), the arcade/makecode tests that
name helper sprites, scripts/verify-makecode.mjs, conversion docs, this ledger.
Not in scope: a tilemap painter (separate later lane), runtime/extension changes.
