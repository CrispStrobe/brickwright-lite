export const SPRITE_REGISTRATION_SOURCE=`let trace=""
let completed=0
let destroyed=0
function install(weight:number){
 let captured=weight
 sprites.onDestroyed(SpriteKind.Food,function(sprite:Sprite){
  trace+="D"+captured+":"+sprite.x
  captured+=1
  pause(20)
  trace+="d"+captured
  destroyed+=1
 })
 sprites.onDestroyed(SpriteKind.Food,function(sprite:Sprite){trace+="B"+captured;captured+=2;destroyed+=1})
 sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(player:Sprite,food:Sprite){
  player.setFlag(SpriteFlag.GhostThroughSprites,true)
  trace+="O"+captured
  captured+=1
  pause(20)
  food.destroy()
  trace+="X"+captured
  completed+=1
 })
 captured+=10
}
install(2)
let hero=sprites.create(img\`2\`,SpriteKind.Player)
hero.setPosition(20,20)
function feed(){let food=sprites.create(img\`5\`,SpriteKind.Food);food.setPosition(20,20);hero.setFlag(SpriteFlag.GhostThroughSprites,false)}
feed()
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){feed()})`;
export const SPRITE_ORACLE_INPUT=`
while(completed<1){pause(5)}
controller.A.setPressed(true)
pause(40)
controller.A.setPressed(false)
while(completed<2){pause(5)}
`;
