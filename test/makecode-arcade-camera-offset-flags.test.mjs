import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const Arcade=loadExtensionClass('arcade');
test('deprecated camera reporters read draw offsets without updating the camera',async()=>{
 const original=await runPxtArcade('game.currentScene().camera.drawOffsetX=12.75;game.currentScene().camera.drawOffsetY=-4.25;let left=scene.cameraLeft();let top=scene.cameraTop();console.log(left);console.log(top)');
 const a=new Arcade(new EventEmitter());const camera=a._camera();camera.drawOffsetX=12.75;camera.drawOffsetY=-4.25;
 a._updateCamera=()=>{throw new Error('legacy draw offset must not trigger camera update');};
 assert.equal(a.cameraDrawOffset({AXIS:'x'}),original.left);assert.equal(a.cameraDrawOffset({AXIS:'y'}),original.top);
 assert.throws(()=>a.cameraDrawOffset({AXIS:'z'}),/x or y/);
});
test('sprite flags retain original masks and destruction status on a retained reference',async()=>{
 const original=await runPxtArcade('let actor=sprites.create(img`1`,SpriteKind.Player);let initial=actor.flags;actor.setFlag(SpriteFlag.Ghost,true);actor.setFlag(SpriteFlag.Invisible,true);let marked=actor.flags;actor.setFlag(SpriteFlag.Ghost,false);let cleared=actor.flags;actor.destroy();let destroyed=actor.flags;console.log(initial);console.log(marked);console.log(cleared);console.log(destroyed)');
 const a=new Arcade(new EventEmitter()),image=a.createImage({WIDTH:1,HEIGHT:1}),id=a.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});
 const flags=()=>a.spriteProperty({ID:id,PROPERTY:'flags'});
 assert.equal(flags(),original.initial);a.setSpriteFlag({ID:id,FLAG:'Ghost',ON:true});a.setSpriteFlag({ID:id,FLAG:'Invisible',ON:true});assert.equal(flags(),original.marked);
 a.setSpriteFlag({ID:id,FLAG:'Ghost',ON:false});assert.equal(flags(),original.cleared);await a.destroySprite({ID:id});assert.equal(flags(),original.destroyed);
});
test('camera offsets, readable flags and info-only life source select their native semantics',()=>{
 const value=arcadeToPseudocode('let left=scene.cameraLeft();let top=scene.cameraTop();let actor=sprites.create(img`1`,SpriteKind.Player);let mask=actor.flags;info.setLife(0)');assert.deepEqual(value.unsupported,[]);
 assert.match(value.code,/arcade camera draw offset x/);assert.match(value.code,/arcade camera draw offset y/);assert.match(value.code,/arcade property flags of/);assert.match(value.code,/arcade set life player/);
 for(const body of ['info.setLife(0)','let lives=info.life()','info.changeLifeBy(-1)'])assert.match(arcadeToPseudocode(body).code,/arcade (?:set life|life player|change life)/,body);
 for(const body of ['let edge=scene.cameraLeft(1)','let edge=scene.cameraTop(1)'])assert.ok(arcadeToPseudocode(body).unsupported.some(x=>x.includes('requires no arguments')),body);
});

test('camera draw offsets and flags survive original/native/Code/SB3/export/reimport',async()=>{
 const source='let oldLeft=scene.cameraLeft();let oldTop=scene.cameraTop();let actor=sprites.create(img`1`,SpriteKind.Player);let initial=actor.flags;actor.setFlag(SpriteFlag.Ghost,true);actor.setFlag(SpriteFlag.Invisible,true);let masked=actor.flags;actor.setFlag(SpriteFlag.Ghost,false);let cleared=actor.flags;actor.destroy();let destroyed=actor.flags;let done=1;console.log(initial);console.log(masked);console.log(cleared);console.log(destroyed);console.log(oldLeft);console.log(oldTop);console.log(done)';
 const names=['initial','masked','cleared','destroyed','oldLeft','oldTop','done'];
 const original=await runPxtArcade(source,{fakeClock:true});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const runs=[];const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));for(const name of names)assert.equal(values[name],original[name],name);};
 try{
  const native=await runProgram(imported.code,{frames:12,uploads:imported.costumes,storage:true});runs.push(native);check(native);
  const code=await runProgram(native.creator.decompile(),{frames:12,uploads:imported.costumes,storage:true});runs.push(code);check(code);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(native.buffer);fresh.vm.greenFlag();await stepFrames(fresh.vm,12);check(fresh);
  const exported=projectToArcade(native.creator.project,{costumeSvg:(target,costume)=>native.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
  assert.match(exported.files['main.ts'],/scene.cameraLeft\(\)/);assert.match(exported.files['main.ts'],/scene.cameraTop\(\)/);
  const exportedOriginal=await runPxtArcade(exported.files,{fakeClock:true});for(const name of names)assert.equal(exportedOriginal[name]??exportedOriginal['Game_'+name],original[name],name+' exported');
  const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);const again=await runProgram(reimported.code,{frames:12,uploads:reimported.costumes,storage:true});runs.push(again);check(again);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
