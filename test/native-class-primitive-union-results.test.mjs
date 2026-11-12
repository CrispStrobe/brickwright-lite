import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
function source(left,right,late=''){
 return `let flag=true;class Pair {constructor(public left:any,public right:any){}get value(){return this.left+this.right}}
let object=new Pair(${left},${right});let observed=object.value;${late}`;
}
function inspect(text){
 const original=parseMakeCodeTs(text,profile),before=structuredClone(original),view=nativeClassScalarView(original,profile);
 assert.deepEqual(original,before,'private scalar view preserves every actual expression');
 const declaration=view.program.body.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='observed'));assert.ok(declaration);
 const observed=declaration.decls.find(decl=>decl.name==='observed').init;
 return {original,view,observed};
}
function alternatives(node){
 if(node.type==='Conditional')return [...alternatives(node.consequent),...alternatives(node.alternate)];
 assert.ok(['String','Number','Boolean','Null','Undefined'].includes(node.type),'only actual private primitive alternatives');return [node.type];
}
function results(text,expected){
 const out=inspect(text);assert.equal(out.observed.type,'Conditional','actual closed getter has a private normal-result view');
 assert.equal(out.observed.test.type,'Member');assert.equal(out.observed.test.object.name,'object');assert.equal(out.observed.test.name,'value','the original getter remains once in test position');
 assert.deepEqual([...new Set(alternatives(out.observed))].sort(),[...expected].sort());assert.equal(out.view.current(),true);return out;
}

test('primitive addition keeps Number and String when both actual operands may be nonString',()=>{
 for(const [left,right]of [
  ['flag?"a":undefined','flag?undefined:"b"'],
  ['flag?"a":null','flag?false:"b"'],
  ['flag?"a":2','flag?true:"b"'],
  ['flag?"a":undefined','2']
 ])results(source(left,right),['Number','String']);
});

test('an alwaysString actual operand selects String while nonString primitive operands retain Number',()=>{
 for(const [left,right]of [['"always"','flag?undefined:2'],['flag?false:null','"always"'],['"a"','"b"']])results(source(left,right),['String']);
 for(const [left,right]of [['undefined','undefined'],['flag?null:2','flag?false:undefined'],['2','3']])results(source(left,right),['Number']);
});

test('annotations, empty or unknown producers and every later nonprimitive writer retain refusal',()=>{
 for(const text of [
  source('"a"','{}'),source('foreign()','"b"'),source('"a"','[1]'),
  source('flag?"a":undefined','flag?undefined:"b"','object.left={};'),
  source('"a"','"b"','object.right=foreign();'),
  source('"a"','"b"','foreign(function(){object.left={}});'),
  'class Empty {left:any;right:any;get value():string{return this.left+this.right}}let object=new Empty();let observed=object.value;object.left=foreign();'
 ]){
  const {observed,view}=inspect(text);assert.equal(observed.type,'Member','no primitive projection from an opaque or exposed writer');assert.equal(view.hasNormalPrimitiveResult?.(observed)??false,false);
 }
});

test('primitive union carrier, getter source and observed restoration remain tied to exact source',()=>{
 const out=results(source('flag?"a":undefined','flag?undefined:"b"'),['Number','String']);
 assert.equal(out.view.hasNormalPrimitiveResult(out.observed),true);assert.equal(out.view.hasNormalPrimitiveResult(structuredClone(out.observed)),false,'a copied union is not issued');
 const branch=out.observed.consequent;out.observed.consequent={type:'Object',props:[]};assert.equal(out.view.hasNormalPrimitiveResult(out.observed),false);out.observed.consequent=branch;assert.equal(out.view.hasNormalPrimitiveResult(out.observed),false,'observed carrier restoration cannot revive authority');
 const next=results(source('flag?"a":undefined','flag?undefined:"b"'),['Number','String']);assert.equal(next.view.hasNormalPrimitiveResult(next.observed),true);
 const getter=next.original.body.find(node=>node.type==='Class').methods.find(method=>method.kind==='get'),saved=getter.body[0].value;
 getter.body[0].value={type:'Object',props:[]};assert.equal(next.view.current(),false);getter.body[0].value=saved;assert.equal(next.view.hasNormalPrimitiveResult(next.observed),false,'actual getter-source ABA retains revocation after use');
});
