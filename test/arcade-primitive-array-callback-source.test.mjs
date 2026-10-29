import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainCallableMetadata:true});
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const v of value)walk(v,out);return out;}out.push(value);for(const [key,v]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters'].includes(key))walk(v,out);return out;};
// The consumer deliberately has no Array value propagation. Parameter facts
// can therefore come only from the optional closed callback-entry issuer.
const inspect=text=>{const p=parse(text),graph=analyseSourceValueProducers(p,{arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,uninitializedLocalsAreOpaque:true,initializationEntries:true});return {p,graph,callbacks:walk(p).filter(n=>n.type==='FunctionExpression')};};
const sorted=value=>[...value].sort();
const primitiveXs='let xs=[10,90,100,130,40];let mapCalls=0;xs.forEach((x,i)=>{mapCalls+=x+i});';

test('actual primitive xs arithmetic receives literal element and Number index entry facts',()=>{
 const {graph,callbacks}=inspect(primitiveXs);assert.equal(callbacks.length,1);
 assert.deepEqual(sorted(graph.functionParameterTypes(callbacks[0],0)),['Number']);
 assert.deepEqual(sorted(graph.functionParameterTypes(callbacks[0],1)),['Number']);
 const original=parse(primitiveXs),fn=walk(original).find(n=>n.type==='FunctionExpression'),without=analyseSourceValueProducers(original,{parenthesized:true,unboundIsOpaque:true});
 assert.deepEqual(sorted(without.functionParameterTypes(fn,1)),[]);
});

test('filter keeps original element domains in a fresh allocation rather than predicate returns',()=>{
 const text='let xs=[10,90,100];let sum=0;let kept=xs.filter((x,i)=>x>80);kept.filter(x=>true).forEach((x,i)=>{sum+=x+i});';
 const {p,graph,callbacks}=inspect(text);assert.equal(callbacks.length,3);
 for(const fn of callbacks)assert.deepEqual(sorted(graph.functionParameterTypes(fn,0)),['Number']);
 const arrays=analyseSourceValueProducers(p,{arrayValues:true,arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});
 const filters=walk(p).filter(n=>n.type==='Call'&&n.callee?.name==='filter');
 for(const call of filters){assert.deepEqual(sorted(arrays.arrayElementTypesAt(call)),['Number']);assert.deepEqual(arrays.arrayAllocationsAt(call),[call]);}
 const each=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='forEach');assert.deepEqual(sorted(arrays.typesAt(each)),['Undefined']);
 // No exact index values or filter lengths are issued: compressed indexes are
 // native callback indexes, not copied original-array positions.
 assert.deepEqual(sorted(graph.functionParameterTypes(callbacks[2],1)),['Number']);
});

test('mixed primitive and explicit Undefined elements retain their actual domains',()=>{
 const {graph,callbacks}=inspect('let xs=[1,"s",true,null,undefined];xs.forEach((x,i)=>{let seen=x;let index=i});');
 assert.deepEqual(sorted(graph.functionParameterTypes(callbacks[0],0)),['Boolean','Null','Number','String','Undefined']);
 assert.deepEqual(sorted(graph.functionParameterTypes(callbacks[0],1)),['Number']);
});

test('receiver writers, methods, holes, escapes, foreign effects and unsupported callback shapes refuse entry facts',()=>{
 for(const text of [
  'let xs=[1];xs.forEach((x,i)=>{xs.length=0});',
  'let xs=[1];let alias=xs;alias[0]=foreign();xs.forEach((x,i)=>{let seen=i});',
  'let xs=[1];xs.forEach((x,i)=>{xs.push(x)});',
  'let xs=[1];foreign(xs);xs.forEach((x,i)=>{let seen=i});',
  'let xs=[1];xs.forEach((x,i)=>{pause(1)});',
  'let xs=[1];xs.forEach((x,i,a)=>{let seen=i});',
  'let xs=[1];xs.forEach((x,i)=>{let seen=i},0);',
  'let xs=[1];xs.forEach((x=1,i)=>{let seen=i});',
  'Array.prototype.forEach=foreign;let xs=[1];xs.forEach((x,i)=>{let seen=i});',
  'let xs=[1];xs.forEach=foreign;xs.forEach((x,i)=>{let seen=i});',
  'let xs=[1];let fn=xs.forEach;fn((x,i)=>{let seen=i});',
  'let xs=sprites.allOfKind(SpriteKind.Enemy);xs.filter(e=>e.x>80).forEach((e,i)=>{let seen=i});'
 ]){const {graph,callbacks}=inspect(text);for(const fn of callbacks){
  // A lowered `x=1` default is itself a legitimate Number writer to x.
  // The untouched index must not acquire the refused callback-entry receipt.
  if(fn.params.length)assert.deepEqual(sorted(graph.functionParameterTypes(fn,fn.params.length>1?1:0)),[],text);
 }}
});

