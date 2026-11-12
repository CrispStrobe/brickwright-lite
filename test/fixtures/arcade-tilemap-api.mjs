// Original authored programs (no corpus or tutorial content) for the tilemap API oracle tests.
// Every result is stored in a numeric global so the pinned PXT simulator and Brickwright can be compared.
export const QUERY_SOURCE = `tiles.setTilemap(tiles.createTilemap(hex\`06000400000002000000000101000300020000000000010101010101\`,img\`
. . . . . .
. 2 2 . 2 .
. . . . . .
2 2 2 2 2 2
\`,[img\`0\`,img\`2\`,img\`5\`,img\`7\`],TileScale.Eight))
let hero = sprites.create(img\`
2 2
2 2
\`, SpriteKind.Player)
let loc = tiles.getTileLocation(2, 1)
let lCol = loc.column
let lRow = loc.row
let lX = loc.x
let lY = loc.y
let lLeft = loc.left
let lTop = loc.top
let lRight = loc.right
let lBottom = loc.bottom
let lSet = loc.tileSet
let wallHere = tiles.tileAtLocationIsWall(tiles.getTileLocation(1, 1)) ? 1 : 0
let wallFree = tiles.tileAtLocationIsWall(tiles.getTileLocation(0, 0)) ? 1 : 0
let wallSet = tiles.tileAtLocationIsWall(tiles.getTileLocation(4, 1)) ? 1 : 0
let wallOutside = tiles.tileAtLocationIsWall(tiles.getTileLocation(-1, 0)) ? 1 : 0
let wallMethod = tiles.getTileLocation(1, 1).isWall() ? 1 : 0
let isCoin = tiles.tileAtLocationEquals(tiles.getTileLocation(2, 0), img\`5\`) ? 1 : 0
let notCoin = tiles.tileAtLocationEquals(tiles.getTileLocation(3, 0), img\`5\`) ? 1 : 0
let imgEq = tiles.tileImageAtLocation(tiles.getTileLocation(1, 1)).equals(img\`2\`) ? 1 : 0
let imgEq2 = tiles.getTileImage(tiles.getTileLocation(0, 2)).equals(img\`5\`) ? 1 : 0
let imgAt = tiles.getTileAt(4, 1).equals(img\`7\`) ? 1 : 0
let nR = loc.getNeighboringLocation(CollisionDirection.Right).column
let nL = loc.getNeighboringLocation(CollisionDirection.Left).column
let nT = loc.getNeighboringLocation(CollisionDirection.Top).row
let nB = loc.getNeighboringLocation(CollisionDirection.Bottom).row
let nBSet = loc.getNeighboringLocation(CollisionDirection.Bottom).tileSet
hero.setPosition(20, 13)
let heroCol = hero.tilemapLocation().column
let heroRow = hero.tilemapLocation().row
let coins = tiles.getTilesByType(img\`5\`)
let coinCount = coins.length
let coinFirstCol = coins[0].column
let coinFirstRow = coins[0].row
let coinLastCol = coins[coins.length - 1].column
let coinLastRow = coins[coins.length - 1].row
let rnd = tiles.getRandomTileByType(img\`5\`)
let rndCol = rnd.column
let rndRow = rnd.row
tiles.placeOnRandomTile(hero, img\`5\`)
let placedX = hero.x
let placedY = hero.y
loc.place(hero)
let locPlaceX = hero.x
let locPlaceY = hero.y
tiles.placeOnTile(hero, tiles.getTileLocation(0, 3))
let onTileX = hero.x
let onTileY = hero.y
let kindTop = hero.tileKindAt(TileDirection.Top, img\`0\`) ? 1 : 0
let kindCenter = hero.tileKindAt(TileDirection.Center, img\`2\`) ? 1 : 0
let noMatches = tiles.getTilesByType(img\`4\`).length
let done = false
done = true
`;
export const QUERY_KEYS = ["lCol","lRow","lX","lY","lLeft","lTop","lRight","lBottom","lSet","wallHere","wallFree","wallSet","wallOutside","wallMethod","isCoin","notCoin","imgEq","imgEq2","imgAt","nR","nL","nT","nB","nBSet","heroCol","heroRow","coinCount","coinFirstCol","coinFirstRow","coinLastCol","coinLastRow","rndCol","rndRow","placedX","placedY","locPlaceX","locPlaceY","onTileX","onTileY","kindTop","kindCenter","noMatches"];
export const DATA_SOURCE = `let hero = sprites.create(img\`
2 2
2 2
\`, SpriteKind.Player)
let levelA = tiles.createTilemap(hex\`03000200000100000002\`, img\`
. 2 .
. . 2
\`, [img\`0\`, img\`2\`, img\`5\`], TileScale.Eight)
let levelB = tiles.createTilemap(hex\`02000300000100000101\`, img\`
. .
2 .
. .
\`, [img\`0\`, img\`2\`], TileScale.Sixteen)
let levels = [levelA, levelB]
let loaded = 0
let unloaded = 0
let loadedW = 0
let unloadedH = 0
let order = 0
tiles.addEventListener(tiles.TileMapEvent.Loaded, function (data) {
    loaded += 1
    loadedW = data.width * 100 + data.height
    order = order * 10 + 1
})
tiles.addEventListener(tiles.TileMapEvent.Unloaded, function (data) {
    unloaded += 1
    unloadedH = data.height
    order = order * 10 + 2
})
tiles.setCurrentTilemap(levels[0])
let afterFirst = loaded * 10 + unloaded
tiles.setCurrentTilemap(levels[0])
let afterSame = loaded * 10 + unloaded
tiles.setCurrentTilemap(levels[1])
let afterSecond = loaded * 10 + unloaded
let wA = levelA.width
let hA = levelA.height
let sA = levelA.scale
let sB = levelB.scale
let tA = levelA.getTile(1, 0)
let tA2 = levelA.getTile(2, 1)
let tOut = levelA.getTile(9, 9)
let wallA = levelA.isWall(1, 0) ? 1 : 0
let wallOut = levelA.isWall(9, 9) ? 1 : 0
levelA.setTile(0, 0, 2)
levelA.setWall(0, 0, true)
let editedTile = levelA.getTile(0, 0)
let editedWall = levelA.isWall(0, 0) ? 1 : 0
let imgOk = levelA.getTileImage(2).equals(img\`5\`) ? 1 : 0
tiles.setCurrentTilemap(levels[0])
let backEdited = tiles.tileAtLocationEquals(tiles.getTileLocation(0, 0), img\`5\`) ? 1 : 0
let backWall = tiles.tileAtLocationIsWall(tiles.getTileLocation(0, 0)) ? 1 : 0
tiles.setTileAt(tiles.getTileLocation(1, 1), img\`5\`)
tiles.setCurrentTilemap(levels[1])
tiles.setCurrentTilemap(levels[0])
let persisted = levelA.getTile(1, 1)
let done = false
done = true
`;
export const DATA_KEYS = ["loaded","unloaded","loadedW","unloadedH","order","afterFirst","afterSame","afterSecond","wA","hA","sA","sB","tA","tA2","tOut","wallA","wallOut","editedTile","editedWall","imgOk","backEdited","backWall","persisted"];
export const EDGE_SOURCE = `let hero = sprites.create(img\`
2 2
2 2
\`, SpriteKind.Player)
let noLoc = tiles.getTileLocation(1, 1) ? 1 : 2
let atW = tiles.getTileAt(1, 1) ? 1 : 2
let atH = tiles.tileImageAtLocation(tiles.getTileLocation(1, 1)) ? 1 : 2
let atBlank = tiles.tileImageAtLocation(null) ? 1 : 2
let meLoc = hero.tilemapLocation() ? 1 : 2
let rndLoc = tiles.getRandomTileByType(img\`5\`) ? 1 : 2
let arr = tiles.getTilesByType(img\`5\`).length
tiles.placeOnRandomTile(hero, img\`5\`)
let px = hero.x
let eq = tiles.tileAtLocationEquals(null, img\`5\`) ? 1 : 0
let wallNull = tiles.tileAtLocationIsWall(null) ? 1 : 0
let imgNullW = tiles.getTileImage(null) ? 1 : 2
let tileImgNullW = tiles.getTileImage(tiles.getTileLocation(0, 0)) ? 1 : 2
tiles.setCurrentTilemap(tiles.createTilemap(hex\`0100010000\`, img\`
.
\`, [img\`0\`], TileScale.Sixteen))
let loc = tiles.getTileLocation(0, 0)
let withMapW = tiles.getTileImage(loc).width
let withMapH = tiles.tileImageAtLocation(loc).height
let outsideW = tiles.getTileAt(5, 5).width
let nbCol = loc.getNeighboringLocation(CollisionDirection.Left).column
let nbRow = loc.getNeighboringLocation(CollisionDirection.Bottom).row
let outsideWall = loc.getNeighboringLocation(CollisionDirection.Right).isWall() ? 1 : 0
let done = false
done = true
`;
export const EDGE_KEYS = ["noLoc","atW","atH","atBlank","meLoc","rndLoc","arr","px","eq","wallNull","imgNullW","tileImgNullW","withMapW","withMapH","outsideW","nbCol","nbRow","outsideWall"];
export const EVENTS_SOURCE = `tiles.setTilemap(tiles.createTilemap(hex\`0c000400000000000000000000000000000000000000000000000000000200000200000000020000010101010101010101010101\`, img\`
. . . . . . . . . . . .
. . . . . . . . . . . .
. . . . . . . . . . . .
2 2 2 2 2 2 2 2 2 2 2 2
\`, [img\`0\`, img\`2\`, img\`5\`], TileScale.Eight))
let hero = sprites.create(img\`
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
\`, SpriteKind.Player)
tiles.placeOnTile(hero, tiles.getTileLocation(0, 1))
hero.ay = 300
hero.vx = 40
let coins = 0
let walls = 0
let lastColumn = -1
let wallSpriteX = 0
let wallColumn = -1
let grounded = 0
scene.onOverlapTile(SpriteKind.Player, img\`2\`, function (sprite, location) {
    coins += 1
    lastColumn = location.column
})
scene.onOverlapTile(SpriteKind.Player, img\`5\`, function (sprite, location) {
    tiles.setTileAt(location, img\`0\`)
    coins += 100
})
scene.onHitWall(SpriteKind.Player, function (sprite, location) {
    walls += 1
    wallColumn = location.column
    wallSpriteX = sprite.x
})
game.onUpdate(function () {
    if (hero.isHittingTile(CollisionDirection.Bottom)) grounded += 1
})
pause(1500)
let x1 = hero.x
let y1 = hero.y
let vx1 = hero.vx
let vy1 = hero.vy
pause(1500)
let x2 = hero.x
let y2 = hero.y
let tileLeft = tiles.tileAtLocationEquals(tiles.getTileLocation(1, 2), img\`0\`) ? 1 : 0
let tileKept = tiles.tileAtLocationEquals(tiles.getTileLocation(9, 2), img\`0\`) ? 1 : 0
let done = false
done = true
`;
export const EVENTS_KEYS = ["coins","walls","lastColumn","wallSpriteX","wallColumn","grounded","x1","y1","vx1","vy1","x2","y2","tileLeft","tileKept"];
export const PHYSICS_SOURCE = `tiles.setTilemap(tiles.createTilemap(hex\`1000100001010101010101010101010101010101010000000000000000000000000000010100000000000000000000000000000101000000000000000000000000000001010000000000000000000000000000010100000000000101010000000000000101000000000000000000000000000001010000000000000000000000000000010100000000000000000000000000000101000000000000000000000000000001010000010100000000000000000000010100000000000000000000000000000101000000000000000000000101000001010000000000000000000000000000010100000000000000000000000000000101010101010101010101010101010101\`, img\`
2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . 2 2 2 . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . 2 2 . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . 2 2 . . 2
2 . . . . . . . . . . . . . . 2
2 . . . . . . . . . . . . . . 2
2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2
\`, [img\`0\`, img\`2\`], TileScale.Eight))
let a = sprites.create(img\`
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
7 7 7 7 7 7
\`, SpriteKind.Player)
let b = sprites.create(img\`
2 2 2 2 2
2 2 2 2 2
2 2 2 2 2
2 2 2 2 2
2 2 2 2 2
\`, SpriteKind.Enemy)
let c = sprites.create(img\`
4 4 4 4
4 4 4 4
4 4 4 4
4 4 4 4
\`, SpriteKind.Food)
let d = sprites.create(img\`
5 5 5 5
5 5 5 5
5 5 5 5
5 5 5 5
\`, SpriteKind.Projectile)
tiles.placeOnTile(a, tiles.getTileLocation(2, 2))
tiles.placeOnTile(b, tiles.getTileLocation(4, 8))
tiles.placeOnTile(c, tiles.getTileLocation(9, 3))
tiles.placeOnTile(d, tiles.getTileLocation(13, 13))
a.setVelocity(70, 45)
a.setBounceOnWall(true)
b.setVelocity(50, -30)
b.setFlag(SpriteFlag.BounceOnWall, true)
c.setVelocity(60, 20)
c.setFlag(SpriteFlag.GhostThroughWalls, true)
d.setVelocity(-55, -40)
d.setFlag(SpriteFlag.DestroyOnWall, true)
let bounces = 0
scene.onHitWall(SpriteKind.Player, function (sprite, location) {
    bounces += 1
})
let dDestroyed = 0
sprites.onDestroyed(SpriteKind.Projectile, function (sprite) {
    dDestroyed = 1
})
scene.cameraFollowSprite(a)
pause(2000)
let ax1 = a.x
let ay1 = a.y
let bx1 = b.x
let by1 = b.y
let cx1 = c.x
let cy1 = c.y
let camX1 = scene.cameraProperty(CameraProperty.X)
let camY1 = scene.cameraProperty(CameraProperty.Y)
c.setFlag(SpriteFlag.GhostThroughWalls, false)
pause(2000)
let ax2 = a.x
let ay2 = a.y
let bx2 = b.x
let by2 = b.y
let cx2 = c.x
let cy2 = c.y
let camX2 = scene.cameraProperty(CameraProperty.Left)
let camY2 = scene.cameraProperty(CameraProperty.Top)
let done = false
done = true
`;
export const PHYSICS_KEYS = ["bounces","dDestroyed","ax1","ay1","bx1","by1","cx1","cy1","camX1","camY1","ax2","ay2","bx2","by2","cx2","cy2","camX2","camY2"];
