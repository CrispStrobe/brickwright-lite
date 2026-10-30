import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const profile=GENERATED_HELPER_PROFILES.ordinary,header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const parse=text=>parseMakeCodeTs(header+';'+text,profile);
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const n of value)walk(n,out);return out;}out.push(value);for(const [key,n]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType'].includes(key))walk(n,out);return out;};
const simple='let primitive=[1];let positions=0;sprites.onDestroyed(SpriteKind.Enemy,function(sprite){positions=__bwBinaryAdd(positions,sprite.x)});';
const source=`function below(a:any,b:any):boolean{return a<b}
function numberOf(value:any):number{return +value}
function identical(a:any,b:any):boolean{return a===b}
let primitive=[1]
let positions=0
sprites.onDestroyed(SpriteKind.Enemy,function(eventSprite:Sprite){
 let sprite:Sprite=null
 let replacement:Sprite=null
 sprite=eventSprite
 positions=__bwBinaryAdd(positions,sprite.x)
 replacement=sprites.create(img\`1\`,SpriteKind.Enemy)
 replacement.setPosition(90,60)
})
let first:Sprite=null
first=sprites.create(img\`1\`,SpriteKind.Enemy)
first.setPosition(10,60)
let saved:Sprite[]=null
saved=sprites.allOfKind(SpriteKind.Enemy)
let cursor=0
let element:Sprite=null
while(below(cursor,saved.length)){
 element=saved[cursor]
 element.destroy()
 cursor=__bwBinaryAdd(numberOf(cursor),1)
}
let same=identical(saved[0],first)`;
const good=p=>{const result=inspectNativeAdditionExportDomains(p,profile);assert.equal(result.reason,null);assert.equal(result.helpers.size,1);assert.equal(result.current(),true);return result;};
const bad=p=>{const result=inspectNativeAdditionExportDomains(p,profile);assert.equal(result.helpers.size,0);assert.equal(typeof result.reason,'string');};
test('callback original-operation proof survives genuine unary result projection and snapshot loops',()=>{
 good(parse(source.replace('return +value','return -1 * value')));
 const p=parse(source),result=good(p),decl=p.body.find(n=>n.type==='Declaration'&&n.decls.some(d=>d.name==='positions')),literal=decl.decls[0].init,old=literal.value;
 literal.value='7';assert.equal(result.current(),false);literal.value=old;assert.equal(result.current(),false);
});
test('original hidden callback defaults and executable mutations cannot borrow a cleaned model proof',()=>{
 good(parse(simple));
 {const p=parse(simple),fn=walk(p).find(n=>n.type==='FunctionExpression');fn.params.parameterDefaults.push({name:'sprite',hidden:'default'});fn.parameterDefaults=[];const result=inspectNativeAdditionExportDomains(p,profile);assert.equal(result.helpers.size,0);assert.equal(result.reason,null,'the original helper admission itself refuses unsupported hidden defaults');}
 {const p=parse(simple),hidden=parseMakeCodeTs('Fx.add=foreign;',profile).body[0],expr=hidden.expr;Object.defineProperty(hidden,'expr',{value:expr,enumerable:false,configurable:true});p.body.push(hidden);const result=inspectNativeAdditionExportDomains(p,profile);assert.equal(result.helpers.size,0);assert.equal(result.reason,null,'the original helper admission refuses hidden executable fields');}
 bad(parse(simple+'Fx.add=foreign;'));
});
test('supplied private property projection tags cannot enroll original source',()=>{
 for(const tag of ['nativeDestroyedSourceProperty','nativeDestroyedDomainNormalProperty']){
  const p=parse(simple),read=walk(p).find(n=>n.type==='Member'&&n.name==='x');read[tag]=Symbol('copied');bad(p);
 }
});
