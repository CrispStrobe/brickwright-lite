import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),create=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/managed-return-values'),loan=require('../overlay/scratch-vm/src/util/bw-primitive-owner');
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
    const args={VALUE:value},util={runtime,thread,target},method=()=>service.value(args,util);
    const operation={id:'return',opcode:'arcade_returnValue',_argValues:args,_blockFunction:method,fields:blocks.return.fields,inputs:blocks.return.inputs};
    runtime.getOpcodeFunction=op=>op==='arcade_returnValue'?method:null;container._cache._executeCached.return={_ops:[operation]};
    container._cache._executeCached.value={id:'value',opcode,fields:blocks.value.fields,inputs:blocks.value.inputs,_isShadowBlock:true,_shadowValue:value,_parentValues:args,_parentKey:'VALUE'};
    const invoke=(values=args)=>loan.invoke(runtime,thread,container,operation,args,util,()=>service.value(values,util));
    return {blocks,container,target,frame,caller,thread,runtime,service,args,util,operation,invoke};
}
test('only the physical current Number return shadow becomes Number',()=>{
    const f=fixture('math_number','20.0');assert.equal(f.invoke(),20);assert.equal(typeof f.invoke(),'number');
    const text=fixture('text','20.0');assert.equal(text.invoke(),'20.0');
    const argument=fixture('argument_reporter_string_number','20');assert.equal(argument.invoke(),'20');
    const variable=fixture('data_variable','020');assert.equal(variable.invoke(),'020');
});
test('return ownership rejects copied args, changed body/signature/input and foreign frames',()=>{
    const copied=fixture();assert.equal(copied.invoke({...copied.args}),'20');
    const edited=fixture();edited.blocks.value.fields.NUM.value='21';assert.equal(edited.invoke(),'20');
    const signature=fixture();signature.blocks.prototype.mutation.argumentnames='["changed"]';assert.equal(signature.invoke(),'20');
    const identity=fixture();identity.blocks.value={...identity.blocks.value};assert.equal(identity.invoke(),'20');
    const frame=fixture();frame.thread.stackFrames[0]={...frame.frame};assert.equal(frame.invoke(),'20');
    const foreign=fixture();foreign.runtime.targets=[];assert.equal(foreign.service.value(foreign.args,foreign.util),'20');assert.throws(()=>foreign.invoke(),/actual cached caller/);
    for(const property of ['_parentValues','_parentKey','_shadowValue','_isShadowBlock','fields','inputs']){const stale=fixture();stale.container._cache._executeCached.value[property]=null;assert.equal(stale.invoke(),'20',property);}
    const disconnected=fixture();disconnected.blocks.value.parent='other';assert.equal(disconnected.invoke(),'20');
    const stoppedCaller=fixture();stoppedCaller.caller.isKilled=true;assert.equal(stoppedCaller.invoke(),'20');
});
test('Stop and disposal invalidate the old invocation; a new binding after start works',()=>{
    const f=fixture();f.service.invalidate();assert.equal(f.invoke(),'20');f.service.start();assert.equal(f.invoke(),'20');
    f.runtime.sequencer.activeThread=f.caller;f.service.bind(f.thread,f.target,'read','definition',f.caller);f.runtime.sequencer.activeThread=f.thread;assert.equal(f.invoke(),20);
    f.service.dispose();f.service.start();assert.equal(f.invoke(),'20');
    const inert=create();inert.start();assert.equal(inert.value({VALUE:'20'},{}),'20');inert.dispose();
});

test('edited class managed return preserves Number through Code, saved projects and current export',async()=>{
    const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const imported=arcadeToPseudocode('class Box {read():number{return 20}}let box=new Box();let result=box.read();result+=0;');
    assert.deepEqual(imported.unsupported,[]);
    // A real Code edit removes the source Number wrapper. The return primitive
    // must retain the physical Number shadow's meaning without a declared-type cast.
    assert.ok(imported.code.includes('arcade return value ((0 + (20)))'));
    const code=imported.code.replace('arcade return value ((0 + (20)))','arcade return value (20)')
        .replace('  set result to (calculate value (result) op "+" with ((0 + (0))))\n','');
    const runs=[],check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const result=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='result');
        assert.equal(result?.value,20);assert.equal(typeof result.value,'number');
    };
    try {
        const run=await runProgram(code,{frames:4,storage:true});runs.push(run);check(run);
        const replay=await runProgram(run.creator.decompile(),{frames:4,storage:true});runs.push(replay);check(replay);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,4);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
        fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,4);check(fresh);
        const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);
        const reimport=await runProgram(restored.code,{frames:4,storage:true,uploads:restored.costumes});runs.push(reimport);check(reimport);
    } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});


test('ordinary managed Number and text returns retain distinct types and once-only effects',async()=>{
    const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const source='let calls=0;function numberValue():number{calls+=1;return 20}function textValue():string{calls+=1;return "20"}let numeric=numberValue();let text=textValue();';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    assert.ok(imported.code.includes('arcade return value ((0 + (20)))'));
    const code=imported.code.replace('arcade return value ((0 + (20)))','arcade return value (20)');
    const runs=[],check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));
        assert.equal(values.numeric,20);assert.equal(typeof values.numeric,'number');
        assert.equal(values.text,'20');assert.equal(typeof values.text,'string');assert.equal(values.calls,2);
    };
    try {
        const run=await runProgram(code,{frames:6,storage:true});runs.push(run);check(run);
        const replay=await runProgram(run.creator.decompile(),{frames:6,storage:true});runs.push(replay);check(replay);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,6);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
        fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,6);check(fresh);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);
        const reimport=await runProgram(restored.code,{frames:6,storage:true,uploads:restored.costumes});runs.push(reimport);check(reimport);
    } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
