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
// both actual cooperative work-budget clocks one advancing external source;
// real stack-wait timers keep their separate runtime.currentMSecs provider.
// No primitive, sequencer method, budget or authored operation is replaced.
function controlledWorkClock(vm) {
 // A frozen CPU clock can make the real sequencer's budget loop unbounded.
 // Advance on EVERY read, independently of the program clock or host load.
 // This read-count quantum controls scheduling inputs, not CPU throughput.
 let reads=0;const now=()=>++reads/64;
 const before=now();assert.ok(Number.isFinite(before)&&now()>before,'controlled CPU clocks must advance before installing them');
 const bindings=[[vm.runtime._arcadeFramePhase,'workNow',now],
  [vm.runtime.sequencer.timer,'nowObj',Object.freeze({now})]];
 const saved=bindings.map(([object,key])=>[object,key,Object.getOwnPropertyDescriptor(object,key)]);
 for(const [,key,descriptor]of saved)assert.ok(descriptor&&Object.hasOwn(descriptor,'value'),key+' is an actual configurable clock input');
 const restore=()=>{for(const [object,key,descriptor]of saved)Object.defineProperty(object,key,descriptor);};
 try{for(let i=0;i<bindings.length;i++){const [object,key,value]=bindings[i];Object.defineProperty(object,key,{...saved[i][2],value});}}
 catch(error){restore();throw error;}
 return restore;
}
test('controlled work clock advances both real budget inputs and restores their descriptors',()=>{
 const phase={workNow:()=>17},timer={nowObj:{now:()=>29}};
 const vm={runtime:{_arcadeFramePhase:phase,sequencer:{timer}}};
 const oldPhase=Object.getOwnPropertyDescriptor(phase,'workNow'),oldTimer=Object.getOwnPropertyDescriptor(timer,'nowObj');
 const restore=controlledWorkClock(vm);
 try{
  assert.equal(phase.workNow,timer.nowObj.now,'one CPU-work source');
  const start=phase.workNow(),next=timer.nowObj.now();assert.ok(next>start,'both clocks share advancing observations');
  const deadline=start+1;let previous=next,iterations=0;
  // Exercise the same elapsed/deadline relationship without invoking a VM or
  // replacing either production scheduler. Constant clocks fail this bound.
  while(phase.workNow()<deadline){const value=timer.nowObj.now();assert.ok(value>previous);previous=value;assert.ok(++iterations<128,'a finite work budget must be reachable');}
  assert.ok(iterations>0);assert.ok(phase.workNow()>=deadline);
 }finally{restore();}
 assert.deepEqual(Object.getOwnPropertyDescriptor(phase,'workNow'),oldPhase);
 assert.deepEqual(Object.getOwnPropertyDescriptor(timer,'nowObj'),oldTimer);
});
async function setup(code=source,{deterministicWorkClock=false}={}){
 assert.equal(readFileSync(guiDependencyFile('scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),'actual installed phase driver must match the owned source');
 const run=await runProgram(code,{frames:0,frameAuthority:'timed'}),clock=createArcadeDiscreteTimers();
 let restoreWorkClock=()=>{};
 try{
  run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};
  if(deterministicWorkClock){
   const sequencerSource=readFileSync(guiDependencyFile('scratch-vm/src/engine/sequencer.js'),'utf8');
   assert.ok(sequencerSource.includes(run.vm.runtime.sequencer.stepThreads.toString()),'actual loaded cooperative budget method must match its installed source');
   restoreWorkClock=controlledWorkClock(run.vm);
  }
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
 let run;try{run=await setup(source,{deterministicWorkClock:true});await stepFrames(run.vm,1,0);const wait=plainWait(run),waitTimer=wait.timer;assert.equal(waitTimer.timeElapsed(),0);await run.clock.advanceTo(0);assert.equal(values(run).ticks,1);assert.equal(values(run).scratchDone,0);
 await run.clock.advanceTo(50);assert.equal(values(run).ticks,3,'source ticks0/20/40');assert.equal(values(run).scratchDone,0,'timer source turns do not execute the ordinary Scratch wait');
 // The timer platform reaches50 without a callback there. The VM sampled its
 // program clock at the actual source turn40; the physical frame samples50.
 assert.equal(run.clock.now(),50);assert.equal(run.vm.runtime.currentMSecs,40);
 assert.equal(plainWait(run),wait,'source turns retain the actual ordinary wait context');assert.equal(wait.timer,waitTimer,'source turns retain the original ordinary Timer');
 const elapsed=waitTimer.timeElapsed();assert.equal(elapsed,40,'ordinary wait observes the last actual VM clock sample');assert.ok(elapsed>=wait.duration,'the real ordinary wait is already due but source turns cannot execute it');
 await stepFrames(run.vm,1,50);assert.equal(run.vm.runtime.currentMSecs,50);assert.equal(waitTimer.timeElapsed(),50,'the physical frame samples50 through the retained original Timer');assert.equal(values(run).scratchDone,1);assert.equal(values(run).ticks,3,'ordinary Scratch frame cannot grant another source tick');assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
test('physical frames cannot complete the actual ordinary wait while its clock is frozen',async()=>{
 let run;try{
  run=await setup(source,{deterministicWorkClock:true});await stepFrames(run.vm,1,0);const wait=plainWait(run);assert.equal(wait.timer.timeElapsed(),0);
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
test('a timed-scene question draws game.showDialog into the frame at the simulator\'s fallback screen refresh',async()=>{
 let run;try{run=await setup(`SPRITE Game:
WHEN arcade source starts:
  arcade set background color to 0
  set ready to 0
  set reply to (arcade ask yes "Continue?" subtitle "Cost")
  set ready to 1`);await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);
 const frame=()=>Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame?.pixels || []);
 const row=(pixels,y)=>pixels.slice(y*160,y*160+160);
 // Dialog height 8+8+2+8+8=34 -> top (120-34)>>1=43; the footer strip starts at 120-8-4=108.
 await run.clock.advanceTo(100);assert.equal(row(frame(),43).every(c=>c===0),true,'the display still shows the last frame');
 await run.clock.advanceTo(200);
 const shown=frame();
 assert.equal(row(shown,43).every(c=>c===1),true,'top border line drawn by showDialog');
 assert.equal(row(shown,76).every(c=>c===1),true,'bottom border line');
 assert.equal(row(shown,108).every(c=>c===1),true,'footer rule');
 assert.equal(shown.some((c,i)=>c===7 && i>=44*160 && i<76*160),true,'title in colour 7');
 assert.equal(values(run).ready,0);
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
 // ask.ts pauses 500 ms, then pauseUntil samples A and B at base/poll.ts's 50 ms polls: a release-and-press inside one poll is not seen.
 run.vm.postIOData('keyboard',{key:' ',isDown:false});await run.clock.advanceTo(520);run.vm.postIOData('keyboard',{key:' ',isDown:true});await run.clock.advanceTo(540);assert.equal(values(run).ready,0,'a release between two polls is not sampled');
 run.vm.postIOData('keyboard',{key:' ',isDown:false});await run.clock.advanceTo(600);run.vm.postIOData('keyboard',{key:' ',isDown:true});await run.clock.advanceTo(700);assert.equal(values(run).ready,1);assert.equal(values(run).reply,1);assert.equal(run.vm.runtime.bwArcadeDialogOpen,false);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
