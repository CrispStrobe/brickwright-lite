export const SIGN_NUMBER_SOURCE=`let actor=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
actor.setPosition(80,60)
let calls=0
function next(){calls++;return -5.5}
let sample=Math.sign(next())
let signReady=true
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){sample=Math.sign(next());actor.x+=sample*4})`;
