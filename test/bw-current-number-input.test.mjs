import test from 'node:test';
import assert from 'node:assert/strict';
import owner from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
import interpret from '../overlay/scratch-vm/src/util/bw-current-number-input.js';
function fixture(opcode,name,value='20',leafOpcode='math_number'){
 const args={[name]:value},leaf={id:'leaf',opcode:leafOpcode,parent:'call',fields:{[leafOpcode==='math_number'?'NUM':'TEXT']:{value}},inputs:{}},block={id:'call',opcode,fields:{},inputs:{[name]:{block:'leaf'}},parent:null};
 const blocks={call:block,leaf},container={getBlock:id=>blocks[id],getInputs:b=>b.inputs,_cache:{_executeCached:{}}};
 const target={blocks:container},thread={target,blockContainer:container,peekStack:()=> 'call'},runtime={targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>runtime.threads.includes(t)};
 const util={runtime,thread,target},primitive=()=>interpret(runtime,args,util,opcode,name),op={id:'call',opcode,_argValues:args,_blockFunction:primitive,fields:block.fields,inputs:block.inputs};
 runtime.getOpcodeFunction=()=>primitive;container._cache._executeCached.call={_ops:[op]};container._cache._executeCached.leaf={id:'leaf',opcode:leafOpcode,fields:leaf.fields,inputs:leaf.inputs,_isShadowBlock:true,_shadowValue:value,_parentValues:args,_parentKey:name};
 return{args,block,leaf,container,target,thread,runtime,util,op,run:()=>owner.invoke(runtime,thread,container,op,args,util,primitive)};
}
test('only explicit current primitive input roles interpret Number leaves',()=>{
 for(const[opcode,names]of Object.entries({arcade_throwValue:['VALUE'],arcade_createOwnedImageSprite:['KIND'],arcade_returnValue:['VALUE'],arcade_functionArgument:['VALUE'],arcade_setLocal:['VALUE'],arcade_setCaptured:['VALUE'],arcade_setObjectField:['VALUE'],arcade_inspectValue:['VALUE','LIMIT'],arrays_valueBinary:['LEFT','RIGHT'],arrays_valueUnary:['VALUE'],arrays_valueCompare:['LEFT','RIGHT'],arrays_valueTruthy:['VALUE']}))for(const name of names){
  assert.equal(fixture(opcode,name).run(),20,opcode+'.'+name);
  assert.equal(fixture(opcode,name,'20','text').run(),'20');
  assert.equal(fixture(opcode,'OP').run(),'20','operator socket has no Number authority');
 }
 for(const opcode of ['arcade_createCallable','arcade_objectField'])assert.equal(fixture(opcode,'VALUE').run(),'20','loan alone is insufficient');
 for(const opcode of ['arrays_createReference','arrays_mutateReference','__proto__','toString','unknown'])assert.equal(owner.handles(opcode),false);
});
test('Array input interpretation preserves signed zero and finite leaf spellings without decoding text',()=>{
 for(const value of ['-0','0.25','-3','5e-324','1e+21'])assert.ok(Object.is(fixture('arrays_valueUnary','VALUE',value).run(),Number(value)));
 for(const value of ['NaN','Infinity','1e309','bad'])assert.equal(fixture('arrays_valueUnary','VALUE',value).run(),value);
});
test('Array value roles retain current cached leaf, active caller and input lineage checks',()=>{
 const changes=[f=>{f.leaf.parent='other';},f=>{f.block.inputs.LEFT={block:'missing',shadow:'leaf'};},f=>{f.leaf.fields.NUM.value='21';},f=>{f.container._cache._executeCached.leaf._parentValues={...f.args};},f=>{f.container._cache._executeCached.leaf._parentKey='RIGHT';},f=>{f.container._cache._executeCached.leaf._isShadowBlock=false;}];
 for(const change of changes){const f=fixture('arrays_valueBinary','LEFT');change(f);assert.equal(f.run(),'20');}
 for(const change of [f=>{f.runtime.threads=[];},f=>{f.thread.isKilled=true;},f=>{f.util.runtime={};},f=>{f.container._cache._executeCached.call._ops=[];}]){const f=fixture('arrays_valueBinary','LEFT');change(f);assert.throws(()=>f.run(),/actual cached caller/);}
});
test('physical input value is evaluated once and copied utility or args cannot borrow a loan',()=>{
 const f=fixture('arrays_valueBinary','LEFT');let reads=0;Object.defineProperty(f.args,'LEFT',{get(){reads++;return '20';}});
 assert.equal(f.run(),20);assert.equal(reads,1);
 owner.invoke(f.runtime,f.thread,f.container,f.op,f.args,f.util,()=>{
  assert.equal(interpret(f.runtime,{LEFT:'20'},f.util,'arrays_valueBinary','LEFT'),'20');
  assert.equal(interpret(f.runtime,f.args,{...f.util},'arrays_valueBinary','LEFT'),'20');
 });
});
