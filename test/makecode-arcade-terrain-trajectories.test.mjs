import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {TRAJECTORIES} from './fixtures/arcade-terrain-trajectories.mjs';

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const entries = trace => String(trace).split(';').filter(Boolean).map(entry => entry.split(','));

// The original runs under a fake clock; its frame times still vary (its loop
// pauses max(1, 20 - callback time) ms and other fibers share the scheduler),
// so the native run replays each recorded frame's delta time. Every entry's
// position, velocity and live-sprite count must then be identical.
for (const [name, source] of Object.entries(TRAJECTORIES)) {
    test(`terrain physics follows the original frame by frame: ${name}`, async () => {
        const expected = entries((await runPxtArcade(source, {waitForGlobals: {traceDone: true}, fakeClock: true})).trace);
        const imported = arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code, {frames: 0, uploads: imported.costumes, storage: true});
        try {
            for (let guard = 0; Number(values(run).frame) < 1; guard++) {
                assert.ok(guard < 200, 'the native recording started');
                await stepFrames(run.vm, 1, 20);
            }
            for (let i = 1; i < expected.length; i++) await stepFrames(run.vm, 1, Number(expected[i][5]) * 1000);
            const actual = entries(values(run).trace);
            assert.deepEqual(run.errors, []);
            assert.equal(actual.length, expected.length);
            assert.deepEqual(actual.map(entry => entry.slice(0, 5)), expected.map(entry => entry.slice(0, 5)));
        } finally { clearStrayTimers(); }
    });
}

test('the trajectories exercise wall contact, not only free flight', async () => {
    // Each scenario's original trace contains a frame whose velocity was
    // zeroed or reversed by a wall, or a sprite removed by one.
    for (const [name, source] of Object.entries(TRAJECTORIES)) {
        const trace = entries((await runPxtArcade(source, {waitForGlobals: {traceDone: true}, fakeClock: true})).trace);
        const contact = trace.some((entry, i) => i > 1 && (
            (Number(trace[i - 1][2]) !== 0 && Number(entry[2]) !== Number(trace[i - 1][2]) && Number(entry[2]) !== 50) ||
            (Number(trace[i - 1][3]) !== 0 && Number(entry[3]) * Number(trace[i - 1][3]) <= 0) ||
            entry[4] !== trace[i - 1][4]));
        assert.ok(contact, `${name} has a wall contact`);
    }
});
