import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

// Timed scene frames are source turns: they step threads directly and never
// enter Sequencer.stepThreads, the only place Scratch drops finished threads.
// Every update callback and every managed procedure call pushes a thread, so
// without release the list grows by one per call and each pass scans it all.
const source=`let total = 0
let started = false
function bump(n: number) {
    total += n
}
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    started = true
})
game.onUpdate(function () {
    if (started) {
        for (let i = 0; i < 40; i++) {
            bump(1)
        }
    }
})
`;

test('timed source turns release finished update and procedure threads',async()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true,frameAuthority:'timed'});
 const {vm}=run,clock=createArcadeDiscreteTimers();
 const total=()=>vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^Game_/,'')==='total')?.value;
 vm.stopAll();vm.runtime.bwArcadeProgramClock=clock;
 vm.runtime.updateCurrentMSecs=()=>{vm.runtime.currentMSecs=clock.now();};vm.greenFlag();
 try{
  await stepFrames(vm,1,0);
  await clock.advanceTo(100);
  vm.postIOData('keyboard',{key:' ',isDown:true});
  for(let turn=0;turn<4;turn++)await new Promise(resolve=>setImmediate(resolve));
  await clock.advanceTo(200);
  vm.postIOData('keyboard',{key:' ',isDown:false});
  let most=0;
  for(let t=233;t<=1500;t+=33){
   await clock.advanceTo(t);
   for(let turn=0;turn<4;turn++)await new Promise(resolve=>setImmediate(resolve));
   most=Math.max(most,vm.runtime.threads.length);
  }
  assert.ok(total()>=40*20,`the update handler kept calling the procedure (total ${total()})`);
  assert.ok(most<=8,`runtime.threads stays bounded across frames (peak ${most})`);
  assert.equal(vm.runtime.threads.filter(thread=>thread.status===thread.constructor.STATUS_DONE).length,0,'no finished thread is retained');
  assert.deepEqual(run.errors,[]);
 }finally{vm.quit();clearStrayTimers();}
});
