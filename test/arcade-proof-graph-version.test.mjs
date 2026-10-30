import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

// Procedure-parameter proofs are cached per graph version: reused while the graph is unchanged,
// re-proved (and able to refuse) after any edit made through the block container.
const source = `let total = 0
function bump(x: number, y: number) {
    total += x + y
}
game.onUpdate(function () {
    for (let i = 0; i < 20; i++) {
        bump(i, 1)
    }
})`;

test('a cached proof is reused while the graph is unchanged and does not outlive an edit', async () => {
    try {
        const imported = arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code, {frames: 1, uploads: imported.costumes});
        await stepFrames(run.vm, 4, 33);
        assert.deepEqual(run.errors, []);
        const total = () => run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).find(v => v.name === 'total').value;
        const before = total();
        assert.ok(before > 0);
        // Any edit through the container's own mutators moves the version and forces full verification.
        const target = run.vm.runtime.targets.find(t => Object.values(t.blocks._blocks).some(b => b.opcode === 'math_number'));
        const number = Object.values(target.blocks._blocks).find(b => b.opcode === 'math_number');
        target.blocks.changeBlock({id: number.id, element: 'field', name: 'NUM', value: String(Number(number.fields.NUM.value) + 5)});
        await stepFrames(run.vm, 3, 33);
        assert.ok(run.errors.some(error => /graph changed|source graph/.test(String(error))), JSON.stringify(run.errors));
    } finally { clearStrayTimers(); }
});

test('the graph version moves on every container mutation and only on those', async () => {
    const {createRequire} = await import('node:module');
    const {REPO} = await import('./helpers/bw-vm.mjs');
    const {track, versionOf} = createRequire(import.meta.url)(REPO + '/overlay/scratch-vm/src/util/bw-graph-version.js');
    const calls = [];
    const blocks = {resetCache() { calls.push('reset'); }};
    assert.equal(versionOf(blocks), -1);
    track(blocks);
    assert.equal(versionOf(blocks), 0);
    blocks.resetCache(); blocks.resetCache();
    assert.equal(versionOf(blocks), 2);
    assert.equal(calls.length, 2, 'the original reset still runs');
    track(blocks);
    assert.equal(versionOf(blocks), 2, 'tracking twice does not double count');
    assert.equal(track({}), null);
});
