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

const multiPrefix=generatedModel.replace('let sprite: Sprite = null','let sprite: Sprite = null\n  let replacement: Sprite = null').replace('positions = positions + sprite.x','positions = positions + sprite.x\n  replacement=sprites.create(img`1`,SpriteKind.Enemy)\n  replacement.setPosition(90,60)');
test('callback ingress follows the whole inert null declaration list without erasing those declarations',()=>{
 const {p,proof,reads}=inspect(multiPrefix),before=JSON.stringify(p);assert.equal(reads.length,1);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);assert.equal(JSON.stringify(p),before);
 assert.equal(accepted(generatedModel),true);
});

test('prefix effects and every alias read/write remain on the exact side of the bridge',()=>{
 for(const text of [
  multiPrefix.replace('let replacement: Sprite = null','let replacement: Sprite = first'),
  multiPrefix.replace('let replacement: Sprite = null','let replacement: Sprite = sprites.create(img`1`,SpriteKind.Enemy)'),
  multiPrefix.replace('sprite = eventSprite','ready=1; sprite = eventSprite'),
  multiPrefix.replace('let replacement: Sprite = null','let replacement: Sprite = sprite.x'),
  multiPrefix.replace('sprite = eventSprite','positions=sprite.x; sprite = eventSprite'),
  multiPrefix.replace('positions = positions + sprite.x','positions=positions+sprite.x; sprite=null'),
  multiPrefix.replace('sprite = eventSprite','sprite = eventSprite;let alias=sprite'),
  multiPrefix.replace('let replacement: Sprite = null','let replacement: Sprite;'),
  multiPrefix.replace('let replacement: Sprite = null','let replacement: Sprite = null, other: Sprite = null')
 ])assert.equal(accepted(text),false,text);
});

test('nullable factory receivers supply effect closure without issuing Sprite or initialization facts',()=>{
 for(const initial of ['null','undefined']){
  const text=multiPrefix+'\nlet first:Sprite='+initial+';first=sprites.create(img`1`,SpriteKind.Enemy);first.setPosition(10,60);first.destroy();';
  const {proof,reads,p}=inspect(text);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);
  for(const node of walk(p))if(node.type==='Identifier'&&['first','replacement'].includes(node.name))assert.equal(proof.has(node),false);
 }
 for(const suffix of ['first=foreign();','first=img`1`;','first=other;','first.x=unknown();'])assert.equal(accepted(multiPrefix+'\nlet first:Sprite=null;first=sprites.create(img`1`,SpriteKind.Enemy);'+suffix+'first.setPosition(10,60);'),false,suffix);
 assert.equal(accepted(multiPrefix+'\nlet first:Sprite=null;first.setPosition(10,60);'),false);
 assert.equal(accepted(multiPrefix+'\nlet first:Sprite;first=sprites.create(img`1`,SpriteKind.Enemy);first.setPosition(10,60);'),true);
});

// The flattened alias is deliberately an ordinary name: no generated-name
// prefix enrolls a Number, identity or initialized-variable producer.
const flatKindSource=`namespace SpriteKind { export let Custom:number }
let assignedKind:number
let positions=0
assignedKind=undefined
assignedKind=SpriteKind.create()
SpriteKind.Custom=assignedKind
sprites.onDestroyed(assignedKind,function(eventSprite:Sprite){
 let sprite:Sprite=null
 let replacement:Sprite=null
 sprite=eventSprite
 positions=positions+sprite.x
 replacement=sprites.create(img\`1\`,assignedKind)
 replacement.setPosition(90,60)
})
let first=sprites.create(img\`1\`,assignedKind)
first.setPosition(10,60)
let retained=sprites.allOfKind(assignedKind)
sprites.destroyAllSpritesOfKind(assignedKind)`;

