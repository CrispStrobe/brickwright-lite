export const INSTANCE_REGISTRATION_SOURCE=`let trace=""
let completed=0
let finished=0
let first=sprites.create(img\`1\`,SpriteKind.Enemy)
let alias=first
function install(sprite:Sprite,weight:number){
 let captured=weight
 let enabled=false
 sprite.onDestroyed(function(){trace+="wrong"})
 sprite.onDestroyed(function(){
  if(enabled){trace+="I"+captured;captured+=1;pause(20);trace+="i"+captured}
 })
 captured+=10
 enabled=true
}
install(first,2)
first=sprites.create(img\`2\`,SpriteKind.Enemy)
sprites.onDestroyed(SpriteKind.Enemy,function(sprite:Sprite){trace+="K";completed+=1})
alias.destroy()
trace+="X"
alias.destroy()
finished=1
install(first,4)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){first.destroy();trace+="Y";finished=2})`;
export const INSTANCE_ORACLE_INPUT=`
while(finished<1){pause(5)}
controller.A.setPressed(true)
pause(40)
controller.A.setPressed(false)
while(finished<2){pause(5)}
`;

