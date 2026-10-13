import {readFileSync} from 'node:fs';import path from 'node:path';
import {REPO,guiDependencyFile} from './helpers/bw-integrated.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const source=`SPRITE Game:
WHEN arcade source starts:
  arcade set background color to 0
  set ticks to 0
  forever:
    change ticks by 1
    arcade set background color to 0
SPRITE Plain:
WHEN flag clicked:
  set scratchDone to 0
  wait (0.03) secs
  set scratchDone to 1`;
const values=run=>Object.fromEntries(run.vm.runtime.targets.filter(t=>t.isOriginal).flatMap(t=>Object.values(t.variables)).map(v=>[v.name,Number(v.value)]));
async function setup(code=source){assert.equal(readFileSync(guiDependencyFile('scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),'actual installed phase driver must match the owned source');const run=await runProgram(code,{frames:0,frameAuthority:'timed'});const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();assert.ok(readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8').includes(run.vm.runtime._arcadeFramePhase.constructor.toString()),'actual loaded phase class must match source, including module cache');return {...run,clock};}
const close=run=>{run?.vm.stopAll();run?.vm.quit();clearStrayTimers();};
test('owned scene20ms ticks do not repeat a consumed source loop or step ordinary Scratch waits',async()=>{
 let run;try{run=await setup();await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);assert.equal(values(run).ticks,1);assert.equal(values(run).scratchDone,0);
 await run.clock.advanceTo(50);assert.equal(values(run).ticks,3,'source ticks0/20/40');assert.equal(values(run).scratchDone,0,'timer source turns do not execute the ordinary Scratch wait');
 await stepFrames(run.vm,1,50);assert.equal(values(run).scratchDone,1);assert.equal(values(run).ticks,3,'ordinary Scratch frame cannot grant another source tick');assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('a continuation-only source turn honors actual sequencer guard and does not release tick yields',async()=>{
 let run;try{run=await setup();await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);const rt=run.vm.runtime,driver=rt._arcadeFramePhase;
 const before=values(run).ticks;await driver.requestContinuation();assert.equal(values(run).ticks,before);
 const actual=rt.sequencer.stepThread;let guarded=0;rt.sequencer.stepThread=function(thread){guarded++;thread.status=thread.constructor.STATUS_YIELD_TICK;};
 await run.clock.advanceTo(20);assert.ok(guarded>0);assert.equal(values(run).ticks,before,'a paused actual executor guard is not bypassed by timers');
 rt.sequencer.stepThread=actual;await run.clock.advanceTo(40);assert.equal(values(run).ticks,before+1);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('source wait timers are exact-context owned and never resurrect an obsolete timer context',async()=>{
 let run;try{run=await setup(`SPRITE Game:
WHEN arcade source starts:
  arcade set background color to 0
  set resumed to 0
  wait (0.03) secs
  set resumed to 1`);await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);const driver=run.vm.runtime._arcadeFramePhase;
 assert.equal(driver.waitTimers.size,1);const [thread,wait]=[...driver.waitTimers][0];const status=thread.status;
 wait.context.timer={timeElapsed:()=>0};await run.clock.advanceTo(30);assert.notEqual(driver.waitTimers.get(thread),wait,'replacement context may acquire its own new timer; old event never owns it');assert.equal(values(run).resumed,0);assert.equal(thread.status,status,'obsolete timer must not set thread runnable');assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('actual Stop/load cached driver cancels both scene workers and source wait timers',async()=>{
 let run;try{run=await setup(`SPRITE Game:
WHEN arcade source starts:
  arcade set background color to 0
  set resumed to 0
  wait (0.03) secs
  set resumed to 1`);await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);const driver=run.vm.runtime._arcadeFramePhase,oldClock=run.clock;assert.equal(driver.waitTimers.size,1);assert.ok(oldClock.pending);
 const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();assert.equal(oldClock.pending,0);assert.equal(driver.waitTimers.size,0);await oldClock.advanceTo(100);assert.equal(values(run).resumed,0);
 await run.vm.loadProject(archive);assert.equal(run.vm.runtime._arcadeFramePhase,driver);run.clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=run.clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=run.clock.now();};run.vm.greenFlag();await stepFrames(run.vm,1,0);await run.clock.advanceTo(30);assert.equal(values(run).resumed,1);assert.equal(driver.waitTimers.size,0);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('production timed-scene questions retain the500ms guard and genuine release/press input',async()=>{
 let run;try{run=await setup(`SPRITE Game:
WHEN arcade source starts:
  arcade set background color to 0
  set ready to 0
  set reply to (arcade ask yes "Continue?" subtitle "")
  set ready to 1`);await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);assert.equal(run.vm.runtime.bwArcadeDialogOpen,true);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});await run.clock.advanceTo(500);assert.equal(values(run).ready,0,'held A cannot bypass the guard');assert.equal(run.vm.runtime.bwArcadeDialogOpen,true);
 run.vm.postIOData('keyboard',{key:' ',isDown:false});await run.clock.advanceTo(520);run.vm.postIOData('keyboard',{key:' ',isDown:true});await run.clock.advanceTo(540);assert.equal(values(run).ready,1);assert.equal(values(run).reply,1);assert.equal(run.vm.runtime.bwArcadeDialogOpen,false);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
