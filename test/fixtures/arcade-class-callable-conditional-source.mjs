export const source=`class State {
 value:number;display:number;image:number;tick:()=>void;
 constructor(){this.value=1;this.display=0;this.image=0;this.tick=()=>{this.display+=1;};}
 updateDisplay(){this.tick();} updateImage(){this.image+=1;}
}
class Holder {
 state:State;
 constructor(state:State,enabled:boolean){if(enabled){this.state=state;}}
 apply<T>(action:(state:State)=>T):T{
  const saved=this.state;
  if(saved){const result=action(saved);saved.updateDisplay();saved.updateImage();return result;}
  return undefined;
 }
}
let state=new State();let present=new Holder(state,true);let absent=new Holder(state,false);
let numberResult=present.apply((state:State)=>{state.value+=2;return state.value;});
let textResult=present.apply((state:State)=>"ok");
let voidResult=present.apply((state:State)=>{state.value+=1;});
let absentResult=absent.apply((state:State)=>state.value);`;

// Effect-only Void action matches the stored setter callback use. A module cell
// holding Void requires a separate declaration/export domain and is retained above.
export const effectSource=source.replace("let voidResult=", "");
