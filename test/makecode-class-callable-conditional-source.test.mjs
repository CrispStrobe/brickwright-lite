import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {classCallableSourceGate} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-gate.js';
import {proveClassCallableSource} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {withClassResultFlowProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-result-flow-proof.js';
import {effectSource as source,source as storedVoidSource} from './fixtures/arcade-class-callable-conditional-source.mjs';
const gate=text=>classCallableSourceGate(parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true}));
test('conditional class source proves Number/String/Void actions and an actual absent field path',()=>{
 assert.deepEqual(gate(source),{eligible:true,unsupported:[]});
 assert.deepEqual(gate(source+'let isAbsent=absentResult===undefined;'),{eligible:true,unsupported:[]});
 assert.deepEqual(gate(source.replace('const saved=this.state;','let result:T;const saved=this.state;').replace('if(saved){const result=action(saved);','if(saved){result=action(saved);').replace('return undefined;','return result;')),{eligible:true,unsupported:[]});
});
test('both conditional arms retain producer and writer refusals',()=>{
 for(const changed of [
  source.replace('this.state=state;','this.state="opaque" as any;'),
  source.replace('if(enabled){this.state=state;}','if(enabled){this.state=state;}else{this.state="opaque" as any;}'),
  source.replace('return undefined;','return "wrong";'),
  source.replace('return result;','return 1 as T;'),
  source.replace('saved.updateImage();','saved.value=action(saved);saved.updateImage();'),
  source+'numberResult="wrong";',
  source+'let fabricated=numberResult+1;',
  source.replace('if(saved){const result=action(saved);','if(saved){result=action(saved);'),
  source.replace('return result;','return undefined;'),
 ])assert.equal(gate(changed).eligible,false,changed);
});

test('nullable certificate comes from the actual saved method receiver field',()=>{
 const parsed=parseMakeCodeTs(source,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
 const proof=proveClassCallableSource(parsed);assert.equal(proof.eligible,true);
 const method=parsed.body.find(node=>node.type==='Class'&&node.name==='Holder').methods.find(node=>node.name==='apply');
 assert.deepEqual(proof.resultFlows.get(method),{schema:'bw-class-result-flow/v1',presenceField:'state',absent:'undefined',present:'callback'});
 assert.equal(proof.resultFlows.has(parsed.body.find(node=>node.type==='Class'&&node.name==='State').methods[0]),false);
 assert.deepEqual(withClassResultFlowProof(parsed,proof).body.find(node=>node.name==='Holder').methods[0].bwClassResultFlow,proof.resultFlows.get(method));
 proof.resultFlows.set(method,{schema:'forged'});
 assert.equal(withClassResultFlowProof(parsed,proof).body.find(node=>node.name==='Holder').methods[0].bwClassResultFlow.schema,'bw-class-result-flow/v1');
 assert.throws(()=>withClassResultFlowProof(parsed,{eligible:true,resultFlows:proof.resultFlows}),/actual unchanged source proof/);
 method.body.push({type:'Return',value:{type:'String',value:'wrong'}});
 assert.throws(()=>withClassResultFlowProof(parsed,proof),/actual unchanged source proof/);
});

test('a stored module Void result remains a named declaration/export gap',()=>{
 const result=gate(storedVoidSource);assert.equal(result.eligible,false);
 assert.match(result.unsupported.join(' '),/module Void result cells require separate declaration\/export qualification/);
});
