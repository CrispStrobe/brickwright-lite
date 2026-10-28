// Independently authored finite programs; randint uses actual unchanged RNG.
export const randintCases = {
 early: {source:'function before(){return value===undefined}let early=before();let value=randint(2,2);let alias=value;let result=alias|0;early=!!early;result+=0;',expected:{early:true,value:2,result:2}},
 typed: {source:'let trace=0;function tap(n:number){trace=trace*10+n;return n}function encode(x:number,y:number){return (x<<8)|y}let x=randint(tap(2),tap(2));let y=randint(tap(3),tap(3));let result=encode(x,y);let masked=y&255;let inverted=~x;trace+=0;result+=0;masked+=0;inverted+=0;',expected:{trace:2233,result:515,masked:3,inverted:-3}},
 bounds: {source:'let valid=true;let count=0;for(let i=0;i<32;i++){let value=randint(-2,3);if(value<-2||value>3||value%1!==0)valid=false;count+=1}valid=!!valid;count+=0;',expected:{valid:true,count:32}}
};
