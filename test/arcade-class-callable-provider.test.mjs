import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createProvider from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-provider.js';
import createFrames from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-frames.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';
import createTypes from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-types.js';
import CallableValues from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const named=name=>({kind:'named',name});
const signature=result=>({kind:'callable',parameters:[],result});
const plan=()=>({schema:'bw-class-callable-lexical',version:2,module:'module',classes:[{name:'Holder',parent:null}],owners:[
    {id:'module',kind:'module',parent:null},
    {id:'method',kind:'method',parent:'module',sourceName:'make',procedure:'HolderMake %s',signature:signature(signature(named('number'))),parameters:[],defaults:[],className:'Holder',memberName:'make',receiver:'self',receiverParameter:'actualSelf',typeParameters:[]},
    {id:'arrow',kind:'arrow',parent:'method',sourceName:null,procedure:'ReadHolder',signature:signature(named('number')),parameters:[],defaults:[]}
],bindings:[{id:'self',owner:'method',sourceName:'this',nativeName:'capturedSelf',kind:'receiver',type:named('Holder'),written:false}],sites:[{id:'site',owner:'arrow',createdIn:'method',captures:[{binding:'self',mode:'value'}],defaults:[]}]});
// Actual heap/callable services with a modeled dispatcher. The true installed
// graph seal and managed VM dispatch remain necessary before source admission.
const fixture=()=>{
    const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];runtime.sequencer={activeThread:null};
    let provider,service;
    const heap=createHeap(runtime,BW,{callableSignature:type=>provider.fieldSignature(type),callableField:(type,value)=>provider.fieldValue(type,value),callableMethod:method=>provider.methodSignature(method)});
    const definitions=new Map([['HolderMake %s',{id:'method'}],['ReadHolder',{id:'arrow'}]]),parameters=new Map([['HolderMake %s',['actualSelf']],['ReadHolder',[]]]);
    const target={blocks:{getProcedureDefinition:code=>definitions.get(code),getProcedureParamNamesIdsAndDefaults:code=>[parameters.get(code),[],[]]}};runtime.targets.push(target);
    let current=true;
    const frames=createFrames(runtime,heap,{currentGraph:()=>current});provider=createProvider(runtime,BW,heap,frames,{currentGraph:()=>current,currentCall:()=>true,signatureOf:ref=>service.signature(ref)});
    heap.register({name:'Holder',fields:[{name:'value',type:'number',readonly:false}],initializer:'',constructor:'',parameters:[],methods:[{name:'make',procedure:'HolderMake %s',parameters:[],returnType:'callable',typeParameters:[],callableSignature:signature(signature(named('number')))}]});
    service=new CallableValues(runtime,BW,provider);const ref=heap.allocate('Holder').ref,params={actualSelf:ref};
    const thread={target,topBlock:definitions.get('HolderMake %s'),status:0,constructor:{STATUS_DONE:4},stackFrames:[{params,waitingReporter:'HolderMake %s'}]};
    runtime.threads.push(thread);runtime.sequencer.activeThread=thread;frames.bind(thread,target,'HolderMake %s',params);
    const metadata={schema:'bw-callable-declaration',version:2,site:'site',procedure:'ReadHolder',plan:plan()};
    service.declare(target,metadata);
    const context={util:{thread,target},locals:{capturedSelf:heap.allocate('Holder').ref},ownerProcedure:'HolderMake %s'};
    return {runtime,heap,frames,service,target,ref,context,metadata,parameters,definitions,invalidate:()=>{current=false;}};
};

test('v2 receiver capture uses actual frame identity rather than a same-name local',()=>{
    const f=fixture(),ref=f.service.create(f.target,'ReadHolder',f.context),invocation=f.service.invocation(ref,[]);
    assert.equal(invocation.captures.get('capturedSelf').values.value,f.ref);
    assert.notEqual(invocation.captures.get('capturedSelf').values.value,f.context.locals.capturedSelf);
    f.heap.set(f.ref,'value',9);assert.equal(f.heap.get(invocation.captures.get('capturedSelf').values.value,'value'),9);
    assert.equal(f.service.complete(invocation,9),9);assert.throws(()=>f.service.complete(invocation,'9'),/argument type differs/);
    assert.throws(()=>f.service.complete({...invocation},9),/actual owned invocation/);
});

test('resource signature copies cannot mutate private invocation type authority',()=>{
    const f=fixture(),ref=f.service.create(f.target,'ReadHolder',f.context),copy=f.service.signature(ref);
    copy.result.name='string';assert.equal(f.service.signature(ref).result.name,'number');
    f.metadata.plan.owners[2].signature.result.name='boolean';assert.equal(f.service.signature(ref).result.name,'number');
    assert.throws(()=>f.service.invocation(ref,[1]),/argument arity differs/);
});

