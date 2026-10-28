import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

import {CALLBACK_COMPLETION_SOURCE as source} from './fixtures/arcade-callback-completion.mjs';

test('completed yielding collision callbacks resume their inline successors before another physics tick',async()=>{
 const expected=await runPxtArcade(source,{dependencies:{device:'*','color-coded-tilemap':'*'}});
 assert.ok(expected.after<expected.before,'original physics continues during the pause');
 for(const key of ['inB','inC','finalX'])assert.equal(expected[key],expected.after,`original ${key}`);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 // This witness requires autonomous source physics while the callback waits;
 // runProgram's default manual-frame profile deliberately provides none.
 const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true,frameAuthority:'timed',retainExtensionTimers:true});
 const values=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
 const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;
 run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();
 try{
  await stepFrames(run.vm,1,0);
  assert.notEqual(values().done,true,'inline successors remain suspended during the authored pause');
  await clock.advanceTo(70);
  // An uninitialized source Boolean is an encoded undefined object, not false.
  assert.equal(values().done,true,'native callback completes at its actual authored wait deadline');
  const actual=values();assert.ok(actual.after<actual.before,'native physics continues during the pause');
  for(const key of ['inB','inC','finalX'])assert.equal(actual[key],actual.after,`native ${key}`);
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});
