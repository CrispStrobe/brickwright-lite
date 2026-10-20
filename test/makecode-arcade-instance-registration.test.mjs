import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {INSTANCE_REGISTRATION_SOURCE as source,INSTANCE_ORACLE_INPUT as input} from './fixtures/arcade-instance-registration.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('instance destruction retains live number/boolean captures, replacement, handle binding and yielding order through roundtrips',async()=>{
 const expected=await runPxtArcade(source+input,{waitForGlobals:{finished:2}});
 const runs=[];
 const boot=async run=>{
  const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();
  await stepFrames(run.vm,1,0);await clock.advanceTo(100);return clock;
 };
 const exercise=async imported=>{
  assert.deepEqual(imported.unsupported,[]);
  const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true,frameAuthority:'timed'});runs.push(run);
  const clock=await boot(run);assert.equal(values(run).finished,1);
  assert.equal(values(run).completed,1);assert.equal(values(run).trace,'I12i13KX');
  assert.equal(Object.keys(run.vm.runtime.bwArcadeDeviceState.sprites).length,1);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});await clock.advanceTo(140);
  run.vm.postIOData('keyboard',{key:' ',isDown:false});await clock.advanceTo(160);assert.equal(values(run).finished,2);
  assert.equal(values(run).trace,expected.trace);assert.equal(values(run).completed,2);
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
 };
 try {
 const imported=arcadeToPseudocode(source);assert.match(imported.code,/arcade register instance destruction/);
 const run=await exercise(imported);
 await exercise({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const oracle=await runPxtArcade(exported.ts+input,{waitForGlobals:{finished:2}});assert.equal(oracle.trace,expected.trace);
 await exercise(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));await boot(run);
 assert.equal(values(run).finished,1);assert.equal(values(run).trace,'I12i13KX');
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('invalid instance destruction callbacks remain diagnosed',()=>{
 for(const callback of ['1','function(a){}','function(){},1']){
  const imported=arcadeToPseudocode(`let sprite=sprites.create(img\`1\`,SpriteKind.Enemy);sprite.onDestroyed(${callback})`);
  assert.ok(imported.unsupported.length,callback);
 }
});
