// Images are authored through Code operations, including the GUI asset path.
export const SCALING_CONTROLLER_SOURCE = `
scene.setBackgroundColor(1)
let yellow=image.create(4,4)
yellow.fill(5)
let actor=sprites.create(yellow,SpriteKind.Player)
actor.setPosition(32,32)
let phase=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.scale=1
    actor.setPosition(32,32)
    actor.setScale(2)
    phase=1
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.scale=1
    actor.setPosition(32,32)
    actor.sx=2
    actor.sy=1
    phase=2
})
controller.up.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.scale=1
    actor.setPosition(32,32)
    actor.setScale(2,ScaleAnchor.TopLeft)
    phase=3
})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.scale=1
    actor.setPosition(32,32)
    actor.changeScale(0.5,ScaleAnchor.BottomRight)
    phase=4
})
controller.left.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.scale=1
    actor.setPosition(32,32)
    actor.sx=0
    phase=5
})
controller.down.onEvent(ControllerButtonEvent.Pressed,function(){
    actor.scale=1
    actor.setPosition(32,32)
    phase=0
})
`;
