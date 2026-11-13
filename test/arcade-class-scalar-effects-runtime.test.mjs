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
const overflowSource=`let trace=0;
 class Box{constructor(public n:number){}
 get value():number{trace=1e308*1e308;return this.n}
 set value(v:number){trace=trace-trace;this.n=v}}
 function take(n:number){return n}
 let box=new Box(2);let first=take(box.value);let infinite=trace>1e308;
 box.value=3;let nan=trace!==trace;let done=nan;`;
for(const [name,source,expected]of [
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
