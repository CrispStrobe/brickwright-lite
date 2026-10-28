import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import getter from '../overlay/scratch-vm/src/util/bw-null-sprite-getter.js';
import primitive from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
import exceptions from '../overlay/scratch-vm/src/util/bw-arcade-exceptions.js';

// Explicit synthetic engine-boundary controls, not native VM qualification.
function fixture(property = 'x') {
    const runtime = new EventEmitter(), args = {ID:null, PROPERTY:property};
    const block = {id:'getter', opcode:'arcade_spriteProperty', inputs:{}, fields:{}, mutation:null};
    const root = {id:'root', inputs:{VALUE:{block:block.id}}}, blocks = {getter:block, root};
    const func = () => 0;
    const operation = {id:block.id, opcode:block.opcode, _argValues:args, fields:block.fields,
        inputs:block.inputs, mutation:block.mutation, _blockFunction:func};
    const container = {getBlock:id=>blocks[id], getInputs:node=>node.inputs,
        _cache:{_executeCached:{root:{_ops:[operation]}}}};
    const target = {id:'target', blocks:container};
    const thread = {target, blockContainer:container, stack:['root'], stackFrames:[{}], status:0,
        constructor:{STATUS_DONE:4}, peekStack:()=> 'root', peekStackFrame(){return this.stackFrames[0];}};
    Object.assign(runtime, {targets:[target], threads:[thread], _blockInfo:[],
        sequencer:{activeThread:thread, retireThread(value){value.status=4;value.stack=[];}},
        isActiveThread:value=>runtime.threads.includes(value) && value.status!==4,
        getOpcodeFunction:()=>operation._blockFunction});
    const util = {runtime, thread, target};
    let implementationCurrent = true;
    const instance = {}, owner = {isInstance:value=>value===instance, isCurrent:()=>implementationCurrent};
    const adapter = Object.assign(Object.create({getInfo(){}}), {_inst:instance, spriteProperty:func});
    const faults = getter.create(runtime,owner), exception = exceptions.create(runtime,()=>null);
    const info = getter.declaration({id:'arcade',blocks:[{opcode:'spriteProperty',arguments:{ID:{type:'string'},PROPERTY:{type:'string'}}}]},owner);
    getter.bindAdapterInfo(info,adapter,instance);
    const entry = {json:{type:block.opcode},info:{...info.blocks[0],func}};
    const category = {id:'arcade',blocks:[entry]};runtime._blockInfo.push(category);runtime.emit('EXTENSION_ADDED',category);
    runtime.emit('PROJECT_START');
    return {runtime,args,block,root,blocks,operation,container,target,thread,util,owner,adapter,info,entry,category,faults,exception,
        changeImplementation:()=>{implementationCurrent=false;},
        invoke:fn=>primitive.invoke(runtime,thread,container,operation,args,util,fn)};
}

for (const property of ['x','y','width','height']) test('private actual null receipt binds '+property+' individually',()=>{
    const f=fixture(property);let fault;
    f.invoke(()=>{fault=f.faults.fault(f.args,f.util);assert.ok(fault.error instanceof TypeError);
        assert.deepEqual(getter.consume(f.runtime,f.args,f.util,fault.error,fault.lease),{block:'getter',property});
        assert.equal(getter.consume(f.runtime,f.args,f.util,fault.error,fault.lease),null);});
    assert.equal(getter.consume(f.runtime,f.args,f.util,fault.error,fault.lease),null);
    assert.equal(primitive.permitsNumberInput('arcade_spriteProperty','ID'),false);
});

test('missing, Undefined, null text, tags and object getters cannot issue null receipts',()=>{
    for(const value of [undefined,'null','',0,false,{bwNull:true},{toString(){return 'null';}},{bwUndefined:true}]) {
        const f=fixture();f.args.ID=value;
        f.invoke(()=>assert.throws(()=>f.faults.fault(f.args,f.util),/actual null/));
    }
    const missing=fixture();delete missing.args.ID;missing.invoke(()=>assert.throws(()=>missing.faults.fault(missing.args,missing.util),/actual null/));
    const accessor=fixture();let reads=0;Object.defineProperty(accessor.args,'ID',{get(){reads++;return null;}});
    accessor.invoke(()=>assert.throws(()=>accessor.faults.fault(accessor.args,accessor.util),/actual null/));assert.equal(reads,0);
    for(const property of ['vx','id',null,undefined,{toString(){return 'x';}}]) {
        const f=fixture();f.args.PROPERTY=property;f.invoke(()=>assert.throws(()=>f.faults.fault(f.args,f.util),/supported current property/));
    }
});

test('copied arguments, retained utility and unrelated runtime cannot borrow a getter loan',()=>{
    const f=fixture();assert.throws(()=>f.faults.fault(f.args,f.util),/original current primitive/);
    f.invoke(()=>{assert.throws(()=>f.faults.fault({...f.args},f.util),/original current primitive/);
        assert.throws(()=>f.faults.fault(f.args,{...f.util}),/original current primitive/);
        assert.throws(()=>f.faults.fault(f.args,{...f.util,runtime:{}}),/original current primitive/);});
    assert.throws(()=>f.faults.fault(f.args,f.util),/original current primitive/);
});

test('current graph, field, input, mutation and actual implementation changes refuse fault authority',()=>{
    for(const change of [f=>{f.root.inputs={};},f=>{f.block.fields={};},f=>{f.block.inputs={};},
        f=>{f.block.mutation={};},f=>{f.operation._argValues={...f.args};},f=>{f.blocks.getter={...f.block};},
        f=>f.changeImplementation(),f=>{f.adapter.spriteProperty=()=>0;},
        f=>{f.runtime._blockInfo=[];},f=>{f.category.blocks=[{...f.entry}];},f=>{f.entry.info.func=()=>0;},
        f=>{f.entry.info.arguments={};}]) {
        const f=fixture();f.invoke(()=>{change(f);assert.throws(()=>f.faults.fault(f.args,f.util));});
    }
});

