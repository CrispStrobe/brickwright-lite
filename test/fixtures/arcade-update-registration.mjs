export const UPDATE_REGISTRATION_SOURCE=`let order=""
let sum=0
let period=100
let intervalRuns=0
let completedIntervals=0
let runs=0
function install(weight:number){
 let captured=weight
 let first=false
 let second=false
 game.onUpdate(function(){
  if(!first){first=true;order+="A";sum+=captured;captured+=1;pause(20);order+="a"}
 })
 game.onUpdate(function(){
  if(!second){second=true;order+="B";sum+=captured;completedIntervals=intervalRuns;runs+=1}
 })
 captured+=10
}
game.onUpdateInterval(period,function(){if(intervalRuns===0){order+="I"}intervalRuns+=1})
period=1
install(2)
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){install(4)})`;
