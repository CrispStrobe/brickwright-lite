import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// The constant computed index row: original PXT, the Lite VM and the export
// (run in PXT) agree on every observed value.
const SOURCE = `let rows=[[3,4]]
function shift(index:number){return index+1}
let column=0
column=column+1
let selected=rows[shift(0)-1][column]
rows[0][column]=selected+2
let result=rows[0][column]`;

test('a constant computed index agrees with original PXT through the VM and export', async () => {
    const expected = {selected: 4, result: 6};
    const files = {'main.ts': SOURCE, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})};
    const original = await runPxtArcade(files, {fakeClock: true, waitForGlobals: expected});
    for (const [key, value] of Object.entries(expected)) assert.equal(original[key], value, key);
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 10, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
        for (const [key, value] of Object.entries(expected)) assert.equal(vars[key], value, key);
        const exported = projectToArcade(run.creator.project);
        assert.deepEqual(exported.unsupported, []);
        const back = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: expected});
        for (const [key, value] of Object.entries(expected)) assert.equal(back[key] ?? back['Game_' + key], value, 'export ' + key);
    } finally { run.vm.quit(); clearStrayTimers(); }
});
