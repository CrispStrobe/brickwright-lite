import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const walk=(n,out=[])=>{if(!n||typeof n!=='object')return out;if(Array.isArray(n)){for(const v of n)walk(v,out);return out;}out.push(n);for(const [k,v]of Object.entries(n))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','calls'].includes(k))walk(v,out);return out;};
const inspect=s=>{const p=parseMakeCodeTs(s),nodes=walk(p);return {p,nodes,graph:analyseSourceValueProducers(p,{unboundIsOpaque:true,parenthesized:true,arrayValues:true,initializationEntries:true})};};
const addition=q=>q.nodes.find(n=>n.type==='Binary'&&n.op==='+');

test('shared ordinary addition retains a conservative primitive result union across actual callers',()=>{
 const q=inspect('function sum(a:any,b:any){return a+b}let label=sum("Player ",2);let count=sum(1,1);');
 assert.deepEqual([...q.graph.typesAt(addition(q))].sort(),['Number','String']);
 const opaque=inspect('function sum(a:any,b:any){return a+b}let label=sum("Player ",2);let count=sum(unknown,1);');
 assert.equal(opaque.graph.typesAt(addition(opaque)).has('Opaque'),true,'one unknown caller cannot be subtracted');
});

test('exact String and numeric primitive conversions keep their separate normal domains',()=>{
 for(const [expression,expected]of [['"x"+1',['String']],['1+2',['Number']],['true+false',['Number']],['null+undefined',['Number']],['(true?"x":1)+null',['Number','String']]]){
  const q=inspect('let value='+expression);assert.deepEqual([...q.graph.typesAt(addition(q))].sort(),expected,expression);
 }
});

test('reference unknown and empty domains cannot become primitive addition inputs',()=>{
 for(const source of ['let value=unknown+"x"','let value=[1]+"x"','let value=img`1`+"x"','function sum(a:any,b:any){return a+b}']){
  const q=inspect(source);assert.equal(q.graph.typesAt(addition(q)).has('Opaque'),true,source);
 }
});

test('a primitive result never grants an earlier binding read its missing readiness',()=>{
 const q=inspect('let result=value+1;let value="x";'),read=q.nodes.find(n=>n.type==='Identifier'&&n.name==='value');
 // The eager graph retains reset alternatives; a normal-result union cannot
 // discharge the independent pointwise declaration/read frontier.
 assert.deepEqual([...q.graph.typesAt(addition(q))].sort(),['Number','String']);assert.equal(q.graph.isInitializedAt(read),false);
});
