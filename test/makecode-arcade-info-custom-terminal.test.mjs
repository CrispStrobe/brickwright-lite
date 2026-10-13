import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const palette=['#000000','#ffffff','#ff2121','#ff93c4','#ff8135','#fff609','#249ca3','#78dc52','#003fad','#87f2ff','#8e2ec4','#a4839f','#5c406c','#e5cdc4','#91463d','#000000'];
const unpack=value=>'#'+[value&255,(value>>>8)&255,(value>>>16)&255].map(n=>n.toString(16).padStart(2,'0')).join('');
const marked=body=>`let shown=false;control.runInParallel(function(){pause(750);shown=true;shown=true;});${body}`;
for(const [name,body]of [['life zero','info.onLifeZero(function(){game.gameOver(true)});info.setLife(0)'],['countdown','info.onCountdownEnd(function(){game.gameOver(true)});info.startCountdown(0.2)'],['waiting life zero','let entered=-1;let enteredScene=-1;let called=-1;let calledScene=-1;info.onLifeZero(function(){entered=control.millis();enteredScene=game.runtime();pause(40);called=control.millis();calledScene=game.runtime();game.gameOver(true)});info.setLife(0)']])test(name+' callback captures the original terminal HUD and sound',async t=>{
 const source='info.setScore(7);scene.setBackgroundColor(9);game.setGameOverEffect(true,effects.none);'+body;
 const original=await runPxtArcade(marked(source),{waitForGlobals:{shown:true},waitForMain:false,inspectDisplay:true,recordSound:true,fakeClock:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes});
 try{
  let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=0;run.vm.greenFlag();
  await stepFrames(run.vm,1,0);for(let i=0;i<40;i++){now+=20;await stepFrames(run.vm,1,20);}
  if(name==='waiting life zero'){const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));assert.equal(vars.called-vars.entered,original.called-original.entered,'authored wait duration is preserved');await t.test('absolute first HUD callback phase matches original',{todo:'Existing initial main/frame phase gap: native callback starts20ms, original0ms; private phase prototype owns remedy.'},()=>assert.deepEqual(Object.fromEntries(['entered','enteredScene','called','calledScene'].map(key=>[key,vars[key]])),Object.fromEntries(['entered','enteredScene','called','calledScene'].map(key=>[key,original[key]]))));}
  assert.deepEqual(run.errors,[]);const frame=run.vm.runtime.bwArcadeDeviceState.sceneFrame;assert.ok(frame);
  const actual=Array.from(frame.pixels,index=>palette[index]),expected=original.$display.screen.map(unpack);const different=actual.map((color,i)=>color!==expected[i]?i:-1).filter(i=>i>=0);
  assert.deepEqual((run.vm.runtime.bwArcadeMusicLog || []).map(entry=>entry.bytes),original.$sound.map(entry=>entry.bytes));
  assert.deepEqual(different.slice(0,12),[],different.length+' pixel differences');
 }finally{run.vm.quit();clearStrayTimers();}
});

test('a life callback that waits and replaces its scene never publishes the old HUD into the new scene',async()=>{
 const source='let done=0;info.setScore(7);scene.setBackgroundColor(9);info.onLifeZero(function(){game.pushScene();scene.setBackgroundColor(6);pause(40);done=1});info.setLife(0)';
 const original=await runPxtArcade(source,{waitForGlobals:{done:1},inspectDisplay:true,waitForDisplay:true,fakeClock:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0});
 try{
  let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=0;run.vm.greenFlag();await stepFrames(run.vm,1,0);
  for(let i=0;i<5;i++){now+=20;await stepFrames(run.vm,1,20);}
  const state=run.vm.runtime.bwArcadeDeviceState;assert.equal(state.backgroundColor,6);assert.equal(state.infoRenderable,undefined);
  assert.deepEqual(Array.from(state.sceneFrame.pixels,index=>palette[index]),original.$display.screen.map(unpack));assert.deepEqual(run.errors,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});

test('stop and restart cancel a suspended HUD callback and its old composition',async()=>{
 const source='let done=0;info.onLifeZero(function(){pause(40);done=1});info.setLife(0)';const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0});const values=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
 try{
  let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=0;run.vm.greenFlag();await stepFrames(run.vm,1,0);now=20;await stepFrames(run.vm,1,20);
  const old=run.vm.runtime.bwArcadeDeviceState,oldFrame=old.sceneFrame,sequence=oldFrame?.sequence,pixels=oldFrame?.pixels.slice();assert.equal(values().done,0);run.vm.stopAll();now=160;await stepFrames(run.vm,1,140);assert.equal(values().done,0);assert.equal(old.sceneFrame,oldFrame,'stopped partial HUD is not published');assert.equal(oldFrame?.sequence,sequence);assert.deepEqual(oldFrame?.pixels,pixels);
  run.vm.greenFlag();await stepFrames(run.vm,1,0);assert.notEqual(run.vm.runtime.bwArcadeDeviceState,old);
  for(let i=0;i<5;i++){now+=20;await stepFrames(run.vm,1,20);}
  assert.equal(values().done,1);assert.equal(old.sceneFrame,oldFrame,'old epoch remains unpublished');assert.equal(oldFrame?.sequence,sequence);assert.deepEqual(oldFrame?.pixels,pixels);assert.deepEqual(run.errors,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});

test('a life callback restores info state and captures the original screen at callback return',async t=>{
 const source='let done=0;let returnedProgram=-1;let returnedScene=-1;let returnedScreen:Image=null;info.setScore(7);scene.setBackgroundColor(9);info.onLifeZero(function(){game.pushScene();info.setScore(3);info.setLife(1);game.popScene();info.setLife(2);returnedProgram=control.millis();returnedScene=game.runtime();returnedScreen=screen.clone();done=1});info.startCountdown(1);info.setLife(0)';
 const original=await runPxtArcade(source,{waitForGlobals:{done:1},inspectImageGlobals:['returnedScreen'],fakeClock:true});const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0});
 try{
  let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=0;run.vm.greenFlag();await stepFrames(run.vm,1,0);for(let i=0;i<6;i++){now+=20;await stepFrames(run.vm,1,20);}
  const state=run.vm.runtime.bwArcadeDeviceState;assert.equal(state.players[0].score,7);assert.equal(state.players[0].life,2);assert.deepEqual(run.errors,[]);
  const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
  const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;const native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;const image=native._image(vars.returnedScreen);
  assert.deepEqual({width:image.width,height:image.height,pixels:Array.from(image.pixels)},original.$images.returnedScreen,'all19200 screen pixels at the same authored callback-return point');
  await t.test('restored callback absolute program and scene phase matches original',{todo:'Existing first-frame phase gap: native initial HUD event20ms, original0ms; no scene-clock reset or counteroffset.'},()=>assert.deepEqual([vars.returnedProgram,vars.returnedScene],[original.returnedProgram,original.returnedScene]));
 }finally{run.vm.quit();clearStrayTimers();}
});
