# Absent and cleared tilemaps

A scene without a TileMap is distinct from an existing TileMap with null data.
`tiles.setCurrentTilemap(null)` creates the latter even when no level was ever
installed. The native runtime retains this scene-local distinction and resets it
with the scene. Null images still follow the SDK's early empty-result guard.

The pinned MakeCode implementation is in the bundled `game/tilemap.ts` and
`game/scenes.ts` of the target worker used by the original compiler tests.
Actual original simulator observations cover these states:

| query | no TileMap | cleared TileMap | valid one-tile map |
|---|---|---|---|
| `getTilesByType(image).length` | 0 | null-data TypeError | 1 |
| `tileAtLocationIsWall(getTileLocation(0,0))` | false | false | true |
| `getTileLocation(0,0).x` | null-Location TypeError | retained scale / 2 | scale / 2 |
| `getTileImage(getTileLocation(0,0)).width` | null-image width TypeError | null-TileMapData TypeError | authored image width |
| `tileAtLocationEquals(getTileLocation(0,0), image)` | false | null-TileMapData TypeError | true |

Calling `getTileLocation` before the first level returns null; it does not create
a TileMap. Passing a null image to `getTilesByType` returns an empty array even
after a map is cleared. Pushing a scene gives it independent absent-map state;
popping restores the parent's map.

A modern `Location` stores its original map for specific SDK helper operations,
but its public pixel getters use the **current scene's** TileMap. An old location
therefore follows a replacement map's scale and an installed child map's scale;
its pixel getter faults while the child has no TileMap. Column and row remain
available without a map. This slice covers public location/query operations;
original-map helper placement behavior has a separate implementation boundary.

`test/makecode-arcade-null-tile-query.test.mjs` exercises native primitive values,
scene ownership, null guards, and the distinct original failure messages. The
original observations were obtained with unchanged owned fixtures in the actual
pinned simulator. Successful generated-factory roundtrips remain covered by
`test/makecode-arcade-tilemap-factories.test.mjs`.

This is operation and source-state parity. It does not establish full propagation
of fatal MakeCode faults through the host scheduler, whole-game qualification,
or faults in unrelated Scratch scripts. No global scheduler or exception policy
is changed here.
