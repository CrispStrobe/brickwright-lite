export const CAMERA_SHAKE_SOURCE=`let hero=sprites.create(img\`2 2 2 2
2 2 2 2
2 2 2 2
2 2 2 2\`,SpriteKind.Player)
hero.setPosition(60,60)
let hud=sprites.create(img\`9 9
9 9\`,SpriteKind.Food)
hud.setFlag(SpriteFlag.RelativeToCamera,true)
hud.setPosition(10,10)
let shakes=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    scene.cameraShake(8,800)
    shakes++
})
let cameraX=scene.cameraProperty(CameraProperty.X)
let cameraY=scene.cameraProperty(CameraProperty.Y)
let shakeReady=true`;
