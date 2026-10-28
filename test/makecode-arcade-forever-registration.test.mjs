import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {FOREVER_REGISTRATION_SOURCE as source,FOREVER_ORACLE_INPUT as input} from './fixtures/arcade-forever-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function waitRuns(run,count){
 for(let i=0;i<150 && values(run).runs!==count;i++){
  await stepFrames(run.vm,1,20);await new Promise(resolve=>setTimeout(resolve,5));
 }
 assert.equal(values(run).runs,count);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
}
test('nested forever retains live captures and yielding order through native/decompile/export/reimport/SB3',async()=>{
 const expected=await runPxtArcade(source+input,{waitForGlobals:{runs:2}});assert.equal(expected.trace,'S12E13S14E15');
 const exercise=async run=>{
  await waitRuns(run,1);assert.equal(values(run).trace,'S12E13');
  run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});
  await waitRuns(run,2);assert.equal(values(run).trace,expected.trace);
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,retainExtensionTimers:true});await exercise(run);run.vm.stopAll();clearStrayTimers();return run;};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register forever/);assert.doesNotMatch(imported.code,/\n  FOREVER:/);
 const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
 const oracle=await runPxtArcade(exported.ts+input,{waitForGlobals:{runs:2}});assert.equal(oracle.trace,expected.trace);
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);run.vm.stopAll();clearStrayTimers();
});
test('all forever spellings register independently of scene stack selection',async()=>{
 for(const api of ['forever','game.forever','basic.forever']){
  const imported=arcadeToPseudocode(`let runs=0;${api}(function(){if(runs===0){runs=1}})`);
  assert.deepEqual(imported.unsupported,[],api);assert.match(imported.code,/arcade register forever/);
  const run=await runProgram(imported.code,{frames:3,retainExtensionTimers:true});await waitRuns(run,1);run.vm.stopAll();clearStrayTimers();
 }
});
test('invalid forever callbacks and shadowed bindings remain diagnosed',()=>{
 for(const source of ['forever(1)','forever(function(a){})','forever(function(){},1)','game.forever()','basic.forever(function(a){})','let forever=1;forever(function(){})','function f(forever:number){forever(function(){})};f(1)','let game=1;game.forever(function(){})','function f(){let basic=1;basic.forever(function(){})};f()'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
