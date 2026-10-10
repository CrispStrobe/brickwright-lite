import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {UPDATE_REGISTRATION_SOURCE as source} from './fixtures/arcade-update-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
 assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});
 let now=0;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};
 const step=async(n=1)=>{for(let i=0;i<n;i++){await stepFrames(run.vm,1,20);now+=20;}};
 await step(5);return {run,step};
}

test('nested frame registrations retain captures and interval values through native, MakeCode and SB3 roundtrips',async()=>{
 const expected=await runPxtArcade(source,{waitForGlobals:{runs:1}});assert.equal(expected.sum,25);assert.equal(expected.order,'IAaB');assert.equal(expected.completedIntervals,1);
 const check=run=>{const actual=values(run);for(const name of ['sum','order','runs','completedIntervals'])assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register update/);assert.match(imported.code,/arcade register interval/);assert.doesNotMatch(imported.code,/WHEN arcade updates:/);
 const {run,step}=await execute(imported);check(run);
 const decompiled=await execute({...imported,code:run.creator.decompile()});check(decompiled.run);
 const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
 const native=await runPxtArcade(exported.files,{waitForGlobals:{runs:1}});for(const name of ['sum','order','runs','completedIntervals'])assert.equal(native[name],expected[name],name+' exported');
 const reimported=await execute(arcadeToPseudocode(exported.files));check(reimported.run);
 const sb3=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(sb3);run.vm.greenFlag();await step(5);check(run);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});await step(5);
 assert.equal(values(run).sum,54);assert.equal(values(run).order,'IAaBAaB');assert.equal(values(run).runs,2);
 run.vm.postIOData('keyboard',{key:' ',isDown:false});await step(10);assert.ok(values(run).intervalRuns<10,'registered100ms interval ignores later period=1');
});

test('frame callback invalid arity, non-inline handlers and shadowed game namespace stay diagnosed',()=>{
 for(const source of ['game.onUpdate(function(a){})','game.onUpdate(1)','game.onUpdate(function(){},1)','game.onUpdateInterval(10)','game.onUpdateInterval(10,function(a){})','let game=1;game.onUpdate(function(){})','function f(game:number){game.onUpdate(function(){})};f(1)','function f(){let game=1;game.onUpdateInterval(10,function(){})};f()'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
