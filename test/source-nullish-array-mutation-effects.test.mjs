import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const walk=(node,out=[])=>{
 if(!node||typeof node!=='object')return out;
 if(Array.isArray(node)){for(const value of node)walk(value,out);return out;}
 out.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType'].includes(key))walk(value,out);
 return out;
};
const inspect=text=>{
 const program=parseMakeCodeTs(text,{retainParentheses:true}),nodes=walk(program);
 const graph=analyseSourceValueProducers(program,{arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,initializationEntries:true});
 const declaration=name=>nodes.find(node=>node.type==='Declaration'&&node.decls.some(row=>row.name===name)).decls.find(row=>row.name===name).init;
 return {graph,nodes,read:declaration('observed'),declaration};
};
test('nested indexed Array alternatives retain all normal push/unshift element effects',()=>{
 const q=inspect('let empty=[];let nested=[empty];nested[0].push(9);nested[0].unshift("changed");let observed=empty;let result=nested[0].push(7);');
 assert.deepEqual([...q.graph.arrayElementTypesAt(q.read)].sort(),['Number','String']);
 const receiver=q.declaration('result').callee.object;
 assert.ok(q.graph.typesAt(receiver).has('Undefined'));
 assert.deepEqual(q.graph.arrayAllocationsAt(receiver),[],'normal mutation effects do not grant a strict Array receiver');
 assert.equal(q.graph.arrayMapReceiverSafeAt(receiver),false);
 assert.equal(q.graph.typesAt(q.declaration('result')).has('Number'),false,'no push result receipt on the mixed receiver');
});
test('explicit Null alternatives retain indexed writes without becoming strict initialized Array facts',()=>{
 const q=inspect('let actual=[];let maybe=null;maybe=actual;maybe[0]="stored";let observed=actual;');
 assert.deepEqual([...q.graph.arrayElementTypesAt(q.read)],['String']);
 const receiver=q.nodes.find(node=>node.type==='Assignment'&&node.left.type==='Index').left.object;
 assert.ok(q.graph.typesAt(receiver).has('Null'));assert.deepEqual(q.graph.arrayAllocationsAt(receiver),[]);
});
test('method replacement and nonnumeric indexed writers poison actual allocation alternatives',()=>{
 for(const statement of ['nested[0].push=foreign;','nested[0]["__proto__"]=foreign;']){
  const q=inspect('let actual=[];let nested=[actual];'+statement+'let observed=actual;');
  assert.equal(q.graph.arrayMapReceiverSafeAt(q.read),false,statement);
 }
});
test('incompatible and reference writers remain visible to declaration and flat-element consumers',()=>{
 const typed=inspect('let actual:number[]=[];let nested=[actual];nested[0].push("bad");let observed=actual;');
 assert.deepEqual(typed.graph.arrayConstraintErrorsAt(typed.read),['actual Array elements contradict declared number[] constraint']);
 const nested=inspect('let actual=[];let outer=[actual];outer[0].push([9]);let observed=actual;');
 assert.ok([...nested.graph.arrayElementTypesAt(nested.read)].some(type=>type?.kind==='Array'),'reference alternatives are retained, never flattened to primitive facts');
});
test('additional primitive or Opaque receiver alternatives conservatively poison possible allocation writers',()=>{
 for(const alternative of ['7','JSON.parse("null")']){
  const q=inspect('let actual=[];let maybe=actual;maybe='+alternative+';maybe.push("unproved");let observed=actual;');
  assert.equal(q.graph.arrayMapReceiverSafeAt(q.read),false,alternative);
  assert.ok(q.graph.arrayElementTypesAt(q.read).has('Opaque'),alternative);
  const receiver=q.nodes.find(node=>node.type==='Call'&&node.callee?.name==='push').callee.object;
  assert.deepEqual(q.graph.arrayAllocationsAt(receiver),[]);
 }
});
