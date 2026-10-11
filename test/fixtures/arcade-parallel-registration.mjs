export const PARALLEL_REGISTRATION_SOURCE=`let trace=""
let completed=0
function launch(weight:number){
 let captured=weight
 let enabled=false
 if(false){control.runInParallel(function(){trace+="wrong"})}
 control.runInParallel(function(){
  if(enabled){
   trace+="P"+captured
   captured+=1
   pause(20)
   trace+="Q"+captured
   control.runInParallel(function(){trace+="N"+captured;captured+=1;completed+=1})
   trace+="E"+captured
  }
 })
 captured+=10
 enabled=true
 trace+="L"+captured
}
launch(2)
trace+="S"
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){launch(4)})`;
export const PARALLEL_ORACLE_INPUT=`
while(completed<1){pause(5)}
controller.A.setPressed(true)
pause(40)
controller.A.setPressed(false)
while(completed<2){pause(5)}
`;
