import test from 'node:test';
import assert from 'node:assert/strict';
import {DIRECT_CONTROLLERS_SOURCE as source} from './fixtures/arcade-direct-controllers.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const oracle=source+`
controller.player1.right.setPressed(true)
controller.player2.left.setPressed(true)
controller.player2.down.setPressed(true)
controller.player3.right.setPressed(true)
controller.player4.right.setPressed(true)
controller.player4.down.setPressed(true)
controller._moveSprites()
let firstVX=first.vx
let secondVX=second.vx
let secondVY=second.vy
let thirdVX=third.vx
let fourthVX=fourth.vx
controller.player2.stopControllingSprite(second)
controller.player2.left.setPressed(false)
controller.player2.down.setPressed(false)
controller.player4.right.setPressed(false)
controller.player4.down.setPressed(false)
controller._moveSprites()
let stoppedVX=second.vx
let stoppedVY=second.vy
let releasedVX=fourth.vx`;
test('direct controllers agree with original PXT through Code, Blocks, MakeCode export and saved SB3',async()=>{
 const expected=await runPxtArcade(oracle);
 assert.deepEqual([expected.firstVX,expected.secondVX,expected.secondVY,expected.thirdVX,expected.fourthVX,expected.releasedVX],[30,-181*100/256,181*100/256,60,181*80/256,0]);
 const exercise=async run=>{
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const state=run.vm.runtime.bwArcadeDeviceState;
  const [first,second,third,fourth]=Object.values(state.sprites);
  state.buttons.right=true;state.controllerButtons={2:{left:true,down:true},3:{right:true},4:{right:true,down:true}};
  await stepFrames(run.vm,2);
  assert.deepEqual([first.vx,second.vx,second.vy,third.vx,fourth.vx],[expected.firstVX,expected.secondVX,expected.secondVY,expected.thirdVX,expected.fourthVX]);
  run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,2);run.vm.postIOData('keyboard',{key:'z',isDown:false});
  state.controllerButtons[2]={};state.controllerButtons[4]={};await stepFrames(run.vm,1);
  assert.deepEqual([second.vx,second.vy,fourth.vx],[expected.stoppedVX,expected.stoppedVY,expected.releasedVX]);
  assert.equal(state.controlledSprites[2].length,0);
 };
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});await exercise(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 assert.equal(JSON.parse(exported.files['pxt.json']).dependencies.multiplayer,undefined);
 assert.match(exported.ts,/controller\.player2\.stopControllingSprite\(second\)/);
 await runPxtArcade(exported.files);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,3);await exercise(run);
});
test('controller selector is a native dropdown and invalid bindings stay explicit',()=>{
 const Arcade=loadExtensionClass('arcade'),ext=new Arcade(stubRuntime()),info=ext.getInfo();
 assert.equal(info.menus.controllerNumbers.acceptReporters,false);
 assert.deepEqual(info.menus.controllerNumbers.items,['1','2','3','4']);
 for(const op of ['controlSpriteByController','stopControllingSprite']){
  assert.equal(info.blocks.find(b=>b.opcode===op).arguments.CONTROLLER.menu,'controllerNumbers');
  assert.throws(()=>ext[op]({CONTROLLER:5,ID:null}),/controller must be/);
 }
 for(const call of ['controller.player2.moveSprite()','controller.player4.moveSprite(null,1,2,3)','controller.player1.stopControllingSprite()','controller.player2.stopControllingSprite(null,null)','controller.player5.moveSprite(null)','controller.stopControllingSprite(null)'])assert.ok(arcadeToPseudocode(call).unsupported.length>0,call);
 const shadow=arcadeToPseudocode('let controller=7;controller.player2.moveSprite(null)');assert.ok(shadow.unsupported.some(g=>g.includes('shadowed controller')),JSON.stringify(shadow.unsupported));
});
test('null direct bindings are no-ops and controller rebinding preserves free axes',async()=>{
 const imported=arcadeToPseudocode(`controller.player2.moveSprite(null)
controller.player2.stopControllingSprite(null)
let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.vy=17
controller.player3.moveSprite(hero,30,0)
controller.player3.moveSprite(hero,0,0)`);
 assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const state=run.vm.runtime.bwArcadeDeviceState,hero=Object.values(state.sprites)[0];
 state.controllerButtons={3:{right:true}};await stepFrames(run.vm,1);assert.equal(hero.vx,0);assert.equal(hero.vy,17);
});
