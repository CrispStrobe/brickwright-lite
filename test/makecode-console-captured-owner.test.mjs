import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values'),loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');
// Structural service adversaries use a real cached-operation loan. Actual
// registered callback execution is covered by console-captured-cells.test.
function fixture(){
 const blocks={},add=(id,opcode,inputs={},fields={},extra={})=>blocks[id]={id,opcode,inputs,fields,...extra},link=(name,id)=>({[name]:{block:id}}),text=(id,value,parent)=>add(id,'text',{}, {TEXT:{value}},{parent});
 add('definition','procedures_definition',link('custom_block','prototype'),{},{topLevel:true,next:'writer'});add('prototype','procedures_prototype',{}, {},{parent:'definition',mutation:{proccode:'install',argumentnames:'[]'}});
 add('writer','arcade_setLocal',{...link('NAME','localName'),...link('VALUE','literal')},{},{parent:'definition',next:'registration'});text('localName','label','writer');text('literal','live','writer');
 add('registration','arcade_registerUpdateHandler',{...link('TOKEN','registrationToken'),...link('CAPTURES','captureNames')},{},{parent:'writer'});text('registrationToken','update','registration');text('captureNames','label','registration');
 add('hat','arcade_whenRegisteredUpdate',link('TOKEN','hatToken'),{},{topLevel:true,next:'assign'});text('hatToken','update','hat');
 add('assign','data_setvariableto',link('VALUE','inspect'),{},{parent:'hat'});add('inspect','arcade_inspectValue',{...link('VALUE','value'),...link('LIMIT','limit')},{},{parent:'assign'});
 add('value','arcade_getCaptured',link('NAME','readName'),{},{parent:'inspect'});text('readName','label','value');add('limit','math_number',{}, {NUM:{value:'20'}},{parent:'inspect'});
 const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:block=>block.inputs,_cache:{_executeCached:{}}},target={isOriginal:true,blocks:container,variables:{}},thread={target,blockContainer:container,peekStack:()=> 'assign',isKilled:false};
 const runtime=new EventEmitter();Object.assign(runtime,{targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:value=>value===thread});const util={runtime,thread,target},args={VALUE:'live',LIMIT:'20'};let service;const method=()=>service.inspect(args,util);runtime.getOpcodeFunction=op=>op==='arcade_inspectValue'?method:null;
 const operation={id:'inspect',opcode:'arcade_inspectValue',_argValues:args,_blockFunction:method,fields:blocks.inspect.fields,inputs:blocks.inspect.inputs};container._cache._executeCached.assign={_ops:[operation]};service=create(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined});service.snapshot();
 const invoke=()=>loan.invoke(runtime,thread,container,operation,args,util,()=>service.inspect(args,util));return{blocks,add,text,link,runtime,target,thread,container,operation,service,invoke};
}

test('captured read requires current unique registration and actual primitive writers',()=>{
 assert.equal(fixture().invoke(),'live');
 for(const change of ['opaque','computedName','foreign','duplicate','missingLocal','duplicateCaptures','producerlessCycle','captureCycle','duplicateFormal']){
  const f=fixture();
  if(change==='opaque'||change==='computedName'){
   f.blocks.assign.next='capturedWrite';f.add('capturedWrite','arcade_setCaptured',{...f.link('NAME','writeName'),...f.link('VALUE','writeValue')},{},{parent:'assign'});f.text('writeName','label','capturedWrite');
   if(change==='opaque')f.add('writeValue','arcade_createSprite',{}, {},{parent:'capturedWrite'});
   else{f.text('writeValue','safe','capturedWrite');f.blocks.writeName.opcode='operator_join';f.blocks.writeName.fields={};f.blocks.writeName.inputs={...f.link('STRING1','left'),...f.link('STRING2','right')};f.text('left','la','writeName');f.text('right','bel','writeName');}
  }
  if(change==='foreign'){const foreignBlocks={hat:{...f.blocks.hat}};f.runtime.targets.push({isOriginal:true,variables:{},blocks:{_blocks:foreignBlocks,getBlock:id=>id==='hat'?foreignBlocks.hat:id==='hatToken'?f.blocks.hatToken:null}});}
  if(change==='duplicate')f.blocks.duplicate={...f.blocks.hat,next:null};
  if(change==='missingLocal')f.blocks.localName.fields.TEXT.value='other';
  if(change==='producerlessCycle'){f.blocks.writer.inputs.VALUE={block:'selfRead'};f.add('selfRead','arcade_getLocal',f.link('NAME','selfName'),{},{parent:'writer'});f.text('selfName','label','selfRead');}
  if(change==='duplicateCaptures')f.blocks.captureNames.fields.TEXT.value='label label';
  if(change==='duplicateFormal')f.blocks.prototype.mutation.argumentnames='["label","label"]';
  if(change==='captureCycle'){f.blocks.writer.next=null;f.blocks.hat.next='registration';f.blocks.registration.parent='hat';f.blocks.registration.next='assign';f.blocks.assign.parent='registration';f.blocks.captureNames.fields.TEXT.value='';}
  f.service.snapshot();assert.throws(()=>f.invoke(),/producer authority/,change);
 }
});

test('capture graph/body/target edits and stopped/disposed ownership cannot reuse a cached read',()=>{
 const f=fixture();assert.equal(f.invoke(),'live');f.blocks.literal.fields.TEXT.value='changed';assert.throws(()=>f.invoke(),/source graph changed/);f.service.snapshot();assert.equal(f.invoke(),'live');
 f.service.invalidate();assert.throws(()=>f.invoke(),/inactive native owner/);f.service.snapshot();assert.equal(f.invoke(),'live');f.thread.isKilled=true;assert.throws(()=>f.invoke(),/actual cached caller/);f.thread.isKilled=false;
 f.service.dispose();f.service.snapshot();assert.throws(()=>f.invoke(),/inactive native owner/);
 const g=fixture();g.thread.blockContainer={...g.container};assert.throws(()=>g.invoke(),/actual cached caller|container/);
});


test('unrelated procedure locals and other callback kinds do not alias a captured cell',()=>{
 const f=fixture();
 f.add('otherDefinition','procedures_definition',f.link('custom_block','otherPrototype'),{},{topLevel:true,next:'dynamicWriter'});f.add('otherPrototype','procedures_prototype',{}, {},{parent:'otherDefinition',mutation:{proccode:'other',argumentnames:'[]'}});
 f.add('dynamicWriter','arcade_setLocal',{...f.link('NAME','dynamicName'),...f.link('VALUE','opaque')},{},{parent:'otherDefinition'});f.add('dynamicName','operator_join',{...f.link('STRING1','left'),...f.link('STRING2','right')},{},{parent:'dynamicWriter'});f.text('left','la','dynamicName');f.text('right','bel','dynamicName');f.add('opaque','arcade_createSprite',{}, {},{parent:'dynamicWriter'});
 f.add('otherHat','arcade_whenRegisteredButton',f.link('TOKEN','otherToken'),{},{topLevel:true});f.text('otherToken','update','otherHat');
 f.service.snapshot();assert.equal(f.invoke(),'live');
});
