import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {numericClosureNormalResults} from '../overlay/scratch-gui/src/lib/bw-makecode/numeric-closure-normal-results.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
const profile=GENERATED_HELPER_PROFILES.ordinary;
const source='function make(start:number):()=>number {let n:number=undefined;n=start;return()=>{n=n+7;return n}} let first=make(2);let alias=first;let second=make(5);let result1=first();let result2=alias();let result3=second();info.setScore(result1+result2+result3);';
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const child of value)walk(child,out);return out;}out.push(value);for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(key))walk(child,out);return out;};
const inspect=(text,{withGraph=false}={})=>{
 const program=parseMakeCodeTs(text,profile),graph=withGraph?analyseSourceValueProducers(program,{arrayValues:true,parenthesized:true,unboundIsOpaque:true,declaredLocalUndefined:true,initializationEntries:true}):null;
 const proof=numericClosureNormalResults(program,profile),nodes=walk(program);
 const calls=nodes.filter(node=>node.type==='Call'&&['first','alias','second'].includes(node.callee?.name||node.callee?.expression?.name));
 return {program,graph,proof,nodes,calls};
};
const bad=text=>{const {proof,calls}=inspect(text);assert.ok(calls.length);assert.ok(calls.every(call=>!proof.has(call)));};

test('numeric closure results come from actual entry stores and distinct factory/alias invocation nodes',()=>{
 const {proof,calls,nodes}=inspect(source);assert.equal(calls.length,3);assert.ok(calls.every(call=>proof.has(call)));assert.equal(proof.current(),true);
 assert.notEqual(calls[0],calls[1]);assert.notEqual(calls[0],calls[2]);
 const arrow=nodes.find(node=>node.type==='FunctionExpression');assert.equal(proof.has(arrow),false);
 const changed=inspect(source.replace('n=n+7','n=n+1'));assert.ok(changed.calls.every(call=>changed.proof.has(call)));
 const renamed=parseMakeCodeTs(source.replaceAll('make','buildCounter').replaceAll('start','score').replaceAll('first','one'),profile),renamedProof=numericClosureNormalResults(renamed,profile);
 const invoked=walk(renamed).filter(node=>node.type==='Call'&&['one','alias','second'].includes(node.callee?.name));assert.equal(invoked.length,3);assert.ok(invoked.every(call=>renamedProof.has(call)));
});
test('numeric closure normal facts do not prune Undefined or replace general callable producers',()=>{
 const {proof,calls,graph,nodes,program}=inspect(source,{withGraph:true});const before=JSON.stringify(program);
 const read=nodes.find(node=>node.type==='Identifier'&&node.name==='n');
 assert.ok(graph.bindingTypesAt(read).has('Undefined'));
 assert.ok(graph.typesAt(nodes.find(node=>node.type==='FunctionExpression')).has('Opaque'));
 assert.ok(calls.every(call=>proof.has(call)));assert.equal(JSON.stringify(program),before);
 assert.ok(graph.bindingTypesAt(read).has('Undefined'));
});
test('missing entry stores and actual opaque capture writers cannot borrow a Number annotation',()=>{
 for(const text of [source.replace('n=start;',''),source.replace('n=start;','n="bad";'),source.replace('n=n+7','n="bad"'),source.replace('n=n+7','n=[]'),source.replace('make(2)','make("2")'),source.replace('make(2)','make(undefined)')])bad(text);
});
test('callable targets require every real writer and refuse foreign aliases and callback escapes',()=>{
 for(const text of [source.replace('let alias=first;','let alias=first;alias=unknown;'),source.replace('let alias=first;','let alias=first;foreign(first);'),source.replace('let alias=first;','let alias=first;let stored=[first];'),source.replace('let alias=first;','let alias=first;game.onUpdate(first);'),source.replace('let alias=first;','let alias=first;first=second;second=unknown;')])bad(text);
});
test('factory and Arrow argument evaluation cannot be skipped for an alleged normal result',()=>{
 for(const text of [source.replace('first()','first(effect())'),source.replace('make(2)','make(2,effect())'),source.replace('make(2)','make()'),source.replace('n=start;','n=effect();'),source.replace('n=n+7','n=make(1)()')])bad(text);
});
test('defaults optional entries recursion and unproved control flow remain outside the closed family',()=>{
 for(const text of [source.replace('start:number','start:number=2'),source.replace('start:number','start?:number'),source.replace('n=start;','if(start)n=start;'),source.replace('n=start;','n=make(start)();'),source.replace('n=n+7;return n','if(n)n=n+7;return n')])bad(text);
 for(const flag of ['async','generator','isAsync','isGenerator']){
  const {program,calls,proof:before}=inspect(source);assert.equal(calls.length,3);assert.ok(calls.every(call=>before.has(call)));
  walk(program).find(node=>node.type==='FunctionExpression')[flag]=true;
  const proof=numericClosureNormalResults(program,profile);assert.ok(calls.every(call=>!proof.has(call)));
 }
});
test('numeric closure queries expire on mutation before first query and remain expired after ABA',()=>{
 for(const queried of [false,true]){
  const {proof,calls,nodes}=inspect(source);if(queried)assert.ok(proof.has(calls[0]));
  const literal=nodes.find(node=>node.type==='Number'&&node.value==='7');assert.ok(literal);literal.value='9';assert.equal(proof.current(),false);literal.value='7';assert.ok(calls.every(call=>!proof.has(call)));assert.equal(proof.current(),false);
 }
 for(const mutate of [program=>{delete program.body;},program=>{delete program.body[0];},program=>{program.body[0].body.pop();}]){
  const {program,calls,proof:before}=inspect(source);assert.equal(calls.length,3);assert.ok(calls.every(call=>before.has(call)));mutate(program);const proof=numericClosureNormalResults(program,profile);assert.ok(calls.every(call=>!proof.has(call)));
 }
 let reads=0;const {program:malformed,calls:realCalls,proof:beforeGetter}=inspect(source);assert.equal(realCalls.length,3);assert.ok(realCalls.every(call=>beforeGetter.has(call)));Object.defineProperty(malformed,'body',{get(){reads++;throw Error('getter');},configurable:true});
 const refused=numericClosureNormalResults(malformed,profile);assert.ok(realCalls.every(call=>!refused.has(call)));assert.equal(reads,0);
 const {proof,calls,program}=inspect(source);program.body.push({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]}});assert.ok(calls.every(call=>!proof.has(call)));
});
test('native helper composition retains original calls and proves only their normal returned values',()=>{
 const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
 const text=helper+'\n'+source.replace('n=n+7','n=__bwBinaryAdd(n,7)').replace('info.setScore(result1+result2+result3)','info.setScore(__bwBinaryAdd(__bwBinaryAdd(result1,result2),result3))');
 const program=parseMakeCodeTs(text,profile),before=JSON.stringify(program),proof=inspectNativeArrayBinaryDomains(program,profile);
 assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);assert.equal(proof.current(),true);assert.equal(JSON.stringify(program),before);
 const unsafe=inspectNativeArrayBinaryDomains(parseMakeCodeTs(text.replace('make(2)','make("bad")'),profile),profile);assert.equal(unsafe.helpers.size,0);assert.match(unsafe.reason,/initialized primitive|flat Array/);
 const forged=parseMakeCodeTs(text,profile);forged.nativeClosureDomainNormalCall=Symbol();const denied=inspectNativeArrayBinaryDomains(forged,profile);assert.equal(denied.helpers.size,0);assert.match(denied.reason,/supplied private/);
});
