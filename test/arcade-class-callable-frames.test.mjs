import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createFrames from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-frames.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';

// These are issuer/heap unit controls. Actual VM managed dispatch and portable
// class/callable admission are independently required before integration.
const fixture=({constructorParameters=[],currentGraph=()=>true}={})=>{
    const runtime=new EventEmitter();runtime.threads=[];runtime.targets=[];runtime.sequencer={activeThread:null};
    const heap=createHeap(runtime,BW),definitions=new Map(),parameters=new Map();
    const blocks={getProcedureDefinition:code=>definitions.get(code),getProcedureParamNamesIdsAndDefaults:code=>[parameters.get(code),[],[]]};
    const target={blocks};runtime.targets.push(target);
    const spec={name:'Holder',fields:[{name:'value',type:'number',readonly:false}],initializer:'',constructor:'HolderCtor %s',parameters:constructorParameters,methods:[{name:'run',procedure:'HolderRun %s %s',parameters:[{name:'amount',type:'number',optional:false}],returnType:'number'}]};
    heap.register(spec);const allocation=heap.allocate('Holder');
    const service=createFrames(runtime,heap,{currentGraph});
    const spawn=(code,receiver=allocation.ref)=>{
        const definition={code};definitions.set(code,definition);
        const names=code===spec.constructor?['receiver',...spec.parameters.map(parameter=>parameter.name)]:['receiver','amount'];parameters.set(code,names);
        const params=Object.fromEntries(names.map(name=>[name,name==='receiver'?receiver:3]));
        const thread={target,topBlock:definition,status:0,constructor:{STATUS_DONE:4},stackFrames:[{params,waitingReporter:code}]};
        runtime.threads.push(thread);runtime.sequencer.activeThread=thread;
        return {thread,params,util:{thread,target},expected:{className:'Holder',methodName:code===spec.constructor?null:'run',procedure:code,receiverName:'receiver'}};
    };
    return {runtime,heap,target,definitions,parameters,allocation,service,spawn,spec};
};

test('receiver capture retains the exact canonical heap alias and actual invocation frame',()=>{
    const f=fixture(),call=f.spawn(f.spec.methods[0].procedure);
    f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
    const cell=f.service.receiverCell(call.util,call.expected);
    assert.equal(cell.values[cell.key],f.allocation.ref);
    f.heap.set(f.allocation.ref,'value',7);assert.equal(f.heap.get(cell.values[cell.key],'value'),7);
    assert.ok(Object.isFrozen(cell.values));
    assert.throws(()=>f.service.bind(call.thread,f.target,call.expected.procedure,call.params),/already bound/);
});

test('observer, different target and wrong receiver parameter cannot acquire a frame',()=>{
    const f=fixture(),call=f.spawn(f.spec.methods[0].procedure);
    f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
    f.runtime.sequencer.activeThread=null;
    assert.throws(()=>f.service.receiverCell(call.util,call.expected),/actual current class invocation/);
    f.runtime.sequencer.activeThread=call.thread;
    assert.throws(()=>f.service.receiverCell({...call.util,target:{blocks:f.target.blocks}},call.expected),/actual current class invocation/);
    assert.throws(()=>f.service.receiverCell(call.util,{...call.expected,receiverName:'__bwSelf'}),/actual current class invocation/);
});

test('current procedure edits and replacement parameter frame invalidate capture authority',()=>{
    for(const edit of ['procedure','params','receiver','parameterNames']) {
        const f=fixture(),call=f.spawn(f.spec.methods[0].procedure);f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
        if(edit==='procedure')f.definitions.set(call.expected.procedure,{code:call.expected.procedure});
        if(edit==='params')call.thread.stackFrames[0].params={...call.params};
        if(edit==='receiver')call.params.receiver=f.heap.allocate('Holder').ref;
        if(edit==='parameterNames')f.parameters.set(call.expected.procedure,['receiver','other']);
        assert.throws(()=>f.service.receiverCell(call.util,call.expected),/actual current class invocation/);
    }
});

