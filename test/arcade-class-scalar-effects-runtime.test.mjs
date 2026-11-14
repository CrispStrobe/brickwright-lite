import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {scalarAccessorSource} from './fixtures/arcade-class-scalar-effects.mjs';

const orderedSource=scalarAccessorSource.replace('let done=trace;',`function pair(a:number,b:number){trace=trace*10+4;return a*10+b}
 let combined=pair(box.value,box.value);
 let skipped=false&&take(box.value);
 let done=trace;`);
const earlierReadSource=`let trace=0;
 class Box{constructor(public n:number){}
 get value():number{trace=trace+1;return this.n}}
 function pair(a:number,b:number){return a*10+b}
 let box=new Box(2);let combined=pair(trace,box.value);
 let added=trace+box.value;let done=trace;`;
const compoundSource=`let trace=0;
 class Box{constructor(public n:number,public m:number){}
 get value():number{trace=trace*10+1;return -(this.n*2)+this.m+1}}
 function pair(a:number,b:number){trace=trace*10+2;return a*10+b}
 function take(n:number){return n}
 let box=new Box(2,8);let first=take(box.value);
 let combined=pair(box.value,box.value);let earlier=trace+box.value;
 let skipped=false&&take(box.value);box.n=1e308;box.m=1e308;
 let infinite=take(box.value)<-1e308;box.n=0;box.m=0;
 let recovered=take(box.value);let done=trace;`;
const compoundNonfiniteSource=`class Box{constructor(public n:number){}
 get value():number{return this.n*1e308-this.n*1e308}}
 function take(n:number){return n}
 let box=new Box(1e308);let result=take(box.value);let nan=result!==result;let done=nan;`;
const overflowSource=`let trace=0;
 class Box{constructor(public n:number){}
 get value():number{trace=1e308*1e308;return this.n}
 set value(v:number){trace=trace-trace;this.n=v}}
 function take(n:number){return n}
 let box=new Box(2);let first=take(box.value);let infinite=trace>1e308;
 box.value=3;let nan=trace!==trace;let done=nan;`;
const compoundSetterSource=`let trace=0;
 class Box{constructor(public n:number,public m:number){}
 get value():number{trace=trace*10+1;return this.n}
 set value(v:number){trace=trace*10+2;this.n=(v+this.n)*this.m}}
 function argument():number{trace=trace*10+4;return 4}
 function take(n:number){trace=trace*10+3;return n}
 let box=new Box(2,3);let argumentValue=argument();box.value=argumentValue;let first=take(box.value);
 let earlier=trace+box.value;box.value=1;let second=take(box.value);let done=trace;`;
const compoundSetterNonfiniteSource=`class Box{constructor(public n:number){}
 get value():number{return this.n}
 set value(v:number){this.n=v*1e308-v*1e308}}
 function take(n:number){return n}
 let box=new Box(2);box.value=1e308;let result=take(box.value);let nan=result!==result;
 box.value=0;let recovered=take(box.value);let done=nan;`;
const compoundConstructorSource=`let trace=0;
 class Box{n:number;m:number;constructor(a:number,b:number){this.n=-(a*2)+b+1;this.m=(a+b)*2}
 get value():number{trace=trace*10+1;return this.n+this.m}}
 function argument():number{trace=trace*10+2;return 2}
 function take(n:number){return n}
 let actual=argument();let box=new Box(actual,8);let first=take(box.value);
 let earlier=trace+box.value;let other=new Box(4,9);let second=take(other.value);let done=trace;`;
const compoundConstructorNonfiniteSource=`class Box{n:number;constructor(a:number,b:number){this.n=-(a*1e308)+b*1e308}
 get value():number{return this.n}}
 function take(n:number){return n}
 let infiniteBox=new Box(1e308,0);let infinite=take(infiniteBox.value)<-1e308;
 let nanBox=new Box(1e308,1e308);let result=take(nanBox.value);let nan=result!==result;
 let finiteBox=new Box(0,0);let recovered=take(finiteBox.value);let done=nan;`;
const bitwiseGetterSource=`let trace=0;
 class Box{constructor(public n:number){}
 get value():number{trace=trace+1;return ~(this.n*2)}}
 function pair(a:number,b:number){return a*10+b}
 function take(n:number){return n}
 let box=new Box(2.75);let first=take(box.value);let ordered=pair(trace,box.value);
 box.n=1073741823.5;let signedMinimum=take(box.value);
 box.n=1073741824;let signedMaximum=take(box.value);
 box.n=2147483648;let wrapped=take(box.value);
 box.n=1e308;let infinite=take(box.value);
 box.n=-2.75;let negative=take(box.value);let done=trace;`;
const bitwiseNaNGetterSource=`class Box{constructor(public n:number){}
 get value():number{return ~(this.n*1e308-this.n*1e308)}}
 function take(n:number){return n}
 let box=new Box(1e308);let nanOperand=take(box.value);
 box.n=0;let recovered=take(box.value);let done=recovered;`;
const bitwiseConstructorSource=`let trace=0;
 class Box{n:number;constructor(a:number,b:number){this.n=~(a*2)+b}
 get value():number{trace=trace+1;return this.n}}
 function argument():number{trace=trace+2;return 2.75}
 function pair(a:number,b:number){return a*10+b}
 function take(n:number){return n}
 let actual=argument();let box=new Box(actual,0);let first=take(box.value);
 let ordered=pair(trace,box.value);
 let low=new Box(1073741823.5,0);let signedMinimum=take(low.value);
 let high=new Box(1073741824,0);let signedMaximum=take(high.value);
 let wrap=new Box(2147483648,0);let wrapped=take(wrap.value);
 let huge=new Box(1e308,0);let infinite=take(huge.value);
 let neg=new Box(-2.75,0);let negative=take(neg.value);let done=trace;`;
