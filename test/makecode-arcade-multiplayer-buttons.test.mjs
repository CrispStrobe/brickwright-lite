import test from 'node:test';
import assert from 'node:assert/strict';
import {MULTIPLAYER_BUTTONS_SOURCE as source} from './fixtures/arcade-multiplayer-buttons.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const dependencies={device:'*',multiplayer:'*'};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const input=`
controller.player2.A.setPressed(true)
pause(10)
controller.player2.A.setPressed(false)
pause(10)
controller.player1.A.setPressed(true)
pause(10)
controller.player1.A.setPressed(false)
pause(10)
controller.player4.B.setPressed(true)
controller.player4.B.setPressed(false)
pause(10)
let observedX=actor.x
while(pressed!==4 || released!==3 || legacy!==1 || quick!==44){pause(5)}`;
test('multiplayer callbacks preserve player identity, captures, replacement and input queries across roundtrips',async()=>{
 const expected=await runPxtArcade(source+input,{dependencies});
 assert.equal(expected.pressed,4);assert.equal(expected.released,3);assert.equal(expected.legacy,1);assert.equal(expected.observed,2);assert.equal(expected.identity,true);assert.equal(expected.held,true);assert.equal(expected.observedX,45);assert.equal(expected.quick,44);
 const exercise=async run=>{
  const runtime=run.vm.runtime,state=runtime.bwArcadeDeviceState;
  state.controllerButtons[2]={a:true};runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'a',true);await stepFrames(run.vm,2);
  state.controllerButtons[2].a=false;runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'a',false);await stepFrames(run.vm,2);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,2);run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,2);
  state.controllerButtons[4]={b:true};runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',4,'b',true);state.controllerButtons[4].b=false;runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',4,'b',false);await stepFrames(run.vm,4);
  for(const name of ['quick','pressed','released','legacy','observed','identity','held'])assert.equal(values(run)[name],expected[name],name);
  assert.equal(Object.values(state.sprites)[0].x,expected.observedX);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});await exercise(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const again=await runPxtArcade({...exported.files,'main.ts':exported.ts+input},{});
 for(const name of ['quick','pressed','released','legacy','observed','identity','held','observedX'])assert.equal(again[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);
});
test('button-only programs import and unknown enum, invalid callbacks and shadowed mp remain named',()=>{
 assert.deepEqual(arcadeToPseudocode('let n=0;mp.onButtonEvent(mp.MultiplayerButton.B,ControllerButtonEvent.Pressed,function(p){n=p.number})').unsupported,[]);
 for(const source of ['mp.onButtonEvent(mp.MultiplayerButton.Missing,ControllerButtonEvent.Pressed,function(p){})','mp.onButtonEvent(0,2049,function(a,b){})','let mp=1;mp.onButtonEvent(0,2049,function(p){})','mp.isButtonPressed(null)'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