test('canonical flattened kind triad issues only SDK kind input authority after its frontier',()=>{
 const {p,proof,reads}=inspect(flatKindSource);assert.equal(proof.reason,null);assert.equal(reads.length,1);assert.equal(proof.has(reads[0]),true);
 for(const node of walk(p))if(node.type==='Identifier'&&node.name==='assignedKind')assert.equal(proof.has(node),false);
 assert.equal(accepted(flatKindSource.replace('onDestroyed(assignedKind','onDestroyed(SpriteKind.Custom')),true);
 assert.equal(accepted(flatKindSource.replace('let assignedKind:number','let ordinaryAlias:number').replaceAll('assignedKind','ordinaryAlias')),true);
 assert.equal(accepted(source),true,'the authored const kind path remains independent');
});

test('flattened kind alias and slot retain every writer and the exact adjacent root triad',()=>{
 for(const text of [
  flatKindSource.replace('assignedKind=SpriteKind.create()','assignedKind=other.create()'),
  'let SpriteKind=other;'+flatKindSource,
  flatKindSource.replace('assignedKind=SpriteKind.create()','assignedKind=SpriteKind.other()'),
  flatKindSource.replace('let assignedKind:number','let assignedKind:number;let assignedKind:number'),
  flatKindSource.replace('assignedKind=SpriteKind.create()','positions=0;assignedKind=SpriteKind.create()'),
  flatKindSource+'\nassignedKind=0;',
  flatKindSource+'\nassignedKind++;',
  flatKindSource+'\nSpriteKind.Custom=0;',
  flatKindSource.replace('SpriteKind.Custom=assignedKind','SpriteKind.Other=assignedKind'),
  flatKindSource+'\nSpriteKind.create=other;',
  flatKindSource.replace('assignedKind=undefined','sprites.allOfKind(assignedKind);assignedKind=undefined'),
  flatKindSource.replace('assignedKind=undefined','sprites.allOfKind(SpriteKind.Custom);assignedKind=undefined'),
  flatKindSource+'\nfunction observe(){sprites.allOfKind(assignedKind)}observe();',
  flatKindSource+'\nlet copy=assignedKind;',
  flatKindSource+'\npositions+=assignedKind;',
  flatKindSource+'\nfirst.setPosition(assignedKind,60);',
  flatKindSource.replace('assignedKind=undefined','assignedKind=null'),
  flatKindSource.replace('export let Custom:number','export let Custom:number=0'),
  flatKindSource.replaceAll('Custom','nextKind'),
  flatKindSource.replaceAll('Custom','_nextKind'),
  flatKindSource.replaceAll('Custom','constructor'),
  flatKindSource+'\nlet extracted=SpriteKind.create;'
 ])assert.equal(accepted(text),false,text);
});

test('flattened kind receipt expires on removed absence and writer changes',()=>{
 const {p,proof,reads}=inspect(flatKindSource);assert.equal(proof.has(reads[0]),true);
 const triad=walk(p).find(n=>n.type==='Assignment'&&n.left?.type==='Member'&&n.left.name==='Custom'),before=triad.left.name;
 triad.left.name='Other';assert.equal(proof.current(),false);triad.left.name=before;assert.equal(proof.current(),false);
 const fresh=inspect(flatKindSource);fresh.p.body.push({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name:'assignedKind'},right:{type:'Number',value:'1'}}});assert.equal(fresh.proof.current(),false);
});

test('computed member flags and malformed callback envelopes never select the literal SDK contract',()=>{
 for(const target of ['registration','property','exported','parameter','body']){
  const p=parse(source),all=walk(p),read=all.find(n=>n.type==='Member'&&n.name==='x'),fn=all.find(n=>n.type==='FunctionExpression');
  if(target==='registration')all.find(n=>n.type==='Call'&&n.callee?.name==='onDestroyed').callee.computed=true;
  if(target==='property')read.computed=true;
  if(target==='exported')fn.exported=true;
  if(target==='parameter')fn.params[0]={type:'Identifier',name:fn.params[0]};
  if(target==='body')fn.body={type:'ExpressionStatement',expr:{type:'Number',value:'0'}};
  assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(read),false,target);
 }
});

