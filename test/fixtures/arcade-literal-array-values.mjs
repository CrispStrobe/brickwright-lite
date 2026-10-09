export const LITERAL_ARRAY_VALUES_SOURCE=`let calls=0
let order=0
let result=""
function element(n:number){calls++;order=order*10+n;return n}
function ignore(values:number[]){}
function join(words:string[]){return words[0]+"!"+words[1]}
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
    calls=0
    order=0
    ignore([element(1),element(2)])
    result=join(["Hi","there"])
})
let arraysReady=true`;
