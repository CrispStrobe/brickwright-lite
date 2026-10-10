import test from 'node:test';
import assert from 'node:assert/strict';
import {MULTIPLAYER_MOVEMENT_SOURCE as source} from './fixtures/arcade-multiplayer-movement.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const dependencies={device:'*',multiplayer:'*'};
const oracle=source+`
controller.player1.right.setPressed(true)
controller.player2.left.setPressed(true)
controller._moveSprites()
let firstVX=first.vx
let secondVX=second.vx
mp.setPlayerSprite(two,replacement)
controller.player2.right.setPressed(true)
controller.player2.left.setPressed(false)
controller._moveSprites()
let detachedVX=second.vx
let replacementVX=replacement.vx
controller.player1.right.setPressed(false)
controller.player2.right.setPressed(false)
controller._moveSprites()
let releasedVX=replacement.vx`;
test('independent player movement and rebinding agree with pinned PXT across Code, Blocks, export and SB3',async()=>{
 const expected=await runPxtArcade(oracle,{dependencies});
 assert.deepEqual([expected.firstVX,expected.secondVX,expected.detachedVX,expected.replacementVX,expected.releasedVX],[100,-60,-60,60,0]);
 const exercise=async run=>{
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const state=run.vm.runtime.bwArcadeDeviceState;
  const [first,second,replacement]=Object.values(state.sprites);
  state.buttons.right=true;state.controllerButtons={2:{left:true}};
  await stepFrames(run.vm,2);assert.equal(first.vx,expected.firstVX);assert.equal(second.vx,expected.secondVX);assert.equal(replacement.vx,0);
  run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,2);run.vm.postIOData('keyboard',{key:'z',isDown:false});
  state.controllerButtons[2]={right:true};await stepFrames(run.vm,2);
  assert.equal(second.vx,expected.detachedVX);assert.equal(replacement.vx,expected.replacementVX);
  state.buttons.right=false;state.controllerButtons[2]={};await stepFrames(run.vm,1);assert.equal(first.vx,0);assert.equal(replacement.vx,expected.releasedVX);
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});await exercise(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 assert.equal(JSON.parse(exported.files['pxt.json']).dependencies.multiplayer,'*');await runPxtArcade(exported.files);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);
});
test('movement arity and multiplayer event/data gaps stay explicit',()=>{
 for(const source of ['mp.moveWithButtons()','mp.moveWithButtons(null,1,2,3)','mp.onControllerEvent(ControllerEvent.Connected,function(p){})'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
