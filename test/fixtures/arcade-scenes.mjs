// Authored scenes with generated art and maps; no private corpus assets.
import {cameraMap} from './arcade-camera.mjs';
export const SCENES_SOURCE=`${cameraMap()}
scene.setBackgroundColor(1)
let art=image.create(2,2)
art.fill(5)
let parent=sprites.create(art,SpriteKind.Player)
parent.setPosition(200,100)
scene.cameraFollowSprite(parent)
info.setScore(11)
info.setLife(7)
info.player2.setScore(21)
info.player2.setLife(9)
let pushHits=0
let popHits=0
let pushScore=-1
let popScore=-1
function installLifecycle(){
    let count=1
    game.addScenePushHandler(function(){pushHits+=count;pushScore=info.score()})
    game.addScenePopHandler(function(){popHits+=count;popScore=info.score()})
    count++
}
installLifecycle()
let parentTicks=0
let childTicks=0
game.onUpdate(function(){parentTicks++})
while(parentTicks===0){pause(5)}
let parentTickBefore=parentTicks
game.pushScene()
let childInitialCount=sprites.allOfKind(SpriteKind.Player).length
let childInitialScore=info.score()
let childInitialLife=info.life()
let childInitialPlayer2Score=info.player2.score()
let childInitialPlayer2Life=info.player2.life()
let childInitialCameraX=scene.cameraProperty(CameraProperty.X)
let childInitialBackground=scene.backgroundColor()
let retainedParentX=parent.x
let childArt=image.create(2,2)
childArt.fill(9)
let child=sprites.create(childArt,SpriteKind.Player)
child.setPosition(30,40)
scene.centerCameraAt(100,80)
scene.setBackgroundColor(2)
info.setScore(33)
info.setLife(4)
info.player2.setScore(44)
info.player2.setLife(5)
art.fill(6)
game.onUpdate(function(){childTicks++})
while(childTicks===0){pause(5)}
let parentFrozen=parentTicks===parentTickBefore
let childTickBefore=childTicks
game.popScene()
let restoredCount=sprites.allOfKind(SpriteKind.Player).length
let restoredParentIdentity=sprites.allOfKind(SpriteKind.Player)[0]===parent
let restoredScore=info.score()
let restoredLife=info.life()
let restoredPlayer2Score=info.player2.score()
let restoredPlayer2Life=info.player2.life()
let restoredCameraX=scene.cameraProperty(CameraProperty.X)
let restoredCameraY=scene.cameraProperty(CameraProperty.Y)
let restoredBackground=scene.backgroundColor()
let restoredPixel=parent.image.getPixel(0,0)
let retainedChildX=child.x
child.x=35
let mutatedPoppedChildX=child.x
while(parentTicks===parentTickBefore){pause(5)}
let parentResumed=parentTicks>parentTickBefore
let childFrozen=childTicks===childTickBefore
let scenesDone=parentFrozen && parentResumed && childFrozen`;
export const SCENES_CONTROLLER_SOURCE=`${cameraMap()}
scene.setBackgroundColor(1)
let art=image.create(4,4)
art.fill(5)
let parent=sprites.create(art,SpriteKind.Player)
parent.setPosition(200,100)
scene.cameraFollowSprite(parent)
info.setScore(11)
info.setLife(7)
let depth=0
let pushEvents=0
function watchPush(){game.addScenePushHandler(function(){pushEvents++})}
watchPush()
watchPush()
let parentTicks=0
let childTicks=0
game.onUpdate(function(){parentTicks++})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    game.pushScene()
    depth=1
    scene.setBackgroundColor(2)
    let childArt=image.create(2,2)
    childArt.fill(9)
    let child=sprites.create(childArt,SpriteKind.Player)
    child.setPosition(30,40)
    info.setScore(33)
    info.setLife(4)
    game.onUpdate(function(){childTicks++})
    controller.B.onEvent(ControllerButtonEvent.Pressed,function(){game.popScene();depth=0})
})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){parent.x+=20})`;
