import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {withClassResultFlowProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-result-flow-proof.js';
import {lowerCallableValues,classCallableCapturedBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
import {lowerObjectClasses} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-object-classes.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {clearStrayTimers} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-class-callables.mjs';
const renamed=source.replace('constructor(picture:Picture)','constructor(box:Picture)').replace('picture.picture.clone()','box.picture.clone()');
const distinct='class Decoy{picture:string;constructor(){this.picture="wrong"}}let box=new Decoy();'+renamed;
const staged=value=>{
 const parsed=parseMakeCodeTs(value,{retainCallableMetadata:true,retainParentheses:true}),proof=proveClassCallableSource(parsed,{sdkImagePrototype:true});assert.equal(proof.eligible,true,JSON.stringify(proof.unsupported));
 const lowered=lowerCallableValues(withClassResultFlowProof(parsed,proof),{classPrototype:true,sdkImagePrototype:true});assert.deepEqual(lowered.unsupported,[]);return lowered;
};
const definition=lowered=>lowered.program.body.find(node=>node.bwCallableDefinition?.captures.some(row=>row.name==='box'));
test('captured ordinary class types follow actual lexical bindings instead of same-name globals',()=>{
 const lowered=staged(distinct),def=definition(lowered),bindings=classCallableCapturedBindings(def);
 assert.deepEqual(bindings.map(row=>[row.name,row.type]),[['box',{kind:'named',name:'Picture'}]]);
 assert.deepEqual(lowerObjectClasses(lowered.program,{classCallablePrototype:true,sdkImagePrototype:true}).unsupported,[]);
 assert.deepEqual(arcadeToPseudocode(distinct,{sdkImagePrototype:true}).unsupported,[]);
});
test('copied, absent, changed and forged capture metadata cannot issue lowering authority',()=>{
 for(const change of [
  lowered=>{lowered.program=structuredClone(lowered.program);},
  lowered=>{delete definition(lowered).bwCallableDefinition.captures;},
  lowered=>{definition(lowered).bwCallableDefinition.captures[0].name='foreign';},
  lowered=>{definition(lowered).bwClassCallableCaptureTypes=[{name:'box',type:{kind:'named',name:'Decoy'}}];},
  lowered=>{delete definition(lowered).bwCallableDefinition;}
 ]){
  const lowered=staged(distinct);change(lowered);
  assert.ok(lowerObjectClasses(lowered.program,{classCallablePrototype:true,sdkImagePrototype:true}).unsupported.some(error=>/actual unchanged lexical binding proof/.test(error)));
 }
});
test('nested local shadows retain their own real class allocation and do not capture an outer same-name cell',()=>{
 const nested=renamed.replace('return box.picture.clone()','let box=new Picture(image.create(3,3));return box.picture.clone()');
 const lowered=staged(nested),defs=lowered.program.body.filter(node=>node.bwCallableDefinition);
 assert.ok(defs.every(node=>!classCallableCapturedBindings(node).some(row=>row.name==='box')));
 assert.deepEqual(arcadeToPseudocode(nested,{sdkImagePrototype:true}).unsupported,[]);
});
test('renamed SDK captures and non-Image captured classes preserve actual native values',async()=>{
 const ordinary='class Decoy{value:string;constructor(){this.value="wrong"}}class Item{value:number;constructor(value:number){this.value=value}}class Holder{read:()=>number;constructor(box:Item){this.read=()=>{return box.value}}}let box=new Decoy();let item=new Item(7);let holder=new Holder(item);let result=holder.read();';
 const runs=[];try{
  for(const [program,name,value]of [[distinct,'width',2],[ordinary,'result',7]]){
   const translated=arcadeToPseudocode(program,{sdkImagePrototype:true});assert.deepEqual(translated.unsupported,[]);
   const run=await runArcadeSourceCode(translated.code,{frames:48});runs.push(run);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
   assert.equal(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name).value,value);
  }
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
