import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, quitStrandedVMs, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';

const arraySource = 'let a:number[]; let arrayLength:number; let arrayChar:string; a=[12,3]; arrayLength=(""+a).length; arrayChar=(""+a).charAt(2);';
const selected = (actual, expected) => Object.fromEntries(Object.keys(expected).map(key => [key, actual[key]]));
const vmValues = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), BW.decode(variable.value)]));
function checkVM(run, expected) {
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(selected(vmValues(run), expected), expected);
}
function translate(source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    return imported.code;
}

// Native Array addition stringifies its elements. Original PXT's source
// addition stringifies the collection object instead; they are different input
// blocks, so original source is not the oracle for the native operation.
test('native Array text receivers preserve VM semantics through PXT export and fresh SB3', {timeout: 120000}, async () => {
    const imported = translate(arraySource);
    const code = imported.replaceAll('arcade source value ("") op "+" with (a)',
        'calculate value ("") op "+" with (a)');
    assert.notEqual(code, imported);
    const expected = {arrayLength: 4, arrayChar: ','};
    let run;
    try {
        run = await runProgram(code, {frames: 20, storage: true, countExtensionCalls: false});
        checkVM(run, expected);
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported, []);
        assert.match(exported.ts, /array\.join\(","\)/);
        assert.match(exported.ts, /arrayLength = \(<string>__bwBinaryAdd\("", a\)\)\.length/);
        const saved = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.quit();
        run = null;
        const original = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: expected});
        assert.deepEqual(selected(original, expected), expected);
        run = await runProgram(translate(exported.files), {frames: 20, countExtensionCalls: false});
        checkVM(run, expected);
        run.vm.quit();
        run = await runProgram('DEVICE ARCADE\nSPRITE Placeholder:\nWHEN flag clicked:\n  hide',
            {frames: 0, storage: true, countExtensionCalls: false});
        run.vm.stopAll();
        await run.vm.loadProject(saved);
        run.vm.greenFlag();
        await stepFrames(run.vm, 20);
        checkVM(run, expected);
    } finally {
        run?.vm.quit();
        quitStrandedVMs();
        clearStrayTimers();
    }
});

test('effectful scalar text receivers run once per use after PXT export and VM reimport', {timeout: 120000}, async () => {
    const source = 'let reads:number; let n:number; let c:string; reads=0; function next():number { reads += 1; return 123; } n=(""+next()).length; c=(""+next()).charAt(1);';
    const expected = {reads: 2, n: 3, c: '2'};
    let run;
    try {
        run = await runProgram(translate(source), {frames: 20, countExtensionCalls: false});
        checkVM(run, expected);
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported, []);
        run.vm.quit();
        run = null;
        const original = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: expected});
        assert.deepEqual(selected(original, expected), expected);
        run = await runProgram(translate(exported.files), {frames: 20, countExtensionCalls: false});
        checkVM(run, expected);
    } finally {
        run?.vm.quit();
        quitStrandedVMs();
        clearStrayTimers();
    }
});

test('unchanged source Array addition retains original PXT object conversion through export', {timeout: 120000}, async () => {
    const expected = {arrayLength: 15, arrayChar: 'b'};
    let run;
    try {
        const original = await runPxtArcade(arraySource, {fakeClock: true, waitForGlobals: expected});
        assert.deepEqual(selected(original, expected), expected);
        run = await runProgram(translate(arraySource), {frames: 20, countExtensionCalls: false});
        checkVM(run, expected);
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported, []);
        assert.match(exported.ts, /arrayLength = \(<string>__bwSourceBinaryAdd\("", a\)\)\.length/);
        assert.doesNotMatch(exported.ts, /array\.join\(","\)/);
        run.vm.quit();
        run = null;
        const back = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: expected});
        assert.deepEqual(selected(back, expected), expected);
        run = await runProgram(translate(exported.files), {frames: 20, countExtensionCalls: false});
        checkVM(run, expected);
    } finally {
        run?.vm.quit();
        quitStrandedVMs();
        clearStrayTimers();
    }
});