const registryLoop=`function below(a:any,b:any):boolean{return a<b}
function identical(a:any,b:any):boolean{return a===b}
let positions=0
sprites.onDestroyed(SpriteKind.Enemy,function(eventSprite:Sprite){
 let sprite:Sprite=null
 sprite=eventSprite
 positions=positions+sprite.x
})
let first=sprites.create(img\`1\`,SpriteKind.Enemy)
first.setPosition(10,60)
let saved:Sprite[]=null
saved=sprites.allOfKind(SpriteKind.Enemy)
let cursor=0
let element:Sprite=null
while(below(cursor,saved.length)){
 element=saved[cursor]
 element.destroy()
 cursor=(+cursor)+1
}
let same=identical(saved[0],first)`;

test('renamed pure comparisons and closed snapshot while retain only callback x authority',()=>{
 const {p,proof,reads}=inspect(registryLoop);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);
 for(const n of walk(p))if(n.type==='Identifier'||n.type==='Index'||n.type==='Call'||n.type==='Member'&&n.name==='length')assert.equal(proof.has(n),false);
 assert.equal(accepted(registryLoop.replaceAll('below','otherName').replaceAll('identical','differentName')),true);
 assert.equal(accepted(registryLoop.replace('element=saved[cursor]','element=saved[-1]')),true,'normal missing-element effect may throw; no presence claim');
});

test('snapshot writer/index domains are actual source facts, never annotations or names',()=>{
 for(const text of [
  registryLoop.replace('let cursor=0','let cursor:number'),
  registryLoop.replace('let cursor=0','let cursor="zero"'),
  registryLoop.replace('saved[cursor]','saved[unknown()]'),
  registryLoop.replace('saved[cursor]','saved[img`1`]'),
  registryLoop+'\nsaved=foreign();',
  registryLoop+'\nsaved=img`1`;',
  registryLoop.replace('element=saved[cursor]','element=foreign()'),
  registryLoop.replace('element.destroy()','element.setPosition(10,60)'),
  registryLoop.replace('element.destroy()','positions=positions+element.x'),
  registryLoop.replace('element.destroy()','foreign(element)'),
  registryLoop.replace('element.destroy()','element.destroy(1)'),
  registryLoop.replace('while(below(cursor,saved.length))','while(foreign())'),
  registryLoop.replace('cursor=(+cursor)+1','cursor="later"')
 ])assert.equal(accepted(text),false,text);
});

test('pure comparison profiles bind exact bodies, formals, calls and coercion boundaries',()=>{
 for(const text of [
  registryLoop.replace('return a<b','return b<a'),
  registryLoop.replace('return a<b','foreign();return a<b'),
  registryLoop.replace('return a<b','return below(a,b)'),
  registryLoop.replace('below(a:any,b:any)','below(a:any,b:any,c:any)'),
  registryLoop.replace('below(a:any,b:any)','below(a:any,b:any=1)'),
  registryLoop.replace('return a===b','return a==b'),
  registryLoop.replace('below(cursor,saved.length)','below(first,saved.length)'),
  registryLoop.replace('below(cursor,saved.length)','below(cursor)'),
  registryLoop+'\nlet escaped=below;',
  registryLoop+'\nbelow=identical;',
  registryLoop.replace('positions=positions+sprite.x','positions=positions+sprite.x;first=below'),
  registryLoop.replace('return a<b','return foreign(a,b)')
 ])assert.equal(accepted(text),false,text);
 assert.equal(accepted(registryLoop.replace('positions=positions+sprite.x','positions=positions+sprite.x;let compared=identical(sprite.x,1)')),true,'callback may call only the pure comparison profile');
});

test('consumed scalar/index graph facts retain the service source-expiry boundary',()=>{
 const {p,proof,reads}=inspect(registryLoop);assert.equal(proof.has(reads[0]),true);
 const index=walk(p).find(n=>n.type==='Index'&&n.index?.name==='cursor'),old=index.index.name;
 index.index.name='positions';assert.equal(proof.current(),false);index.index.name=old;assert.equal(proof.current(),false);
});

