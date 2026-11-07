import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// A literal in-bounds index into a never-mutated literal (or exporter
// push-built) Array holds exactly that element: original PXT, the Lite VM and
// the export agree, and a Number formal accepts it.
const OBSERVE = 'function observe(value:number){return value}\n';
const files = source => ({'main.ts': source, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})});

test('positional Number elements agree with original PXT through the VM and export', async () => {
    const source = 'let numbers=[Math.PI,NumberFormat.UInt16LE,2]\n' + OBSERVE + 'let first=0\nlet format=0\nfirst=observe(numbers[0])\nformat=observe(numbers[1])\n';
    const original = await runPxtArcade(files(source), {fakeClock: true, waitForGlobals: {format: 4}});
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 10, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
        for (const key of ['first', 'format']) assert.equal(vars[key], original[key], key);
        const exported = projectToArcade(run.creator.project);
        assert.deepEqual(exported.unsupported, []);
        const back = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: {format: 4}});
        for (const key of ['first', 'format']) assert.equal(back[key] ?? back['Game_' + key], original[key], 'export ' + key);
        const again = arcadeToPseudocode(exported.ts);
        assert.deepEqual(again.unsupported, []);
        const rerun = await runProgram(again.code, {frames: 10, storage: true});
        try { assert.deepEqual(rerun.errors, []); } finally { rerun.vm.quit(); }
    } finally { run.vm.quit(); clearStrayTimers(); }
});

test('mutated, out-of-range, non-Number, shadowed or rewritten Arrays keep the refusal', () => {
    for (const source of [
        'let a=[1,2]\na.pop()\n' + OBSERVE + 'let x=observe(a[1])\n',
        'let a=[1,2]\n' + OBSERVE + 'let x=observe(a[2])\n',
        'let a=[1,"t"]\n' + OBSERVE + 'let x=observe(a[1])\n',
        'let a=[1,2]\na[0]=5\n' + OBSERVE + 'let x=observe(a[0])\n',
        'let a=[1,2]\nlet b=a\nb.push(3)\n' + OBSERVE + 'let x=observe(a[0])\n',
        'let a=[1,2]\na=[]\n' + OBSERVE + 'let x=observe(a[0])\n'])
        assert.ok(arcadeToPseudocode(source).unsupported.some(row => /Procedure parameter constraint/.test(row)), source);
});

test('the native positional proof refuses an Array mutated after the read', async () => {
    const run = await runProgram(arcadeToPseudocode('let a=[1,2]\nlet x=0\n' + OBSERVE + 'x=observe(a[0])\na[0]=5\n').code, {frames: 10, storage: true});
    try { assert.ok(run.errors.some(error => /primitive domain evidence/.test(String(error)))); }
    finally { run.vm.quit(); clearStrayTimers(); }
});
