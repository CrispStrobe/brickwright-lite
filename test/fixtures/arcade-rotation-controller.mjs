// Dynamic images keep this Code-entry fixture independent of hidden asset injection.
export const ROTATION_CONTROLLER_SOURCE = `
scene.setBackgroundColor(1)
let art=image.create(3,2)
art.setPixel(0,0,2)
art.setPixel(1,0,5)
art.setPixel(2,0,9)
art.setPixel(0,1,7)
art.setPixel(1,1,8)
art.setPixel(2,1,10)
let actor=sprites.create(art,SpriteKind.Player)
actor.setScale(8)
actor.rotationDegrees=0
actor.setPosition(80,60)
actor.data="ready"
let phase=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.rotationDegrees=90
    actor.data="quarter"
    phase=1
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.rotationDegrees=180
    actor.data="half"
    phase=2
})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.rotation=0.6
    actor.setScale(4096)
    actor.left=80-actor.width/2
    actor.top=60-actor.height/2
    actor.data="huge"
    phase=3
})
controller.down.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.setScale(8)
    actor.rotationDegrees=0
    actor.setPosition(80,60)
    actor.data="ready"
    phase=0
})
`;