test('callback entry expires after source change and restoration',()=>{
 const {p,graph,callbacks}=inspect(primitiveXs),fn=callbacks[0];assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),['Number']);
 const literal=walk(p).find(n=>n.type==='Number'),before=literal.value;literal.value='999';assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);
 literal.value=before;assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);
});

test('primitive chained filter callback source exports through actual authoring conversion',()=>{
 const text='let xs=[10,90,100,130,40];let sum=0;xs.filter((x,i)=>x>80).forEach((x,i)=>{sum+=x+i});';
 const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.unparsed,[]);
 const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);
 assert.match(exported.ts,/filter|forEach|while|for/);
});

test('block predicate prefix and original indexes survive authoring conversion',()=>{
 const text='let xs=[10,90,100,130,40];let sum=0;let predicateIndexes=0;let trace="";'+
  'xs.filter((x,i)=>{predicateIndexes=predicateIndexes*10+i;return x>80}).forEach((x,i)=>{sum+=x+i;trace=trace+x+":"+i+";"});sum+=0;';
 const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.unparsed,[]);
 const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);
 assert.match(exported.ts,/predicateIndexes/);assert.match(exported.ts,/trace/);
});

 test('forEach and filter facts require an issued receipt even when Array propagation is enabled',()=>{
  for(const text of ['let xs=[1];let ys=xs.filter((x,i)=>x>0);',
   'let xs=[1];xs.forEach((x,i)=>{let seen=i});',
   'let xs=[1];xs.forEach((x,i)=>{pause(1)});']){
   const p=parse(text),fn=walk(p).find(n=>n.type==='FunctionExpression');
   const off=analyseSourceValueProducers(p,{arrayValues:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});
   assert.deepEqual(sorted(off.functionParameterTypes(fn,1)),[]);
   const call=walk(p).find(n=>n.type==='Call'&&['filter','forEach'].includes(n.callee?.name));
   assert.deepEqual(off.arrayAllocationsAt(call),[]);
   const forged=analyseSourceValueProducers(p,{arrayValues:true,arrayCallbackBootstrap:true,
    callbackEntry:{calls:new Set([call]),entries:new Map([[fn,[new Set(['Number']),new Set(['Number'])]]])},
    parenthesized:true,unboundIsOpaque:true,initializationEntries:true});
   assert.deepEqual(sorted(forged.functionParameterTypes(fn,1)),[]);assert.deepEqual(forged.arrayAllocationsAt(call),[]);
   if(text.includes('pause')){const refused=analyseSourceValueProducers(p,{arrayValues:true,arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});assert.deepEqual(sorted(refused.functionParameterTypes(fn,1)),[]);assert.deepEqual(refused.arrayAllocationsAt(call),[]);}
  }
 });

const builder='let xs:number[];function startup(){let tmp:number[]=null;tmp=[];tmp.push(0+10);tmp.push(0+90);tmp.push(0+100);xs=tmp;let sum=0;xs.filter((x,i)=>x>80).forEach((x,i)=>{sum+=x+i});}startup();';
test('actual emitted empty allocation and contiguous primitive builder pushes issue entry facts',()=>{
 const {graph,callbacks}=inspect(builder);assert.equal(callbacks.length,2);
 for(const fn of callbacks){assert.deepEqual(sorted(graph.functionParameterTypes(fn,0)),['Number']);assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),['Number']);}
});

test('construction authorization excludes callback/later pushes, intervening publication and empty writers',()=>{
 for(const text of [
  builder.replace('sum+=x+i','tmp.push(4);sum+=x+i'),
  builder.replace('xs=tmp;','xs=tmp;tmp.push(4);'),
  builder.replace('tmp.push(0+90);','xs=tmp;tmp.push(0+90);'),
  builder.replace('tmp.push(0+10);tmp.push(0+90);tmp.push(0+100);',''),
  builder.replace('tmp.push(0+10)','tmp.push(sideEffect())'),
  builder.replace('tmp.push(0+10)','tmp.push(tmp.length)'),
  builder.replace('tmp.push(0+10)','tmp.push(1,2)'),
  builder.replace('tmp=[];','let intervening=0;tmp=[];'),
  builder.replace('sum+=x+i','let inside=[];inside.push(1);sum+=x+i')
 ]){const {graph,callbacks}=inspect(text);for(const fn of callbacks)assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[],text);}
});

