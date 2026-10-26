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
// This fixture observes program-time ownership, not host CPU throughput. Give
// both actual cooperative work-budget clocks the same external fixed source;
// real stack-wait timers keep their separate runtime.currentMSecs provider.
// No primitive, sequencer method, budget or authored operation is replaced.
function controlledWorkClock(vm) {
 const bindings=[[vm.runtime._arcadeFramePhase,'workNow',()=>0],
  [vm.runtime.sequencer.timer,'nowObj',Object.freeze({now:()=>0})]];
 const saved=bindings.map(([object,key])=>[object,key,Object.getOwnPropertyDescriptor(object,key)]);
 for(const [,key,descriptor]of saved)assert.ok(descriptor&&Object.hasOwn(descriptor,'value'),key+' is an actual configurable clock input');
 const restore=()=>{for(const [object,key,descriptor]of saved)Object.defineProperty(object,key,descriptor);};
 try{for(let i=0;i<bindings.length;i++){const [object,key,value]=bindings[i];Object.defineProperty(object,key,{...saved[i][2],value});}}
 catch(error){restore();throw error;}
 return restore;
}
async function setup(code=source,{fixedWorkClock=false}={}){
 assert.equal(readFileSync(guiDependencyFile('scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),'actual installed phase driver must match the owned source');
 const run=await runProgram(code,{frames:0,frameAuthority:'timed'}),clock=createArcadeDiscreteTimers();
 let restoreWorkClock=()=>{};
 try{
  run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};
  if(fixedWorkClock)restoreWorkClock=controlledWorkClock(run.vm);
  run.vm.greenFlag();
  assert.ok(readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8').includes(run.vm.runtime._arcadeFramePhase.constructor.toString()),'actual loaded phase class must match source, including module cache');
  return {...run,clock,restoreWorkClock};
 }catch(error){run.vm.stopAll();restoreWorkClock();run.vm.quit();clearStrayTimers();throw error;}
}
const close=run=>{run?.vm.stopAll();run?.restoreWorkClock();run?.vm.quit();clearStrayTimers();};
function plainWait(run){
 const threads=run.vm.runtime.threads.filter(thread=>thread.target.getName()==='Plain'&&thread.peekStackFrame()?.executionContext?.timer);
 assert.equal(threads.length,1,'the actual ordinary wait must have started before source timer observations');
 const thread=threads[0],context=thread.peekStackFrame().executionContext;
 assert.equal((thread.blockContainer||thread.target.blocks).getBlock(thread.peekStack()).opcode,'control_wait');
 assert.equal(context.duration,30);assert.equal(context.timer.startTime,0);
 assert.notEqual(context.timer.nowObj,run.vm.runtime.sequencer.timer.nowObj,'program wait and CPU-work clocks remain separate');
 assert.equal(run.vm.runtime._arcadeFramePhase.waitTimers.has(thread),false,'source timers never own the ordinary wait');
 return context;
}
test('owned scene20ms ticks do not repeat a consumed source loop or step ordinary Scratch waits',async()=>{
 let run;try{run=await setup(source,{fixedWorkClock:true});await stepFrames(run.vm,1,0);const wait=plainWait(run);assert.equal(wait.timer.timeElapsed(),0);await run.clock.advanceTo(0);assert.equal(values(run).ticks,1);assert.equal(values(run).scratchDone,0);
 await run.clock.advanceTo(50);assert.equal(values(run).ticks,3,'source ticks0/20/40');assert.equal(values(run).scratchDone,0,'timer source turns do not execute the ordinary Scratch wait');assert.equal(wait.timer.timeElapsed(),50,'the real ordinary wait is due but source turns cannot execute it');
 await stepFrames(run.vm,1,50);assert.equal(values(run).scratchDone,1);assert.equal(values(run).ticks,3,'ordinary Scratch frame cannot grant another source tick');assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('physical frames cannot complete the actual ordinary wait while its clock is frozen',async()=>{
 let run;try{
  run=await setup(source,{fixedWorkClock:true});await stepFrames(run.vm,1,0);const wait=plainWait(run);assert.equal(wait.timer.timeElapsed(),0);
  // Remove only ordinary elapsed-clock progress. The real source timers,
  // instructions and both originally requested physical frames still run.
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=0;};
  await run.clock.advanceTo(0);await run.clock.advanceTo(50);await stepFrames(run.vm,1,50);
  assert.equal(values(run).ticks,3);assert.equal(values(run).scratchDone,0);
  assert.equal(plainWait(run),wait);assert.equal(wait.timer.timeElapsed(),0);assert.deepEqual(run.errors,[]);
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
