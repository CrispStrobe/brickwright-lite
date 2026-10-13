import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
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
