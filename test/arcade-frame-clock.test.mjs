import test from 'node:test';
import assert from 'node:assert/strict';
import {VM,SB3Creator,runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const Arcade=loadExtensionClass('arcade');
const schedules={hz30:Array.from({length:30},(_,i)=>Math.round((i+1)*1000/30)),hz60:Array.from({length:60},(_,i)=>Math.round((i+1)*1000/60)),irregular:[10,35,100,150,225,250,300,350,400,475,500,600,650,700,800,850,900,1000]};
const make=async()=>{
 const creator=new SB3Creator();creator.parse('DEVICE ARCADE\nSPRITE hero:\nWHEN flag clicked:\n  hide\n');
 const vm=new VM();await vm.loadProject(Buffer.from(await(await creator.generateSB3()).arrayBuffer()));
 const ext=new Arcade(vm.runtime);const id=ext.spawnSprite({TEMPLATE:'hero',KIND:'Player',X:80,Y:60,WIDTH:2,HEIGHT:2});ext.setSpriteProperty({ID:id,PROPERTY:'vx',VALUE:30});
 vm.runtime.currentStepTime=1000/60;return {vm,ext,id};
};

test('elapsed VM-clock schedules at30Hz/60Hz/irregular intervals match original PXT physics',async t=>{
 let source='let moving=sprites.create(img`5 5\n5 5`,SpriteKind.Player)\n';
 for(const [name,times] of Object.entries(schedules)){
  source+='moving.setPosition(80,60)\nmoving.vx=30\n';let last=0;
  for(const now of times){source+=`game.currentScene().physicsEngine.move(${(now-last)/1000})\n`;last=now;}
  source+=`let ${name}=moving.x\n`;
 }
 const oracle=await runPxtArcade(source);
 for(const [name,times] of Object.entries(schedules)){
  const {vm,ext,id}=await make();let now=0;vm.runtime.updateCurrentMSecs=()=>{vm.runtime.currentMSecs=now;};
  try{
   vm.runtime._step();assert.equal(ext.spriteProperty({ID:id,PROPERTY:'x'}),80,'first timestamp seeds clock with zero delta');
   for(now of times)vm.runtime._step();
   assert.equal(ext.spriteProperty({ID:id,PROPERTY:'x'}),oracle[name],name);
   assert.equal(vm.runtime.bwArcadeDeviceState.elapsedMs,1000,name+' elapsed time');
   assert.ok(oracle[name]>80 && oracle[name]<111,'bounded forward movement');
   t.diagnostic(JSON.stringify({schedule:name,elapsedMs:1000,originalX:oracle[name],nativeX:ext.spriteProperty({ID:id,PROPERTY:'x'})}));
  }finally{vm.quit();}
 }
});

test('frame clock clamps backward timestamps, supports explicit offline deltas and resets on green flag/restart',async()=>{
 const {vm,ext,id}=await make();let now=1000;const deltas=[];vm.runtime.updateCurrentMSecs=()=>{vm.runtime.currentMSecs=now;};vm.runtime.on('ARCADE_FRAME',dt=>deltas.push(dt));
 try{
  vm.runtime._step();now=990;vm.runtime._step();assert.deepEqual(deltas,[0,0]);
  now=1010;vm.runtime._step();assert.equal(deltas.at(-1),20);
  vm.runtime._step(1000/30);assert.equal(deltas.at(-1),1000/30);
  vm.greenFlag();now=5000;vm.runtime._step();assert.equal(deltas.at(-1),0,'green flag has no stopped-time jump');
  now=6000;vm.start();vm.quit();vm.runtime._step();assert.equal(deltas.at(-1),0,'scheduler restart reseeds clock');
  vm.runtime._step(-1);assert.equal(deltas.at(-1),0,'invalid explicit delta uses clock');
 }finally{vm.quit();}
});

test('scene-frame waits and physics share actual owned timer authority and callback deltas',async()=>{
 const source=`game.pushScene()
let phase=0
let startedAt=-1
let resumedAt=-1
let sceneAfterWait=-1
function install(){let captured=0;game.onUpdate(function(){captured+=1;if(phase===0){phase=1;startedAt=control.millis();pause(70);resumedAt=control.millis();sceneAfterWait=game.runtime();phase=2;}})}
install()
pause(120)
let sampledScene=game.runtime()
let done=phase
done+=0`;
 const original=await runPxtArcade(source,{fakeClock:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,frameAuthority:'timed'}),clock=createArcadeDiscreteTimers();
 const values=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
 try{
  run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();
  await stepFrames(run.vm,1,0);await clock.advanceTo(0);
  await clock.advanceTo(original.resumedAt-1);assert.equal(Number(values().phase),1,'the actual source wait is still blocked before its deadline');
  await clock.advanceTo(original.resumedAt);assert.equal(Number(values().phase),2,'actual continuation resumes without a synthetic physics frame');
  await clock.advanceTo(120);
  for(const name of ['startedAt','resumedAt','sceneAfterWait','sampledScene','done'])assert.equal(values()[name],original[name],name);
  assert.equal(run.vm.runtime.bwArcadeDeviceState.elapsedMs,original.sampledScene,'frame callback duration determines the next real scene worker delta');
  assert.deepEqual(run.errors,[]);
 }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
