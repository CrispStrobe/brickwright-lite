import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const source=`let one=mp.playerSelector(mp.PlayerNumber.One)
let alias=one
let two=mp.playerSelector(mp.PlayerNumber.Two)
let four=mp.playerSelector(mp.PlayerNumber.Four)
let missing=mp.isConnected(null)
let initial=mp.isConnected(one)
let connectedOne=mp.isConnected(one)
let connectedAlias=mp.isConnected(alias)
let connectedTwo=mp.isConnected(two)
let connectedFour=mp.isConnected(four)
game.onUpdate(function(){connectedOne=mp.isConnected(one);connectedAlias=mp.isConnected(alias);connectedTwo=mp.isConnected(two);connectedFour=mp.isConnected(four)})`;
const originalInputs=`
multiplayer.initPlayerConnectionListeners()
pause(40)
controller.player1.A.setPressed(true)
pause(40)
let afterPress=connectedOne
let aliasPress=connectedAlias
controller.player1.A.setPressed(false)
pause(40)
let afterRelease=connectedOne
control.raiseEvent(3242,1)
pause(40)
let afterLeave=connectedOne
control.raiseEvent(3241,4)
pause(40)
let afterJoin=connectedFour
controller.player2.B.setPressed(true)
pause(40)
let afterTwo=connectedTwo
control.raiseEvent(3242,2)
pause(40)
let afterTwoLeave=connectedTwo
controller.player2.B.setPressed(false)
pause(40)
let afterTwoRelease=connectedTwo
`;
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('original controller connection changes survive native Code, export and fresh SB3 paths',async()=>{
 const expected=await runPxtArcade(source+originalInputs,{dependencies:{device:'*',multiplayer:'*'}});
 assert.equal(expected.initial,false);assert.equal(expected.missing,false);assert.equal(expected.afterPress,true);assert.equal(expected.aliasPress,true);assert.equal(expected.afterRelease,true);assert.equal(expected.afterLeave,false);assert.equal(expected.afterJoin,true);assert.equal(expected.afterTwo,true);assert.equal(expected.afterTwoLeave,false);assert.equal(expected.afterTwoRelease,true);
 const exercise=async run=>{
  const runtime=run.vm.runtime,state=runtime.bwArcadeDeviceState;
  assert.equal(values(run).initial,expected.initial);assert.equal(values(run).missing,expected.missing);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,2,20);assert.equal(values(run).connectedOne,expected.afterPress);assert.equal(values(run).connectedAlias,expected.aliasPress);
  run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,2,20);assert.equal(values(run).connectedOne,expected.afterRelease);
  runtime.emit('ARCADE_CONTROLLER_CONNECTION',1,false);await stepFrames(run.vm,2,20);assert.equal(values(run).connectedOne,expected.afterLeave);
  runtime.emit('ARCADE_CONTROLLER_CONNECTION',4,true);await stepFrames(run.vm,2,20);assert.equal(values(run).connectedFour,expected.afterJoin);
  state.controllerButtons[2]={b:true};runtime.emit('ARCADE_CONTROLLER_INPUT',2,'b',true);runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'b',true);await stepFrames(run.vm,2,20);assert.equal(values(run).connectedTwo,expected.afterTwo);
  runtime.emit('ARCADE_CONTROLLER_CONNECTION',2,false);await stepFrames(run.vm,2,20);assert.equal(values(run).connectedTwo,expected.afterTwoLeave);
  state.controllerButtons[2].b=false;runtime.emit('ARCADE_CONTROLLER_INPUT',2,'b',false);runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'b',false);await stepFrames(run.vm,2,20);assert.equal(values(run).connectedTwo,expected.afterTwoRelease);
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 };
 const boot=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});await exercise(run);return run;};
 const imported=arcadeToPseudocode(source);const first=await boot(imported);
 try{
  const code=await boot({...imported,code:first.creator.decompile()});code.vm.quit();
  const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/mp\.isConnected/);
  const again=await runPxtArcade({...exported.files,'main.ts':exported.ts+originalInputs});for(const name of ['initial','missing','afterPress','aliasPress','afterRelease','afterLeave','afterJoin','afterTwo','afterTwoLeave','afterTwoRelease'])assert.equal(again[name],expected[name],name);
  const reimport=await boot(arcadeToPseudocode(exported.ts));reimport.vm.quit();
  const saved=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());
  const fresh=await runProgram(imported.code,{frames:0,storage:true});try{await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,3,20);await exercise(fresh);}finally{fresh.vm.quit();}
 }finally{first.vm.quit();}
});
test('connection Boolean imports preserve shadow and arity refusals',()=>{
 assert.deepEqual(arcadeToPseudocode('let connected=mp.isConnected(null)').unsupported,[]);
 for(const source of ['mp.isConnected()','mp.isConnected(null,null)','let mp=1;mp.isConnected(null)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
