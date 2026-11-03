import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';

// Math.map on the unshadowed SDK namespace is the range-mapping function, not
// Array.prototype.map; the Array.map receiver proof must not claim it.
const SOURCE = `let smallest = Math.min(9, 3)
let largest = Math.max(9 - 2, 3)
let scaled = Math.map(5, 0, 10, 0, 100)
let exponent = Math.pow(2, 3)`;

test('Math.map values agree with original PXT and raise no Array.map receiver refusal', async () => {
    const expected = {smallest: 3, largest: 7, scaled: 50, exponent: 8};
    const original = await runPxtArcade({'main.ts': SOURCE, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})},
        {fakeClock: true, waitForGlobals: expected});
    for (const [key, value] of Object.entries(expected)) assert.equal(original[key], value, key);
    const imported = arcadeToPseudocode(SOURCE);
    assert.ok(!imported.unsupported.some(row => /^Array\.map/.test(row)), imported.unsupported.join('\n'));
    const run = await runProgram(imported.code, {frames: 4});
    try {
        assert.deepEqual(run.errors, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
        for (const [key, value] of Object.entries(expected)) assert.equal(Number(vars[key]), value, key);
    } finally { run.vm.quit(); clearStrayTimers(); }
});

test('only the unshadowed SDK Math.map is excluded from Array map sites', () => {
    const sites = source => analyseSourceValueProducers(parseMakeCodeTs(source, {retainParentheses: true}),
        {arrayValues: true, parenthesized: true, unboundIsOpaque: true}).arrayMapCalls.length;
    assert.equal(sites('let out = Math.map(5, 0, 10, 0, 100)'), 0);
    assert.equal(sites('let Math: number[] = [1, 2]; let out = Math.map((v: number) => v + 1)'), 1);
});
