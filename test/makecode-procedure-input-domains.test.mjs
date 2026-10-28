import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values');
const loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');

function fixture(value='text',limit='20') {
    const blocks={root:{id:'root',opcode:'data_setvariableto',topLevel:true,inputs:{VALUE:{block:'inspect'}}},
        inspect:{id:'inspect',opcode:'arcade_inspectValue',parent:'root',fields:{},inputs:{VALUE:{block:'value'},LIMIT:{block:'limit'}}},
        value:{id:'value',opcode:'text',parent:'inspect',fields:{TEXT:{value}},inputs:{}},
        limit:{id:'limit',opcode:'math_number',parent:'inspect',fields:{NUM:{value:limit}},inputs:{}}};
    const container={_blocks:blocks,getBlock:id=>blocks[id],getInputs:block=>block.inputs,_cache:{_executeCached:{}}};
    const target={isOriginal:true,blocks:container};
    const thread={target,blockContainer:container,peekStack:()=> 'root',isKilled:false};
    const runtime=new EventEmitter();Object.assign(runtime,{targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread:t=>t===thread});
    const util={runtime,thread,target},args={VALUE:value,LIMIT:limit};
    const method=()=>service.inspect(args,util);
    runtime.getOpcodeFunction=op=>op==='arcade_inspectValue'?method:null;
    const operation={id:'inspect',opcode:'arcade_inspectValue',_argValues:args,_blockFunction:method,fields:blocks.inspect.fields,inputs:blocks.inspect.inputs};
    container._cache._executeCached.root={_ops:[operation]};
    const service=create(runtime,{referenceTypeOf:()=>undefined,typeOf:()=>undefined});service.snapshot();
    const invoke=(values=args,handler=()=>service.inspect(values,util))=>loan.invoke(runtime,thread,container,operation,args,util,handler);
    return {runtime,target,thread,util,args,blocks,container,operation,service,invoke};
}


const query=(f,requests)=>f.invoke(f.args,()=>f.service.inputDomains(f.args,f.util,requests));
test('private current-input query reports domains without decoding raw carriers',()=>{
 const f=fixture('20');assert.deepEqual(query(f,['VALUE','LIMIT']),[['string'],['number']]);
 f.blocks.value.opcode='math_number';f.blocks.value.fields={NUM:{value:'20'}};f.service.snapshot();assert.deepEqual(query(f,['VALUE']),[['number']]);
 assert.throws(()=>f.service.inputDomains(f.args,f.util,['VALUE']),/primitive ownership/);
 assert.throws(()=>f.invoke({...f.args},()=>f.service.inputDomains({...f.args},f.util,['VALUE'])),/primitive ownership/);
 f.blocks.value.parent='foreign';f.service.snapshot();assert.throws(()=>query(f,['VALUE']),/disconnected/);
});
function formalFixture(){
 const f=fixture('20'),b=f.blocks;
 b.definition={id:'definition',opcode:'procedures_definition',topLevel:true,next:'write',inputs:{custom_block:{block:'prototype'}},fields:{}};
 b.prototype={id:'prototype',opcode:'procedures_prototype',parent:'definition',inputs:{},fields:{},mutation:{proccode:'hold %s',argumentnames:'["value"]',argumentids:'["arg"]'}};
 b.write={id:'write',opcode:'arcade_setLocal',parent:'definition',inputs:{NAME:{block:'name'},VALUE:{block:'assigned'}},fields:{}};
 b.name={id:'name',opcode:'text',parent:'write',inputs:{},fields:{TEXT:{value:'value'}}};
 b.assigned={id:'assigned',opcode:'math_number',parent:'write',inputs:{},fields:{NUM:{value:'1'}}};
 b.call={id:'call',opcode:'procedures_call',topLevel:true,inputs:{arg:{block:'incoming'}},fields:{},mutation:{proccode:'hold %s',argumentids:'["arg"]'}};
 b.incoming={id:'incoming',opcode:'math_number',parent:'call',inputs:{},fields:{NUM:{value:'20'}}};
 f.service.snapshot();return f;
}
test('unused actual formals include every incoming call and local writer without annotation facts',()=>{
 const f=formalFixture(),request={procedure:'hold %s',formal:'value'};
 assert.deepEqual(query(f,[request]),[['number']]);
 f.blocks.assigned.opcode='text';f.blocks.assigned.fields={TEXT:{value:'20'}};f.service.snapshot();assert.deepEqual(new Set(query(f,[request])[0]),new Set(['number','string']));
 f.blocks.assigned.opcode='arcade_createSprite';f.blocks.assigned.fields={};f.service.snapshot();assert.throws(()=>query(f,[request]),/domain evidence/);
 const g=formalFixture();g.blocks.call.mutation.argumentids='["wrong"]';g.service.snapshot();assert.throws(()=>query(g,[request]),/domain evidence/);
 const h=formalFixture();delete h.blocks.call;h.service.snapshot();assert.throws(()=>query(h,[request]),/domain evidence/);
 const dynamic=formalFixture();dynamic.blocks.name.opcode='operator_join';dynamic.blocks.name.fields={};dynamic.service.snapshot();assert.throws(()=>query(dynamic,[request]),/domain evidence/);
});
test('domain query keeps unchanged inspection behavior and rejects lifecycle or graph reuse',()=>{
 const f=fixture('20');assert.equal(f.invoke(),'20');assert.deepEqual(query(f,['VALUE']),[['string']]);assert.equal(f.invoke(),'20');
 f.blocks.value.fields.TEXT.value='changed';assert.throws(()=>query(f,['VALUE']),/source graph changed/);
 f.service.snapshot();f.service.invalidate();assert.throws(()=>query(f,['VALUE']),/inactive native owner/);
 const g=fixture();g.service.dispose();g.service.snapshot();assert.throws(()=>query(g,['VALUE']),/inactive native owner/);
});
