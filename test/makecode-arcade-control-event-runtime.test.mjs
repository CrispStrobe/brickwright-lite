import test from 'node:test';import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const source='let trace="";control.onEvent(777,3,function(){trace+="H"});trace+="A";control.raiseEvent(777,3);trace+="B";pause(60);let observed=trace;observed+="";';
const globals=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));
async function finish(run,ms=100){run.vm.stopAll();const clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();await stepFrames(run.vm,1,0);await clock.advanceTo(ms);assert.deepEqual(run.errors,[]);return globals(run);}
test('inline control event native, editable Code, same/fresh SB3 and export/reimport preserve retained original ABH',async()=>{
 const runs=[];try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
  const run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});runs.push(run);assert.deepEqual(run.creator.warnings,[]);assert.equal((await finish(run)).observed,'ABH');
  const code=await runProgram(run.creator.decompile(),{frames:0,storage:true,frameAuthority:'timed'});runs.push(code);assert.equal((await finish(code)).observed,'ABH');
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.files['main.ts'],/control\.onEvent/);
  const originalExport=await runPxtArcade(exported.files,{fakeClock:true});assert.equal(originalExport.observed,'ABH');
  const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);const re=await runProgram(reimport.code,{frames:0,storage:true,frameAuthority:'timed'});runs.push(re);assert.equal((await finish(re)).observed,'ABH');
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);assert.equal((await finish(run)).observed,'ABH');
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:'timed'});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);assert.equal((await finish(fresh)).observed,'ABH');
 }finally{for(const r of runs)r.vm.quit();clearStrayTimers();}
});
test('named and dynamic event callbacks and unavailable target APIs retain diagnostics',()=>{
 for(const source of ['function h(){};control.onEvent(1,2,h);','let h=function(){};control.onEvent(1,2,h);','control.eventValue();','control.eventTimestamp();'])assert.notDeepEqual(arcadeToPseudocode(source).unsupported,[],source);
});
const controls=[
 ['late-queue-registration','let trace="";control.raiseEvent(790,1);control.onEvent(790,1,function(){trace+="L"});control.onEvent(0,0,function(){trace+="G"});control.raiseEvent(791,1);control.onEvent(791,1,function(){trace+="E"});pause(60);let observed=trace;observed+="";','G'],
 ['internal-sdk-button-state','let hits=0;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hits++});let before=controller.A.isPressed();control.raiseEvent(2051,5);pause(30);let pressed=controller.A.isPressed();control.raiseEvent(2050,5);pause(30);let released=controller.A.isPressed();let observed=hits;observed+=0;before=!!before;pressed=!!pressed;released=!!released;',1],
 ['raised-button-does-not-press','let hits=0;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hits++});let before=controller.A.isPressed();control.raiseEvent(2049,5);pause(60);let after=controller.A.isPressed();let observed=hits;observed+=0;',1],
 ['explicit-user-raise-while-gated','let hits=0;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){hits++});controller._setUserEventsEnabled(false);control.raiseEvent(2049,5);pause(60);let held=controller.A.isPressed();let observed=hits;observed+=0;',1],
 ['escaped-cell','let observed=0;function install(){let local=1;control.onEvent(786,1,function(){local++;observed=local});local=4};install();control.raiseEvent(786,1);pause(60);observed+=0;',5],
 ['scene-context-restoration','let trace="";control.onEvent(787,1,function(){trace+="P"});game.pushScene();control.onEvent(787,1,function(){trace+="C"});control.raiseEvent(787,1);pause(40);game.popScene();control.raiseEvent(787,1);pause(40);let observed=trace;observed+="";','CP'],
 ['transport-joined-event','let trace="";mp.onControllerEvent(ControllerEvent.Connected,function(player){trace+="C"+mp.getPlayerProperty(player,mp.PlayerProperty.Number)});control.raiseEvent(3241,2);pause(60);let observed=trace;observed+="";','C2'],
 ['connection-replacement-equal-state','let trace="";mp.onControllerEvent(ControllerEvent.Connected,function(player){trace+="O"+mp.getPlayerProperty(player,mp.PlayerProperty.Number)});mp.onControllerEvent(ControllerEvent.Connected,function(player){trace+="C"+mp.getPlayerProperty(player,mp.PlayerProperty.Number)});controller.player2.connected=true;controller.player2.connected=true;pause(60);let observed=trace;observed+="";','C2'],
 ['connection-scene-restoration','let trace="";mp.onControllerEvent(ControllerEvent.Connected,function(player){trace+="C"+mp.getPlayerProperty(player,mp.PlayerProperty.Number)});controller.player2.connected=true;pause(30);game.pushScene();mp.onControllerEvent(ControllerEvent.Disconnected,function(player){trace+="D"+mp.getPlayerProperty(player,mp.PlayerProperty.Number)});controller.player2.connected=false;pause(30);game.popScene();controller.player2.connected=true;pause(60);let observed=trace;observed+="";','C2D2C2'],
 ['wildcards','let trace="";control.onEvent(0,0,function(){trace+="A"});control.onEvent(0,4,function(){trace+="B"});control.onEvent(778,0,function(){trace+="C"});control.onEvent(778,4,function(){trace+="D"});control.raiseEvent(778,4);pause(60);let observed=trace;observed+="";','ABCD'],
 ['waiter-before-handler','let trace="";control.onEvent(779,5,function(){trace+="H"});control.runInParallel(function(){control.waitForEvent(779,5);trace+="W"});pause(20);control.raiseEvent(779,5);pause(60);let observed=trace;observed+="";','WH'],
 ['busy-context-replacement','let trace="";control.onEvent(780,1,function(){trace+="O";pause(40);trace+="o"});control.raiseEvent(780,1);pause(10);control.onEvent(780,1,function(){trace+="N"});control.raiseEvent(780,1);pause(100);let observed=trace;observed+="";','OoN'],
 ['supplied-flags-evaluated-ignored','let trace="";let calls=0;function flags(){calls++;return 32};control.onEvent(781,1,function(){trace+="S";pause(40);trace+="E"},flags());control.raiseEvent(781,1);pause(10);control.raiseEvent(781,1);pause(100);let observed=trace;observed+="";','SESE'],
 ['same-queue-nested','let trace="";let hits=0;control.onEvent(784,1,function(){hits++;trace+="S";if(hits===1)control.raiseEvent(784,1);trace+="E"});control.raiseEvent(784,1);pause(80);let observed=trace;observed+="";','SESE']
];
for(const [name,source,expected]of controls)test('inline event '+name+' matches retained unchanged original control',async()=>{
 let run;try{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});const g=await finish(run,200);assert.equal(g.observed,expected);if(name==='supplied-flags-evaluated-ignored')assert.equal(g.calls,1);if(name==='internal-sdk-button-state'){assert.equal(g.before,false);assert.equal(g.pressed,true);assert.equal(g.released,false);assert.equal(run.vm.runtime.ioDevices.keyboard.getKeyIsDown('space'),false);}if(name==='raised-button-does-not-press'){assert.equal(g.before,false);assert.equal(g.after,false);}if(name==='explicit-user-raise-while-gated')assert.equal(g.held,false);}finally{run?.vm.quit();clearStrayTimers();}
});
test('multiplayer connection and intentional raw connected values preserve Code, original export, reimport and same/fresh SB3',async()=>{
 const source='let trace="";mp.onControllerEvent(ControllerEvent.Connected,function(player){trace+="C"});mp.onControllerEvent(ControllerEvent.Disconnected,function(player){trace+="D"});controller.player2.connected=1 as any;let raw=controller.player2.connected;let exact=(raw as any)===1;controller.player2.connected=true;controller.player2.connected=0 as any;pause(60);let observed=trace;observed+="";let finalValue=controller.player2.connected;let finalExact=(finalValue as any)===0;raw=raw;exact=!!exact;finalExact=!!finalExact;';
 const expected={raw:1,exact:true,observed:'CD',finalValue:0,finalExact:true},runs=[];
 const check=async(run)=>{const g=await finish(run,100);for(const [name,value]of Object.entries(expected))assert.equal(g[name],value,name);};
 const runCode=async code=>{const run=await runProgram(code,{frames:0,storage:true,frameAuthority:'timed'});runs.push(run);await check(run);return run;};
 try{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runCode(imported.code);await runCode(run.creator.decompile());
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);const original=await runPxtArcade(exported.files,{fakeClock:true});for(const[name,value]of Object.entries(expected))assert.equal(original[name],value,'original export '+name);
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);await runCode(again.code);const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);await check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:'timed'});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);await check(fresh);
 }finally{for(const r of runs)r.vm.quit();clearStrayTimers();}
});
test('controller sources share allocation order and counter through pushed and popped scenes',async()=>{
 const source='let p1=controller.player1.id;let p2=controller.player2.id;let p3=controller.player3.id;let p4=controller.player4.id;let first=control.allocateNotifyEvent();game.pushScene();let second=control.allocateNotifyEvent();game.popScene();let third=control.allocateNotifyEvent();p1+=0;p2+=0;p3+=0;p4+=0;first+=0;second+=0;third+=0;';
 let run;try{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});const g=await finish(run);for(const[name,value]of Object.entries({p1:1027,p2:1024,p3:1025,p4:1026,first:1028,second:1029,third:1030}))assert.equal(g[name],value,name);}finally{run?.vm.quit();clearStrayTimers();}
});
test('actual VM Stop cancels waiting/queued source event work and restart owns fresh context',async()=>{
 const source='let trace="";control.onEvent(799,1,function(){trace+="H"});control.runInParallel(function(){control.waitForEvent(799,1);trace+="W"});pause(20);control.raiseEvent(799,1);pause(60);let observed=trace;observed+="";';
 let run;try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
  run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});
  run.vm.stopAll();const clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=clock;
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();
  await stepFrames(run.vm,1,0);await clock.advanceTo(10);assert.equal(globals(run).trace,'');
  run.vm.stopAll();await clock.advanceTo(1000);assert.equal(globals(run).trace,'');assert.deepEqual(run.errors,[]);
  assert.equal((await finish(run,100)).observed,'WH');
 }finally{run?.vm.quit();clearStrayTimers();}
});
test('default numeric zero source/value block shadows dispatch a single zero wildcard event',async()=>{
 let run;try{
  const imported=arcadeToPseudocode('let hits=0;control.onEvent(0,0,function(){hits++});control.raiseEvent(0,0);pause(60);let observed=hits;observed+=0;');
  assert.deepEqual(imported.unsupported,[]);run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});
  assert.equal((await finish(run)).observed,1);
 }finally{run?.vm.quit();clearStrayTimers();}
});
test('selected Arcade leaves notify-one unconfigured and broadcasts actual source through Code and SB3',async()=>{
 const source='let trace="";control.runInParallel(function(){control.waitForEvent(1023,44);trace+="A"});control.runInParallel(function(){control.waitForEvent(1023,44);trace+="B"});pause(20);control.raiseEvent(1022,44);pause(20);let first=trace;control.raiseEvent(1023,44);pause(20);let observed=trace;first+="";observed+="";';
 const runs=[];const check=async r=>{const g=await finish(r,100);assert.equal(g.first,'');assert.equal(g.observed,'AB');};
 try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
  const run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});runs.push(run);await check(run);
  const code=await runProgram(run.creator.decompile(),{frames:0,storage:true,frameAuthority:'timed'});runs.push(code);await check(code);
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);await check(run);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:'timed'});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);await check(fresh);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
