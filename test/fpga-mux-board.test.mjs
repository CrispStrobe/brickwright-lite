// A MULTIPLEXER IN REAL PARTS — the first realisation that routes rather than
// computes.
//
// Everything below it in the ladder is a function of its inputs. A mux is a
// function too, formally, but the thing being taught is different: while `sel`
// picks `b`, nothing about `a` may reach the output. That is a property the
// truth table alone states only implicitly, so it is asserted directly below.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, MUX2, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeMessageRealised} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const MUX = challengeById('mux2_real');

const build = spec => {
    const c = new Circuit(5.0);
    const io = buildLogicIcCircuit(c, spec);
    c.board.setPower(true);
    return {c, io};
};

test('the real board passes mux2_real', () => {
    const {c} = build(MUX2);
    const result = gradeRealisedCircuit(c, MUX);
    assert.equal(result.pass, true, gradeMessageRealised(result, MUX, 'en'));
    assert.equal(result.checked, 8, 'three inputs is eight combinations, all driven');
});

test('THE PROPERTY THAT MAKES IT A MUX: the unselected input cannot reach the output', () => {
    // A circuit that ORed its inputs would satisfy half the truth table and
    // still be wrong about the thing a multiplexer is for. Drive the
    // UNSELECTED input through both values and require the output not to move.
    const {c, io} = build(MUX2);
    const b = c.board;
    const sw = n => io.inputs.find(i => i.name === n).switch;
    const led = io.outputs.find(o => o.name === 'y').led;
    const NS = 1000000n;
    const settle = () => {
        const s = typeof b.timeNs === 'bigint' ? b.timeNs : 0n;
        for (let t = s + 25n * NS; t <= s + 200n * NS; t += 25n * NS) b.advanceTo(t);
    };
    const lit = () => {
        const v = b.ledBrightness(led);
        return v >= 0.1 ? 1 : (v <= 0.05 ? 0 : null);
    };
    for (const [sel, held, moved, heldName] of [[0, 'a', 'b', 'a'], [1, 'b', 'a', 'b']]) {
        for (const heldValue of [0, 1]) {
            b.setControl(sw('sel'), sel);
            b.setControl(sw(held), heldValue);
            b.setControl(sw(moved), 0); settle();
            const before = lit();
            b.setControl(sw(moved), 1); settle();
            const after = lit();
            assert.equal(before, heldValue, `sel=${sel} should pass ${heldName}=${heldValue}`);
            assert.equal(after, before,
                `sel=${sel}: moving the UNSELECTED input changed the output — it is not routing, it is mixing`);
        }
    }
});

test('a plain OR of the two data inputs does NOT satisfy the challenge', () => {
    // The nastiest wrong answer: it agrees on six of the eight rows.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, {
        id: 'or_not_mux', inputs: ['a', 'b', 'sel'],
        gates: [{type: 'or', in: ['a', 'b'], out: 'y'}], outputs: ['y']
    });
    c.board.setPower(true);
    const result = gradeRealisedCircuit(c, MUX);
    assert.equal(result.pass, false, 'an OR is not a multiplexer');
});

test('it is three packages: an inverter, the ANDs, and an OR', () => {
    const {c} = build(MUX2);
    const kinds = {};
    for (const p of c.parts) if (String(p.kind).startsWith('74hc')) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    assert.deepEqual(kinds, {'74hc04': 1, '74hc08': 1, '74hc32': 1},
        `expected one inverter, one quad AND (both ANDs share it) and one quad OR, got ${JSON.stringify(kinds)}`);
});

test('the rung is wired into the ladder and the picker', () => {
    assert.equal(IC_CIRCUITS.mux2, MUX2, 'the ⚙ picker must offer the circuit the challenge names');
    assert.equal(MUX.circuit, 'mux2');
    assert.ok(MUX.requires.includes('mux2'), 'design it on the canvas before building it');
    assert.ok(MUX.requires.includes('xor_real'), 'and it follows the single-gate realisations');
    assert.equal(MUX.sequential, undefined, 'a mux has no memory');
});
