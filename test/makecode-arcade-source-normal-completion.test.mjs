import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {analyseSourceNormalCompletion} from '../overlay/scratch-gui/src/lib/bw-makecode/source-normal-completion.js';
const walk=(node,out=[])=>{if(!node||typeof node!=='object')return out;if(Array.isArray(node)){node.forEach(item=>walk(item,out));return out;}out.push(node);Object.values(node).forEach(item=>walk(item,out));return out;};
const proof=source=>{const program=parseMakeCodeTs(source,{retainCallableMetadata:true,retainParentheses:true});const initial=analyseSourceValueProducers(program,{unboundIsOpaque:true});const completion=analyseSourceNormalCompletion(program,initial.immutableFunctionAt);const graph=analyseSourceValueProducers(program,{unboundIsOpaque:true,normalCompletion:completion});return {program,completion,graph,nodes:walk(program)};};
const finalCall=p=>p.nodes.filter(n=>n.type==='Call').at(-1);
test('exceptional completion never manufactures normal result or dead return producer',()=>{
 const p=proof('function fail(){throw 20;return 7}let value=fail();');
 assert.deepEqual([...p.graph.typesAt(finalCall(p))],[]);
 const fn=p.program.body[0];assert.equal(p.completion.functionFallsThrough(fn),false);assert.equal(p.completion.functionReturnsNormally(fn),false);
});
test('conditional normal return and exceptional branch do not create implicit Undefined',()=>{
 for(const source of ['function choose(flag){if(flag)throw 20;return 7}let value=choose(true);','function choose(flag){if(flag)return 7;throw 20}let value=choose(false);']){
  const p=proof(source);assert.deepEqual([...p.graph.typesAt(finalCall(p))],['Number']);assert.equal(p.completion.functionFallsThrough(p.program.body[0]),false);
 }
});
test('actual no-normal ordinary calls terminate later facts but preserve hoisted declarations',()=>{
 const p=proof('let first=helper();throw 20;function helper(){return 3}let later=helper();');
 const calls=p.nodes.filter(n=>n.type==='Call');assert.deepEqual([...p.graph.typesAt(calls[0])],['Number']);assert.equal(p.completion.isReachable(calls[1]),false);
 const q=proof('function fail(){throw 20}function outer(){fail();return 7}let result=outer();');assert.deepEqual([...q.graph.typesAt(finalCall(q))],[]);
});
test('unknown and cyclic calls cannot establish no-normal invocation',()=>{
 for(const source of ['function work(){foreign();return 7}let result=work();','function work(){work();return 7}let result=work();']){
  const p=proof(source);assert.equal(p.completion.functionReturnsNormally(p.program.body[0]),true);
 }
});
test('dead calls cannot supply an actual formal producer and foreign completion facade refuses',()=>{
 const p=proof('function accept(value){throw value}throw 20;accept(7);');
 const fn=p.program.body[0],argument=fn.body[0].argument;assert.deepEqual([...p.graph.typesAt(argument)],[]);
 const other=parseMakeCodeTs('let value=1');assert.throws(()=>analyseSourceValueProducers(other,{normalCompletion:p.completion}),/actual Program/);
});

test('automatic exceptional analysis cannot be bypassed with public options or weaker caller facade',()=>{
 const program=parseMakeCodeTs('function fail(){throw 20}function outer(){fail();return 7}let result=outer();');
 const call=walk(program).filter(n=>n.type==='Call').at(-1);
 const weak=analyseSourceNormalCompletion(program,()=>null);
 for(const options of [{},{exceptionalAnalysis:false},{normalCompletion:weak}]){
  assert.deepEqual([...analyseSourceValueProducers(program,options).typesAt(call)],[]);
 }
 const clone=JSON.parse(JSON.stringify(program));const cloneCall=walk(clone).filter(n=>n.type==='Call').at(-1);
 assert.deepEqual([...analyseSourceValueProducers(clone).typesAt(cloneCall)],[]);
});

test('completion facade cannot be reused after editing the same actual AST object',()=>{
 const p=proof('function fail(){throw 20;return 7}let result=fail();');
 p.program.body[0].body[0]={type:'Return',value:{type:'String',value:'changed'}};
 assert.throws(()=>analyseSourceValueProducers(p.program,{normalCompletion:p.completion}),/actual Program/);
});

test('full-source constraint facts cannot revive a normal dead Return producer',()=>{
 const p=proof('function fail():number{throw 20;return "bad"}let result=fail();');const returned=p.program.body[0].body[1].value;
 assert.deepEqual([...p.graph.constraintTypesAt(returned)],['String']);assert.deepEqual([...p.graph.typesAt(returned)],['Opaque']);assert.deepEqual([...p.graph.typesAt(finalCall(p))],[]);
 const copied=p.graph.constraintTypesAt(returned);copied.clear();assert.deepEqual([...p.graph.constraintTypesAt(returned)],['String']);
});
