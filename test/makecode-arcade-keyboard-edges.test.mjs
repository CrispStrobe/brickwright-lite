import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {VM_SRC,loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {SCENES_CONTROLLER_SOURCE} from './fixtures/arcade-scenes.mjs';
const Keyboard=createRequire(import.meta.url)(`${VM_SRC}/io/keyboard`);
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('keyboard emits only actual transitions after pressed-state mutation and preserves Scratch repeat events',()=>{
 const events=[];let keyboard;const runtime={emit(name,key,down){events.push({name,key,down,held:keyboard.getKeyIsDown(key)});}};keyboard=new Keyboard(runtime);
 keyboard.postData({key:' ',isDown:true});keyboard.postData({key:' ',isDown:true});keyboard.postData({key:' ',isDown:false});keyboard.postData({key:' ',isDown:false});
 assert.deepEqual(events.filter(e=>e.name==='KEY_STATE_CHANGED'),[{name:'KEY_STATE_CHANGED',key:'space',down:true,held:true},{name:'KEY_STATE_CHANGED',key:'space',down:false,held:false}]);assert.equal(events.filter(e=>e.name==='KEY_PRESSED').length,2);
});
const source=`game.pushScene()
game.popScene()
let downs=0
let ups=0
let repeats=0
let bDowns=0
let waiting=false
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){downs+=1})
controller.A.onEvent(ControllerButtonEvent.Released,function(){ups+=1})
controller.A.onEvent(ControllerButtonEvent.Repeated,function(){repeats+=1})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){bDowns+=1})
game.onUpdate(function(){waiting=true;pause(500);waiting=false})`;
test('real postIOData short taps run pressed/released fibers while an update frame waits',async()=>{
 const imported=arcadeToPseudocode(source),run=await runProgram(imported.code,{frames:8});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.equal(values(run).waiting,true);
 const before=run.vm.runtime.bwArcadeDeviceState.elapsedMs;
 // Both edges precede the next frame: polling alone would lose this tap.
 run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,5);
 assert.equal(values(run).downs,1);assert.equal(values(run).ups,1);assert.equal(values(run).repeats,0);assert.equal(values(run).bDowns,0);assert.equal(run.vm.runtime.bwArcadeDeviceState.elapsedMs,before,'button fibers run while update frame remains suspended');
 // Pane writes its boolean and posts the same keyboard transition. This
 // must produce one B event and must not accidentally fire A on key Z.
 const state=run.vm.runtime.bwArcadeDeviceState;state.buttons.b=true;run.vm.postIOData('keyboard',{key:'z',isDown:true});state.buttons.b=false;run.vm.postIOData('keyboard',{key:'z',isDown:false});await stepFrames(run.vm,5);
 assert.equal(values(run).bDowns,1);assert.equal(values(run).downs,1);assert.equal(values(run).ups,1);assert.equal(run.vm.runtime.bwArcadeDeviceState.elapsedMs,before);run.vm.runtime.stopAll();
});

test('real VM repeated lifecycle registrations at one source site fire on every scene push',async()=>{
 const imported=arcadeToPseudocode(SCENES_CONTROLLER_SOURCE),run=await runProgram(imported.code,{frames:10,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const tap=async key=>{run.vm.postIOData('keyboard',{key,isDown:true});run.vm.postIOData('keyboard',{key,isDown:false});await stepFrames(run.vm,10);};
 await tap(' ');assert.equal(values(run).depth,1);assert.equal(values(run).pushEvents,2,'two distinct inline callbacks with the same token');await tap('z');assert.equal(values(run).depth,0);await tap(' ');assert.equal(values(run).depth,1);assert.equal(values(run).pushEvents,4,'both callbacks must fire again');run.vm.runtime.stopAll();
});

test('all manually dispatched registered hats explicitly bypass Scratch edge caches',()=>{
 const Arcade=loadExtensionClass('arcade');const hats=new Arcade(null).getInfo().blocks.filter(block=>/^whenRegistered/.test(block.opcode || ''));
 assert.ok(hats.length>=14);for(const hat of hats)assert.equal(hat.isEdgeActivated,false,hat.opcode);
});
