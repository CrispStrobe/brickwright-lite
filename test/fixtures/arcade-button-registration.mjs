export const BUTTON_REGISTRATION_SOURCE=`let trace=""
let presses=0
let releases=0
let repeated=false
let ready=false
let installs=0
function install(weight:number,event:number){
 let captured=weight
 controller.A.onEvent(ControllerButtonEvent.Pressed,function(){trace+="P"+captured;captured+=1;presses+=1})
 controller.A.onEvent(event,function(){trace+="R"+captured;releases+=1})
 captured+=1
 installs+=1
}
install(2,ControllerButtonEvent.Released)
install(6,ControllerButtonEvent.Released)
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){install(9,ControllerButtonEvent.Released)})
controller.right.onEvent(ControllerButtonEvent.Repeated,function(){repeated=true})
ready=true`;
export const BUTTON_ORACLE_INPUT=`
while(!ready){pause(5)}
controller.A.setPressed(true)
pause(40)
controller.A.setPressed(false)
while(releases<1){pause(5)}
controller.B.setPressed(true)
pause(40)
controller.B.setPressed(false)
controller.A.setPressed(true)
pause(40)
controller.A.setPressed(false)
while(releases<2){pause(5)}
controller.right.setPressed(true)
while(!repeated){pause(5)}
controller.right.setPressed(false)
`;
