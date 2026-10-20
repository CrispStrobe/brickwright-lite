import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

const source=`let mode=0
sprites.onCreated(SpriteKind.Projectile,function(actor){
 if(mode==1)actor.flags=32
 if(mode==2){actor.flags=32;actor.destroy()}
 if(mode==3)actor.flags=1.5
})
let normal=sprites.createProjectileFromSide(img\`1 1 1\`,-40,0)
let normalFlags=normal.flags;let normalX=normal.x
mode=1
let edge=sprites.createProjectileFromSide(img\`1 1 1\`,-40,0)
let edgeFlags=edge.flags;let edgeX=edge.x
let parent=sprites.create(img\`1\`,SpriteKind.Player)
parent.setPosition(200,70);parent.destroy()
mode=2
let dead=sprites.createProjectileFromSprite(img\`1 1 1\`,parent,40,0)
let deadFlags=dead.flags;let deadX=dead.x;let deadY=dead.y;let deadVx=dead.vx
mode=3
let changed=sprites.createProjectileFromSide(img\`1 1 1\`,-40,0)
let changedFlags=changed.flags;let changedX=changed.x
mode=0;scene.centerCameraAt(200,100)
let cameraShot=sprites.createProjectileFromSide(img\`1 1 1\`,-40,0)
let cameraFlags=cameraShot.flags;let cameraX=cameraShot.x;let cameraY=cameraShot.y
tiles.setTilemap(tiles.createTilemap(hex\`0200020000000000\`,img\`. .
. .\`,[img\`${('1 '.repeat(16).trim()+'\n').repeat(16)}\`],TileScale.Sixteen))
scene.centerCameraAt(80,60)
let tileShot=sprites.createProjectileFromSide(img\`1 1 1\`,-40,0)
let tileFlags=tileShot.flags;let tileX=tileShot.x;let tileY=tileShot.y
normalFlags+=0;normalX+=0;edgeFlags+=0;edgeX+=0;deadFlags+=0;deadX+=0;deadY+=0;deadVx+=0;changedFlags+=0;changedX+=0
cameraFlags+=0;cameraX+=0;cameraY+=0
tileFlags+=0;tileX+=0;tileY+=0
`;
const names=['normalFlags','normalX','edgeFlags','edgeX','deadFlags','deadX','deadY','deadVx','changedFlags','changedX','cameraFlags','cameraX','cameraY','tileFlags','tileX','tileY'];
const globals=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('projectile finalization retains handler changes, destroyed references and original default masks through authoring routes',async()=>{
 const expected=await runPxtArcade(source,{fakeClock:true});
 assert.equal(expected.normalFlags,20);assert.equal(expected.edgeFlags,52);assert.equal(expected.deadFlags,54);assert.equal(expected.deadX,200);assert.equal(expected.deadY,70);assert.equal(expected.deadVx,40);assert.equal(expected.changedFlags,21);
 const runs=[];
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});runs.push(run);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(globals(run)[name],expected[name],name);return run;};
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported);
  await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project,{costumeSvg:(_target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  const original=await runPxtArcade(exported.files,{fakeClock:true});for(const name of names)assert.equal(original[name]??original['Game_'+name],expected[name],name+' exported');
  await execute(arcadeToPseudocode(exported.files));
  const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
  await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);
  assert.deepEqual(fresh.errors,[]);for(const name of names)assert.equal(globals(fresh)[name],expected[name],name+' fresh SB3');
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
