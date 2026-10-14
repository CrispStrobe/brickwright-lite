import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const source='let trace=0;let yes=true;function tap(n:number){trace=trace*10+n;return n}function pair(a:number,b:number){return a*10+b}class Field {value=pair(tap(1),yes?tap(2):tap(8));constructor(){tap(3)}}let field=new Field();let fieldTrace=trace;let fieldValue=field.value;fieldTrace+=0;fieldValue+=0;';
test('selected PXT field staging retains its complete helper body before the constructor across authoring routes',async()=>{
 const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));assert.equal(vars.fieldTrace,213);assert.equal(vars.fieldValue,12);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:24,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);
  await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  assert.match(exported.ts,/function \w*__bwClass_Field_field_value/);
  const original=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(original.fieldTrace,213);assert.equal(original.fieldValue,12);
  await execute(arcadeToPseudocode(exported.files));
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));fresh.vm.greenFlag();await stepFrames(fresh.vm,24);check(fresh);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});
