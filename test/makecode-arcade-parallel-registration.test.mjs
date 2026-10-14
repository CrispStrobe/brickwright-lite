import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {PARALLEL_REGISTRATION_SOURCE as source,PARALLEL_ORACLE_INPUT as input} from './fixtures/arcade-parallel-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function waitCompleted(run,count){
 for(let i=0;i<150 && values(run).completed!==count;i++){await stepFrames(run.vm,1,20);await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(values(run).completed,count);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
}
test('parallel launch preserves call timing, live captures, nested fibers and caller continuation through roundtrips',async()=>{
 const expected=await runPxtArcade(source+input,{waitForGlobals:{completed:2}});
 assert.equal(expected.trace,'L12SP12Q13E13N13L14P14Q15E15N15');
 const exercise=async run=>{
  await waitCompleted(run,1);assert.equal(values(run).trace,'L12SP12Q13E13N13');
  run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});
  await waitCompleted(run,2);assert.equal(values(run).trace,expected.trace);
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});await exercise(run);return run;};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade run parallel as/);assert.equal((imported.code.match(/WHEN flag clicked:/g)||[]).length,1);
 const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const oracle=await runPxtArcade(exported.ts+input,{waitForGlobals:{completed:2}});assert.equal(oracle.trace,expected.trace);
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);
});
test('parallel calls create distinct fibers with separate invocation cells and persist through scene push/pop',async()=>{
 const source=`let total=0
let completed=0
function launch(value:number){
 control.runInParallel(function(){pause(20);total+=value;completed+=1})
 value+=10
}
launch(2)
launch(4)
game.pushScene()
pause(60)
game.popScene()`;
 const expected=await runPxtArcade(source,{waitForGlobals:{completed:2}});assert.equal(expected.total,26);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});await waitCompleted(run,2);assert.equal(values(run).total,expected.total);
});
test('invalid parallel callbacks and shadowed control bindings remain explicit diagnostics',()=>{
 for(const source of ['control.runInParallel(1)','control.runInParallel(function(a){})','control.runInParallel(function(){},1)','let control=1;control.runInParallel(function(){})','function f(control:number){control.runInParallel(function(){})};f(1)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('stopping cancels queued parallel work and restart launches exactly one fresh fiber',async()=>{
 const imported=arcadeToPseudocode(`let completed=0
control.runInParallel(function(){pause(40);completed+=1})`);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:1});
 run.vm.stopAll();await new Promise(resolve=>setTimeout(resolve,60));await stepFrames(run.vm,4,20);
 assert.equal(values(run).completed,0);
 run.vm.greenFlag();await waitCompleted(run,1);await new Promise(resolve=>setTimeout(resolve,60));await stepFrames(run.vm,4,20);
 assert.equal(values(run).completed,1);assert.deepEqual(run.errors,[]);
});
