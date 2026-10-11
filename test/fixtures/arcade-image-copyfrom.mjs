export const IMAGE_COPY_SOURCE = `let art=img\`2 2 2
2 2 2\`
let sourceArt=img\`. 7 .
7 . 7\`
let actor=sprites.create(art,SpriteKind.Player)
actor.setPosition(80,60)
let copyReady=true
let copyPhase=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
 actor.image.copyFrom(sourceArt)
 copyPhase=1
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
 actor.image.copyFrom(image.create(1,1))
 copyPhase=2
})`;
