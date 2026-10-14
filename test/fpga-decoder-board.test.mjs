// A 3-to-8 decoder in real parts, and the output that goes DARK.
//
// The 74HC138's outputs are ACTIVE LOW — the part names the pins y0b..y7b, "y0
// bar". So the addressed line is the one that goes out and the other seven stay
// lit. Grading it the other way round would be grading a chip that does not
// exist, and the error would be invisible in the shape of a model: seven LEDs
// versus one is a very convincing wrong answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, DECODER_CHIP_3TO8, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeMessageRealised} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const DEC = challengeById('decoder_real');

const build = spec => {
    const c = new Circuit(5.0);
    const io = buildLogicIcCircuit(c, spec);
    c.board.setPower(true);
    return {c, io};
};

test('the real 74HC138 passes decoder_real', () => {
    const {c} = build(DECODER_CHIP_3TO8);
    const result = gradeRealisedCircuit(c, DEC);
    assert.equal(result.pass, true, gradeMessageRealised(result, DEC, 'en'));
    assert.equal(result.checked, 8, 'three address lines is eight combinations, all driven');
});

test('MEASURED ON THE BOARD: exactly one output is low, and it is the addressed one', () => {
    const {c, io} = build(DECODER_CHIP_3TO8);
    const b = c.board;
    const sw = n => io.inputs.find(i => i.name === n).switch;
    const leds = Array.from({length: 8}, (_, k) => io.outputs.find(o => o.name === `y${k}`).led);
    const NS = 1000000n;
    const settle = () => {
        const s = typeof b.timeNs === 'bigint' ? b.timeNs : 0n;
        for (let t = s + 25n * NS; t <= s + 200n * NS; t += 25n * NS) b.advanceTo(t);
    };
    for (let n = 0; n < 8; n++) {
        b.setControl(sw('a'), n & 1);
        b.setControl(sw('b'), (n >> 1) & 1);
        b.setControl(sw('c'), (n >> 2) & 1);
        settle();
        const lit = leds.map(id => (b.ledBrightness(id) >= 0.1 ? 1 : 0));
        const dark = lit.map((v, k) => (v ? -1 : k)).filter(k => k >= 0);
        assert.deepEqual(dark, [n],
            `address ${n}: exactly y${n} should be dark, got dark=[${dark}] lit=[${lit}]`);
    }
});

test('the ACTIVE-LOW sense is the claim, so the inverted expectation must fail', () => {
    // The wrong answer that looks right: one LED lit instead of one dark. If
    // the board satisfied THAT, the part would not be a 74HC138.
    const inverted = {
        ...DEC,
        expect: i => {
            const n = i.a + (i.b << 1) + (i.c << 2);
            const out = {};
            for (let k = 0; k < 8; k++) out[`y${k}`] = k === n ? 1 : 0;
            return out;
        }
    };
    const {c} = build(DECODER_CHIP_3TO8);
    const result = gradeRealisedCircuit(c, inverted);
    assert.equal(result.pass, false, 'active-high expectations must not pass on an active-low part');
});

test('the enables are tied so the chip is actually enabled', () => {
    // g1 HIGH and both g2 LOW, all three required. A floating enable leaves
    // every output high and the board looks dead in a way that reads as a
    // wiring mistake rather than a missing tie-off.
    assert.deepEqual(DECODER_CHIP_3TO8.tieHigh, ['g1']);
    assert.deepEqual(DECODER_CHIP_3TO8.tieLow, ['g2ab', 'g2bb']);
});

test('it is ONE package — that is the whole point of buying it', () => {
    const {c} = build(DECODER_CHIP_3TO8);
    const chips = c.parts.filter(p => String(p.kind).startsWith('74hc'));
    assert.equal(chips.length, 1, `a decoder you buy is one chip, got ${chips.map(p => p.kind).join(', ')}`);
    assert.equal(chips[0].kind, '74hc138');
});

test('the rung is in the picker and follows the other bought chip', () => {
    assert.equal(IC_CIRCUITS.decoder3to8, DECODER_CHIP_3TO8);
    assert.equal(DEC.circuit, 'decoder3to8');
    assert.deepEqual(DEC.requires, ['adder_chip_real'], 'bought follows bought');
    assert.equal(challengeById('register_real').requires.includes('decoder_real'), true,
        'the ladder is a line, so the register follows this rung');
});
