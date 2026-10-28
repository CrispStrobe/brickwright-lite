# Generated Arcade tilemap factories

The native importer parses the full generated TypeScript factory AST, rather
than extracting only `case "name": return ...` text. Empty cases fall through,
so `case "level0": case "level2": return ...` gives both names the same map.
Duplicate labels retain the first matching case, and an explicit default can
return a fallback map. Registered factories are tried in original project file
order; a null result continues to the next factory. Generated trim operations
are retained rather than applied to factories that compare raw names.

The retained Arcade SDK's `game/assetTemplates.ts` helper returns **null** after
all factories miss. The importer emits the existing null-map command only when
it has validated the generated registrations and callbacks. Dynamic kinds,
conditional registrations, malformed maps, callback side effects and unknown
source shapes remain explicit diagnostics. A missing name is not a substitute
for an unreadable generated factory. Runtime map clearing preserves the
existing tile scale and background; known aliases retain tiles, wall plane,
image pixels and tile scale.

The original implementation is in Microsoft's
[pxt-common-packages assetTemplates.ts](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/assetTemplates.ts)
and [tilemap.ts](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/tilemap.ts).
The selected bundled SDK defines behavior; these current upstream links locate
the implementation and do not replace the retained source version.

`test/makecode-arcade-tilemap-factories.test.mjs` exercises aliases, defaults,
null fallback, exact whitespace behavior, malformed/dynamic refusals and
original registration order. Original/native/Code, same and fresh VM SB3,
MakeCode export and reimport controls compare loaded map pixels, walls and
scales. Existing tile-data and builtin-art controls remain enabled.

Only readable literal map values and named tagged templates are lowered here.
Runtime map variables and dynamic names remain separate gaps. There is also a
known original runtime boundary: `tiles.getTilesByType` after a null map can
throw in the selected SDK's `TileMap.getImageType`; this change does not qualify
that observer as returning an empty collection. Finite source and runtime
controls do not establish full GUI, arbitrary-game or corpus compatibility.
