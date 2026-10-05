import {TERRAIN_MAP} from './arcade-terrain.mjs';
// Authored sources only. Observe callback state/order rather than frame timing.
export const TERRAIN_EVENTS_SOURCE = `${TERRAIN_MAP}
let hero=sprites.create(img\`5 5
5 5\`,SpriteKind.Player)
hero.setPosition(30,12)
let wallOrder=""
let wallCount=0
let wallColumn=0
let wallRow=0
let entryX=0
let sawContact=false
let afterPause=false
let secondSawVelocity=false
function install(amount:number){
    let captured=amount
    scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){
        wallOrder+="A"
        wallCount+=captured
        captured+=1
        wallColumn=location.column
        wallRow=location.row
        entryX=sprite.x
        sawContact=sprite.isHittingTile(CollisionDirection.Right)
        sprite.vx=-40
        pause(20)
        afterPause=sprite.vx===-40
    })
    captured+=10
}
install(2)
scene.onHitWall(SpriteKind.Player,function(sprite:Sprite,location:tiles.Location){
    wallOrder+="B"
    secondSawVelocity=sprite.vx===-40
    sprite.vx=0
})
hero.vx=50
hero.x=32
let returnedAfterHandlers=wallOrder==="AB"&&afterPause&&secondSawVelocity
let finalWallVelocity=hero.vx
hero.setPosition(20,12)
let empty=img\`0\`
let tileOrder=""
let tileColumn=0
let tileRow=0
let sameLocation=false
let savedLocation:tiles.Location=null
scene.onOverlapTile(SpriteKind.Player,empty,function(sprite:Sprite,location:tiles.Location){
    tileOrder+="C"
    savedLocation=location
    tileColumn=location.column
    tileRow=location.row
    sprite.setFlag(SpriteFlag.GhostThroughTiles,true)
})
scene.onOverlapTile(SpriteKind.Player,empty.clone(),function(sprite:Sprite,location:tiles.Location){
    tileOrder+="D"
    sameLocation=location===savedLocation
})
hero.setFlag(SpriteFlag.GhostThroughTiles,false)
hero.x+=1
let tileReturnedAfterHandlers=tileOrder==="CD"
let eventsDone=returnedAfterHandlers&&tileReturnedAfterHandlers`;

export const TERRAIN_EVENTS_CONTROLLER_SOURCE = `${TERRAIN_MAP}
let art=image.create(2,2)
art.fill(5)
let hero=sprites.create(art,SpriteKind.Player)
hero.setPosition(20,12)
let wallOrder=""
let wallCount=0
let wallColumn=-1
let wallRow=-1
let sawContact=false
let afterPause=false
let secondSawVelocity=false
let empty=image.create(1,1)
let tileOrder=""
let tileColumn=-1
let tileRow=-1
let sameLocation=false
let savedLocation:tiles.Location=null
scene.onHitWall(SpriteKind.Player,function(sprite,location){
    wallOrder+="A"
    wallCount++
    wallColumn=location.column
    wallRow=location.row
    sawContact=sprite.isHittingTile(CollisionDirection.Right)
    sprite.vx=-40
    pause(20)
    afterPause=sprite.vx===-40
})
scene.onHitWall(SpriteKind.Player,function(sprite,location){
    wallOrder+="B"
    secondSawVelocity=sprite.vx===-40
    sprite.vx=0
})
scene.onOverlapTile(SpriteKind.Player,empty,function(sprite,location){
    tileOrder+="C"
    savedLocation=location
    tileColumn=location.column
    tileRow=location.row
    sprite.setFlag(SpriteFlag.GhostThroughTiles,true)
})
scene.onOverlapTile(SpriteKind.Player,empty.clone(),function(sprite,location){
    tileOrder+="D"
    sameLocation=location===savedLocation
})
hero.setFlag(SpriteFlag.GhostThroughTiles,true)
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){hero.vx=60})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    hero.setFlag(SpriteFlag.GhostThroughTiles,false)
    hero.x-=1
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    hero.vx=0
    hero.setFlag(SpriteFlag.GhostThroughTiles,true)
    hero.setPosition(20,12)
})`;