const bitwiseNaNConstructorSource=`class Box{n:number;constructor(a:number,b:number){this.n=~(a*1e308-b*1e308)}
 get value():number{return this.n}}
 function take(n:number){return n}
 let nanBox=new Box(1e308,1e308);let nanOperand=take(nanBox.value);
 let zeroBox=new Box(0,0);let recovered=take(zeroBox.value);let done=recovered;`;
const bitwiseSetterSource=`let trace=0;
 class Box{constructor(public n:number){}
 get value():number{trace=trace+1;return this.n}
 set value(v:number){trace=trace+1;this.n=~(v+this.n)}}
 function argument():number{trace=trace+10;return 3.75}
 function pair(a:number,b:number){return a*10+b}
 function take(n:number){return n}
 let box=new Box(2.75);let actual=argument();box.value=actual;
 let first=take(box.value);let ordered=pair(trace,box.value);
 box.n=2147483647;box.value=0;let signedMinimum=take(box.value);
 box.n=2147483648;box.value=0;let signedMaximum=take(box.value);
 box.n=4294967296;box.value=0;let wrapped=take(box.value);
 box.n=1e308;box.value=1e308;let infinite=take(box.value);
 box.n=-2.75;box.value=0;let negative=take(box.value);let done=trace;`;
const bitwiseNaNSetterSource=`class Box{constructor(public n:number){}
 get value():number{return this.n}
 set value(v:number){this.n=~(v*1e308-this.n*1e308)}}
 function take(n:number){return n}
 let box=new Box(1e308);box.value=1e308;let nanOperand=take(box.value);
 box.n=0;box.value=0;let recovered=take(box.value);let done=recovered;`;
for(const [name,source,expected]of [
 ['bitwise setter',bitwiseSetterSource,{first:-7,ordered:113,signedMinimum:-2147483648,signedMaximum:2147483647,wrapped:-1,infinite:-1,negative:1,trace:23,done:23}],
 ['bitwise NaN setter',bitwiseNaNSetterSource,{nanOperand:-1,recovered:-1,done:-1}],
 ['bitwise constructor',bitwiseConstructorSource,{first:-6,ordered:24,signedMinimum:-2147483648,signedMaximum:2147483647,wrapped:-1,infinite:-1,negative:4,trace:9,done:9}],
 ['bitwise NaN constructor',bitwiseNaNConstructorSource,{nanOperand:-1,recovered:-1,done:-1}],
 ['bitwise getter',bitwiseGetterSource,{first:-6,ordered:4,signedMinimum:-2147483648,signedMaximum:2147483647,wrapped:-1,infinite:-1,negative:4,trace:7,done:7}],
 ['bitwise NaN getter',bitwiseNaNGetterSource,{nanOperand:-1,recovered:-1,done:-1}],
 ['compound constructor',compoundConstructorSource,{first:25,earlier:46,second:28,trace:2111,done:2111}],
 ['compound constructor nonfinite',compoundConstructorNonfiniteSource,{infinite:true,nan:true,recovered:0,done:true}],
 ['compound setter',compoundSetterSource,{first:18,earlier:4231,second:57,trace:42131213,done:42131213}],
 ['compound setter NaN',compoundSetterNonfiniteSource,{nan:true,recovered:0,done:true}],
 ['compound getter',compoundSource,{first:5,combined:55,earlier:1117,skipped:false,infinite:true,recovered:1,trace:1112111,done:1112111}],
 ['compound NaN',compoundNonfiniteSource,{nan:true,done:true}],
 ['earlier read',earlierReadSource,{combined:2,added:3,trace:2,done:2}],
 ['ordered',orderedSource,{first:2,second:3,combined:33,skipped:false,trace:13213114,done:13213114}],
 ['nonfinite arithmetic',overflowSource,{first:2,infinite:true,nan:true,done:true}]
])test(name+' closed accessor effects retain original PXT results in VM, Code replay and fresh SB3',{timeout:120000},async()=>{
 const original=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{done:expected.done}});
 for(const[name,value]of Object.entries(expected))assert.equal(original[name],value,'PXT '+name);
 const runs=[];
 const check=run=>{
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const variables=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));
  for(const[name,value]of Object.entries(expected))assert.equal(variables[name],value,'VM '+name);
 };
 const execute=async code=>{const run=await runProgram(code,{frames:30,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
  const run=await execute(imported.code);await execute(run.creator.decompile());
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
  fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,30);check(fresh);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('native constructor unary evidence refuses actual object and reference arguments',{timeout:120000},async()=>{
 const source=`class Box{n:number;constructor(a:number){this.n=~a}
 get value():number{return this.n}}
 function take(n:number){return n}
 let box=new Box(2);let first=take(box.value);`;
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const supplied='(0 + (2))';assert.equal(imported.code.split(supplied).length,2);
 for(const actual of ['new array reference from ("[]")','arcade new object class ("Box") arguments ("[]")','convert value (new array reference from ("[]")) op "~"']){
  const code=imported.code.replace(supplied,'('+actual+')');
  const run=await runProgram(code,{frames:30,storage:true});
  try{
   assert.deepEqual(run.creator.warnings,[]);
   assert.ok(run.errors.some(error=>error.includes('connected input lacks complete primitive domain evidence')),actual);
  }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
 }
});
