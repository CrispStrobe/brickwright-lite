import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource,inspectNativeArrayAddHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const helpers=nativeArrayAddHelperSource('__bwBinaryAdd',true,true)+';function __bwCompareLess(a:any,b:any){return a<b};function __bwUnaryAdd(value:any){return +value};';
// The actual ordinary forEach export shape, including hoisted reset writers.
const source='let one:Sprite;let all:Sprite[]=null;let sum=0;let list:Sprite[]=null;let i=0;let each:Sprite=null;one=null;one=sprites.create(img`1`,SpriteKind.Enemy);one.x=3;all=sprites.allOfKind(SpriteKind.Enemy);sum=0;list=all;i=0;while(__bwCompareLess(i,list.length)){each=list[i];sum=__bwBinaryAdd(sum,each.x);i=__bwBinaryAdd(__bwUnaryAdd(i),1)}';
const inspect=body=>{
 const program=parseMakeCodeTs(helpers+body,profile);
 return {program,proof:inspectNativeAdditionExportDomains(program,profile)};
};
const good=body=>{
 const result=inspect(body);assert.equal(result.proof.reason,null,body);
 assert.equal(result.proof.helpers.has('__bwBinaryAdd'),true,body);
 assert.equal(result.proof.current(),true,body);
 assert.equal(result.proof.arrayHelpers?.has('__bwBinaryAdd')===true,false,'normal scalar results grant no Array operand');
 return result;
};
const bad=body=>{
 const {program,proof}=inspect(body),syntax=inspectNativeArrayAddHelpers(program,profile);
 // Reflected prototype access invalidates the complete source census before
 // a helper can be selected. Preserve that refusal, not an invented reason.
 if(!syntax.current())assert.equal(proof.current(),false,body);
 else assert.equal(typeof proof.reason,'string',body);
 assert.equal(proof.helpers.size,0,body);
};

test('actual registry collection aliases and loop entries retain owned SDK scalar receivers',()=>{
 good(source);
 good(source.replace('let list:Sprite[]=null','let list:Sprite[]=null;let alias:Sprite[]=null').replace('list=all','alias=all;list=alias'));
});

test('arbitrary indexed objects cannot acquire SDK receiver lineage',()=>{
 for(const prefix of ['', 'let one=sprites.create(img`1`,SpriteKind.Enemy);'])
  bad(prefix+'let item=JSON.parse(\'[{"x":[1]}]\')[0];let sum=__bwBinaryAdd(item.x,2)');
 for(const changed of [
  source.replace('list=all','list=JSON.parse(\'[{"x":[1]}]\')'),
  source.replace('list=all','list=all;list[0]=JSON.parse(\'{"x":[1]}\')'),
  source.replace('list=all','list=all;foreign(list)'),
  source.replace('each=list[i]','each=list["constructor"]'),
  source.replace('one.x=3','one.x=JSON.parse(\'[1]\')'),
  source.replace('one.x=3','one["x"]=JSON.parse(\'[1]\')'),
  source.replace('one.x=3','one.x=3;let reflectedCtor=one.constructor;reflectedCtor.prototype.x=JSON.parse(\'[1]\')'),
  source.replace('SpriteKind.Enemy);sum=0','foreign());sum=0'),
  'sprites.allOfKind=foreign;'+source,
  'let saved=sprites;'+source,
  'let saved=sprites;saved.allOfKind=foreign;'+source
 ])bad(changed);
});

test('registry source edits permanently expire the exact held receiver proof',()=>{
 const {program,proof}=good(source);
 const walk=node=>{
  if(!node||typeof node!=='object')return null;
  if(node.type==='Member'&&node.name==='allOfKind')return node;
  for(const [key,child]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters'].includes(key)){
   const found=Array.isArray(child)?child.map(walk).find(Boolean):walk(child);if(found)return found;
  }
  return null;
 };
 const member=walk(program);assert.ok(member);member.name='unprovedRegistry';
 assert.equal(proof.current(),false);member.name='allOfKind';assert.equal(proof.current(),false);
});
