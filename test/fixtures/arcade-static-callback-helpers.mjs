export const STATIC_CALLBACK_SOURCE = `namespace Helpers {
 export function repeat(handler:(value:number)=>number,times:number,start:number):number {
  let total=0
  for(let i=0;i<times;i++){total+=handler(start+i)}
  return total
 }
 export function forward(handler:(value:number)=>number,times:number,start:number):number {
  return repeat(handler,times,start)
 }
 export function recurse(handler:(value:number)=>number,depth:number):number {
  if(depth<=0){return handler(2)}
  return recurse(handler,depth-1)+handler(depth)
 }
}
let trace=0
let total=Helpers.forward(function(value:number){trace=trace*10+value;pause(1);return value*2},3,1)
function named(value:number){return value+5}
let recursive=Helpers.recurse(named,2)
function choose(first:(value:number)=>number,second:(value:number)=>number,which:boolean,value:number):number {
 if(which){return first(value)}
 return second(value)
}
let chosen=choose(named,(value:number)=>value*3,false,4)
let player=sprites.create(img\`7 7\n7 7\`,SpriteKind.Player)
player.setPosition(20,30)
let buttonResult=0
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
 buttonResult=Helpers.repeat(function(value:number){player.x+=value;return player.x},2,3)
})`;
