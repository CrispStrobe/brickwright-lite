export const LEGACY_TILE_VALUES_SOURCE=`
scene.placeOnRandomTile(null,1)
let empty=scene.getTilesByType(1).length
let emptySpot=scene.getTile(1,0)
let emptyX=emptySpot.x
let mapImage=img\`
1 2 1
1 1 3
\`
scene.setTileMap(mapImage,TileScale.Eight)
let spots=scene.getTilesByType(1)
let count=spots.length
let firstX=spots[0].x
let firstY=spots[0].y
let secondX=spots[1].x
let secondY=spots[1].y
let thirdX=spots[2].x
let thirdY=spots[2].y
let fourthX=spots[3].x
let fourthY=spots[3].y
let fresh=scene.getTile(0,0)!==spots[0]
let freshList=scene.getTilesByType(1)!==spots
let freshElement=scene.getTilesByType(1)[0]!==spots[0]
let invalidCount=scene.getTilesByType(16).length
let fractionalCount=scene.getTilesByType(1.5).length
function forward(tile:tiles.Tile):tiles.Tile {return tile}
function arrayForward(values:tiles.Tile[]):tiles.Tile[] {return values}
let retained=forward(arrayForward(spots)[3])
let retainedIndex=retained.tileSet
scene.setTileAt(retained,4)
let changedIndex=retained.tileSet
let changedPixel=mapImage.getPixel(2,0)
scene.setTileAt(retained,16)
let afterInvalid=retained.tileSet
let outside=scene.getTile(-1,0)
scene.setTileAt(outside,7)
let outsideIndex=outside.tileSet
let actor=sprites.create(img\` 5 5
5 5 \`,SpriteKind.Player)
let order=0
function tileOperand():tiles.Tile {order=order*10+1;return retained}
function spriteOperand():Sprite {order=order*10+2;return actor}
scene.place(tileOperand(),spriteOperand())
let sceneOrder=order
order=0
tileOperand().place(spriteOperand())
let methodOrder=order
let sumX=0
for(let cell of spots){sumX+=cell.x}
let picked=spots._pickRandom()
let pickedMember=spots.indexOf(picked)>=0
let placedX=actor.x
let placedY=actor.y
spots[1].place(actor)
let methodX=actor.x
let methodY=actor.y
scene.placeOnRandomTile(actor,3)
let randomX=actor.x
let randomY=actor.y
scene.placeOnRandomTile(actor,15)
let noMatchX=actor.x
let noMatchY=actor.y
game.pushScene()
let childImage=img\`
1 1
1 1
\`
scene.setTileMap(childImage,TileScale.Sixteen)
let childRetainedX=retained.x
let childRetainedY=retained.y
scene.setTileAt(retained,6)
let childPixel=childImage.getPixel(1,0)
let originalRetainedIndex=retained.tileSet
game.popScene()
let restoredIndex=retained.tileSet
scene.setTileMap(img\` 2 2 2 \`,TileScale.Four)
let rescaledX=retained.x
let replacedIndex=retained.tileSet
scene.setTileMap(null,TileScale.Eight)
let disabledX=retained.x
scene.setTileMap(img\` 1 1 1 \`,TileScale.Four)
scene.place(retained,actor)
let placementBefore=actor.x
let editBefore=retained.tileSet
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
 scene.setTileAt(retained,9)
 retained.place(actor)
 actor.x+=1
})
let legacyTileValuesDone=true
`;