test('replacement registration AND cached function together cannot acquire original getter ownership',()=>{
    const f=fixture();f.operation._blockFunction=()=>0;
    f.invoke(()=>assert.throws(()=>f.faults.fault(f.args,f.util),/original current primitive/));
    const g=fixture();g.runtime.getOpcodeFunction=()=>g.operation._blockFunction;
    g.invoke(()=>assert.throws(()=>g.faults.fault(g.args,g.util),/original current primitive/));
});

test('unissued metadata, repeated registration and copied rows cannot renew getter identity',()=>{
    const f=fixture();f.runtime.emit('EXTENSION_ADDED',f.category);
    f.invoke(()=>assert.throws(()=>f.faults.fault(f.args,f.util),/original current primitive/));
    const g=fixture();g.runtime.emit('BLOCKSINFO_UPDATE',g.category);
    g.invoke(()=>assert.throws(()=>g.faults.fault(g.args,g.util),/original current primitive/));
    const h=fixture();assert.throws(()=>getter.bindAdapterInfo({id:'arcade',blocks:[{...h.info.blocks[0]}]},h.adapter,h.adapter._inst),/source owner/);
});

test('actual metadata refresh requires a fresh single-use source issuance',()=>{
    const f=fixture();const info=getter.declaration({id:'arcade',blocks:[{opcode:'spriteProperty',arguments:{}}]},f.owner);
    getter.bindAdapterInfo(info,f.adapter,f.adapter._inst);
    const fresh={json:{type:'arcade_spriteProperty'},info:{...info.blocks[0],func:f.operation._blockFunction}};
    f.category.blocks=[fresh];f.runtime.emit('BLOCKSINFO_UPDATE',f.category);
    f.invoke(()=>assert.ok(f.faults.fault(f.args,f.util).error instanceof TypeError));
});

test('Stop, Load and disposal invalidate issued receipts even after another Start',()=>{
    for(const event of ['PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED']) {
        const f=fixture();f.invoke(()=>{const fault=f.faults.fault(f.args,f.util);f.runtime.emit(event);f.runtime.emit('PROJECT_START');
            assert.equal(getter.consume(f.runtime,f.args,f.util,fault.error,fault.lease),null);});
    }
});

test('only the exact Error, private receipt, runtime, args and utility consume a fault',()=>{
    const f=fixture();f.invoke(()=>{const fault=f.faults.fault(f.args,f.util);
        for(const [runtime,args,util,error,lease] of [[{},f.args,f.util,fault.error,fault.lease],
            [f.runtime,{...f.args},f.util,fault.error,fault.lease],[f.runtime,f.args,{...f.util},fault.error,fault.lease],
            [f.runtime,f.args,f.util,new TypeError(fault.error.message),fault.lease],
            [f.runtime,f.args,f.util,fault.error,{}]])assert.equal(getter.consume(runtime,args,util,error,lease),null);
        assert.ok(getter.consume(f.runtime,f.args,f.util,fault.error,fault.lease));
    });
});

test('same-generation later invocation cannot consume an old receipt with identical cached args and utility',()=>{
    const f=fixture();let previous;
    f.invoke(()=>{previous=f.faults.fault(f.args,f.util);});
    f.invoke(()=>{
        assert.equal(getter.consume(f.runtime,f.args,f.util,previous.error,previous.lease),null);
        const current=f.faults.fault(f.args,f.util);
        assert.deepEqual(getter.consume(f.runtime,f.args,f.util,current.error,current.lease),{block:'getter',property:'x'});
    });
});

test('private fault retires real linked callers exactly once while detached fiber remains live',()=>{
    const f=fixture(),caller={...f.thread,stack:['caller'],stackFrames:[{}]},detached={...f.thread,stack:['independent'],stackFrames:[{}]};
    f.runtime.threads.push(caller,detached);let cleaned=0;const signals=[];f.runtime.on('BLOCKS_ERROR',error=>signals.push(error));
    f.runtime.sequencer.activeThread=caller;f.exception.link(f.thread,caller,()=>cleaned++);f.runtime.sequencer.activeThread=f.thread;
    let actual;
    assert.throws(()=>f.invoke(()=>{const fault=f.faults.fault(f.args,f.util);actual=fault.error;
        f.exception.rejectPrimitiveFault(f.args,f.util,fault.error,fault.lease);assert.fail('no successful primitive completion');}),error=>error===actual);
    assert.equal(cleaned,1);assert.equal(signals.length,1);assert.equal(signals[0],actual);
    assert.equal(f.thread.status,4);assert.equal(caller.status,4);assert.equal(detached.status,0);
    assert.equal(exceptions.consume(f.runtime,f.thread,actual),true);assert.equal(exceptions.consume(f.runtime,caller,actual),true);
    assert.equal(exceptions.consume(f.runtime,detached,actual),false);
    assert.deepEqual(exceptions.diagnostic(f.runtime,actual),{kind:'primitive-fault',message:actual.message,block:'getter',target:'target'});
    assert.equal(exceptions.diagnostic({},actual),null);assert.equal(exceptions.diagnostic(f.runtime,new TypeError(actual.message)),null);
});

test('arbitrary Errors and public receipt copies never enter shared exceptional lineage',()=>{
    const f=fixture();let reports=0;f.runtime.on('BLOCKS_ERROR',()=>reports++);
    f.invoke(()=>assert.throws(()=>f.exception.rejectPrimitiveFault(f.args,f.util,new TypeError('null'),{}),/private current receipt/));
    assert.equal(reports,0);assert.equal(f.thread.status,0);
});
