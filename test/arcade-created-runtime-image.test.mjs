import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const source=`namespace SpriteKind { export const Custom=SpriteKind.create() }
let made=0
sprites.onCreated(SpriteKind.Custom,function(sprite){
  sprite.setImage(img\`22\n22\n22\`)
  made+=1
})
let first=sprites.create(img\`1\`,SpriteKind.Custom)
let second=sprites.create(img\`1\`,SpriteKind.Custom)
let firstWidth=first.width
let secondHeight=second.height
let imagesDistinct=first.image!==second.image
first.image.setPixel(0,0,4)
let firstPixel=first.image.getPixel(0,0)
let secondPixel=second.image.getPixel(0,0)`;
const expected={made:2,firstWidth:2,secondHeight:3,imagesDistinct:true,firstPixel:4,secondPixel:2};
async function native(imported){
 const run=await runProgram(imported.code,{frames:2,uploads:imported.costumes,storage:true});
 try{
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
  for(const [name,value]of Object.entries(expected))assert.equal(values[name],value,name);
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,2);
  const reread=vm=>Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
  for(const [name,value]of Object.entries(expected))assert.equal(reread(run.vm)[name],value,'same SB3 '+name);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});
  try{fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,2);
   for(const [name,value]of Object.entries(expected))assert.equal(reread(fresh.vm)[name],value,'fresh SB3 '+name);
  }finally{fresh.vm.quit();}

  return {project:run.creator.project,costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data};
 }finally{run.vm.quit();clearStrayTimers();}
}
test('runtime creation callback image literals retain custom kinds and fresh image identity',async()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 assert.match(imported.code,/arcade set image of/);
 const snapshot=await native(imported);
 const Creator=(await import('../overlay/scratch-gui/src/lib/sb3-creator.js')).default;
 const creator=new Creator();creator.project=snapshot.project;
 await native({...imported,code:creator.decompile()});
});
test('runtime creation callback image writes export to the selected original and reimport',async()=>{
 const originalSource=await runPxtArcade(source);
 for(const [name,value]of Object.entries(expected))assert.equal(originalSource[name],value,'original source '+name);
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const snapshot=await native(imported),exported=projectToArcade(snapshot.project,snapshot);assert.deepEqual(exported.unsupported,[]);
 const original=await runPxtArcade(exported.files);
 for(const [name,value]of Object.entries(expected))assert.equal(Object.fromEntries(Object.entries(original).map(([k,v])=>[k.replace(/^(?:Game_)+/,''),v]))[name],value,name);
 const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);await native(reimported);
});
