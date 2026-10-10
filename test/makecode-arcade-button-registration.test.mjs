import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {BUTTON_REGISTRATION_SOURCE as source,BUTTON_ORACLE_INPUT as input} from './fixtures/arcade-button-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function exercise(run){
 const tap=async key=>{run.vm.postIOData('keyboard',{key,isDown:true});run.vm.postIOData('keyboard',{key,isDown:false});await stepFrames(run.vm,4,20);};
 await tap(' ');await tap('z');await tap(' ');
 run.vm.postIOData('keyboard',{key:'ArrowRight',isDown:true});await stepFrames(run.vm,40,20);run.vm.postIOData('keyboard',{key:'ArrowRight',isDown:false});await stepFrames(run.vm,2,20);
}
test('controller registrations preserve replacement, live captures, dynamic events and short taps through roundtrips',async()=>{
 const expected=await runPxtArcade(source+input,{waitForGlobals:{repeated:true,releases:2}});assert.equal(expected.trace,'P7R8P10R11');assert.equal(expected.presses,2);
 const check=run=>{const actual=values(run);for(const n of ['trace','presses','releases','repeated','installs'])assert.equal(actual[n],expected[n],n);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,storage:true});await exercise(run);check(run);return run;};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register button/);assert.doesNotMatch(imported.code,/WHEN .* key pressed:/);
 const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const originalExport=await runPxtArcade(exported.ts+input,{waitForGlobals:{repeated:true,releases:2}});for(const n of ['trace','presses','releases','repeated','installs'])assert.equal(originalExport[n],expected[n],n+' exported');
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);check(run);
});
test('invalid controller callbacks and shadowed namespaces are diagnosed',()=>{
 for(const source of ['controller.A.onEvent(ControllerButtonEvent.Pressed,1)','controller.A.onEvent(ControllerButtonEvent.Pressed,function(a){})','controller.A.onEvent(ControllerButtonEvent.Pressed,function(){},1)','let controller=1;controller.A.onEvent(2049,function(){})','function f(controller:number){controller.A.onEvent(2049,function(){})};f(1)','let ControllerButtonEvent=1;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){})'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