test('forged and foreign heap references never acquire receiver ownership',()=>{
    const f=fixture();
    for(const receiver of [BW.reference(f.runtime,'object','forged'),BW.reference(new EventEmitter(),'object','foreign')]) {
        const call=f.spawn(f.spec.methods[0].procedure,receiver);
        assert.throws(()=>f.service.bind(call.thread,f.target,call.expected.procedure,call.params),/stale class object/);
    }
});

test('killed, retired, reset and loaded invocation bindings refuse',()=>{
    for(const action of ['killed','retired','PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED']) {
        const f=fixture(),call=f.spawn(f.spec.methods[0].procedure);f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
        if(action==='killed')call.thread.isKilled=true;
        else if(action==='retired')f.runtime.threads=[];
        else f.runtime.emit(action);
        assert.throws(()=>f.service.receiverCell(call.util,call.expected),/actual current class invocation/);
    }
});

test('constructor capture requires the actual still-active construction token',()=>{
    const f=fixture(),call=f.spawn(f.spec.constructor);
    assert.throws(()=>f.service.bind(call.thread,f.target,call.expected.procedure,call.params,{}),/no unique/);
    f.service.bind(call.thread,f.target,call.expected.procedure,call.params,f.allocation.token);
    assert.equal(f.service.receiverCell(call.util,call.expected).values.value,f.allocation.ref);
    f.heap.finish(f.allocation.ref,f.allocation.token);
    assert.throws(()=>f.service.receiverCell(call.util,call.expected),/outlived construction/);
});

test('actual inherited method descriptor resolves its declaring owner',()=>{
    const f=fixture();f.heap.register({name:'Child',parent:'Holder',fields:[],initializer:'',constructor:'',parameters:[],methods:[]});
    const call=f.spawn(f.spec.methods[0].procedure,f.heap.allocate('Child').ref);
    f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
    assert.equal(f.service.receiverCell(call.util,call.expected).values.value,call.params.receiver);
    assert.throws(()=>f.service.receiverCell(call.util,{...call.expected,className:'Child'}),/actual current class invocation/);
});

test('in-place parameter and return-signature edits invalidate actual heap frame bindings',()=>{
    for(const property of ['type','name','default']) {
        const f=fixture(),call=f.spawn(f.spec.methods[0].procedure);f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
        const descriptor=f.heap.definition('Holder').methods.get('run');
        if(property==='type')descriptor.parameters[0].type='string';
        if(property==='name')descriptor.parameters[0].name='changed';
        if(property==='default')descriptor.parameters[0].default=9;
        assert.throws(()=>f.service.receiverCell(call.util,call.expected),/signature changed/);
    }
    const f=fixture(),call=f.spawn(f.spec.methods[0].procedure);f.service.bind(call.thread,f.target,call.expected.procedure,call.params);
    f.heap.definition('Holder').methods.set('run',{...f.heap.definition('Holder').methods.get('run'),returnType:'string'});
    assert.throws(()=>f.service.receiverCell(call.util,call.expected),/descriptor changed/);
    const ctor=fixture({constructorParameters:[{name:'initial',type:'number',optional:false}]}),construction=ctor.spawn(ctor.spec.constructor);
    ctor.service.bind(construction.thread,ctor.target,construction.expected.procedure,construction.params,ctor.allocation.token);
    ctor.heap.definition('Holder').parameters[0].type='string';
    assert.throws(()=>ctor.service.receiverCell(construction.util,construction.expected),/signature changed/);
});

test('a frame binding cannot capture without the separate canonical block-graph guard',()=>{
    for(const currentGraph of [undefined,()=>false]) {
        const f=fixture(),call=f.spawn(f.spec.methods[0].procedure),unwired=createFrames(f.runtime,f.heap,{currentGraph});
        unwired.bind(call.thread,f.target,call.expected.procedure,call.params);
        assert.throws(()=>unwired.receiverCell(call.util,call.expected),/current canonical class block graph/);
    }
});