test('observer, forged frame and stale canonical graph cannot create receiver resources',()=>{
    for(const action of ['observer','missingThread','graph']) {
        const f=fixture();if(action==='observer')f.runtime.sequencer.activeThread=null;
        if(action==='missingThread')f.context.util={target:f.target};if(action==='graph')f.invalidate();
        assert.throws(()=>f.service.create(f.target,'ReadHolder',f.context),/actual current class invocation|canonical class block graph/);
    }
});

test('graph edits and Stop/reload/dispose invalidate signatures and pending completions',()=>{
    for(const action of ['graph','PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED']) {
        const f=fixture(),ref=f.service.create(f.target,'ReadHolder',f.context),invocation=f.service.invocation(ref,[]);
        if(action==='graph')f.invalidate();else f.runtime.emit(action);
        assert.throws(()=>f.service.signature(ref),/canonical class block graph|Stale or foreign callable reference/);
        assert.throws(()=>f.service.complete(invocation,9),/canonical class block graph|Stale or foreign callable reference/);
    }
});

test('unwired v2 and unqualified v1 signatures refuse without changing ordinary v1 resources',()=>{
    const f=fixture(),ordinary=new CallableValues(f.runtime,BW);
    assert.throws(()=>ordinary.declare(f.target,f.metadata),/owned provider/);
    ordinary.declare(f.target,{procedure:'ReadHolder',site:'plain',parameters:[],captures:[]});
    const ref=ordinary.create(f.target,'ReadHolder');assert.equal(ordinary.invocation(ref,[]).args.length,0);
    assert.throws(()=>ordinary.signature(ref),/no qualified class signature/);
    assert.throws(()=>ordinary.complete(ordinary.invocation(ref,[]),9),/actual owned invocation/);
});

test('typed stored fields retain the actual resource alias and refuse writes atomically',()=>{
    const f=fixture(),fieldSignature=signature(named('number'));
    f.heap.register({name:'Slot',fields:[{name:'callback',type:'callable',valueKind:'callable',readonly:false,callableSignature:fieldSignature}],initializer:'',constructor:'',parameters:[],methods:[]});
    const slot=f.heap.allocate('Slot').ref;
    assert.equal(f.heap.get(slot,'callback'),BW.UNDEFINED);
    const ref=f.service.create(f.target,'ReadHolder',f.context);f.heap.set(slot,'callback',ref);
    assert.equal(f.heap.get(slot,'callback'),ref);assert.equal(f.service.invocation(f.heap.get(slot,'callback'),[]).reference,ref);
    for(const value of [1,'callback',f.ref,BW.reference(f.runtime,'callable','forged')]) {
        assert.throws(()=>f.heap.set(slot,'callback',value),/argument structure differs|Stale or foreign callable reference|no qualified class signature/);
        assert.equal(f.heap.get(slot,'callback'),ref);
    }
    fieldSignature.result.name='string';assert.equal(f.heap.property(slot,'callback').callableSignature.result.name,'number');
    assert.ok(Object.isFrozen(f.heap.property(slot,'callback').callableSignature.result));
    f.heap.set(slot,'callback',BW.UNDEFINED);assert.equal(f.heap.get(slot,'callback'),BW.UNDEFINED);
    assert.throws(()=>f.service.invocation(f.heap.get(slot,'callback'),[]),/Stale or foreign callable reference/);
});

test('unwired callable field descriptors and disguised scalar signatures refuse',()=>{
    const runtime=new EventEmitter(),heap=createHeap(runtime,BW);
    for(const field of [
        {name:'callback',type:'callable',valueKind:'callable',readonly:false},
        {name:'callback',type:'callable',valueKind:'callable',readonly:false,callableSignature:signature(named('number'))},
        {name:'callback',type:'number',readonly:false,callableSignature:signature(named('number'))}
    ])assert.throws(()=>heap.register({name:'Slot',fields:[field],initializer:'',constructor:'',parameters:[],methods:[]}),/explicit owned signature service/);
});

test('an ordinary class named callable retains reference fields without acquiring a function domain',()=>{
    const runtime=new EventEmitter(),heap=createHeap(runtime,BW);
    heap.register({name:'callable',fields:[],initializer:'',constructor:'',parameters:[],methods:[]});
    heap.register({name:'Container',fields:[{name:'ordinary',type:'callable',readonly:false}],initializer:'',constructor:'',parameters:[],methods:[]});
    const instance=heap.allocate('callable').ref,container=heap.allocate('Container').ref;
    heap.set(container,'ordinary',instance);assert.equal(heap.get(container,'ordinary'),instance);
    assert.equal(heap.property(container,'ordinary').valueKind,undefined);
});

