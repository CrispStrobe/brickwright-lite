import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const Arcade=loadExtensionClass('arcade');
function setup(){
 const runtime=new EventEmitter();runtime.startHats=()=>[];runtime.requestRedraw=()=>{};
 const ext=new Arcade(runtime);
 const id=ext.spawnSprite({TEMPLATE:'',KIND:'Player',X:80,Y:60,WIDTH:2,HEIGHT:2});
 return {ext,id,runtime,sprite:runtime.bwArcadeDeviceState.sprites[id]};
}
const set=(ext,id,value)=>ext.setSpriteProperty({ID:id,PROPERTY:'flags',VALUE:value});
const read=(ext,id)=>ext.spriteProperty({ID:id,PROPERTY:'flags'});

test('writable flags preserve raw numbers before a bitwise flag operation',()=>{
 const {ext,id}=setup();
 for(const value of [1.5,Infinity,NaN,-Infinity,-0]){set(ext,id,value);assert.ok(Object.is(read(ext,id),value));}
 set(ext,id,32);ext.setSpriteFlag({ID:id,FLAG:'Ghost',ON:true});assert.equal(read(ext,id),7200);
 ext.setSpriteFlag({ID:id,FLAG:'Ghost',ON:false});assert.equal(read(ext,id),32);
 assert.throws(()=>set(ext,id,{}),/flags require a primitive/);
});

test('manual Destroyed masks guard destruction, clearing retained flags permits another callback',async()=>{
 const {ext,id,sprite,runtime}=setup();const seen=[];
 runtime.startHats=opcode=>{seen.push({opcode,fields:{...ext._inst._currentEvent}});return [];};
 ext.registerSpriteDestroyed({ID:id,TOKEN:'instance'});
 set(ext,id,2);assert.equal(ext.spriteCount({KIND:'Player'}),0);
 await ext.destroySprite({ID:id});assert.equal(seen.length,0);
 assert.ok(ext._state().sprites[id]);
 set(ext,id,0);await ext.destroySprite({ID:id});assert.equal(read(ext,id),2);
 assert.equal(ext.spriteCount({KIND:'Player'}),0);assert.equal(seen.length,2);
 set(ext,id,0);assert.equal(read(ext,id),0);await ext.destroySprite({ID:id});
 assert.equal(seen.length,4);assert.equal(seen.filter(x=>x.fields.TOKEN==='instance').length,2);
 assert.equal(sprite.flags,2);assert.equal(ext._state().sprites[id],undefined);
});

test('raw mask writes update physical flag state and clipping retains unrelated bits',()=>{
 const {ext,id,sprite}=setup();
 set(ext,id,128|256|8|2048);assert.equal(sprite.invisible,true);assert.equal(sprite._wallClipping,true);
 assert.equal(sprite.stayInScreen,true);assert.equal(sprite.ghostThroughWalls,true);
 ext._setSpriteClipping(sprite,false);assert.equal(read(ext,id),128|8|2048);
 ext._setSpriteClipping(sprite,true);assert.equal(read(ext,id),128|256|8|2048);
 set(ext,id,0);assert.equal(sprite.invisible,false);assert.equal(sprite._wallClipping,false);
 assert.equal(sprite.stayInScreen,false);assert.equal(sprite.ghostThroughWalls,false);
 assert.ok(ext.getInfo().menus.spriteProperties.items.includes('flags'));
});

test('source flags require proven primitive values and real unshadowed SDK constants',()=>{
 for(const rhs of ['1.5','Infinity','NaN','SpriteFlag.Ghost','sprites.Flag.Destroyed','sprites.Flag.IsClipping','sprites.Flag.HitboxOverlaps']){
  const result=arcadeToPseudocode('let actor=sprites.create(img`1`,SpriteKind.Player);actor.flags='+rhs);
  assert.deepEqual(result.unsupported,[],rhs);assert.match(result.code,/arcade set flags of/);
 }
 for(const rhs of ['actor','img`1`','[1]','{}']){
  const result=arcadeToPseudocode('let actor=sprites.create(img`1`,SpriteKind.Player);actor.flags='+rhs+' as any');
  assert.ok(result.unsupported.length>0,rhs);
 }
 const shadow=arcadeToPseudocode('let SpriteFlag=1;let actor=sprites.create(img`1`,SpriteKind.Player);actor.flags=SpriteFlag.Ghost');
 assert.ok(shadow.unsupported.length>0);
});
