// A shift register in real parts — the rung that MOVES a bit instead of holding it.
//
// The expected table in challenges.js says output i carries the bit fed in i
// cycles ago. That is a claim about a real 74HC595 with its two clocks tied
// together, so it is MEASURED here rather than reasoned about: a shift
// register's exact phase (does qa show the new bit on this edge or the next?)
// depends on the part, and a table written from theory would be wrong in a way
// the LEDs would not obviously contradict.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, SHIFT_REG_8, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeMessageRealised} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const SHIFT = challengeById('shift_real');
const NAMES = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh'];
const NS = 1000000n;

const build = () => {
    const c = new Circuit(5.0);
    const io = buildLogicIcCircuit(c, SHIFT_REG_8);
    c.board.setPower(true);
    return {c, io};
};

/** The grader's own clocking, so what this reads is what the grader reads. */
const runBoard = serBits => {
    const {c, io} = build();
    const b = c.board;
    const sw = n => io.inputs.find(i => i.name === n).switch;
    const leds = NAMES.map(n => io.outputs.find(o => o.name === n).led);
    const settle = () => {
        const s = typeof b.timeNs === 'bigint' ? b.timeNs : 0n;
        for (let t = s + 25n * NS; t <= s + 200n * NS; t += 25n * NS) b.advanceTo(t);
    };
    b.setControl(sw('clk'), 0);
    settle();
    const seq = [];
    for (const bit of serBits) {
        b.setControl(sw('ser'), bit);
        settle();
        b.setControl(sw('clk'), 1);
        settle();
        seq.push(leds.map(id => {
            const v = b.ledBrightness(id);
            return v >= 0.1 ? 1 : (v <= 0.05 ? 0 : null);
        }));
        b.setControl(sw('clk'), 0);
        settle();
    }
    return seq;
};

test('the real board passes shift_real', () => {
    const {c} = build();
    const result = gradeRealisedCircuit(c, SHIFT);
    assert.equal(result.pass, true, gradeMessageRealised(result, SHIFT, 'en'));
    assert.equal(result.checked, SHIFT.cycles, 'every clock edge was driven');
});

test('MEASURED: output i carries the bit fed in i cycles ago', () => {
    const ser = SHIFT.stimulus.ser;
    const seq = runBoard(ser);
    assert.ok(seq.every(row => row.every(v => v !== null)), 'an LED never settled');
    const want = ser.map((_, t) => NAMES.map((__, i) => (t - i >= 0 ? ser[t - i] : 0)));
    assert.deepEqual(seq, want,
        'the measured shift differs from the table — update challenges.js from THIS, never the reverse');
});

test('A BIT IS SEEN ENTERING, TRAVELLING AND LEAVING', () => {
    // The property ten cycles buy that four would not: the first 1 reaches the
    // far end and then falls off, which is what makes it a shift register
    // rather than eight independent latches.
    const seq = runBoard(SHIFT.stimulus.ser);
    assert.equal(seq[0][0], 1, 'the first bit enters at qa');
    assert.equal(seq[7][7], 1, 'and reaches qh seven edges later');
    assert.equal(seq[8][7], 1, 'the next bit of the pattern follows it out');
    assert.deepEqual(seq[9], [0, 0, 0, 0, 0, 0, 1, 0], 'the tail of 1101 is all that is left');
});

test('the table agrees with the board it describes', () => {
    const expected = SHIFT.seqExpect(SHIFT.stimulus).map(row => NAMES.map(n => row[n]));
    assert.deepEqual(expected, runBoard(SHIFT.stimulus.ser),
        'challenges.js and the solver disagree — the table is the thing that is wrong');
});

test('THE test that matters: a plain register does NOT satisfy it', () => {
    // A 74HC74 holds its input, so qa would be right on every cycle and every
    // other output would be dark — a board that remembers but does not move.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, IC_CIRCUITS.dff);
    c.board.setPower(true);
    const result = gradeRealisedCircuit(c, SHIFT);
    assert.equal(result.pass, false, 'holding a bit is not shifting it');
});

test('the control pins are tied the way a working 595 needs', () => {
    // srclr and oe are both ACTIVE LOW and are the classic 595 wiring mistake:
    // leave clear low and it never holds, leave output-enable high and it never
    // shows anything, and both look like a dead board.
    assert.deepEqual(SHIFT_REG_8.tieHigh, ['srclr']);
    assert.deepEqual(SHIFT_REG_8.tieLow, ['oe']);
    assert.deepEqual(SHIFT_REG_8.pins.clk, ['srclk', 'rclk'],
        'one clock switch drives both the shift and the latch, which is why the bits are visible');
});

test('the rung closes the ladder and is in the picker', () => {
    assert.equal(IC_CIRCUITS.shift8, SHIFT_REG_8);
    assert.equal(SHIFT.circuit, 'shift8');
    assert.equal(SHIFT.sequential, true);
    assert.deepEqual(SHIFT.requires, ['counter4_real']);
});
