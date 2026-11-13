export const scalarAccessorSource=`let trace=0;
class Box {
 constructor(public n:number){}
 get value():number {trace=trace*10+1;return this.n}
 set value(v:number) {trace=trace*10+2;this.n=v}
}
function take(n:number){trace=trace*10+3;return n}
let box=new Box(2);
let first=take(box.value);
box.value=3;
let second=take(box.value);
let done=trace;`;
