import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createRequire} from 'node:module';
import {VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

// Until the canonical Throw word lands, replace one real registered command in
// the actual project. This tests native execution, not source Throw admission.
async function fixture(expression, {wait=false,parallel=false,nested=false,sourceText=null,throwOpcode='arcade_returnValue'}={}) {
    const source = arcadeToPseudocode(sourceText || `let entered=0;let after=0;let independent=0;
        ${parallel?'game.onUpdate(function(){independent+=1})':''}
        function fail(){entered=1;${wait?'pause(200);':''}return ${expression}}
        ${nested?'function outer(){return fail()}':''}
        let answer=${nested?'outer()':'fail()'};after=1;`);
    assert.deepEqual(source.unsupported,[]);
    const run = await runProgram(source.code,{frames:0});
    run.vm.stopAll();
    const commands = run.creator.project.targets.flatMap(target => Object.values(target.blocks).filter(block=>{
        if(block.opcode!==throwOpcode)return false;
        if(throwOpcode==='arcade_returnValue')return true;
        const value=block.inputs.VALUE?.[1],producer=typeof value==='string'?target.blocks[value]:null;
        return producer && Object.values(producer.inputs||{}).some(input=>Number(input?.[1]?.[1])===20);
    }));
    assert.equal(commands.length,nested?2:1,JSON.stringify(run.creator.project.targets.flatMap(target=>Object.values(target.blocks).filter(block=>block.opcode===throwOpcode).map(block=>({block,producer:target.blocks[block.inputs.VALUE?.[1]]})))));
    commands[0].opcode='arcade_throwValue';
    // Preserve the actual producer and its physical Number/Text domain.
    const bytes=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());
    await run.vm.loadProject(bytes);
    run.errors.length=0;
    run.signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>run.signals.push(error));
    let now=0;
    const runtime=run.vm.runtime;
    runtime.updateCurrentMSecs=()=>{runtime.currentMSecs=now;};runtime.currentMSecs=now;
    runtime.bwArcadeProgramClock={now:()=>now};
    run.advance=milliseconds=>{now+=milliseconds;};
    run.vm.greenFlag();
    return run;
}

test('native Throw retires the actual failed procedure without running its continuation',async()=>{
    const run=await fixture('"boom"');
    try {
        await stepFrames(run.vm,4);
        const variables=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
        assert.equal(variables.entered,1);
        assert.equal(variables.after,0);
        assert.equal(run.errors.filter(message=>message.includes('Arcade uncaught thrown value: boom')).length,1);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

const exceptions=createRequire(import.meta.url)(VM_SRC+'/util/bw-arcade-exceptions.js');
for (const [expression,expected] of [['20',20],['"20"','20'],['false',false],['0',0],['""',''],['null',null],['undefined',undefined]]) {
    test('native Throw preserves the actual primitive domain: '+expression,async()=>{
        const run=await fixture(expression);
        try {
            await stepFrames(run.vm,4);
            assert.equal(run.signals.length,1);
            assert.equal(exceptions.diagnostic(run.vm.runtime,run.signals[0]).value,expected);
            assert.equal(exceptions.diagnostic({},run.signals[0]),null);
            assert.equal(exceptions.diagnostic(run.vm.runtime,new Error('copied')),null);
        } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
    });
}
test('async Throw retires nested callers while an independent update fiber keeps running',async()=>{
    const run=await fixture('20',{wait:true,parallel:true,nested:true});
    try {
        await stepFrames(run.vm,2);
        run.advance(200);
        await stepFrames(run.vm,8);
        const variables=()=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
        assert.equal(variables().after,0);
        assert.equal(run.signals.length,1);
        const prior=variables().independent;
        await stepFrames(run.vm,3);
        assert.ok(variables().independent>prior);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('Stop and restart cannot let a previous async continuation report into the new run',async()=>{
    const run=await fixture('20',{wait:true});
    try {
        await stepFrames(run.vm,1);
        assert.equal(run.signals.length,0,'old call is still waiting');
        run.vm.stopAll();run.vm.greenFlag();
        await stepFrames(run.vm,1);
        run.advance(200);
        await stepFrames(run.vm,8);
        assert.equal(run.signals.length,1);
        assert.equal(exceptions.diagnostic(run.vm.runtime,run.signals[0]).value,20);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('loading a different project invalidates old async exception continuations',async()=>{
    const run=await fixture('20',{wait:true});
    try {
        await stepFrames(run.vm,1);
        assert.equal(run.signals.length,0,'old call is still waiting');
        for (const target of run.creator.project.targets) for (const block of Object.values(target.blocks)) {
            if (block.opcode==='arcade_throwValue') block.opcode='arcade_returnValue';
        }
        const bytes=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());
        await run.vm.loadProject(bytes);run.vm.greenFlag();
        await stepFrames(run.vm,1);
        run.advance(200);
        await stepFrames(run.vm,8);
        assert.equal(run.signals.length,0);
        const after=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name.replace(/^Game_/,'')==='after');
        assert.equal(after.value,1);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('an asynchronous constructor aborts its allocation and never completes a failed object',async()=>{
    const run=await fixture('20',{throwOpcode:'arcade_setObjectField',sourceText:
        'class Box{value=0;constructor(){pause(200);this.value=20}}let after=0;let made=new Box();after=1;'});
    try {
        await stepFrames(run.vm,1);
        assert.equal(run.signals.length,0);
        run.advance(200);await stepFrames(run.vm,8);
        assert.equal(run.signals.length,1);
        assert.equal(exceptions.diagnostic(run.vm.runtime,run.signals[0]).value,20);
        const variables=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));
        assert.equal(variables.after,0);
        // No completed result is assigned to made by the failed constructor.
        assert.ok(variables.made?.bwUndefined);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