test('sparse parser input and sparse AST origins cannot manufacture callback entry',()=>{
 assert.throws(()=>parse('let xs=[1,,3];xs.forEach((x,i)=>{let seen=i});'),/MakeCode TS: expected \] but found "3" on line 1/);
 const p=parse('let xs=[1,2,3];xs.forEach((x,i)=>{let seen=i});');
 const literal=walk(p).find(node=>node.type==='Array'),fn=walk(p).find(node=>node.type==='FunctionExpression');
 delete literal.items[1];
 const graph=analyseSourceValueProducers(p,{arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});
 assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);
});

test('optional invocation and opaque/default-envelope syntax cannot authorize methods',()=>{
 {const p=parse(primitiveXs),fn=walk(p).find(n=>n.type==='FunctionExpression');fn.restParam='x';
  const graph=analyseSourceValueProducers(p,{arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);}
 for(const target of ['call','callee']){
  const p=parse(primitiveXs),fn=walk(p).find(n=>n.type==='FunctionExpression'),call=walk(p).find(n=>n.type==='Call'&&n.callee?.name==='forEach');
  (target==='call'?call:call.callee).optional=true;
  const graph=analyseSourceValueProducers(p,{arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);
 }
 {const p=parse(primitiveXs),fn=walk(p).find(n=>n.type==='FunctionExpression');fn.body.push({type:'Unknown',text:'unmodeled source'});
  const graph=analyseSourceValueProducers(p,{arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);}
 const p=parse(primitiveXs),fn=walk(p).find(n=>n.type==='FunctionExpression');fn.parameterDefaults={hidden:'default'};
 const graph=analyseSourceValueProducers(p,{arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true});assert.deepEqual(sorted(graph.functionParameterTypes(fn,1)),[]);
});

test('unrecognized forms and ordinary callee defaults or async flags cannot hide receiver effects',()=>{
 const options={arrayCallbackParameters:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true};
 {const p=parse(primitiveXs),fn=walk(p).find(node=>node.type==='FunctionExpression');
  fn.body.push({type:'OpaqueEffect',raw:'Array.prototype.forEach=foreign'});
  assert.deepEqual(sorted(analyseSourceValueProducers(p,options).functionParameterTypes(fn,1)),[]);}
 {const p=parse('function produce(){return 1}let xs=[produce()];xs.forEach((x,i)=>{let seen=i});');
  const fn=walk(p).find(node=>node.type==='FunctionExpression');p.body[0].isAsync=true;
  assert.deepEqual(sorted(analyseSourceValueProducers(p,options).functionParameterTypes(fn,1)),[]);}
 {const p=parseMakeCodeTs('function produce(x:any=(Array.prototype.forEach=()=>{})){return 1}let xs=[produce()];xs.forEach((x,i)=>{let seen=i});',
   {retainCallableMetadata:true,parameterDefaults:false});
  const fn=walk(p).find(node=>node.type==='FunctionExpression'&&node.params.length===2);
  assert.ok(p.body[0].params.parameterDefaults.length);
  assert.deepEqual(sorted(analyseSourceValueProducers(p,options).functionParameterTypes(fn,1)),[]);}
});

// Default-on external runtime acceptance. Local bounded probes explicitly
// exclude this case; absent browser/SDK inputs cannot qualify the change.
test('original PXT/native: filter predicate indexes and compressed forEach indexes preserve actual effects',async()=>{
 const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
 const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const {default:BW}=await import('../overlay/scratch-vm/src/util/bw-values.js');
 const text='let xs=[10,90,100,130,40];let sum=0;let predicateIndexes=0;let trace="";'+
  'xs.filter((x,i)=>{predicateIndexes=predicateIndexes*10+i;return x>80}).forEach((x,i)=>{sum+=x+i;trace=trace+x+":"+i+";"});sum+=0;';
 const wanted={sum:323,predicateIndexes:1234,trace:'90:0;100:1;130:2;'};
 const checkOriginal=globals=>{for(const [name,value]of Object.entries(wanted)){
  const matches=Object.entries(globals).filter(([key])=>[name,'Game_'+name].includes(key));assert.equal(matches.length,1,name);assert.equal(matches[0][1],value,name);
 }};
 checkOriginal(await runPxtArcade(text,{fakeClock:true}));
 const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);let run;
 try{
  // Same finite frame budget as the existing complete Array callback fixture.
  run=await runProgram(imported.code,{frames:30,storage:true,uploads:imported.costumes});
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const values=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
  for(const [name,value]of Object.entries(wanted)){
   const matches=values.filter(variable=>[name,'Game_'+name].includes(variable.name));assert.equal(matches.length,1,name);assert.equal(BW.decode(matches[0].value),value,name);
  }
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
  checkOriginal(await runPxtArcade(exported.files,{fakeClock:true}));
 }finally{run?.vm.quit();clearStrayTimers();}
});
