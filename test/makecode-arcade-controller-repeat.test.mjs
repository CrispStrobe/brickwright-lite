import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const Arcade=loadExtensionClass('arcade');
const slot={PLAYER:'2',BUTTON:'B',PROPERTY:'repeatDelay'};
test('native repeat property cells preserve undefined and primitive operands across scenes and reset at program start',()=>{
 const runtime=createArcadeRuntimeMock(),a=new Arcade(runtime);
 assert.equal(BW.decode(a.buttonRepeatProperty(slot)),undefined);
 for(const value of [0,-3.5,NaN,Infinity,null,undefined]){
  a.setButtonRepeatProperty({...slot,VALUE:BW.encode(value)});
  assert.ok(Object.is(BW.decode(a.buttonRepeatProperty(slot)),value));
 }
 a.setButtonRepeatProperty({...slot,VALUE:24});a.pushScene();assert.equal(BW.decode(a.buttonRepeatProperty(slot)),24);a.popScene();assert.equal(BW.decode(a.buttonRepeatProperty(slot)),24);
 a.setButtonRepeatDefaults({DELAY:80,INTERVAL:40});runtime.emit('PROJECT_START');
 assert.equal(BW.decode(a.buttonRepeatProperty(slot)),undefined);assert.deepEqual(a._inst._repeatDefaults,{delay:500,interval:30});
 assert.throws(()=>a.setButtonRepeatProperty({...slot,VALUE:{}}),/primitive/);
 for(const bad of [{PLAYER:'5'},{BUTTON:'menu'},{PROPERTY:'elapsed'}])assert.throws(()=>a.buttonRepeatProperty({...slot,...bad}),/repeat/);
});
test('repeat block ABI uses direct fixed fields and numeric palette shadows',()=>{
 const a=new Arcade(createArcadeRuntimeMock()),info=a.getInfo();
 for(const opcode of ['buttonRepeatProperty','setButtonRepeatProperty']){
  const b=info.blocks.find(b=>b.opcode===opcode);assert.ok(b);
  for(const name of ['PLAYER','BUTTON','PROPERTY'])assert.equal(info.menus[b.arguments[name].menu].acceptReporters,false);
 }
 assert.equal(info.blocks.find(b=>b.opcode==='setButtonRepeatProperty').arguments.VALUE.type,'number');
});
test('fixed controller repeat source receivers retain complete effectful RHS and reject shadowed or unknown SDK buttons',()=>{
 const source='let before=controller.A.repeatDelay;function value(){controller.A.repeatInterval=40;return 20};controller.player2.B.repeatDelay=value();controller.setRepeatDefault(100,40)';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 assert.match(imported.code,/arcade player 1 button A repeat property repeatDelay/);
 assert.match(imported.code,/arcade set player 2 button B repeat property repeatDelay to \(\(arcade call function/);
 assert.match(imported.code,/arcade set button repeat defaults delay/);
 for(const source of ['controller.menu.repeatDelay=10','controller.player5.A.repeatInterval=20','function f(controller:any){controller.A.repeatDelay=10};f(null)','let controller=1;controller.A.repeatDelay=10','controller.setRepeatDefault(1)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

const settingsCases=[
 ['ordinary','controller.setRepeatDefault(100,40)\ncontroller.A.repeatDelay=60\ncontroller.A.repeatInterval=20'],
 ['zero','controller.A.repeatDelay=40\ncontroller.A.repeatInterval=0'],
 ['changed','controller.A.repeatDelay=40\ncontroller.A.repeatInterval=20\ngame.onUpdate(function(){ if(game.runtime()>=100)controller.A.repeatInterval=40 })']
];
const repeatSource=settings=>`let defaultDelayUndefined=controller.A.repeatDelay===undefined
let defaultIntervalUndefined=controller.A.repeatInterval===undefined
let trace=""
let repeats=0
let pressed=0
let released=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){pressed+=1})
controller.A.onEvent(ControllerButtonEvent.Released,function(){released+=1})
controller.A.onEvent(ControllerButtonEvent.Repeated,function(){repeats+=1;trace+=game.runtime()+","})
${settings}
let ready=0
let done=0
game.onUpdate(function(){ ready=1; if(game.runtime()>=240)done=1 })
pause(240)`;
const actions={afterGlobals:{ready:1},steps:[{button:5,held:true},{delay:200},{button:5,held:false},{delay:40}]};
for(const [name,settings]of settingsCases)test('original/native/Code/same-fresh SB3/export/reimport repeat properties: '+name,async()=>{
 const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
 const {runProgram,stepFrames,quitStrandedVMs}=await import('./helpers/bw-vm.mjs');
 const {createArcadeDiscreteTimers}=await import('./helpers/arcade-discrete-timers.mjs');
 const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
 const original=await runPxtArcade(repeatSource(settings),{fakeClock:true,waitForGlobals:{done:1},buttonActions:actions});
 const keys=['defaultDelayUndefined','defaultIntervalUndefined','trace','repeats','pressed','released','done'];
 const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
 async function finish(run){
  const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now()};run.vm.greenFlag();
  await stepFrames(run.vm,1,0);await clock.advanceTo(0);assert.equal(values(run).ready,1);
  run.vm.postIOData('keyboard',{key:' ',isDown:true});await clock.advanceTo(200);
  run.vm.postIOData('keyboard',{key:' ',isDown:false});await clock.advanceTo(240);
  assert.deepEqual(run.errors,[]);for(const key of keys)assert.equal(values(run)[key],original[key],key);
 }
 async function execute(code){const run=await runProgram(code,{frames:0,storage:true,frameAuthority:'timed',retainExtensionTimers:true});assert.deepEqual(run.creator.warnings,[]);await finish(run);return run;}
 try{
  const imported=arcadeToPseudocode(repeatSource(settings));assert.deepEqual(imported.unsupported,[]);
  const native=await execute(imported.code);await execute(native.creator.decompile());
  const sb3=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(sb3);await finish(native);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:'timed',retainExtensionTimers:true});fresh.vm.stopAll();await fresh.vm.loadProject(sb3);await finish(fresh);
  const exported=projectToArcade(native.creator.project);assert.deepEqual(exported.unsupported,[]);
  const out=await runPxtArcade(exported.files,{fakeClock:true,waitForGlobals:{done:1},buttonActions:actions});for(const key of keys)assert.equal(out[key]??out['Game_'+key],original[key],key+' exported');
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);await execute(again.code);
 }finally{quitStrandedVMs()}
});

for(const [name,keyNames]of [['operands',['calls','initial','compound','rawNull','unset','rawNaN','child','parent','done']],['allPairs',['initialPairs','total','trace','repeats','done']]])test('original/native/Code/same-fresh SB3/export/reimport repeat '+name,async()=>{
 const {repeatOperandSource,repeatAllPairsSource}=await import('./fixtures/arcade-controller-repeat.mjs');
 const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
 const {runProgram,stepFrames,quitStrandedVMs}=await import('./helpers/bw-vm.mjs');
 const {createArcadeDiscreteTimers}=await import('./helpers/arcade-discrete-timers.mjs');
 const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
 const pairs=name==='allPairs',source=pairs?repeatAllPairsSource:repeatOperandSource;
 // B has enum id 6; the selected Controller constructor gives player 2
 // button ids 1+(2-1)*7 through 7+(2-1)*7, hence physical B id 13.
 const buttons={afterGlobals:{ready:1},steps:[{button:13,held:true},{delay:100},{button:13,held:false},{delay:20},{button:13,held:true},{delay:100},{button:13,held:false},{delay:20}]};
 const options={fakeClock:true,waitForGlobals:{done:pairs?1:true},...(pairs?{dependencies:{device:'*',multiplayer:'*'},buttonActions:buttons}:{})};
 const original=await runPxtArcade(source,options);
 if(pairs){assert.equal(original.initialPairs,24);assert.equal(original.total,3000);assert.equal(original.trace,'40,60,80,100,160,180,200,220,');assert.equal(original.repeats,8);}
 else{assert.equal(original.compound,15);assert.equal(original.calls,1);assert.equal(original.rawNull,true);assert.equal(original.unset,true);assert.equal(original.rawNaN,true);assert.equal(original.child,24.5);assert.equal(original.parent,24.5);}
 const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const key of keyNames)assert.equal(values(run)[key],original[key],key);};
 async function finish(run){
  if(!pairs){run.vm.greenFlag();await stepFrames(run.vm,12);check(run);return;}
  const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;
  run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now()};run.vm.greenFlag();await stepFrames(run.vm,1,0);await clock.advanceTo(0);assert.equal(values(run).ready,1);
  for(const[at,held]of [[0,true],[100,false],[120,true],[220,false]]){await clock.advanceTo(at);run.vm.runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',2,'b',held);await run.vm.runtime._arcadeFramePhase.continuation;}
  await clock.advanceTo(240);check(run);
 }
 async function execute(code){const run=await runProgram(code,{frames:0,storage:true,frameAuthority:pairs?'timed':'manual',retainExtensionTimers:pairs});await finish(run);return run;}
 try{
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const native=await execute(imported.code);await execute(native.creator.decompile());
  const saved=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(saved);await finish(native);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true,frameAuthority:pairs?'timed':'manual',retainExtensionTimers:pairs});fresh.vm.stopAll();await fresh.vm.loadProject(saved);await finish(fresh);
  const exported=projectToArcade(native.creator.project);assert.deepEqual(exported.unsupported,[]);const out=await runPxtArcade(exported.files,options);for(const key of keyNames)assert.equal(out[key]??out['Game_'+key],original[key],key+' exported');
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);await execute(again.code);
 }finally{quitStrandedVMs()}
});
