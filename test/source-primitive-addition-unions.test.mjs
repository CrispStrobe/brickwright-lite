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

test('non-addition arithmetic on primitive operands is Number; += and references keep their refusals',()=>{
 for(const expression of ['"5"-2','true*2','null/2','undefined%2','("5" as any)**2']){
  const q=inspect('let value='+expression),node=q.nodes.find(n=>n.type==='Binary'&&n.op!=='+');
  assert.deepEqual([...q.graph.typesAt(node)],['Number'],expression);
 }
 for(const expression of ['[1]-2','img`1`*2','unknown/2']){
  const q=inspect('let value='+expression),node=q.nodes.find(n=>n.type==='Binary');
  assert.equal(q.graph.typesAt(node).has('Opaque'),true,expression);
 }
 // A compound += may concatenate: a String store keeps String in the domain.
 const q=inspect('let text:any="5";text+=2;let read=text'),read=q.nodes.filter(n=>n.type==='Identifier'&&n.name==='text').at(-1);
 assert.notDeepEqual([...q.graph.typesAt(read)],['Number']);
});

test('a nullish Array receiver read sees its allocation elements and nullable writes, and escapes make it Opaque',()=>{
 const read=q=>q.nodes.filter(n=>n.type==='Index').at(-1);
 const q=inspect('let rows:any[]=null\nfunction init(){rows=[];rows.push("5");rows[1]=2;let x=rows[0]}\ninit()');
 assert.deepEqual([...q.graph.typesAt(read(q))].sort(),['Number','String','Undefined']);
 // An Array written through the nullable binding reaches its later reads.
 const nested=inspect('let rows:any[]=null\nfunction init(){let tmp:any[]=[1];rows=tmp;rows[0]=[2];let x=rows[1]}\ninit()');
 assert.equal([...nested.graph.typesAt(read(nested))].some(type=>type?.kind==='Array'),true);
 // An escape through the nullable binding makes its element reads Opaque.
 const escaped=inspect('let rows:any[]=null\nfunction init(){let tmp:any[]=[1];rows=tmp;foreign(rows);let x=rows[0]}\ninit()');
 assert.equal(escaped.graph.typesAt(read(escaped)).has('Opaque'),true);
 // A receiver that may be any other non-Array value remains unknown.
 const mixed=inspect('let rows:any=0\nfunction init(){rows=[];rows.push(1);let x=rows[0]}\ninit()');
 assert.equal(mixed.graph.typesAt(read(mixed)).size,0);
});
