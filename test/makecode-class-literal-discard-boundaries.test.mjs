import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade-class-callable-source.mjs';
const scalar=(run,name)=>run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name)?.value;
test('class source recognizes only signed finite Number literal syntax and retains coercion refusals',()=>{
 for(const value of ['-1','+1','-1e-7','-1e+21','(0 + -1)'])assert.deepEqual(arcadeToPseudocode(source.replace('this.value=1','this.value='+value)).unsupported,[],value);
 for(const value of ['-"1"','+"1"','-unknown','+unknown','~1','-1e309','+1e309'])assert.ok(arcadeToPseudocode(source.replace('this.value=1','this.value='+value)).unsupported.length,value);
});
test('class signed Number literals preserve the qualified current carrier through native export and reimport',async()=>{
 const runs=[];try{
  const imported=arcadeToPseudocode(source.replace('this.value=1','this.value=-1'));assert.deepEqual(imported.unsupported,[]);
  const first=await runProgram(imported.code,{frames:60});runs.push(first);assert.deepEqual(first.errors,[]);assert.equal(scalar(first,'n'),1);
  const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/0 \+ -1/);
  const importedAgain=arcadeToPseudocode(exported.files);assert.deepEqual(importedAgain.unsupported,[]);const again=await runProgram(importedAgain.code,{frames:60});runs.push(again);assert.deepEqual(again.errors,[]);assert.equal(scalar(again,'n'),1);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('actual proved class Void discard terminates after an assignment before the next statement',async()=>{
 const input='let voidProofCalls:number=0;class State{value:number;constructor(){this.value=0}}class Holder{run:(s:State)=>void;constructor(){this.run=(s:State)=>{s.value+=1;voidProofCalls+=1}}}let state=new State();let holder=new Holder();let before:number=4;holder.run(state);let after:number=state.value;';
 const runs=[];try{
  const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);const first=await runProgram(imported.code,{frames:60});runs.push(first);assert.deepEqual(first.errors,[]);assert.equal(scalar(first,'voidProofCalls'),1);assert.equal(scalar(first,'after'),1);
  const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/;\(holder\.run\)\(state\);/);
  const importedAgain=arcadeToPseudocode(exported.files);assert.deepEqual(importedAgain.unsupported,[]);const again=await runProgram(importedAgain.code,{frames:60});runs.push(again);assert.deepEqual(again.errors,[]);assert.equal(scalar(again,'voidProofCalls'),1);assert.equal(scalar(again,'after'),1);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
