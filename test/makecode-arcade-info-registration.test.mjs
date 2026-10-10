import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {INFO_REGISTRATION_SOURCE as source} from './fixtures/arcade-info-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
 assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:0,storage:true});let now=0;
 run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};
 const step=async(n=10)=>{for(let i=0;i<n;i++){await stepFrames(run.vm,1,20);now+=20;}};await step();return {run,step};
}
test('life and countdown registrations retain replacement, shared captures and player state through roundtrips',async()=>{
 const expected=await runPxtArcade(source,{waitForGlobals:{ready:true,timerHits:1}});assert.equal(expected.trace,'L9M10T10');assert.equal(expected.lifeNow,2);assert.equal(expected.secondNow,3);
 const names=['trace','lifeHits','secondHits','timerHits','lifeNow','secondNow','initialHasLife','ready'];
 const check=run=>{for(const n of names)assert.equal(values(run)[n],expected[n],n);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register life zero/);assert.match(imported.code,/arcade register countdown/);assert.doesNotMatch(imported.code,/wait until lives|WHEN arcade countdown ends:/);
 const {run,step}=await execute(imported);check(run);const decompiled=await execute({...imported,code:run.creator.decompile()});check(decompiled.run);
 const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const again=await runPxtArcade(exported.ts,{waitForGlobals:{ready:true,timerHits:1}});for(const n of names)assert.equal(again[n],expected[n],n+' exported');
 const reimported=await execute(arcadeToPseudocode(exported.files));check(reimported.run);
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await step();check(run);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});await step();
 assert.equal(values(run).trace,'L9M10T10L10M11T11');for(const n of ['lifeHits','secondHits','timerHits'])assert.equal(values(run)[n],2,n);
 const repeatSource=source+'\nwhile(!ready){pause(5)}\ncontroller.A.setPressed(true)\npause(20)\ncontroller.A.setPressed(false)\nwhile(timerHits<2){pause(5)}';
 const repeated=await runPxtArcade(repeatSource,{waitForGlobals:{timerHits:2}});assert.equal(values(run).trace,repeated.trace);
});
test('invalid life/countdown callbacks and shadowed info namespace remain diagnosed',()=>{
 for(const source of ['info.onLifeZero(1)','info.onLifeZero(function(a){})','info.onCountdownEnd(function(){},1)','info.player3.onLifeZero(function(a){})','let info=1;info.onLifeZero(function(){})','function f(info:number){info.onCountdownEnd(function(){})};f(1)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