const originalUnaryLoop='function numericStep(input:any):number{return +input}\n'+registryLoop.replace('cursor=(+cursor)+1','cursor=numericStep(cursor)+1');
test('actual original unary operation profile closes loop effects without projection badges',()=>{
 const {p,proof,reads}=inspect(originalUnaryLoop);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);
 for(const node of walk(p))if(node.type==='Call'&&node.callee?.name==='numericStep'||node.type==='Identifier'&&node.name==='input')assert.equal(proof.has(node),false);
 assert.equal(accepted(originalUnaryLoop.replaceAll('numericStep','anotherOrdinaryName')),true);
 assert.equal(accepted(originalUnaryLoop.replace('return +input','return -input')),true);
 assert.equal(accepted(originalUnaryLoop.replace('positions=positions+sprite.x','positions=positions+sprite.x;let converted=numericStep(sprite.x)')),true);
});

test('pure unary profiles require exact source body, binding, calls and primitive actual operands',()=>{
 for(const text of [
  originalUnaryLoop.replace('return +input','return +other'),
  originalUnaryLoop.replace('return +input','foreign();return +input'),
  originalUnaryLoop.replace('return +input','return numericStep(input)'),
  originalUnaryLoop.replace('return +input','return ~input'),
  originalUnaryLoop.replace('numericStep(input:any)','numericStep(input:any,extra:any)'),
  originalUnaryLoop.replace('numericStep(input:any)','numericStep(input:any=1)'),
  originalUnaryLoop.replace('numericStep(cursor)','numericStep(first)'),
  originalUnaryLoop.replace('numericStep(cursor)','numericStep(saved)'),
  originalUnaryLoop.replace('numericStep(cursor)','numericStep()'),
  originalUnaryLoop.replace('numericStep(cursor)','numericStep(cursor,1)'),
  originalUnaryLoop+'\nlet escaped=numericStep;',
  originalUnaryLoop+'\nnumericStep=below;',
  originalUnaryLoop.replace('function numericStep','export function numericStep')
 ])assert.equal(accepted(text),false,text);
 const p=parse(originalUnaryLoop),fn=walk(p).find(n=>n.type==='FunctionDeclaration'&&n.name==='numericStep');fn.params.restParam='input';assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(walk(p).find(n=>n.type==='Member'&&n.name==='x')),false);
});

test('a numeric conditional projection token remains outside this original-operation proof',()=>{
 const p=parse(originalUnaryLoop),call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='numericStep');
 call.type='Conditional';call.test=call.args[0];call.consequent={type:'Number',value:'0'};call.alternate={type:'Number',value:'0'};call.nativeArrayDomainNormalCall=Symbol('inert projection');delete call.callee;delete call.args;
 assert.equal(createDestroyedSpriteCallbackNumberSource(p).has(walk(p).find(n=>n.type==='Member'&&n.name==='x')),false);
});

test('changed Array.every cannot certify its own analysis realm or revive a consumed proof',()=>{
 const {proof,reads}=inspect(source);assert.equal(proof.has(reads[0]),true);const before=Array.prototype.every;let calls=0,observed;
 try{Array.prototype.every=()=>{calls++;return true;};observed=proof.current();}finally{Array.prototype.every=before;}
 assert.equal(observed,false);assert.equal(calls,0,'revocation observes the changed method without calling it');
 assert.equal(proof.current(),false);assert.equal(proof.has(reads[0]),false);
});

test('private original unary operation views isolate actual callers without a shared formal domain loan',()=>{
 const text=originalUnaryLoop.replace('positions=positions+sprite.x','positions=positions+sprite.x;let converted=numericStep(sprite.x)');
 const {p,proof,reads}=inspect(text),before=JSON.stringify(p);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);assert.equal(JSON.stringify(p),before);
 for(const n of walk(p))if(n.type==='Call'&&n.callee?.name==='numericStep')assert.equal(proof.has(n),false);
 assert.equal(accepted(text.replace('numericStep(sprite.x)','numericStep(first)')),false,'the original complete callee effect census still validates this caller');
 assert.equal(accepted(text.replace('return +input','return foreign(input)')),false,'no arbitrary function body is erased');
});

