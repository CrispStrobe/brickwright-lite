import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers,projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const fixtures={
 unused:'let trace=0;function touch(){trace+=1;return trace}class Dormant {value=touch()}let observed=trace;observed+=0;',
 deadFunction:'let trace=0;class Dormant {value=1}function never(){return new Dormant()}let observed=trace;observed+=0;'
};
const invalid=[
 'class Dormant {value=1}let instance=new Dormant();let observed=instance.value;',
 'class Dormant {value=1}class Child extends Dormant {constructor(){super()}}let instance=new Child();let observed=instance.value;',
 'class Dormant {value=1}control.onEvent(707,1,function(){let instance=new Dormant()});let observed=0;observed+=0;'
];
const check=run=>{
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
 assert.equal(values.trace,0);assert.equal(values.observed,0);
};

test('unused class metadata remains editable while reachable constructor restrictions remain diagnostics',()=>{
 for(const source of Object.values(fixtures)){
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
  assert.match(imported.code,/arcade declare class \("Dormant"\)/);
  assert.ok(imported.code.includes('value'),'the class field is retained');
 }
 for(const source of invalid)assert.ok(arcadeToPseudocode(source).unsupported.some(message=>message.includes('initialized fields require an explicit constructor')));
});

test('unused field initializers and uncalled factories do not execute in native authoring routes',async()=>{
 const runs=[];
 try{
  for(const source of Object.values(fixtures)){
   const imported=arcadeToPseudocode(source);
   const first=await runProgram(imported.code,{frames:12,storage:true});runs.push(first);check(first);
   assert.ok(projectOpcodes(first.creator.project).has('arcade_declareClass'));
   const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);
   const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);
   for(const code of [first.creator.decompile(),reimported.code]){const next=await runProgram(code,{frames:12,storage:true});runs.push(next);check(next);}
   const bytes=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());
   await first.vm.loadProject(bytes);first.vm.greenFlag();await stepFrames(first.vm,12);check(first);
   const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
   await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,12);check(fresh);
  }
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});

test('selected original and exported original preserve unused constructor reachability',async()=>{
 try{
  for(const source of Object.values(fixtures)){
   const original=await runPxtArcade(source);assert.equal(original.trace,0);assert.equal(original.observed,0);
   const imported=arcadeToPseudocode(source);const run=await runProgram(imported.code,{frames:12,storage:true});check(run);
   const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
   const again=await runPxtArcade(exported.files);assert.equal(again.trace??again.Game_trace,0);assert.equal(again.observed??again.Game_observed,0);run.vm.quit();
  }
 }finally{clearStrayTimers();}
});
