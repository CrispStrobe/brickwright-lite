// Authored sources and generated art; no private corpus assets.
import {TERRAIN_MAP} from './arcade-terrain.mjs';

// The unthrottled original headless simulator can produce sub-2ms frames;
// its integer dt/2 then integrates zero motion. A normal yielding update
// makes these real public-API fixtures exercise positive frame intervals.
const pacedFrame='game.onUpdate(function(){pause(20)})\n';

export const MULTI_MOVER_SOURCE=`${pacedFrame}
let art=image.create(8,8)
art.fill(5)
let first=sprites.create(art,SpriteKind.Player)
let second=sprites.create(art,SpriteKind.Food)
first.setPosition(20,40)
second.setPosition(80,40)
let sameFirst=false
let sameSecond=false
let firstPixel=-1
let secondPixel=-1
let met=false
sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(a,b){
    sameFirst=a===first
    sameSecond=b===second
    firstPixel=a.image.getPixel(0,0)
    secondPixel=b.image.getPixel(0,0)
    a.vx=0
    b.vx=0
    met=true
})
first.vx=500
second.vx=-500
while(!met){pause(5)}
let firstStopped=first.vx===0
let secondStopped=second.vx===0
let multiMoverDone=sameFirst && sameSecond && firstStopped && secondStopped
`;

export const TRANSPARENT_PIXEL_SOURCE=`${pacedFrame}
let diagonal=image.create(4,4)
diagonal.setPixel(0,0,5)
diagonal.setPixel(3,3,5)
let antiDiagonal=image.create(4,4)
antiDiagonal.setPixel(3,0,9)
antiDiagonal.setPixel(0,3,9)
let first=sprites.create(diagonal,SpriteKind.Player)
let second=sprites.create(antiDiagonal,SpriteKind.Food)
first.setPosition(40,40)
second.setPosition(40,40)
let disjointPixels=first.overlapsWith(second)
let eventSeen=false
let callbackIdentity=false
let callbackMask=false
let observations=0
sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(a,b){
    callbackIdentity=a===first && b===second
    callbackMask=a.overlapsWith(b)
    eventSeen=true
})
game.onUpdate(function(){observations++})
while(observations<3){pause(5)}
let noSpuriousEvent=!eventSeen
second.x-=3
let sharedPixels=first.overlapsWith(second)
while(!eventSeen){pause(5)}
let transparentDone=!disjointPixels && noSpuriousEvent && sharedPixels && callbackIdentity && callbackMask
`;

export const WALL_PEER_MUTATION_SOURCE=`${TERRAIN_MAP}
${pacedFrame}let art=image.create(2,2)
art.fill(5)
let first=sprites.create(art,SpriteKind.Player)
let second=sprites.create(art,SpriteKind.Player)
first.setPosition(31,12)
second.setPosition(10,20)
let peerAtWall=-1
let wallColumn=-1
let stoppedPeer=false
scene.onHitWall(SpriteKind.Player,function(sprite,location){
    if(sprite===first){
        peerAtWall=second.x
        wallColumn=location.column
        second.vx=0
        sprite.vx=0
        stoppedPeer=true
    }
})
first.vx=500
second.vx=500
while(!stoppedPeer){pause(5)}
let firstX=first.x
let peerX=second.x
let firstVx=first.vx
let peerVx=second.vx
let wallPeerDone=stoppedPeer && firstX===31 && peerX===10 && firstVx===0 && peerVx===0
`;

// A launches a fast pass through a stationary target; B resets it. Up and Down
// switch the sparse images between pixel overlap and disjoint pixel masks.
export const multiPhysicsControllerSource=(targetWidth=8)=>`
scene.setBackgroundColor(1)
let art=image.create(2,2)
art.fill(5)
// The controller defaults to a wide target for variable desktop frame rates.
let targetArt=image.create(${targetWidth},2)
targetArt.fill(9)
let mover=sprites.create(art,SpriteKind.Player)
let target=sprites.create(targetArt,SpriteKind.Food)
mover.setPosition(60,40)
target.setPosition(68,40)
let fastOverlapSeen=false
let endFrameTouching=false
let passes=0
let diagonal=image.create(4,4)
diagonal.setPixel(0,0,7)
diagonal.setPixel(3,3,7)
let antiDiagonal=image.create(4,4)
antiDiagonal.setPixel(3,0,2)
antiDiagonal.setPixel(0,3,2)
let sparseFirst=sprites.create(diagonal,SpriteKind.Enemy)
let sparseSecond=sprites.create(antiDiagonal,SpriteKind.Projectile)
sparseFirst.setPosition(110,80)
sparseSecond.setPosition(110,80)
let pixelMaskTouch=sparseFirst.overlapsWith(sparseSecond)
sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(first,second){
    if(!fastOverlapSeen){
        first.vx=0
        fastOverlapSeen=true
        endFrameTouching=first.overlapsWith(second)
        passes++
    }
})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    mover.vx=0
    mover.setPosition(60,40)
    target.setPosition(68,40)
    fastOverlapSeen=false
    endFrameTouching=false
    mover.vx=500
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    mover.vx=0
    mover.setPosition(60,40)
    fastOverlapSeen=false
    endFrameTouching=false
})
controller.up.onEvent(ControllerButtonEvent.Pressed,function(){
    sparseSecond.x=sparseFirst.x-3
    pixelMaskTouch=sparseFirst.overlapsWith(sparseSecond)
})
controller.down.onEvent(ControllerButtonEvent.Pressed,function(){
    sparseSecond.x=sparseFirst.x
    pixelMaskTouch=sparseFirst.overlapsWith(sparseSecond)
})
`;

export const MULTI_PHYSICS_CONTROLLER_SOURCE=multiPhysicsControllerSource();

// Explicit overlap queries retain Sprite and live Image references across
// scene transitions even when the queried sprite is outside the active world.
export const RETAINED_SPRITE_QUERY_SOURCE=`
let parentArt=image.create(1,1)
parentArt.fill(5)
let parent=sprites.create(parentArt,SpriteKind.Player)
parent.setPosition(10,10)
game.pushScene()
let childArt=image.create(1,1)
childArt.fill(9)
let child=sprites.create(childArt,SpriteKind.Food)
child.setPosition(10,10)
let hiddenParentTouch=parent.overlapsWith(child)
parentArt.fill(0)
let hiddenParentEmpty=parent.overlapsWith(child)
parentArt.fill(2)
let hiddenParentRestored=parent.overlapsWith(child)
game.popScene()
let poppedChildTouch=child.overlapsWith(parent)
childArt.fill(0)
let poppedChildEmpty=child.overlapsWith(parent)
childArt.fill(9)
let poppedChildRestored=child.overlapsWith(parent)
let activeFoodCount=sprites.allOfKind(SpriteKind.Food).length
let retainedQueriesDone=hiddenParentTouch && !hiddenParentEmpty && hiddenParentRestored && poppedChildTouch && !poppedChildEmpty && poppedChildRestored && activeFoodCount===0
`;
