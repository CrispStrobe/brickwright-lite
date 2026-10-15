import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import CallableValues from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js';
import createHost from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-host.js';
import createHeap from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js';

test('failed untyped invocation cannot bypass settlement and does not clear shared resources or cells',()=>{
    const runtime=new EventEmitter(),target={blocks:{getProcedureDefinition:()=> 'body',getProcedureParamNamesIdsAndDefaults:()=>[[],[],[]]}};
    runtime.targets=[target];const service=new CallableValues(runtime,BW);
    try {
        service.declare(target,{procedure:'read',site:'site',parameters:[],captures:[{name:'n',mode:'cell'}]});
        const params={n:3},ref=service.create(target,'read',{locals:params});
        const failed=service.invocation(ref,[]),sibling=service.invocation(ref,[]),generation=service.generation;
        assert.equal(service.hasTypedInvocation(failed),false);
        service.failInvocation(failed);
        assert.equal(service.hasTypedInvocation(failed),true,'failed untyped work must not take the plain-success branch');
        assert.throws(()=>service.complete(failed,BW.UNDEFINED),/Failed callable invocation/);
        assert.equal(service.hasTypedInvocation(sibling),false);assert.equal(service.generation,generation);
        assert.equal(service.hold(ref),ref);params.n=12;
        assert.equal(sibling.captures.get('n').values.n,12);assert.equal(failed.captures.get('n').values.n,12);
        assert.throws(()=>service.failInvocation({...failed}),/actual issued invocation/);
    } finally {service.dispose();}
});

// This uses the real host/heap/frame services with explicit native procedure
// records. Installed dispatch and engine unwinding remain separate root gates.
function hostFixture() {
    const runtime=new EventEmitter();runtime.targets=[];runtime.threads=[];runtime.sequencer={activeThread:null};
    const nodes={ctor:{id:'ctor',opcode:'procedures_definition'},method:{id:'method',opcode:'procedures_definition'}};
    const procedures=new Map([['Holder_ctor %s','ctor'],['Holder_read %s','method']]);
    const blocks={_blocks:nodes,getBlock:id=>nodes[id],getProcedureDefinition:code=>procedures.get(code),
        getProcedureParamNamesIdsAndDefaults:()=>[['self'],[],[]]};
    const target={blocks};runtime.targets.push(target);
    const host=createHost(runtime,BW,createHeap,{},()=>null);
    host.heap.register({name:'Holder',fields:[],parameters:[],initializer:'',constructor:'Holder_ctor %s',methods:[
        {name:'read',procedure:'Holder_read %s',parameters:[],returnType:'number',typeParameters:[],
            callableSignature:{kind:'callable',parameters:[],result:{kind:'named',name:'number'}}}]});
    runtime.emit('PROJECT_START');
    // PROJECT_START resets registrations; install this run's actual heap rows.
    host.heap.register({name:'Holder',fields:[],parameters:[],initializer:'',constructor:'Holder_ctor %s',methods:[
        {name:'read',procedure:'Holder_read %s',parameters:[],returnType:'number',typeParameters:[],
            callableSignature:{kind:'callable',parameters:[],result:{kind:'named',name:'number'}}}]});
    const allocation=host.heap.allocate('Holder');
    const spawn=procedure=>{
        const params={self:allocation.ref};
        const thread={target,topBlock:procedures.get(procedure),status:0,constructor:{STATUS_DONE:4},
            stackFrames:[{params,waitingReporter:procedure}]};runtime.threads.push(thread);runtime.sequencer.activeThread=thread;
        const ticket=host.bind(thread,target,procedure,params,allocation.token,[allocation.ref]);
        return {thread,params,ticket};
    };
    return {runtime,target,host,allocation,spawn};
}
test('host abort retires only failed completion tickets, including constructor frames without result tickets',()=>{
    const f=hostFixture();try {
        const failed=f.spawn('Holder_read %s'),sibling=f.spawn('Holder_read %s');
        assert.ok(failed.ticket);assert.ok(sibling.ticket);
        assert.equal(f.host.abortThread(failed.thread),true);assert.equal(f.host.abortThread(failed.thread),false);
        assert.throws(()=>f.host.result(failed.ticket,4),/outlived its actual invocation/);
        assert.equal(f.host.result(sibling.ticket,5),5);
        const ctor=f.spawn('Holder_ctor %s');assert.equal(ctor.ticket,null);
        assert.throws(()=>f.host.bind(ctor.thread,f.target,'Holder_ctor %s',ctor.params,f.allocation.token,[f.allocation.ref]),/already bound/);
        assert.equal(f.host.abortThread(ctor.thread),true);assert.equal(f.host.abortThread(ctor.thread),false);
        assert.equal(f.host.bind(ctor.thread,f.target,'Holder_ctor %s',ctor.params,f.allocation.token,[f.allocation.ref]),null,'constructor issuer was actually removed');
        f.host.abortThread(ctor.thread);
        assert.equal(ctor.thread.stackFrames[0].params,ctor.params);
        assert.equal(ctor.params.self,f.allocation.ref);
        assert.equal(f.host.heap.constructionActive(f.allocation.ref,f.allocation.token),true,'root owns exact heap allocation abort');
        const next=f.spawn('Holder_read %s');assert.equal(f.host.result(next.ticket,6),6);
    } finally {f.host.dispose();}
});
