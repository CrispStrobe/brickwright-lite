import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {SDK_SPRITE_CLASS_NODES} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-class-descriptors.js';
import {createDestroyedSpriteCallbackNumberSource,DESTROYED_SPRITE_X_SOURCE_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/destroyed-sprite-callback-number-source.js';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainCallableMetadata:true});
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const n of value)walk(n,out);return out;}out.push(value);for(const [key,n]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','optionalParams','calls'].includes(key))walk(n,out);return out;};
const source='namespace SpriteKind { export const Custom=SpriteKind.create() }\nlet callbacks=0;let positions=0;let __bwDestroyKindSprite1=73;\nsprites.onDestroyed(SpriteKind.Custom,function(sprite){callbacks+=1;positions+=sprite.x;let replacement=sprites.create(img`7`,SpriteKind.Custom);replacement.setPosition(90,60)});\nlet first=sprites.create(img`2`,SpriteKind.Custom);first.setPosition(10,60);let second=sprites.create(img`3`,SpriteKind.Custom);second.setPosition(20,60);let player=sprites.create(img`5`,SpriteKind.Player);let retained=sprites.allOfKind(SpriteKind.Custom);sprites.destroyAllSpritesOfKind(SpriteKind.Custom);pause(100);let survivors=sprites.allOfKind(SpriteKind.Custom).length;let players=sprites.allOfKind(SpriteKind.Player).length;let retainedCount=retained.length;let retainedIdentity=retained[0]===first;let retainedX=first.x;first.destroy();second.destroy();sprites.destroyAllSpritesOfKind(SpriteKind.Food);let protectedValue=__bwDestroyKindSprite1;let finished=1;';
const inspect=text=>{const p=parse(text),proof=createDestroyedSpriteCallbackNumberSource(p),reads=walk(p).filter(n=>n.type==='Member'&&n.name==='x');return {p,proof,reads};};
const accepted=text=>{const {proof,reads}=inspect(text);return reads.some(n=>proof.has(n));};

test('unchanged destruction snapshot source issues only the direct callback x normal result',()=>{
 const {proof,reads}=inspect(source);assert.equal(reads.length,2);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);assert.equal(proof.has(reads[1]),false);
 assert.equal(proof.has({...reads[0]}),false);assert.equal(proof.has({type:'Identifier',name:'sprite'}),false);
});

test('callback registration and every coordinate writer retain independent actual-source obligations',()=>{
 for(const text of [
  source.replace('positions+=sprite.x','let alias=sprite;positions+=alias.x'),
  source.replace('positions+=sprite.x','sprite=first;positions+=sprite.x'),
  source.replace('positions+=sprite.x','positions+=sprite.x;foreign(sprite)'),
  source.replace('positions+=sprite.x','let nested=function(){return sprite.x};positions+=sprite.x'),
  source.replace('setPosition(10,60)','setPosition(unknown(),60)'),
  source.replace('setPosition(10,60)','setPosition(img`1`,60)'),
  source+'first.x=unknown();',source+'first.width=img`1`;',
  source+'Fx.add=foreign;',source+'Sprite.prototype.x=foreign;',
  source.replace('function(sprite)','function(sprite,other)'),
  source.replace('function(sprite)','function(sprite=first)'),
  source.replace('positions+=sprite.x','positions+=sprite.x;Object.defineProperty(first,"x",foreign)'),
  source.replace('positions+=sprite.x','positions+=sprite.x;game.pushScene()'),
  source.replace('SpriteKind.Custom,function','unknown(),function'),
  source.replace('export const Custom=SpriteKind.create()','export const Custom=foreign()'),
  'let sprites=foreign;'+source,source+'let saved=sprites;'
 ])assert.equal(accepted(text),false,text);
});

test('coordinate inputs stay literal until a separate readiness proof exists',()=>{
 assert.equal(accepted('let x=10;'+source.replace('setPosition(10,60)','setPosition(x,60)')),false);
 assert.equal(accepted(source.replace('setPosition(10,60)','setPosition(x,60)')+'let x=10;'),false);
 assert.equal(accepted(source.replace('setPosition(10,60)','setPosition(x,60)')+'let x:number;x=10;'),false);
 assert.equal(accepted('let x:number;'+source.replace('setPosition(10,60)','setPosition(x,60)')),false);
 assert.equal(accepted('let x=10;'+source.replace('setPosition(10,60)','setPosition(x,60)')+'x=unknown();'),false);
});

test('source absence, callback identity and SDK descriptors expire permanently after observation',()=>{
 const {p,proof,reads}=inspect(source);assert.equal(proof.has(reads[0]),true);p.extra=1;assert.equal(proof.current(),false);delete p.extra;assert.equal(proof.current(),false);
 const fresh=inspect(source),sprite=SDK_SPRITE_CLASS_NODES.find(n=>n.name==='Sprite'),old=sprite.extra;
 try{sprite.extra=1;assert.equal(fresh.proof.current(),false);}finally{if(old===undefined)delete sprite.extra;else sprite.extra=old;}
 assert.equal(fresh.proof.current(),false);
});

test('opaque syntax and optional callback entries refuse without running accessors',()=>{
 const p=parse(source),call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='onDestroyed');call.optional=true;assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(walk(p).find(n=>n.type==='Member'&&n.name==='x')),false);
 let observed=0;const bad={type:'Program'};Object.defineProperty(bad,'body',{get(){observed++;return [];}});assert.equal(createDestroyedSpriteCallbackNumberSource(bad).has({}),false);assert.equal(observed,0);
});

