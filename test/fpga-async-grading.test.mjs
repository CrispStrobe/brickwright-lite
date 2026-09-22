// Grading without freezing the page.
//
// The 4-bit adder drives 22 rows and takes seconds. The grader ran entirely
// inside a click handler, so the page was locked for the duration — and the
// "Checking…" state could not even paint before the block began. The core is
// now a generator: the sync API drains it unchanged, and an async caller
// yields to the event loop between rows.
//
// The thing worth proving is that the two produce the SAME verdict. An async
// grader that quietly graded differently would be worse than a slow one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {buildLogicIcGate} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-board.js';
import {gradeRealisedCircuit, gradeRealisedAsync} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const AND = {id: 'and', inputs: [{name: 'a'}, {name: 'b'}], outputs: [{name: 'y'}], expect: i => ({y: i.a & i.b})};

const build = (spec, gate) => {
    const c = new Circuit(5.0);
    if (gate) buildLogicIcGate(c, gate); else buildLogicIcCircuit(c, spec);
    return c;
};

test('async and sync reach the same verdict on a passing board', async () => {
    const sync = gradeRealisedCircuit(build(null, 'and'), AND);
    const async_ = await gradeRealisedAsync(build(null, 'and'), AND);
    assert.deepEqual(async_, sync, 'identical result objects');
});

test('async and sync reach the same verdict on a FAILING board', async () => {
    const sync = gradeRealisedCircuit(build(null, 'or'), AND);
    const async_ = await gradeRealisedAsync(build(null, 'or'), AND);
    assert.equal(async_.pass, false);
    assert.deepEqual(async_.failing, sync.failing, 'the same failing row, not just the same verdict');
});

test('async grading works for a declared-row challenge too', async () => {
    const ch = challengeById('ripple_adder_real');
    const result = await gradeRealisedAsync(build(IC_CIRCUITS.ripple_adder_4), ch);
    assert.equal(result.pass, true);
    assert.equal(result.checked, (typeof ch.rows === 'function' ? ch.rows() : ch.rows).length);
});

test('async grading works for a SEQUENTIAL challenge', async () => {
    const ch = challengeById('register_real');
    const result = await gradeRealisedAsync(build(IC_CIRCUITS.dff), ch);
    assert.equal(result.pass, true, 'the clocking path is generator-driven too');
    assert.equal(result.sequential, true);
});

test('progress is reported per row, counting up to the total', async () => {
    const seen = [];
    const ch = challengeById('ripple_adder_real');
    await gradeRealisedAsync(build(IC_CIRCUITS.ripple_adder_4), ch, {
        onProgress: p => seen.push(p)
    });
    assert.ok(seen.length >= 20, `expected progress per row, got ${seen.length}`);
    assert.equal(seen[0].checked, 0, 'starts at zero');
    assert.ok(seen.every(p => p.total === seen[0].total), 'the total does not wander');
    for (let i = 1; i < seen.length; i++) {
        assert.equal(seen[i].checked, seen[i - 1].checked + 1, 'and counts up one row at a time');
    }
    assert.equal(seen[seen.length - 1].checked, seen[0].total - 1, 'right up to the last row');
});

test('it really does yield — other work runs while a grade is in flight', async () => {
    // The point of the exercise. If the grade held the thread, this timer could
    // not fire until it finished.
    let ticked = 0;
    const timer = setInterval(() => { ticked++; }, 5);
    await gradeRealisedAsync(build(IC_CIRCUITS.ripple_adder_4), challengeById('ripple_adder_real'));
    clearInterval(timer);
    assert.ok(ticked > 0, 'the event loop never got a turn during the grade');
});

test('the yield is a macrotask, so a browser can actually paint', () => {
    // await Promise.resolve() drains as a microtask BEFORE paint, which would
    // look like yielding while still freezing the page.
    const src = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-fpga/grader.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('export async function gradeRealisedAsync'));
    assert.match(fn, /setTimeout\(resolve, 0\)/, 'a macrotask');
});

test('the panel drives the async grader and shows the count', () => {
    const ui = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx', import.meta.url), 'utf8');
    assert.match(ui, /gradeRealisedAsync/, 'Check uses the non-freezing path');
    assert.match(ui, /onProgress/, 'and reports progress');
    const panel = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/fpga-challenges.jsx', import.meta.url), 'utf8');
    assert.match(panel, /result\.progress/, 'which the panel renders');
});
