// Authored public-API fixtures, generated art, no private corpus assets.
export const FRICTION_VALUES_SOURCE=`
let art=image.create(2,2)
art.fill(5)
let actor=sprites.create(art,SpriteKind.Player)
actor.fx=-10
let negativeClamp=actor.fx
actor.fy=1.234
let fractionalFy=actor.fy
actor.fx=10
let receiverCalls=0
let amountCalls=0
function owner(){receiverCalls++;return actor}
function amount(){amountCalls++;return 5}
owner().fx+=amount()
actor.fy++
let compoundFx=actor.fx
let incrementFy=actor.fy
function friction(sprite:Sprite){return sprite.fx}
let numericProcedure=friction(actor)
let aliases=[actor]
aliases[0].fx=20
let aliasFx=actor.fx
game.pushScene()
actor.fy=40
let suspendedFy=actor.fy
game.popScene()
let restoredFy=actor.fy
let frictionValuesDone=negativeClamp===0 && compoundFx===15 && numericProcedure===15 && aliasFx===20 && suspendedFy===40 && restoredFy===40 && receiverCalls===1 && amountCalls===1
`;

// Yielding updates also make the original headless simulator produce useful
// positive elapsed intervals rather than sub-2ms integer dt/2 motion steps.
export const FRICTION_MOTION_SOURCE=`
game.onUpdate(function(){pause(20)})
let yellow=image.create(2,2)
yellow.fill(5)
let blue=image.create(2,2)
blue.fill(9)
let horizontal=sprites.create(yellow,SpriteKind.Player)
let vertical=sprites.create(blue,SpriteKind.Food)
horizontal.setPosition(40,40)
vertical.setPosition(110,90)
horizontal.fx=200
vertical.fy=200
horizontal.vx=100
vertical.vy=-100
while(horizontal.vx!==0 || vertical.vy!==0){pause(5)}
let horizontalStopped=horizontal.vx===0
let verticalStopped=vertical.vy===0
let horizontalMoved=horizontal.x>40 && horizontal.x<70
let verticalMoved=vertical.y<90 && vertical.y>60
horizontal.ax=100
while(horizontal.vx<=0){pause(5)}
let accelerationOverridesFriction=horizontal.vx>0
horizontal.ax=0
while(horizontal.vx!==0){pause(5)}
let horizontalFriction=horizontal.fx
let verticalFriction=vertical.fy
let frictionMotionDone=horizontalStopped && verticalStopped && horizontalMoved && verticalMoved && accelerationOverridesFriction && horizontalFriction===200 && verticalFriction===200
`;

export const FRICTION_CONTROLLER_SOURCE=`
scene.setBackgroundColor(1)
let yellow=image.create(2,2)
yellow.fill(5)
let blue=image.create(2,2)
blue.fill(9)
let horizontal=sprites.create(yellow,SpriteKind.Player)
let vertical=sprites.create(blue,SpriteKind.Food)
horizontal.setPosition(40,40)
vertical.setPosition(110,90)
horizontal.fx=200
vertical.fy=200
let horizontalLaunches=0
let verticalLaunches=0
let horizontalDone=false
let verticalDone=false
let horizontalFinish=40
let verticalFinish=90
game.onUpdate(function(){
    if(horizontalLaunches>0 && horizontal.vx===0){horizontalDone=true;horizontalFinish=horizontal.x}
    if(verticalLaunches>0 && vertical.vy===0){verticalDone=true;verticalFinish=vertical.y}
})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    horizontal.vx=0
    horizontal.setPosition(40,40)
    horizontalDone=false
    horizontal.vx=100
    horizontalLaunches++
})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    horizontal.vx=0
    horizontal.setPosition(40,40)
    horizontalLaunches=0
    horizontalDone=false
    horizontalFinish=40
})
controller.up.onEvent(ControllerButtonEvent.Pressed,function(){
    vertical.vy=0
    vertical.setPosition(110,90)
    verticalDone=false
    vertical.vy=-100
    verticalLaunches++
})
controller.down.onEvent(ControllerButtonEvent.Pressed,function(){
    vertical.vy=0
    vertical.setPosition(110,90)
    verticalLaunches=0
    verticalDone=false
    verticalFinish=90
})
`;
