import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {flagsSource,flagsExpected,renderingSource,gatingSource,gatingActions,compoundSource,throughSource,nonfiniteZSource} from './fixtures/arcade-scene-flags-controller.mjs';
const globals=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));
const checked=(actual,expected,label)=>{for(const[name,value]of Object.entries(expected))assert.equal(actual[name]??actual[name+'_'],value,label+' '+name);};
async function finish(run,ms=0,actions=[]) {
    run.vm.stopAll();const clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=clock;
    run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();await stepFrames(run.vm,1,0);
    for(const action of actions){await clock.advanceTo(action.at);run.vm.postIOData('keyboard',{key:' ',isDown:action.held});await run.vm.runtime._arcadeFramePhase?.continuation;}
    if(ms)await clock.advanceTo(ms);else await stepFrames(run.vm,150,0);
    assert.deepEqual(run.errors,[]);
}
async function execute(imported,runs,ms=0,actions=[]) {
    assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes||[],frameAuthority:'timed'});runs.push(run);
    assert.deepEqual(run.creator.warnings,[]);await finish(run,ms,actions);return run;
}
async function routes(source,reference,{ms=0,actions=[],names=Object.keys(reference),pixels=null}={}) {
 const runs=[],check=(run,label)=>{checked(globals(run),Object.fromEntries(names.map(n=>[n,reference[n]])),label);if(pixels)assert.deepEqual(Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels),pixels,label+' all19200pixels');};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported,runs,ms,actions);check(run,'native');
  check(await execute({...imported,code:run.creator.decompile()},runs,ms,actions),'Code');
  const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  const buttonActions=actions.length?{afterGlobals:{ready:1},steps:actions.map((a,i)=>({delay:a.at-(actions[i-1]?.at||0),button:5,held:a.held}))}:null;
  const original=await runPxtArcade(exported.files,{fakeClock:true,buttonActions,waitForGlobals:ms&&!actions.length?{done:true}:null,inspectDisplay:!!pixels,waitForDisplay:!!pixels});
  checked(original,Object.fromEntries(names.map(n=>[n,reference[n]])),'original export');
  if(pixels)assert.deepEqual(original.$display.screen,reference.$display.screen,'original export all19200pixels');
  check(await execute(arcadeToPseudocode(exported.files),runs,ms,actions),'reimport');
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);await finish(run,ms,actions);check(run,'same SB3');
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:'timed'});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);await finish(fresh,ms,actions);check(fresh,'fresh SB3');
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
}
test('Scene flags preserve actual SDK creation, raw writes, current-scene z dirtying and retained popped references through all routes',async()=>{
 const original=await runPxtArcade(flagsSource,{fakeClock:true});checked(original,flagsExpected,'original');await routes(flagsSource,flagsExpected);
});
test('Scene flags conditional sorting, manual render guard and live paint masks match original pixels through all routes',async()=>{
 const original=await runPxtArcade(renderingSource,{fakeClock:true,waitForGlobals:{done:true},inspectDisplay:true,waitForDisplay:true});
 assert.equal(original.trace,'0,2,2,3,3,3,3,3,');assert.equal(original.masks,'1,0,0,0,0,0,4,0,');assert.equal(original.paintMasks,'4,4,4,4,4,4,');
 const pixels=original.$display.screen.map(color=>original.$display.palette.indexOf(color));assert.equal(pixels.length,19200);assert.ok(pixels.every(p=>p>=0));
 await routes(renderingSource,original,{ms:260,names:['trace','masks','paintMasks','frame','done'],pixels});
});
test('user-event gating retains real held state, user press/release classification and reenable through all routes',async()=>{
 const original=await runPxtArcade(gatingSource,{fakeClock:true,buttonActions:{afterGlobals:{ready:1},steps:gatingActions.map((a,i)=>({delay:a.at-(gatingActions[i-1]?.at||0),button:5,held:a.held}))}});
 const expected={heldWhileDisabled:true,heldLater:false,downResult:1,upResult:2};checked(original,expected,'original');await routes(gatingSource,expected,{ms:140,actions:gatingActions});
});


test('Scene compound flag stores read the old mask before RHS and evaluate their receiver once through all routes',async()=>{
 const expected={trace:'LR',result:3},original=await runPxtArcade(compoundSource,{fakeClock:true});checked(original,expected,'original');await routes(compoundSource,expected);
});

test('SeeThrough renders actual parent and child pixels with active rendering flags through all routes',async()=>{
 const original=await runPxtArcade(throughSource,{fakeClock:true,waitForGlobals:{done:true},inspectDisplay:true,waitForDisplay:true});
 assert.equal(original.paintMask,6);
 const pixels=original.$display.screen.map(color=>original.$display.palette.indexOf(color));
 // Completion stops only this source observation. Later real frames keep
 // rendering the same authored parent and child without an invented freeze.
 await routes(throughSource,original,{ms:220,names:['paintMask','parentMask','done'],pixels});
});


test('raw numeric z including NaN and Infinity preserves actual dirty-bit equality through all routes',async()=>{
 const expected={first:1,nanZ:true,second:1,third:1,infinite:true,fourth:0,raw:2.5,fifth:1};
 const original=await runPxtArcade(nonfiniteZSource,{fakeClock:true});checked(original,expected,'original');await routes(nonfiniteZSource,expected);
});

test('a real input edge wakes its callback before the next scene frame and Stop cancels its pending wait',async()=>{
 const source='let starts=0;let ends=0;controller._setUserEventsEnabled(true);controller.A.onEvent(ControllerButtonEvent.Pressed,function(){starts++;pause(40);ends++});let ready=1;ready+=0;',runs=[];
 try{
  const run=await execute(arcadeToPseudocode(source),runs),clock=run.vm.runtime.bwArcadeProgramClock;
  await clock.advanceTo(10);run.vm.postIOData('keyboard',{key:' ',isDown:true});await run.vm.runtime._arcadeFramePhase.continuation;
  assert.equal(globals(run).starts,1,'actual callback executes at the real10ms edge before20ms frame');assert.equal(globals(run).ends,0);assert.equal(run.vm.runtime.bwArcadeDeviceState.elapsedMs,0);
  run.vm.stopAll();await clock.advanceTo(100);assert.equal(globals(run).ends,0);assert.equal(run.vm.runtime.threads.length,0);
  run.vm.postIOData('keyboard',{key:' ',isDown:false});await run.vm.runtime._arcadeFramePhase.continuation;
  await finish(run);assert.equal(globals(run).starts,0);assert.equal(globals(run).ends,0);assert.deepEqual(run.errors,[]);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
