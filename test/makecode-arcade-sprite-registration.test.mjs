import {runTimedArcadeProgram, restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {SPRITE_REGISTRATION_SOURCE as source,SPRITE_ORACLE_INPUT as input} from './fixtures/arcade-sprite-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function waitCompleted(run,count){
 // Observe the real program timer deadlines; physics stepping is not a pause clock.
 await run.clock.advanceTo(count===1?150:300);
 assert.equal(values(run).completed,count);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
}
test('sprite overlap/destruction retain live captures, event identity and yielding order through roundtrips',async()=>{
 const expected=await runPxtArcade(source+input,{waitForGlobals:{completed:2}});
 assert.equal(expected.trace,'O12D13:20d14B14X16O16D17:20d18B18X20');assert.equal(expected.destroyed,4);
 const exercise=async run=>{
  await waitCompleted(run,1);assert.equal(values(run).trace,'O12D13:20d14B14X16');assert.equal(values(run).destroyed,2);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});
  await waitCompleted(run,2);assert.equal(values(run).trace,expected.trace);assert.equal(values(run).destroyed,expected.destroyed);
  const live=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(live.length,1);assert.equal(live[0].kind,run.vm.runtime._primitives.arcade_spriteKindValue({NAME:'Player'},{}));
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runTimedArcadeProgram(imported.code,{milliseconds:0,uploads:imported.costumes,storage:true});await exercise(run);return run;};
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register overlap/);assert.match(imported.code,/arcade register destroyed/);assert.doesNotMatch(imported.code,/WHEN arcade kinds|WHEN arcade kind "Food" destroyed/);
 const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const oracle=await runPxtArcade(exported.ts+input,{waitForGlobals:{completed:2}});assert.equal(oracle.trace,expected.trace);assert.equal(oracle.destroyed,4);
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.clock=await restartTimedArcadeRun(run,0);await exercise(run);
});
test('invalid sprite callbacks and shadowed namespaces remain diagnosed',()=>{
 for(const source of ['sprites.onDestroyed(SpriteKind.Food,1)','sprites.onDestroyed(SpriteKind.Food,function(a,b){})','sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(a,b,c){})','sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(){},1)','let sprites=1;sprites.onDestroyed(SpriteKind.Food,function(){})','function f(sprites:number){sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(){})};f(1)','let SpriteKind=1;sprites.onDestroyed(SpriteKind.Food,function(){})'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('kind destruction handlers register at execution time and skipped registrations do not fire',async()=>{
 const source=`let hits=0
let before=sprites.create(img\`1\`,SpriteKind.Enemy)
before.destroy()
if(false){sprites.onDestroyed(SpriteKind.Enemy,function(){hits+=100})}
sprites.onDestroyed(SpriteKind.Enemy,function(){hits+=1})
let after=sprites.create(img\`1\`,SpriteKind.Enemy)
after.destroy()`;
 const expected=await runPxtArcade(source);assert.equal(expected.hits,1);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});
 assert.equal(values(run).hits,expected.hits);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
});


test('native sprite registrations keep yielding event order through current editable routes',async()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=async run=>{
  assert.equal(values(run).completed,1);assert.equal(values(run).trace,'O12D13:20d14B14X16');assert.equal(values(run).destroyed,2);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});
  await run.clock.advanceTo(300);
  assert.equal(values(run).completed,2);assert.equal(values(run).trace,'O12D13:20d14B14X16O16D17:20d18B18X20');assert.equal(values(run).destroyed,4);
  const live=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(live.length,1);assert.equal(live[0].kind,run.vm.runtime._primitives.arcade_spriteKindValue({NAME:'Player'},{}));
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 };
 try {
  const execute=async input=>{assert.deepEqual(input.unsupported,[]);const run=await runTimedArcadeProgram(input.code,{milliseconds:150,uploads:input.costumes,storage:true});runs.push(run);await check(run);return run;};
  const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const out=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(out.unsupported,[]);await execute(arcadeToPseudocode(out.files));
  await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.clock=await restartTimedArcadeRun(run,150);await check(run);
 } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}}
});