test('operation view cloning keeps source descriptors and array metadata or declines hidden callee envelopes',()=>{
 const p=parse(originalUnaryLoop),before=JSON.stringify(p),metadataValue='inert array metadata';
 Object.defineProperty(p.body,'analysisNote',{value:metadataValue,writable:true,enumerable:false,configurable:true});
 const proof=createDestroyedSpriteCallbackNumberSource(p),read=walk(p).find(n=>n.type==='Member'&&n.name==='x');assert.equal(proof.has(read),true);assert.equal(JSON.stringify(p),before);
 assert.deepEqual(Object.getOwnPropertyDescriptor(p.body,'analysisNote'),{value:metadataValue,writable:true,enumerable:false,configurable:true});
 p.body.analysisNote='changed';assert.equal(proof.current(),false);p.body.analysisNote=metadataValue;assert.equal(proof.current(),false);
 for(const part of ['callee','args']){
  const fresh=parse(originalUnaryLoop),call=walk(fresh).find(n=>n.type==='Call'&&n.callee?.name==='numericStep');
  Object.defineProperty(call[part],'hiddenEnvelope',{value:{type:'Number',value:'7'},enumerable:false,configurable:true});
  const denied=createDestroyedSpriteCallbackNumberSource(fresh);assert.equal(denied.has(walk(fresh).find(n=>n.type==='Member'&&n.name==='x')),false);
 }
});

test('original unary body and call changes expire a consumed per-call graph permanently',()=>{
 const {p,proof,reads}=inspect(originalUnaryLoop);assert.equal(proof.has(reads[0]),true);
 const fn=walk(p).find(n=>n.type==='FunctionDeclaration'&&n.name==='numericStep'),expr=fn.body[0].value,op=expr.op;
 expr.op='-';assert.equal(proof.current(),false);expr.op=op;assert.equal(proof.current(),false);
});

test('throwing source observation permanently revokes the standalone property proof',()=>{
 const {p,proof,reads}=inspect(source);assert.equal(proof.has(reads[0]),true);
 const original=p.body[0];let observations=0;
 try{p.body[0]=new Proxy(original,{getPrototypeOf(){observations++;throw new Error('source observation failed');}});let current;assert.doesNotThrow(()=>{current=proof.current();});assert.equal(current,false);}
 finally{p.body[0]=original;}
 assert.equal(observations,1);assert.equal(proof.current(),false);assert.equal(proof.has(reads[0]),false);
});

test('canonical negative-one multiplication retains the genuine original unary operation effect',()=>{
 const text=originalUnaryLoop.replace('return +input','return -1*input').replace('positions=positions+sprite.x','positions=positions+sprite.x;let converted=numericStep(sprite.x)');
 const {p,proof,reads}=inspect(text);assert.equal(proof.reason,null);assert.equal(proof.has(reads[0]),true);
 for(const node of walk(p))if(node.type==='Call'&&node.callee?.name==='numericStep'||node.type==='Identifier'&&node.name==='input')assert.equal(proof.has(node),false);
 assert.equal(accepted(text.replaceAll('numericStep','ordinaryNegative')),true);
 for(const body of ['return input*-1','return -2*input','return -1*other','return (-1*input)+0','return -1*numericStep(input)'])assert.equal(accepted(text.replace('return -1*input',body)),false,body);
 assert.equal(accepted(text.replace('numericStep(sprite.x)','numericStep(first)')),false);
});

test('negative-one multiplication profile still rejects nonprimitive actual values and stale bodies',()=>{
 const text=originalUnaryLoop.replace('return +input','return -1*input');
 for(const argument of ['first','saved','foreign()','{value:1}'])assert.equal(accepted(text.replace('numericStep(cursor)','numericStep('+argument+')')),false,argument);
 const {p,proof,reads}=inspect(text);assert.equal(proof.has(reads[0]),true);
 const fn=walk(p).find(n=>n.type==='FunctionDeclaration'&&n.name==='numericStep'),body=fn.body[0].value,op=body.op;body.op='+';assert.equal(proof.current(),false);body.op=op;assert.equal(proof.current(),false);
});
