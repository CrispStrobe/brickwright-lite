export const SPRITE_LAYER_ROUTING_SOURCE=`let front=sprites.create(img\`2 2 2
2 2 2
2 2 2\`,SpriteKind.Player)
let back=sprites.create(img\`5 5 5
5 5 5
5 5 5\`,SpriteKind.Enemy)
front.setPosition(80,60)
back.setPosition(80,60)
front.z=1
back.z=0
let layerReady=true
let layerPhase=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){front.z=-1;layerPhase=1})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){front.z=2;layerPhase=2})`;
