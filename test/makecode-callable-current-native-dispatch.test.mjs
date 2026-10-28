import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';

const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;

async function fixture({wait=false}={}) {
    const run=await runProgram(`DEVICE ARCADE
GLOBAL observed
SPRITE Game:
WHEN flag clicked:
  set observed to 0
DEFINE callback (argument):
${wait?'  wait 0.2 seconds\n':''}\
  set observed to (argument + arcade captured cell)
  arcade return value (observed)
`,{frames:10});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const runtime=run.vm.runtime;
    const ext=runtime._arcadeFramePhase.ext;
    const target=runtime.targets.find(target=>target.getName()==='Game');
    const prototype=Object.values(target.blocks._blocks).find(block=>block.opcode==='procedures_prototype');
    const name=prototype.mutation.proccode;
    const parameters=target.blocks.getProcedureParamNamesIdsAndDefaults(name)[0];
    ext._callableValues.declare(target,{procedure:name,site:'fixture',parameters,captures:['cell']});
    const locals={cell:2},reference=ext._callableValues.create(target,name,{locals});
    const hat='callableService',text='callableServiceName',body='callableServiceBody';
    target.blocks.createBlock({id:hat,opcode:'arcade_whenCallableDispatched',next:body,parent:null,
        inputs:{NAME:{name:'NAME',block:text,shadow:text}},fields:{},shadow:false,topLevel:true,x:0,y:0});
    target.blocks.createBlock({id:text,opcode:'text',next:null,parent:hat,inputs:{},
        fields:{TEXT:{name:'TEXT',value:name}},shadow:true,topLevel:false});
    target.blocks.createBlock({id:body,opcode:'arcade_runCallableDispatch',next:null,parent:hat,
        inputs:{},fields:{},shadow:false,topLevel:false});
    return {run,runtime,ext,target,name,locals,reference};
}

test('a host dispatch after startup ends invokes the real managed procedure with live captures',async()=>{
    const {run,runtime,ext,locals,reference}=await fixture();
    try {
        assert.equal(runtime.threads.length,0,'no registration caller remains alive');
        const first=ext.invokeHeldCallable(reference,[3],{TOKEN:'first'});
        const second=ext.invokeHeldCallable(reference,[4],{TOKEN:'second'});
        locals.cell=7;
        const serviceThreads=runtime.threads.filter(thread=>thread.bwCallableDispatch);
        assert.equal(serviceThreads.length,2);
        assert.deepEqual(serviceThreads.map(thread=>thread.bwArcadeEvent.TOKEN),['first','second']);
        assert.ok(serviceThreads.every(thread=>runtime._arcadeFramePhase._sourceOwned(thread)),
            'the emitted service hats have actual source phase authority');
        await stepFrames(run.vm,12);
        assert.equal(ext._callableDispatch.pending.size,0,JSON.stringify({
            requests:[...ext._callableDispatch.pending].map(request=>({state:request.state,status:request.thread.status,stack:request.thread.stack})),
            threads:runtime.threads.map(thread=>({status:thread.status,stack:thread.stack})),
            errors:run.errors,calls:[...run.calls].filter(([name])=>/Callable|Captured|callFunction/.test(name))
        }));
        assert.deepEqual((await Promise.all([first,second])).map(BW.decode),[10,11]);
        assert.deepEqual(run.errors,[]);
        assert.equal(ext._callableDispatch.pending.size,0);
        assert.equal(ext._functionCalls.size,0);
    } finally {run.vm.quit();clearStrayTimers();}
});

test('queued service requests cancel on Stop and stale callable references cannot restart them',async()=>{
    const {run,runtime,ext,reference}=await fixture();
    try {
        const result=ext.invokeHeldCallable(reference,[3]);
        run.vm.stopAll();
        assert.equal(await result,undefined);
        assert.equal(ext._callableDispatch.pending.size,0);
        assert.equal(runtime.threads.filter(thread=>thread.bwCallableDispatch).length,0);
        assert.throws(()=>ext.invokeHeldCallable(reference,[4]),/Stale or foreign callable/);
        await stepFrames(run.vm,5);assert.deepEqual(run.errors,[]);
    } finally {run.vm.quit();clearStrayTimers();}
});

test('Stop cancels an actual yielding managed invocation and prevents a later result',async()=>{
    const {run,runtime,ext,reference}=await fixture({wait:true});
    try {
        const result=ext.invokeHeldCallable(reference,[3]);
        await stepFrames(run.vm,2);
        assert.equal(ext._callableDispatch.pending.size,1);
        assert.equal([...ext._callableDispatch.pending][0].state,'running');
        assert.equal(ext._functionCalls.size,1,'the actual managed child is suspended');
        const observed=runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='observed');
        const before=observed.value;assert.equal(before,'0','ordinary Scratch fixture retains its authored saved value');
        run.vm.stopAll();
        assert.equal(await result,undefined);
        assert.equal(ext._callableDispatch.pending.size,0);
        assert.equal(ext._functionCalls.size,0);
        assert.equal(runtime.threads.length,0);
        await stepFrames(run.vm,8);
        assert.equal(observed.value,before,'cancelled body did not publish its result');
        assert.deepEqual(run.errors,[]);
    } finally {run.vm.quit();clearStrayTimers();}
});

test('missing, duplicate or changed service bodies refuse before starting a thread',async()=>{
    const {run,runtime,ext,target,reference}=await fixture();
    try {
        const before=runtime.threads.length;
        target.blocks.getBlock('callableServiceBody').opcode='control_wait';
        assert.throws(()=>ext.invokeHeldCallable(reference,[]),/one exact native service hat/);
        assert.equal(runtime.threads.length,before);
        target.blocks.getBlock('callableServiceBody').opcode='arcade_runCallableDispatch';
        target.blocks.createBlock({id:'duplicateService',opcode:'arcade_whenCallableDispatched',next:null,parent:null,
            inputs:target.blocks.getBlock('callableService').inputs,fields:{},shadow:false,topLevel:true,x:0,y:0});
        assert.throws(()=>ext.invokeHeldCallable(reference,[]),/one exact native service hat/);
        assert.equal(runtime.threads.length,before);
        assert.equal(ext._callableDispatch.pending.size,0);
    } finally {run.vm.quit();clearStrayTimers();}
});
