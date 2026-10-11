export const INFO_REGISTRATION_SOURCE=`let trace=""
let lifeHits=0
let secondHits=0
let timerHits=0
let lifeNow=0
let secondNow=0
let ready=false
let initialHasLife=info.hasLife()
function install(weight:number){
 let captured=weight
 info.onLifeZero(function(){trace+="L"+captured;captured+=1;lifeHits+=1;info.setLife(2)})
 info.player2.onLifeZero(function(){trace+="M"+captured;secondHits+=1;info.player2.setLife(3)})
 info.onCountdownEnd(function(){trace+="T"+captured;timerHits+=1;lifeNow=info.life();secondNow=info.player2.life();ready=true})
 captured+=1
}
install(2)
install(8)
info.setLife(0)
info.player2.setLife(-1)
info.startCountdown(0.08)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){ready=false;info.setLife(0);info.player2.setLife(0);info.startCountdown(0.08)})`;