// Bind the contract to the checked-in provenance document; the producer never
// executes or downloads original SDK code. Actual target-data identity belongs
// to the parent's retained pinned-input reader/qualification.
test('selected x getter digest agrees with the pinned-contract provenance',()=>{
 assert.equal(DESTROYED_SPRITE_X_SOURCE_SHA256,'c452013b5ddea08284a6d9e6ee34e86fdc59df2dead6f34cf12d01a2dda2d4da');
 assert.match(readFileSync(new URL('../docs/ARCADE-CLASS-LINEAGE.md',import.meta.url),'utf8'),new RegExp(DESTROYED_SPRITE_X_SOURCE_SHA256));
});

test('rest parser refusal and mutated default envelopes cannot hide callback effects',()=>{
 assert.throws(()=>parse(source.replace('function(sprite)','function(...sprite)')));
 for(const key of ['restParam','parameterDefaults','parameterProperties']){const p=parse(source),fn=walk(p).find(n=>n.type==='FunctionExpression');fn[key]=key==='restParam'?'sprite':{hidden:'effect'};const proof=createDestroyedSpriteCallbackNumberSource(p);assert.equal(proof.has(walk(p).find(n=>n.type==='Member'&&n.name==='x')),false);}
 const p=parse(source),declaration=walk(p).find(n=>n.type==='Declaration'&&n.decls.some(d=>d.name==='positions'));declaration.decls[0].hiddenInitializer={type:'Call'};assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(walk(p).find(n=>n.type==='Member'&&n.name==='x')),false);
});

// Reconstructed from the retained actual exporter draft AFTER the existing
// addition recognizer has removed its genuine helper and rewritten that call.
// This test never blesses an arbitrary function body by its generated name.
const generatedModel=`function begin() {
 let tmp: number[] = null
 positions = (0 + 0)
 tmp = []
 tmp.push((0 + 1))
 values = tmp
 sprites.onDestroyed(SpriteKind.Enemy,function(eventSprite: Sprite){
  let sprite: Sprite = null
  sprite = eventSprite
  positions = positions + sprite.x
 })
 ready = (0 + 1)
}
let values: number[]
let ready: number
let positions = 0
begin()`;
test('closed zeroarg source and exact callback ingress accept the genuine rewritten generated model',()=>{
 const {p,proof,reads}=inspect(generatedModel);assert.equal(reads.length,1);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);
 const binary=walk(p).find(n=>n.type==='Binary'&&n.right?.name==='x');binary.nativeArrayDomainCall=Symbol('private recognition identity');
 const tagged=createDestroyedSpriteCallbackNumberSource(p);assert.equal(tagged.has(reads[0]),true);
 const token=binary.nativeArrayDomainCall;binary.nativeArrayDomainCall=Symbol('replacement');assert.equal(tagged.current(),false);binary.nativeArrayDomainCall=token;assert.equal(tagged.current(),false);
 assert.equal(tagged.has(reads[0]),false);
});

test('ordinary entry and callback alias ingress remain closed against every actual reference/writer',()=>{
 for(const text of [
  generatedModel.replace('function begin()','function begin(value:number)'),
  generatedModel.replace('begin()','begin(value=1)'),
  generatedModel+'\nlet escaped=begin;',
  generatedModel.replace('ready = (0 + 1)','ready=(0+1);begin()'),
  generatedModel.replace('ready = (0 + 1)','ready=(0+1);unknown()'),
  generatedModel.replace('sprite = eventSprite','positions=sprite.x; sprite = eventSprite'),
  generatedModel.replace('sprite = eventSprite','sprite = eventSprite; sprite=eventSprite'),
  generatedModel.replace('sprite = eventSprite','sprite = eventSprite;let alias=sprite'),
  generatedModel.replace('sprite = eventSprite','sprite = eventSprite;let nested=function(){return sprite.x}'),
  generatedModel.replace('positions = positions + sprite.x','positions=positions+sprite.x;eventSprite=first'),
  generatedModel.replace('tmp.push((0 + 1))','tmp.push(unknown())'),
  generatedModel.replace('tmp.push((0 + 1))','tmp.push(img`1`)'),
  generatedModel.replace('tmp.push((0 + 1))','tmp.push((0+1));tmp.push(values)')
 ])assert.equal(accepted(text),false,text);
});

test('inert rewrite identity never authorizes symbolic executable fields or copied receiver nodes',()=>{
 const p=parse(generatedModel),binary=walk(p).find(n=>n.type==='Binary'&&n.right?.name==='x'),read=binary.right;
 binary.nativeArrayDomainCall=Symbol('inert');binary.op=Symbol('unknown executable operator');assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(read),false);
 const fresh=inspect(generatedModel);assert.equal(fresh.proof.has({...fresh.reads[0]}),false);
});

test('non-enumerable executable fields cannot hide later SDK mutations or foreign calls',()=>{
 for(const text of ['Fx.add=foreign;','unknown();']){
  const p=parse(source),hidden=parse(text).body[0],expr=hidden.expr;
  Object.defineProperty(hidden,'expr',{value:expr,enumerable:false,writable:true,configurable:true});p.body.push(hidden);
  const read=walk(p).find(n=>n.type==='Member'&&n.name==='x');assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(read),false);
 }
 const p=parse(generatedModel),fn=p.body.find(n=>n.type==='FunctionDeclaration');fn.exported=true;
 assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(walk(p).find(n=>n.type==='Member'&&n.name==='x')),false);
});
