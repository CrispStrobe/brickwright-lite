import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const palette=['#000000','#ffffff','#ff2121','#ff93c4','#ff8135','#fff609','#249ca3','#78dc52','#003fad','#87f2ff','#8e2ec4','#a4839f','#5c406c','#e5cdc4','#91463d','#000000'];
const unpack=value=>'#'+[value&255,(value>>>8)&255,(value>>>16)&255].map(n=>n.toString(16).padStart(2,'0')).join('');
const marked=body=>`let shown=false;control.runInParallel(function(){pause(750);shown=true;shown=true;});${body}`;
for(const [name,body] of [['countdown','info.startCountdown(0.2)'],['life zero','info.setLife(0)'],['configured countdown','game.setGameOverPlayable(false,music.melodyPlayable(music.baDing),false);info.startCountdown(0.2)']])test(name+' uses the original modern loss dialog and configured sound policy',async()=>{
 const source='info.setScore(7);scene.setBackgroundColor(9);'+body;
 const original=await runPxtArcade(marked(source),{waitForGlobals:{shown:true},waitForMain:false,inspectDisplay:true,recordSound:true,fakeClock:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes});
 try{
  let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};
  run.vm.runtime.currentMSecs=0;run.vm.greenFlag();
  await stepFrames(run.vm,1,0);
  for(let i=0;i<38;i++){now+=20;await stepFrames(run.vm,1,20);}
  assert.deepEqual(run.errors,[]);
  assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage,'modern game over pushes the captured scene');
  const frame=run.vm.runtime.bwArcadeDeviceState.sceneFrame;assert.ok(frame);
  const actual=Array.from(frame.pixels,index=>palette[index]),expected=original.$display.screen.map(unpack);
  const different=actual.map((color,i)=>color!==expected[i]?i:-1).filter(i=>i>=0);
  assert.deepEqual(different.slice(0,12),[],different.length+' pixel differences');
  assert.deepEqual((run.vm.runtime.bwArcadeMusicLog || []).map(entry=>entry.bytes),original.$sound.map(entry=>entry.bytes));
  if(name==='configured countdown')assert.ok(original.$sound.length,'explicit sound survives default loss');
  else assert.deepEqual(original.$sound,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});


test('queued default loss belongs to its scene and run, with one terminal operation',async()=>{
 const runtime=new EventEmitter(),errors=[];runtime.on('BLOCKS_ERROR',error=>errors.push(String(error)));
 const native=new(loadExtensionClass('arcade'))(runtime)._inst,calls=[];
 native._runGameOver=(win,util,pixels)=>{calls.push({win,pixels});};
 let owner=native._infoState(),pixels=new Uint8Array(19200);pixels[0]=9;
 native._defaultInfoGameOver(owner,pixels);native._defaultInfoGameOver(owner,pixels);
 await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0].win,false);assert.equal(calls[0].pixels[0],9);
 runtime.emit('PROJECT_START');owner=native._infoState();native._defaultInfoGameOver(owner,pixels);
 runtime.emit('PROJECT_STOP_ALL');await Promise.resolve();assert.equal(calls.length,1,'stop cancels pending loss');
 runtime.emit('PROJECT_START');owner=native._infoState();native._defaultInfoGameOver(owner,pixels);
 runtime.emit('PROJECT_START');await Promise.resolve();assert.equal(calls.length,1,'restart cancels old loss');
 owner=native._infoState();native._defaultInfoGameOver(owner,pixels);
 runtime.bwArcadeDeviceState={};await Promise.resolve();assert.equal(calls.length,1,'replacement scene cancels old loss');
 assert.deepEqual(errors,[]);
});
