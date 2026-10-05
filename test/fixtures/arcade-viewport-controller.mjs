// One billion logical pixels, authored with four actual source pixels.
export const VIEWPORT_CONTROLLER_SOURCE = `
scene.setBackgroundColor(1)
let art=image.create(2,2)
art.setPixel(0,0,5)
art.setPixel(1,0,9)
art.setPixel(0,1,2)
let actor=sprites.create(art,SpriteKind.Player)
actor.setScale(16384)
actor.left=-16304
    actor.top=-16324
let phase=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.left=-16272
    actor.top=-16324
    phase=1
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.left=-16336
    actor.top=-16324
    phase=2
})
controller.up.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.left=-16304
    actor.top=-16324
    scene.centerCameraAt(128,60)
    phase=3
})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.setFlag(SpriteFlag.RelativeToCamera,true)
    phase=4
})
controller.left.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.setFlag(SpriteFlag.RelativeToCamera,false)
    phase=5
})
controller.down.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.setFlag(SpriteFlag.RelativeToCamera,false)
    actor.left=-16304
    actor.top=-16324
    scene.centerCameraAt(80,60)
    phase=0
})
`;
