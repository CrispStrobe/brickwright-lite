export const FOREVER_REGISTRATION_SOURCE=`let trace=""
let runs=0
function install(weight:number){
 let captured=weight
 let pending=true
 forever(function(){
  if(pending){pending=false;trace+="S"+captured;pause(20);captured+=1;trace+="E"+captured;runs+=1}
 })
 captured+=10
}
install(2)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){install(4)})`;

export const FOREVER_ORACLE_INPUT=`
while(runs<1){pause(5)}
controller.A.setPressed(true)
pause(40)
controller.A.setPressed(false)
while(runs<2){pause(5)}
`;
