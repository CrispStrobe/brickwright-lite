export const LEGACY_TILEMAP_SOURCE = `
let mapImage=img\`
1 2
2 1
\`
let exact=image.create(4,4)
exact.fill(7)
let small=img\` 5 \`
scene.setTile(1,exact,false)
scene.setTile(2,small,true)
scene.setTileMap(mapImage,TileScale.Four)
let spot=tiles.getTileLocation(1,0)
let initialWall=tiles.tileAtLocationIsWall(spot)
let initialIndex=spot.tileSet
mapImage.setPixel(1,0,1)
let aliasWall=tiles.tileAtLocationIsWall(spot)
let aliasIndex=spot.tileSet
scene.setTile(1,exact,true)
let changedWall=tiles.tileAtLocationIsWall(spot)
let invalidIndexCalls=0
function invalidIndex():number {invalidIndexCalls+=1;return 16}
scene.setTile(invalidIndex(),small,true)
let afterInvalid=tiles.tileAtLocationIsWall(spot)
scene.setTileMap(img\` 2 1 \`,TileScale.Eight)
let replacementWall=tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0))
let replacementCenter=spot.x
mapImage.fill(0)
let detachedIndex=tiles.getTileLocation(0,0).tileSet
scene.setTileMap(null)
let clearedWall=tiles.tileAtLocationIsWall(spot)
scene.setTileMap(img\` 1 2 \`,TileScale.Four)
let retainedDefinition=tiles.tileAtLocationIsWall(spot)
game.pushScene()
scene.setTileMap(img\` 1 \`,TileScale.Four)
let childUndefined=tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0))===undefined
scene.setTile(1,small,false)
let childWall=tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0))
scene.setTile(1,small,true)
let childChangedWall=tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0))
game.popScene()
let restoredWall=tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0))
let restoredIndex=tiles.getTileLocation(1,0).tileSet
scene.setTile(1,exact,false)
scene.setTile(2,small,false)
let actor=sprites.create(img\` 3 \`,SpriteKind.Player)
actor.setPosition(2,2)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
 exact.setPixel(0,0,8)
 small.setPixel(0,0,9)
 actor.x+=1
})
let legacyTilemapDone=true
`;
