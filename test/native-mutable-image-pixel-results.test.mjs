import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {SDK_SPRITE_CLASS_NODES} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-class-descriptors.js';
import {imagePixelNormalResults,mutableImagePixelNormalResults,MUTABLE_IMAGE_PIXEL_CPP_SHA256,MUTABLE_IMAGE_PIXEL_DTS_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/image-pixel-normal-results.js';
const profile=GENERATED_HELPER_PROFILES.ordinary;
const parse=text=>parseMakeCodeTs(text,profile);
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const n of value)walk(n,out);return out;}out.push(value);for(const [key,n]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','calls'].includes(key))walk(n,out);return out;};
// Exact authored inline-animation-artwork source. No VM, SDK, browser, image
// renderer or pixel evaluator runs in these source producer controls.
const source='let hero=sprites.create(img`1`,SpriteKind.Player)\nlet frames=[img`2 3`,img`4 5`]\nlet alias=frames\nlet one=frames[0]\nlet two=frames[1]\nlet other=[img`2 3`,img`4 5`]\nlet separate=one!==other[0]\nalias[0].setPixel(0,0,7)\nhero.setImage(frames[0])\nlet first=one.getPixel(0,0)\nlet second=two.getPixel(0,0)\nlet count=frames.length\nlet aliasSame=alias===frames\nlet imageDistinct=one!==two\nlet prior=other[0].getPixel(0,0)\nfirst+=0\nsecond+=0\ncount+=0\nprior+=0\naliasSame=!!aliasSame\nseparate=!!separate\nimageDistinct=!!imageDistinct';
const inspect=text=>{const p=parse(text),proof=mutableImagePixelNormalResults(p,profile),calls=walk(p).filter(n=>n.type==='Call'&&n.callee?.name==='getPixel');return {p,proof,calls};};
const good=text=>{const {proof,calls}=inspect(text);assert.ok(calls.length>0);for(const call of calls)assert.equal(proof.has(call),true,text);return {proof,calls};};
const bad=text=>{const {proof,calls}=inspect(text);assert.ok(calls.length>0);for(const call of calls)assert.equal(proof.has(call),false,text);};

test('unchanged mutable artwork issues only actual getPixel normal results',()=>{
 const {p,proof,calls}=inspect(source),before=JSON.stringify(p);assert.equal(calls.length,3);for(const call of calls)assert.equal(proof.has(call),true);assert.equal(JSON.stringify(p),before);
 assert.deepEqual(Object.keys(proof).sort(),['current','has']);
 const old=imagePixelNormalResults(p,profile);for(const call of calls)assert.equal(old.has(call),false);
 for(const node of walk(p))if(!calls.includes(node))assert.equal(proof.has(node),false);
 assert.equal(proof.has({...calls[0]}),false);assert.equal(proof.has({type:'Identifier',name:'first'}),false);
});

test('literal mutable writes, clones, aliases and Sprite attachment preserve genuine receiver origins',()=>{
 good(source.replace('setPixel(0,0,7)','fill(7)'));
 good(source.replace('let one=frames[0]','let one=frames[0].clone()'));
 good(source.replace('hero.setImage(frames[0])','hero.setImage(one)'));
 good(source.replaceAll('getPixel(0,0)','getPixel(-1,999)'));
 const staged='let frames:Image[]=null;frames=[];frames.push(img`1`);let alias=frames;let one=alias[0];one.setPixel(0,0,7);let pixel=one.getPixel(0,0);let size=frames.length;let at=frames.indexOf(one);';
 const {p,proof,calls}=inspect(staged);for(const call of calls)assert.equal(proof.has(call),true);
 const old=imagePixelNormalResults(p,profile);for(const call of calls)assert.equal(old.has(call),false,'the old push/immutable Number gate stays closed');
 for(const node of walk(p))if(node.type==='Member'&&node.name==='length'||node.type==='Call'&&node.callee?.name==='indexOf'||node.type==='Identifier')assert.equal(proof.has(node),false);
});

test('classes callbacks scene effects namespace shadows and prototype changes cannot borrow the profile',()=>{
 for(const text of [
  'class Child extends Sprite {}\n'+source,
  'sprites.onCreated(SpriteKind.Player,function(s){s.setImage(img`1`)});'+source,
  source+'\ngame.pushScene();',
  'let sprites=foreign;'+source,
  'let SpriteKind=foreign;'+source,
  'let image=foreign;'+source,
  'let img=foreign;'+source,
  source+'\nSpriteKind.Player=0;',
  source+'\nsprites.create=foreign;',
  source+'\nimage.create=foreign;',
  source+'\none.getPixel=foreign;',
  source+'\none.setPixel=foreign;',
  source+'\nhero.setImage=foreign;',
  source+'\nImage.prototype.getPixel=foreign;',
  source+'\nObject.defineProperty(one,"getPixel",foreign);',
  source+'\nforeign(one);',
  source+'\nlet extracted=one.getPixel;',
  source+'\nlet saved=sprites;',
  source.replace('SpriteKind.Player','0'),
  source.replace('SpriteKind.Player','SpriteKind["Player"]')
 ])bad(text);
});

test('unsafe receiver/index/writer inputs and unexecuted image mutations remain visible refusals',()=>{
 for(const text of [
  source.replace('let one=frames[0]','let one=frames[99]'),
  source.replace('let one=frames[0]','let one=frames[-1]'),
  source.replace('let one=frames[0]','let one=frames[unknown]'),
  source.replace('let first=one.getPixel','one=undefined;let first=one.getPixel'),
  source.replace('let first=one.getPixel','one=hero;let first=one.getPixel'),
  source.replace('let first=one.getPixel','one=0;let first=one.getPixel'),
  source.replace('setPixel(0,0,7)','setPixel(unknown(),0,7)'),
  source.replace('setPixel(0,0,7)','setPixel(img`1`,0,7)'),
  source.replace('hero.setImage(frames[0])','hero.setImage(0)'),
  source+'\nfunction poison(){one=undefined;}',
  source+'\nfunction poison(){one.setPixel(0,0,8);}',
  source+'\nfunction poison(){hero.setImage(one);}',
  source+'\nlet coerced=+one;',
  source+'\nlet coerced=one+1;'
 ])bad(text);
});

test('source and SDK descriptor currentness expire permanently through restoration',()=>{
 const {p,proof,calls}=inspect(source);assert.equal(proof.has(calls[0]),true);p.extra=1;assert.equal(proof.current(),false);delete p.extra;assert.equal(proof.current(),false);
 const fresh=inspect(source),row=SDK_SPRITE_CLASS_NODES.find(n=>n.name==='Sprite'),prior=Object.getOwnPropertyDescriptor(row,'pixelProbe');
 try{Object.defineProperty(row,'pixelProbe',{value:1,configurable:true});assert.equal(fresh.proof.current(),false);}finally{if(prior)Object.defineProperty(row,'pixelProbe',prior);else delete row.pixelProbe;}
 assert.equal(fresh.proof.current(),false);
});

test('realm checks cannot self-certify through replaced every and throws revoke the receipt',()=>{
 const {proof,calls}=inspect(source);assert.equal(proof.has(calls[0]),true);const every=Array.prototype.every;let changed,restored;
 try{Array.prototype.every=()=>true;changed=proof.current();}finally{Array.prototype.every=every;restored=proof.current();}
 assert.equal(changed,false);assert.equal(restored,false);
 const fresh=inspect(source),before=fresh.p.body;fresh.p.body=new Proxy(before,{getPrototypeOf(){throw new Error('source trap');}});
 assert.equal(fresh.proof.current(),false);fresh.p.body=before;assert.equal(fresh.proof.current(),false);
});

test('non-data sources do not run property getters or enroll annotation/flag lookalikes',()=>{
 let calls=0;const fake={type:'Program'};Object.defineProperty(fake,'body',{get(){calls++;return [];}});assert.equal(mutableImagePixelNormalResults(fake,profile).has({}),false);assert.equal(calls,0);
 bad('let imageValue:Image=0;let pixel=imageValue.getPixel(0,0);');
 const {p,calls:sites}=inspect('let imageValue:Image=0;let pixel=imageValue.getPixel(0,0);');p.mutableImagePixelMode=true;p.nativeImageDomainNormalCall=Symbol('copied');assert.equal(mutableImagePixelNormalResults(p,profile).has(sites[0]),false);
});

test('reviewed original pixel implementation identities remain explicit without executing the SDK',()=>{
 assert.equal(MUTABLE_IMAGE_PIXEL_CPP_SHA256,'74b51956789d8cc6da461415ae80a5016e207b140ae190ebfc60fa022baac193');
 assert.equal(MUTABLE_IMAGE_PIXEL_DTS_SHA256,'bc899eb68811bf8f03a2844d5d8bfaa96d6a1e8c91765a84d5e7aa734d57d991');
});

test('hidden rest/default and optional envelopes cannot alter a closed source function',()=>{
 const text='function pixel(im:Image){return im.getPixel(0,0)}let one=img`1`;let value=pixel(one);';
 for(const where of ['function','params']){
  const p=parse(text),fn=walk(p).find(n=>n.type==='FunctionDeclaration');(where==='function'?fn:fn.params).restParam='im';
  const proof=mutableImagePixelNormalResults(p,profile);for(const call of walk(p).filter(n=>n.type==='Call'&&n.callee?.name==='getPixel'))assert.equal(proof.has(call),false);
 }
 const p=parse(text),fn=walk(p).find(n=>n.type==='FunctionDeclaration');fn.parameterDefaultPrologue=[];const proof=mutableImagePixelNormalResults(p,profile);assert.equal(proof.has(walk(p).find(n=>n.type==='Call'&&n.callee?.name==='getPixel')),false);
});

test('generated Image drawing effects and private dimensions retain only pixel occurrence receipts',()=>{
 const text='let width=4;let height=3;let picture=image.create(width,height);picture.fill(0);picture.fillRect(1,0,2,2,5);picture.drawLine(3,2,0,2,7);let copied=picture.clone();let alias=picture;copied.flipX();copied.replace(7,8);alias.setPixel(0,0,3);let sampled=picture.getPixel(2,1)+1;let actualWidth=picture.width;let actualHeight=copied.height;';
 const {p,proof,calls}=inspect(text);assert.equal(calls.length,1);assert.equal(proof.has(calls[0]),true);
 for(const n of walk(p))if(!calls.includes(n))assert.equal(proof.has(n),false,'dimensions and effects do not gain public authority');
 for(const replacement of ['picture.fillRect(1,0,2,2,unknown)','picture.drawLine(3,2,0,2,picture)','copied.flipX(1)','copied.replace(7,foreign())','foreign.fillRect(1,0,2,2,5)'])bad(text.replace('picture.fillRect(1,0,2,2,5)',replacement));
 for(const invalid of ['2001','2147483647','-1','0.5'])bad(text.replace('let width=4','let width='+invalid));
 for(const suffix of ['picture.fillRect=foreign;','picture.drawLine=foreign;','copied.flipX=foreign;','copied.replace=foreign;','picture.width=99;','function dormant(){picture.drawLine(0,0,1,1,7);}','sprites.onCreated(SpriteKind.Player,function(sprite){width=sprite.width;});'])bad(text+suffix);
});