test('creator heap procedure and complete callable signature must agree with the v2 plan',()=>{
    for(const property of ['procedure','signature','generics']) {
        const f=fixture(),methods=f.heap.definition('Holder').methods,original=methods.get('make');
        const replacement={...original,callableSignature:structuredClone(original.callableSignature),typeParameters:structuredClone(original.typeParameters)};
        if(property==='procedure')replacement.procedure='foreign';
        if(property==='signature')replacement.callableSignature.result.result.name='string';
        if(property==='generics')replacement.typeParameters=[{name:'T',constraint:'',defaultType:''}];
        methods.set('make',replacement);
        assert.throws(()=>f.service.create(f.target,'ReadHolder',f.context),/source creator differs from its actual heap (procedure|signature)/);
    }
});

test('generic method descriptors retain one template while actual resources specialize each call',()=>{
    const f=fixture();f.heap.register({name:'State',fields:[],initializer:'',constructor:'',parameters:[],methods:[]});
    const action={kind:'callable',parameters:[{name:'state',type:named('State'),optional:false}],result:named('T')};
    const method={name:'applyChange',procedure:'ApplyChange %s %s',parameters:[{name:'action',type:'callable',optional:false,callableSignature:action}],returnType:'T',typeParameters:[{name:'T',constraint:'',defaultType:''}],callableSignature:{kind:'callable',parameters:[{name:'action',type:action,optional:false}],result:named('T')}};
    f.heap.register({name:'Actions',fields:[],initializer:'',constructor:'',parameters:[],methods:[method]});
    const createAction=(name,result)=>{
        const template=plan();template.classes.push({name:'State',parent:null});
        const sig={...structuredClone(action),result:named(result)};
        template.owners=[template.owners[0],{id:'arrow',kind:'arrow',parent:'module',sourceName:null,procedure:name,signature:sig,parameters:['parameter'],defaults:[]}];
        template.bindings=[{id:'parameter',owner:'arrow',sourceName:'state',nativeName:'state',kind:'parameter',type:named('State'),written:false}];
        const site='site_'+result;template.sites=[{id:site,owner:'arrow',createdIn:'module',captures:[],defaults:[]}];
        f.definitions.set(name,{id:name});f.parameters.set(name,['state']);
        f.service.declare(f.target,{schema:'bw-callable-declaration',version:2,site,procedure:name,plan:template});
        return f.service.create(f.target,name,{sourceModule:true});
    };
    const numeric=createAction('NumericAction %s','number'),text=createAction('TextAction %s','string');
    const actual=f.heap.method(f.heap.allocate('Actions').ref,'applyChange'),types=createTypes(f.runtime,BW,f.heap,ref=>f.service.signature(ref));
    assert.equal(types.instantiate(actual.callableSignature,actual.typeParameters,[numeric]).result.name,'number');
    assert.equal(types.instantiate(actual.callableSignature,actual.typeParameters,[text]).result.name,'string');
    assert.equal(actual.callableSignature.result.name,'T');
    method.parameters[0].callableSignature.result.name='any';assert.equal(actual.parameters[0].callableSignature.result.name,'T');
    assert.ok(Object.isFrozen(actual.parameters[0].callableSignature.result));
});

test('generic method parameter/result mismatch, defaults and unwired signatures refuse',()=>{
    const f=fixture(),signature_={kind:'callable',parameters:[{name:'value',type:named('T'),optional:false}],result:named('T')};
    const method=()=>({name:'identity',procedure:'Identity %s %s',parameters:[{name:'value',type:'T',optional:false}],returnType:'T',typeParameters:[{name:'T',constraint:'',defaultType:''}],callableSignature:structuredClone(signature_)});
    for(const mutate of [
        row=>{row.parameters[0].name='wrong';},row=>{row.parameters[0].type='number';},row=>{row.returnType='string';},
        row=>{row.typeParameters[0].constraint='Holder';},row=>{row.parameters[0].default=1;}
    ]){const row=method();mutate(row);assert.throws(()=>f.heap.register({name:'Bad',fields:[],initializer:'',constructor:'',parameters:[],methods:[row]}),/method parameter mapping differs|method parameter type differs|method return type differs|unqualified generic method parameter/);}
    const runtime=new EventEmitter(),heap=createHeap(runtime,BW);
    assert.throws(()=>heap.register({name:'Bad',fields:[],initializer:'',constructor:'',parameters:[],methods:[method()]}),/Invalid declared class method/);
});

test('failed typed invocation cannot complete while another invocation of the same resource remains valid',()=>{
    const f=fixture(),ref=f.service.create(f.target,'ReadHolder',f.context);
    const failed=f.service.invocation(ref,[]),survivor=f.service.invocation(ref,[]);
    f.service.failInvocation(failed);f.service.failInvocation(failed);
    assert.equal(f.service.hasTypedInvocation(failed),true);
    assert.throws(()=>f.service.complete(failed,7),/Failed callable invocation/);
    assert.equal(f.service.complete(survivor,8),8);
    assert.equal(f.service.hold(ref),ref);
    assert.equal(f.heap.inspect(failed.captures.get('capturedSelf').values.value).className,'Holder');
    assert.throws(()=>f.service.failInvocation({...failed}),/actual issued invocation/);
});
