// FOUR BITS, TWO CHIPS — the first realise challenge that does not fit in one
// package.
//
// Everything below the 4-bit counter in the ladder is a single part with its
// pins renamed. A 74HC74 holds two flip-flops and a nibble needs four, so this
// board is two of them and the carry between them is a wire on the breadboard.
// That makes it the test of the multi-package spec form as much as of the
// counter: `chips: [{chip, nets, tieHigh}]`, where a net name is the only way
// anything is joined to anything.
//
// The expected sequence in challenges.js is MEASURED, and this file is where it
// is measured. A ripple counter's power-up value is a property of the silicon,
// so a tidier table written from theory would simply be wrong — and would fail
// against the board it claims to describe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, COUNTER4_CHIP, IC_CIRCUITS}
    from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeMessageRealised}
    from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const C4 = challengeById('counter4_real');
const NS = 1000000n;

const build = () => {
    const c = new Circuit(5.0);
    const io = buildLogicIcCircuit(c, COUNTER4_CHIP);
    c.board.setPower(true);
    return {c, io};
};

/** The grader's own clocking, so what this reads is what the grader reads. */
const settle = board => {
    const start = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    for (let t = start + (25n * NS); t <= start + (200n * NS); t += 25n * NS) board.advanceTo(t);
};

const runBoard = cycles => {
    const {c, io} = build();
    const board = c.board;
    const clk = io.inputs.find(i => i.name === 'clk').switch;
    const leds = ['q0', 'q1', 'q2', 'q3'].map(n => io.outputs.find(o => o.name === n).led);
    board.setControl(clk, 0);
    settle(board);
    const seq = [];
    for (let t = 0; t < cycles; t++) {
        board.setControl(clk, 1);
        settle(board);
        const bits = leds.map(id => {
            const b = board.ledBrightness(id);
            return b >= 0.1 ? 1 : (b <= 0.05 ? 0 : null);
        });
        seq.push(bits.some(b => b === null) ? null : bits.reduce((a, b, i) => a + (b << i), 0));
        board.setControl(clk, 0);
        settle(board);
    }
    return seq;
};

test('the 4-bit counter is TWO packages, and the carry between them is a real wire', () => {
    const {io} = build();
    const chips = io.chips || [];
    const packs = (io.packages || []).length || 2;
    assert.equal(COUNTER4_CHIP.chips.length, 2, 'four flip-flops do not fit in one 74HC74');
    assert.ok(packs >= 2, `expected two packages on the board, got ${packs}`);
    // U1's second q̄ and U2's first clock must name the SAME net, or the chain
    // is broken at exactly the seam this challenge exists to show.
    assert.equal(COUNTER4_CHIP.chips[0].nets['2q_bar'], COUNTER4_CHIP.chips[1].nets['1clk'],
        'the carry from U1 to U2 must be one net');
    assert.ok(chips !== undefined);
});

test('every stage feeds back on itself: q̄ and d share a net in all four', () => {
    for (const [n, chip] of COUNTER4_CHIP.chips.entries()) {
        for (const slot of ['1', '2']) {
            assert.equal(chip.nets[`${slot}q_bar`], chip.nets[`${slot}d`],
                `U${n + 1} flip-flop ${slot} is not folded back on itself — it will not toggle`);
        }
    }
});

test('MEASURED: the board counts through every one of the sixteen values and wraps', () => {
    const seq = runBoard(18);
    assert.ok(seq.every(v => v !== null), `an LED never settled: ${JSON.stringify(seq)}`);
    // Every value appears — a counter that skipped one would still look like it
    // was counting on a quick glance at the LEDs.
    assert.equal(new Set(seq).size, 16, `expected all 16 values, saw ${new Set(seq).size}: ${JSON.stringify(seq)}`);
    // And it WRAPS: the run is longer than one lap on purpose.
    assert.deepEqual(seq, Array.from({length: 18}, (_, t) => (t + 15) % 16),
        `the measured sequence changed — update challenges.js from THIS number, never the other way round: ${JSON.stringify(seq)}`);
});

test('the challenge table agrees with the board it describes', () => {
    const expected = C4.seqExpect(C4.stimulus).map(r => r.q0 + (r.q1 << 1) + (r.q2 << 2) + (r.q3 << 3));
    assert.deepEqual(expected, runBoard(C4.cycles),
        'challenges.js and the solver disagree — the table is the thing that is wrong');
});

test('the real board passes counter4_real', () => {
    const {c} = build();
    const result = gradeRealisedCircuit(c, C4);
    assert.equal(result.pass, true, gradeMessageRealised(result, C4));
    assert.equal(result.sequential, true, 'graded by clocking, not by enumerating inputs');
    assert.equal(result.checked, C4.cycles, 'every clock edge was driven');
});

test('THE test that matters: a 2-bit counter does not pass the 4-bit challenge', () => {
    // The nastiest wrong answer is a board that is RIGHT, just not big enough:
    // its low two bits follow the same 0,1,2,3 the 4-bit counter's do. It fails
    // only because q2 and q3 are not there to be read.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, IC_CIRCUITS.counter2);
    c.board.setPower(true);
    const result = gradeRealisedCircuit(c, C4);
    assert.equal(result.pass, false, 'a 2-bit counter must not pass the 4-bit challenge');
    assert.ok(gradeMessageRealised(result, C4).length > 0, 'and it must say something about why');
});

test('counter4 is offered in the ⚙ picker', () => {
    assert.equal(IC_CIRCUITS.counter4, COUNTER4_CHIP, 'the picker must list the circuit the challenge names');
    assert.equal(C4.circuit, 'counter4');
    assert.deepEqual(C4.requires, ['counter_real'], 'it follows the 2-bit counter in the ladder');
});
