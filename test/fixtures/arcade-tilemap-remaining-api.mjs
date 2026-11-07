// Original authored program (no corpus or tutorial content) for the last pinned
// pxt-arcade tilemap APIs: tiles.removeEventListener with a named listener,
// TileMapData.scale (setter) and getTileset(), and Location.tileMap. Every
// result is a numeric global, so the pinned PXT simulator and Brickwright can
// be compared value by value.
export const REMAINING_SOURCE = `let levelA = tiles.createTilemap(hex\`03000200000100000002\`, img\`
. 2 .
. . 2
\`, [img\`0\`, img\`2\`, img\`5\`], TileScale.Eight)
let levelB = tiles.createTilemap(hex\`02000300000100000101\`, img\`
. .
2 .
. .
\`, [img\`0\`, img\`2\`], TileScale.Sixteen)
let loads = 0
let unloads = 0
let order = 0
function countLoad(data: tiles.TileMapData) {
    loads += 1
    order = order * 10 + data.width
}
function countUnload(data: tiles.TileMapData) {
    unloads += data.height
}
tiles.addEventListener(tiles.TileMapEvent.Loaded, countLoad)
tiles.addEventListener(tiles.TileMapEvent.Loaded, countLoad)
tiles.addEventListener(tiles.TileMapEvent.Unloaded, countUnload)
tiles.setTilemap(levelA)
let afterAdd = loads * 10 + unloads
tiles.removeEventListener(tiles.TileMapEvent.Loaded, countLoad)
tiles.removeEventListener(tiles.TileMapEvent.Unloaded, function (data: tiles.TileMapData) {
    unloads += 100
})
tiles.setTilemap(levelB)
let afterRemove = loads * 10 + unloads
tiles.removeEventListener(tiles.TileMapEvent.Loaded, countLoad)
tiles.addEventListener(tiles.TileMapEvent.Loaded, countLoad)
tiles.setTilemap(levelA)
let afterReadd = loads * 10 + unloads
let sA0 = levelA.scale
let loc = tiles.getTileLocation(1, 1)
let x8 = loc.x
let tm = loc.tileMap
let tmSame = tm === tiles.getTileLocation(0, 0).tileMap ? 1 : 0
let tmData = tm.data === levelA ? 1 : 0
let tmScale = tm.scale
let tmEnabled = tm.enabled ? 1 : 0
let tmW = tm.areaWidth()
let tmH = tm.areaHeight()
let tmIndex = tm.getTileIndex(1, 0)
levelA.scale = TileScale.Sixteen
let sA1 = levelA.scale
let xKept = loc.x
let tmScaleKept = tm.scale
tiles.setTilemap(levelB)
tiles.setTilemap(levelA)
let x16 = loc.x
let tmScale16 = tm.scale
let ts = levelA.getTileset()
let tsLen = ts.length
let tsSame = ts === levelA.getTileset() ? 1 : 0
let tsTwo = ts[1].equals(img\`2\`) ? 1 : 0
ts[1].setPixel(0, 0, 9)
let tsShared = levelA.getTileImage(1).getPixel(0, 0)
tiles.setTileAt(tiles.getTileLocation(0, 0), img\`7\`)
let tsGrown = levelA.getTileset().length
let tsNew = levelA.getTileset()[3].equals(img\`7\`) ? 1 : 0
tiles.setTilemap(null)
let tmEnabledNull = tm.enabled ? 1 : 0
let tmDataNull = tm.data === null ? 1 : 0
let tmWNull = tm.areaWidth()
let done = false
done = true
`;
export const REMAINING_KEYS = ['loads', 'unloads', 'order', 'afterAdd', 'afterRemove', 'afterReadd', 'sA0', 'x8', 'tmSame', 'tmData',
    'tmScale', 'tmEnabled', 'tmW', 'tmH', 'tmIndex', 'sA1', 'xKept', 'tmScaleKept', 'x16', 'tmScale16', 'tsLen', 'tsSame', 'tsTwo',
    'tsShared', 'tsGrown', 'tsNew', 'tmEnabledNull', 'tmDataNull', 'tmWNull'];
