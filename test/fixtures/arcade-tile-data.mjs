// Authored tile data fixture; no private corpus source or assets.
export const TILE_DATA_SOURCE = `let absent=tiles.getTileLocation(1,0)
let absentNull=absent===null
let red=img\`2\`
let blue=img\`7\`
tiles.setTilemap(tiles.createTilemap(hex\`03000200010201020102\`,img\`0 2 0
0 0 0\`,[img\`0\`,img\`2\`,img\`7\`],TileScale.Eight))
let locations=tiles.getTilesByType(red)
let another=tiles.getTilesByType(red)
let arrayFresh=locations!==another
let locationFresh=locations[0]!==another[0]
let count=locations.length
let order=0
for(let location of locations){order=order*100+location.column*10+location.row}
let spot=tiles.getTileLocation(1,0)
let spotAlias=spot
let spotFresh=tiles.getTileLocation(1,0)!==spot
let aliasSame=spotAlias===spot
function echoTile(location:tiles.Location){return location}
function tileCenter(location:tiles.Location){return location.x}
let procedureSame=echoTile(spot)===spot
let procedureCenter=tileCenter(spot)
let col=spot.column
let row=spot.row
let centerX=spot.x
let centerY=spot.y
let initialWall=tiles.tileAtLocationIsWall(spot)
tiles.setWallAt(spot,false)
let clearWall=tiles.tileAtLocationIsWall(spot)
tiles.setWallAt(spot,true)
let setWall=tiles.tileAtLocationIsWall(spot)
let redBefore=tiles.tileAtLocationEquals(spot,red)
tiles.setTileAt(spot,red)
let redAfter=tiles.tileAtLocationEquals(spot,red)
let blueAfter=tiles.tileAtLocationEquals(spot,blue)
let countAfter=tiles.getTilesByType(red).length
let snapshotCount=locations.length
let cloneCount=tiles.getTilesByType(red.clone()).length
let actor=sprites.create(img\`5\`,SpriteKind.Player)
let livePlayers=sprites.allOfKind(SpriteKind.Player).length
tiles.placeOnTile(actor,spot)
let actorX=actor.x
let actorY=actor.y
let off=tiles.getTileLocation(-1,0)
let offWall=tiles.tileAtLocationIsWall(off)
tiles.setWallAt(off,false)
let offWallStill=tiles.tileAtLocationIsWall(off)
tiles.setTileAt(off,blue)
let countOff=tiles.getTilesByType(red).length
tiles.setTilemap(tiles.createTilemap(hex\`03000200020202020202\`,img\`0 0 0
0 0 0\`,[img\`0\`,img\`2\`,img\`7\`],TileScale.Sixteen))
let retainedX=spot.x
let retainedY=spot.y
let retainedBlue=tiles.tileAtLocationEquals(spot,blue)
let retainedWall=tiles.tileAtLocationIsWall(spot)
let nowRedCount=tiles.getTilesByType(red).length
let snapshotCountAfter=locations.length
let snapshotX=locations[2].x
let tileDataDone=tiles.getTileLocation(0,0).column===0
`;

export const TILE_CLEAR_SOURCE = `scene.setBackgroundImage(img\`5 7\`)
let savedBackground=scene.backgroundImage()
tiles.setTilemap(tiles.createTilemap(hex\`020001000101\`,img\`0 2\`,[img\`0\`,img\`2\`],TileScale.Eight))
let retained=tiles.getTileLocation(1,0)
let initialCenter=retained.x
let beforeWall=tiles.tileAtLocationIsWall(retained)
tiles.setTilemap(null)
let afterCenter=retained.x
let afterRow=retained.row
let afterWall=tiles.tileAtLocationIsWall(retained)
let fresh=tiles.getTileLocation(1,0)
let freshNull=fresh===null
let freshCenter=fresh.x
let identity=retained!==fresh
let actor=sprites.create(img\`1\`,SpriteKind.Player)
tiles.placeOnTile(actor,retained)
let placedX=actor.x
let placedY=actor.y
let pixelAfterClear=savedBackground.getPixel(1,0)
let sameBackground=scene.backgroundImage()===savedBackground
let tileClearDone=tiles.getTileLocation(0,0).column===0
`;
