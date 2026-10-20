import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

for(const [name,call,record] of [
    ['omitted','carnival.customGameOverExpanded("Hello")',['high-score',7]],
    ['zero','carnival.customGameOverExpanded("Zero",undefined,undefined,carnival.ScoreTypes.HScore,0)',null],
    ['low','carnival.customGameOverExpanded("Lower",effects.hearts,music.baDing,carnival.ScoreTypes.LScore,3)',['low-score',3]],
    ['high','carnival.customGameOverExpanded("Higher",effects.none,music.powerUp,carnival.ScoreTypes.HScore,12)',['high-score',12]],
    ['none','carnival.customGameOverExpanded("No record",undefined,undefined,carnival.ScoreTypes.None,12)',null],
    ['time-zero','pause(2200)\ncarnival.customGameOverExpanded("Time",undefined,undefined,carnival.ScoreTypes.LTime,0)',['low-score',2]]
])test('custom carnival '+name+' runs and preserves optional arguments through export/reimport',async()=>{
    const source='info.setScore(7)\n'+call;
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:0,storage:true,frameAuthority:'timed'});let again;
    const finish=async run=>{
        const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;
        run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();
        await stepFrames(run.vm,1,0);await clock.advanceTo(4000);
    };
    try {
        await finish(run);
        assert.deepEqual(run.errors,[]);
        const state=run.vm.runtime.bwArcadeDeviceState;
        assert.ok(state.backgroundImage);assert.ok(state.sceneFrame.pixels.some(c=>c!==0 && c!==15));
        const values=run.vm.runtime.getTargetForStage().bwArcadeSettings.values;
        if(record)assert.equal(values[record[0]],record[1]);else assert.equal(Object.keys(values).length,0);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/carnival\.customGameOverExpanded/);
        if(name==='zero')assert.match(exported.ts,/carnival\.ScoreTypes\.HScore, 0\)/);
        if(name==='omitted')assert.match(exported.ts,/undefined, undefined, undefined, undefined\)/);
        assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-carnival'],'github:microsoft/arcade-carnival#v0.0.7');
        const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[]);
        again=await runProgram(reimported.code,{frames:0,storage:true,frameAuthority:'timed'});
        await finish(again);
        assert.deepEqual(again.errors,[]);
        assert.deepEqual(again.vm.runtime.getTargetForStage().bwArcadeSettings.values,values);
    }finally{run.vm.stopAll();run.vm.quit?.();again?.vm.stopAll();again?.vm.quit?.();}
});

test('custom carnival unsupported scoring, effects, shadowing and arity stay diagnosed',()=>{
    for(const source of ['carnival.customGameOverExpanded()',
        'carnival.customGameOverExpanded("x",effects.unknown)',
        'carnival.customGameOverExpanded("x",undefined,undefined,3)',
        'let carnival=0; carnival.customGameOverExpanded("x")'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('editable presence flags export as normal conditionals and reimport with optional arguments intact',async()=>{
    const imported=arcadeToPseudocode('let useScore=false\nlet useSound=true\ninfo.setScore(7)\ncarnival.customGameOverExpanded("Flags",effects.hearts,music.baDing,carnival.ScoreTypes.HScore,12)');
    assert.deepEqual(imported.unsupported,[]);
    const code=imported.code.replace('use sound 1','use sound (useSound)').replace('use score 1','use score (useScore)');
    assert.notEqual(code,imported.code);
    const run=await runProgram(code,{frames:90,storage:true});let again;
    try {
        assert.deepEqual(run.errors,[]);
        assert.equal(run.vm.runtime.getTargetForStage().bwArcadeSettings.values['high-score'],7);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/if \(/);assert.doesNotMatch(exported.ts,/\? .* : undefined/);
        const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[]);
        again=await runProgram(reimported.code,{frames:90,storage:true});
        assert.deepEqual(again.errors,[]);
        assert.equal(again.vm.runtime.getTargetForStage().bwArcadeSettings.values['high-score'],7);
    }finally{run.vm.quit?.();again?.vm.quit?.();}
});

test('an invalid supplied melody reports an error instead of silently playing the default',async()=>{
    const imported=arcadeToPseudocode('carnival.customGameOverExpanded("Bad sound",undefined,7)');
    const run=await runProgram(imported.code,{frames:90,storage:true});
    try {
        assert.ok(run.errors.some(error=>/melody/i.test(error)));
        assert.ok(!run.vm.runtime.bwArcadeDeviceState.backgroundImage);
    }finally{run.vm.quit?.();}
});
