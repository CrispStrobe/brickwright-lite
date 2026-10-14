import test from 'node:test';
import assert from 'node:assert/strict';
import {repeatAuthoringFiles,repeatSample,editRepeatDelayCode} from './fixtures/arcade-controller-repeat-authoring-game.mjs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
test('repeat GUI Code edit updates every serialized command copy and preserves other players and intervals',()=>{
 const imported=arcadeToPseudocode(repeatAuthoringFiles({delay:40,interval:30}));assert.deepEqual(imported.unsupported,[]);
 const doubled=imported.code+'\n'+imported.code,edited=editRepeatDelayCode(doubled);
 assert.equal(edited.split('arcade set player 1 button A repeat property repeatDelay to (60)').length-1,2);
 assert.doesNotMatch(edited,/repeatDelay to \(40\)/);
 assert.match(edited,/arcade set player 2 button B repeat property repeatDelay to \(80\)/);
 assert.match(edited,/arcade set player 1 button A repeat property repeatInterval to \(30\)/);
 assert.throws(()=>editRepeatDelayCode('no matching property'),/No authored/);
 const creator=new SB3Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
 const code=creator.decompile(),changed=editRepeatDelayCode(code+'\n'+code);
 assert.equal(changed.split('arcade set player 1 button A repeat property repeatDelay to 60').length-1,2);
 assert.doesNotMatch(changed,/repeatDelay to 40(?:\s|$)/);
 assert.match(changed,/arcade set player 2 button B repeat property repeatDelay to 80/);
 const restored=new SB3Creator();restored.parse(editRepeatDelayCode(code));assert.deepEqual(restored.warnings,[]);
});
for(const options of [{delay:60,interval:20},{delay:40,interval:30}])test(`repeat GUI owned fixture native preflight ${options.delay}/${options.interval}`,async()=>{
 const imported=arcadeToPseudocode(repeatAuthoringFiles(options));assert.deepEqual(imported.unsupported,[]);
 try {
  const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes,frameAuthority:'timed',retainExtensionTimers:true});assert.deepEqual(run.creator.warnings,[]);
  const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now()};run.vm.greenFlag();await stepFrames(run.vm,1,0);await clock.advanceTo(0);
  const values=()=>Object.fromEntries(run.vm.runtime.targets.filter(t=>t.isOriginal).flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),v.value]));
  for(const[key,value]of Object.entries(repeatSample(options)))assert.equal(values()[key],value,key);
  async function input(player,button,isDown,time){if(player===1)run.vm.postIOData('keyboard',{key:' ',isDown});else run.vm.runtime.emit('ARCADE_PLAYER_BUTTON_EDGE',player,button,isDown);await clock.advanceTo(time)}
  await input(1,'a',true,200);assert.equal(values().first,2);
  await input(1,'a',false,220);assert.equal(values().firstReleased,1);
  await input(1,'a',true,420);assert.equal(values().first,4);
  await input(1,'a',false,440);
  await input(2,'b',true,640);assert.equal(values().second,2);
  await input(2,'b',false,660);assert.equal(values().secondReleased,1);
  await input(2,'b',true,860);assert.equal(values().second,4);
  await input(2,'b',false,880);
  assert.deepEqual(run.errors,[]);for(const[key,value]of Object.entries(repeatSample({...options,held:true})))assert.equal(values()[key],value,key);
 }finally{quitStrandedVMs()}
});
