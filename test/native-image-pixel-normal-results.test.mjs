import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {imagePixelNormalResults} from '../overlay/scratch-gui/src/lib/bw-makecode/image-pixel-normal-results.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const profile=GENERATED_HELPER_PROFILES.ordinary;
const source='function fresh(id:string):Image[]{if(id=="walk")return [img`2`,img`5`];console.log("missing "+id);return undefined;} function start(){let current:Image[]=null;current=fresh(""+"walk");frames=current;count=frames.length;first=frames[0].getPixel(0,0);second=frames[1].getPixel(0,0);count=count+0;first=first+0;second=second+0;} let frames:Image[];let count:any=2;let first:any=4;let second:any=5;start();';
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const child of value)walk(child,out);return out;}out.push(value);for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(key))walk(child,out);return out;};
const inspect=text=>{const program=parseMakeCodeTs(text,profile),nodes=walk(program),calls=nodes.filter(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='getPixel'),length=nodes.find(node=>node.type==='Member'&&node.name==='length'),proof=imagePixelNormalResults(program,profile);assert.ok(calls.length);return {program,nodes,calls,length,proof};};
const bad=text=>{const {proof,calls}=inspect(text);assert.ok(calls.every(call=>!proof.has(call)),text);};

test('Image pixel normal results follow actual selected factory returns and exact bounded Array entries',()=>{
 const {program,proof,calls,length}=inspect(source),before=JSON.stringify(program);assert.equal(calls.length,2);assert.ok(calls.every(call=>proof.has(call)));assert.ok(proof.has(length));assert.equal(proof.has({}),false);assert.equal(proof.current(),true);assert.equal(JSON.stringify(program),before);
 const renamed=inspect(source.replaceAll('fresh','build').replaceAll('walk','steps').replaceAll('frames','pictures'));assert.ok(renamed.calls.every(call=>renamed.proof.has(call)));
 const direct=inspect('let image=img`2`;let n=image.getPixel(0,0);');assert.ok(direct.proof.has(direct.calls[0]));
});
test('raw factory fallback is an actual effect boundary not an inert console exemption',()=>{
 for(const text of [source.replace('fresh(""+"walk")','fresh("missing")'),source.replace('fresh(""+"walk")','fresh(unknown)'),source+'fresh("missing");',source.replace('return [img`2`,img`5`]','{console.log("selected");return [img`2`,img`5`]}'),source+'console.addListener(function(){frames=[];});'])bad(text);
 // Both closed callers are visited; a successful entry cannot hide a later bad one.
 bad(source+'start();fresh("missing");');
 const two=inspect(source+'start();');assert.ok(two.calls.every(call=>two.proof.has(call)));
});
test('all Array receiver writers aliases and element bounds remain separate from pixel coordinates',()=>{
 for(const text of [source.replace('frames[1]','frames[2]'),source.replace('frames[1]','frames[-1]'),source.replace('frames[1]','frames[unknown]'),source.replace('img`5`','undefined'),source.replace('frames=current;','frames=current;frames=null;'),source.replace('frames=current;','frames=current;frames[1]=img`3`;'),source.replace('frames=current;','frames=current;let alias=frames;alias.push(img`3`);'),source.replace('frames=current;','frames=current;foreign(frames);'),source+'function poison(){frames=undefined;}'])bad(text);
 // SDK pixel bounds return0; unlike an out-of-bounds Array element this still
 // has a genuine Image receiver and integer coordinates. No value is folded.
 const outside=inspect(source.replace('getPixel(0,0)','getPixel(-1,999)'));assert.ok(outside.calls.every(call=>outside.proof.has(call)));
});
test('Image origins and operations cannot be supplied by annotations shadows or method extraction',()=>{
 for(const text of [source.replace('return [img`2`,img`5`]','return [foreign,foreign]'),source.replace('frames[0].getPixel(0,0)','foreign.getPixel(0,0)'),source.replace('frames=current;','frames=current;frames[0].getPixel=other;'),source+'let img=foreign;',source.replace('frames=current;','frames=current;let extracted=frames[0].getPixel;'),source+'Object.prototype.getPixel=other;'])bad(text);
 const cloned=inspect(source.replace('frames[0].getPixel','frames[0].clone().getPixel'));assert.ok(cloned.calls.every(call=>cloned.proof.has(call)));
 bad(source.replace('frames[0].getPixel','frames[0].clone(effect()).getPixel'));
});
test('factory receiver and all actual argument effects preserve arity entry order and closure',()=>{
 for(const text of [source.replace('fresh(""+"walk")','fresh("walk",effect())'),source.replace('fresh(""+"walk")','fresh()'),source.replace('fresh(""+"walk")','fresh(effect())'),source.replace('getPixel(0,0)','getPixel(coordinate,0)'),source.replace('getPixel(0,0)','getPixel(0,0,effect())'),source.replace('getPixel(0,0)','getPixel(0.5,0)'),source.replace('fresh(id:string)','fresh(id:string="walk")'),source.replace('fresh(id:string)','fresh(id?:string)'),source+'let escaped=fresh;',source.replace('if(id==','id();if(id=='),source.replace('if(id==','let escaped=fresh;if(id=='),source.replace('current=fresh(""+"walk")','current=fresh(fresh("walk"))'),source.replace('return [img`2`,img`5`]','return fresh(id)'),source.replace('start();','start();game.onUpdate(start);')])bad(text);
 for(const flag of ['async','generator','isAsync','isGenerator']){
  const {program,calls,proof:before}=inspect(source);assert.ok(calls.every(call=>before.has(call)));program.body[0][flag]=true;const proof=imagePixelNormalResults(program,profile);assert.ok(calls.every(call=>!proof.has(call)));
 }
});
test('pixel facts expire before first observation and remain revoked after observed source ABA',()=>{
 for(const first of [false,true]){
  const {program,calls,proof,nodes}=inspect(source);if(first)assert.ok(calls.every(call=>proof.has(call)));
  const image=nodes.find(node=>node.type==='Template');image.value='4';assert.equal(proof.current(),false);image.value='2';assert.ok(calls.every(call=>!proof.has(call)));assert.equal(proof.current(),false);assert.ok(imagePixelNormalResults(program,profile).has(calls[0]));
 }
 const mutations=[p=>{delete p.body;},p=>{delete p.body[0];},p=>{delete p.body[0].body;},p=>{p.body[0].body.push({type:'Unknown'});}];
 for(const mutate of mutations){const {program,calls,proof:before}=inspect(source);assert.ok(calls.every(call=>before.has(call)));mutate(program);const proof=imagePixelNormalResults(program,profile);assert.ok(calls.every(call=>!proof.has(call)));}
 // A missing grammar field cannot borrow a spelling from the prototype.
 const inherited=inspect(source);assert.ok(inherited.calls.every(call=>inherited.proof.has(call)));
 const decl=inherited.nodes.find(node=>node.type==='Declaration');assert.ok(Object.hasOwn(decl,'kind'));const previous=Object.getOwnPropertyDescriptor(Object.prototype,'kind');assert.equal(previous,undefined);
 delete decl.kind;let inheritedProof;
 try{Object.defineProperty(Object.prototype,'kind',{value:'let',configurable:true});inheritedProof=imagePixelNormalResults(inherited.program,profile);}
 finally{if(previous)Object.defineProperty(Object.prototype,'kind',previous);else delete Object.prototype.kind;}
 assert.ok(inherited.calls.every(call=>!inheritedProof.has(call)));
 let reads=0;const {program,calls,proof:before}=inspect(source);assert.ok(calls.every(call=>before.has(call)));Object.defineProperty(program,'body',{get(){reads++;throw Error('unowned');},configurable:true});const proof=imagePixelNormalResults(program,profile);assert.ok(calls.every(call=>!proof.has(call)));assert.equal(reads,0);
});
test('Image normal result membership does not mint ordinary initialization or flat Array input facts',()=>{
 const {program,proof,calls,length,nodes}=inspect(source);const graph=analyseSourceValueProducers(program,{arrayValues:true,parenthesized:true,unboundIsOpaque:true,declaredLocalUndefined:true,initializationEntries:true});
 assert.ok(calls.every(call=>proof.has(call)));assert.ok(proof.has(length));
 assert.ok(calls.some(call=>graph.typesAt(call).has('Opaque')),'ordinary graph does not acquire a global getPixel Number rule');
 const temporary=nodes.find(node=>node.type==='Identifier'&&node.name==='current');assert.ok(temporary);assert.ok(graph.bindingTypesAt(temporary).has('Null'),'the actual null reset is retained');
 bad('let image:Image=foreign;let n=image.getPixel(0,0);');
});
test('native additions compose with current image operations while preserving original source and refusals',()=>{
 const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
 const text=helper+'\n'+source.replace('count=count+0','count=__bwBinaryAdd(count,0)').replace('first=first+0','first=__bwBinaryAdd(first,0)').replace('second=second+0','second=__bwBinaryAdd(second,0)');
 const program=parseMakeCodeTs(text,profile),before=JSON.stringify(program),proof=inspectNativeArrayBinaryDomains(program,profile);assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);assert.equal(proof.current(),true);assert.equal(JSON.stringify(program),before);
 const badResult=inspectNativeArrayBinaryDomains(parseMakeCodeTs(text.replace('frames[1]','frames[9]'),profile),profile);assert.equal(badResult.helpers.size,0);assert.ok(badResult.reason);
 const mixed=inspectNativeArrayBinaryDomains(parseMakeCodeTs(text.replace('__bwBinaryAdd(first,0)','__bwBinaryAdd(first,foreign)'),profile),profile);assert.equal(mixed.helpers.size,0);assert.ok(mixed.reason);
 const forged=parseMakeCodeTs(text,profile);forged.nativeImageDomainNormalCall=Symbol();const denied=inspectNativeArrayBinaryDomains(forged,profile);assert.equal(denied.helpers.size,0);assert.match(denied.reason,/supplied private/);
});
