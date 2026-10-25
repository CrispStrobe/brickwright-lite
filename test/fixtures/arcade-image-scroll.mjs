export const IMAGE_SCROLL_SOURCE=`let art=img\`2 . .
. 5 .
. . 7\`
let actor=sprites.create(art,SpriteKind.Player)
actor.setPosition(80,60)
let initialPixel=actor.image.getPixel(0,0)
let scrollReady=true
let scrollPhase=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){actor.image.scroll(1,0);scrollPhase=1})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){actor.image.scroll(0,-1);scrollPhase=2})`;
