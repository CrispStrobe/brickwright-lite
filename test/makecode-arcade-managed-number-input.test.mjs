import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/managed-return-values'),loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner'),interpret=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/current-number-input');
function fixture(opcode='math_number',value='20'){
    const blocks={definition:{id:'definition',opcode:'procedures_definition',topLevel:true,inputs:{custom_block:{block:'prototype'}},next:'return'},
        prototype:{id:'prototype',opcode:'procedures_prototype',mutation:{proccode:'read',argumentnames:'[]',argumentids:'[]'},inputs:{}},
        return:{id:'return',opcode:'arcade_returnValue',parent:'definition',fields:{},inputs:{VALUE:{block:'value'}}},
        value:{id:'value',opcode,parent:'return',fields:opcode==='math_number'?{NUM:{value}}:{TEXT:{value}},inputs:{}}};
    const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:block=>block.inputs,getProcedureDefinition:name=>name==='read'?'definition':null,_cache:{_executeCached:{}}};
    const target={blocks:container},frame={waitingReporter:'read',params:{}},caller={target,blockContainer:container,isKilled:false};
    const thread={target,blockContainer:container,stack:[null,'return'],stackFrames:[frame,{}],peekStack:()=> 'return',isKilled:false};
    const runtime=new EventEmitter();Object.assign(runtime,{targets:[target],threads:[caller,thread],sequencer:{activeThread:caller},isActiveThread:t=>runtime.threads.includes(t)});
    const service=create(runtime);service.start();service.bind(thread,target,'read','definition',caller);runtime.sequencer.activeThread=thread;
    const args={VALUE:value},util={runtime,thread,target},method=()=>interpret(runtime,args,util,'arcade_returnValue');
    const operation={id:'return',opcode:'arcade_returnValue',_argValues:args,_blockFunction:method,fields:blocks.return.fields,inputs:blocks.return.inputs};
    runtime.getOpcodeFunction=op=>op==='arcade_returnValue'?method:null;container._cache._executeCached.return={_ops:[operation]};
    container._cache._executeCached.value={id:'value',opcode,fields:blocks.value.fields,inputs:blocks.value.inputs,_isShadowBlock:true,_shadowValue:value,_parentValues:args,_parentKey:'VALUE'};
    const invoke=(values=args)=>loan.invoke(runtime,thread,container,operation,args,util,()=>interpret(runtime,values,util,'arcade_returnValue'));
    return {blocks,container,target,frame,caller,thread,runtime,service,args,util,operation,invoke};
}

test('current input utility distinguishes physical Number from text without type annotations',()=>{
    for(const value of ['20','20.0','-0','5e-324','1e+21'])assert.ok(Object.is(fixture('math_number',value).invoke(),Number(value)),value);
    for(const value of ['20','20.0','-0','1e+21'])assert.equal(fixture('text',value).invoke(),value);
    for(const value of ['Infinity','NaN','1e309','bad'])assert.equal(fixture('math_number',value).invoke(),value);
});
test('leaf cache lineage, current connectivity and physical input govern interpretation',()=>{
    const changes=[
      f=>{f.blocks.return.inputs.VALUE={block:'missing',shadow:'value'};},
      f=>{f.blocks.value.parent='foreign';},
      f=>{f.blocks.value.fields.NUM.value='21';},
      f=>{f.blocks.value.opcode='text';},
      f=>{f.blocks.value.fields={TEXT:{value:'20'}};},
      f=>{f.container._cache._executeCached.value={...f.container._cache._executeCached.value,fields:{NUM:{value:'20'}}};},
      ...['_parentValues','_parentKey','_shadowValue','_isShadowBlock','inputs'].map(key=>f=>{f.container._cache._executeCached.value[key]=null;})
    ];
    for(const [index,change]of changes.entries()){const f=fixture();change(f);assert.equal(f.invoke(),'20',String(index));}
});
test('copied args, direct calls and wrong consumer never acquire Number authority',()=>{
    const f=fixture();assert.equal(f.invoke({...f.args}),'20');
    assert.equal(interpret(f.runtime,f.args,f.util,'arcade_returnValue'),'20');
    assert.equal(loan.invoke(f.runtime,f.thread,f.container,f.operation,f.args,f.util,()=>interpret(f.runtime,f.args,f.util,'arcade_setLocal')),'20');
});
test('foreign, stopped and replaced runtime callers cannot lend an execution context',()=>{
    const changes=[f=>{f.thread.isKilled=true;},f=>{f.runtime.threads=[];},f=>{f.runtime.targets=[];},f=>{f.thread.blockContainer={};},f=>{f.runtime.sequencer.activeThread=f.caller;},f=>{f.operation._blockFunction=()=>{};},f=>{f.container._cache._executeCached.return._ops=[];},f=>{f.util.runtime=new EventEmitter();}];
    for(const [index,change]of changes.entries()){const f=fixture();change(f);assert.equal(interpret(f.runtime,f.args,f.util,'arcade_returnValue'),'20');assert.throws(()=>f.invoke(),/actual cached caller/,String(index));}
    const reload=fixture();reload.runtime.threads=[reload.caller];assert.throws(()=>reload.invoke(),/actual cached caller/);
    const fresh=fixture();assert.equal(fresh.invoke(),20);
});
test('utility does not replace the consumer managed-frame lifetime guard',()=>{
    const f=fixture();f.service.invalidate();assert.equal(f.service.value(f.args,f.util),'20');
    // The synchronous leaf witness is separate from the revoked managed lease.
    assert.equal(f.invoke(),20);
    f.service.dispose();assert.equal(f.service.value(f.args,f.util),'20');
});
