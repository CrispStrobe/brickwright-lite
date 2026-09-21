// A HALF ADDER in real parts, graded on the real solver.
//
// The board grader read one LED, which is why the realise challenges stopped at
// single gates. This is the step up: a circuit of two 74HC chips watching the
// same two switches — XOR for the sum, AND for the carry — with an LED per
// output, graded on both at once. Binary addition happening in parts you could
// buy, checked by driving it.
//
// The interesting failure this guards against is a SWAP: a design that computes
// sum and carry correctly but reports them the wrong way round is wrong, and
// must be caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, HALF_ADDER} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {buildLogicIcGate} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-board.js';
import {gradeRealisedCircuit, gradeMessageRealised, discoverRealisation} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';

const {Circuit} = await boot();

const HALF = {
    id: 'half_adder_real',
    inputs: [{name: 'a'}, {name: 'b'}],
    outputs: [{name: 'sum'}, {name: 'carry'}],
    expect: i => ({sum: i.a ^ i.b, carry: i.a & i.b})
};

const realiseHalfAdder = () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, HALF_ADDER);
    return c;
};

// ── It adds ─────────────────────────────────────────────────────────────────

test('two 74HC chips on the board add two bits', () => {
    const result = gradeRealisedCircuit(realiseHalfAdder(), HALF);
    assert.equal(result.pass, true, gradeMessageRealised(result, HALF));
    assert.equal(result.checked, 4, 'every input combination was driven');
});

test('the build is the real thing: an XOR chip, an AND chip, two switches, two LEDs', () => {
    const c = realiseHalfAdder();
    const kinds = {};
    for (const p of c.parts) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    assert.equal(kinds['74hc86'], 1, 'XOR chip for the sum');
    assert.equal(kinds['74hc08'], 1, 'AND chip for the carry');
    assert.equal(kinds.switch, 2, 'two shared input switches');
    assert.equal(kinds.led, 2, 'an LED per output');
    assert.ok(kinds.vcc >= 1 && kinds.gnd >= 1, 'powered');
});

test('1+1 really does light the carry and leave the sum dark', () => {
    // The row that makes it an ADDER rather than two unrelated gates. Read the
    // board directly rather than through the grader, so this is independent of
    // the grader agreeing with itself.
    const c = realiseHalfAdder();
    const built = buildLogicIcCircuit(c, HALF_ADDER);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    const MS = 1000000n;
    built.inputs.forEach(i => board.setControl(i.switch, 1)); // a=1, b=1
    let t = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    for (let k = 0; k < 8; k++) { t += 25n * MS; board.advanceTo(t); }
    const byName = Object.fromEntries(built.outputs.map(o => [o.name, board.ledBrightness(o.led)]));
    assert.ok(byName.carry > 0.1, `1+1 must light the carry, got ${byName.carry}`);
    assert.ok(byName.sum < 0.05, `1+1 must leave the sum dark, got ${byName.sum}`);
});

test('the pass message does not call two LEDs "the output LED"', () => {
    // Caught in a browser drive: the half adder passed and the verdict read
    // "the output LED followed the truth table", which is untrue of what was
    // just checked.
    const msg = gradeMessageRealised(gradeRealisedCircuit(realiseHalfAdder(), HALF), HALF);
    assert.match(msg, /all 2 output LEDs followed their truth tables/, 'plural, and says how many');
    assert.ok(!/the output LED followed/.test(msg), 'not the singular wording');
    // The single-output wording is untouched.
    const AND = {id: 'and', inputs: [{name: 'a'}, {name: 'b'}], outputs: [{name: 'y'}], expect: i => ({y: i.a & i.b})};
    const c = new Circuit(5.0);
    buildLogicIcGate(c, 'and');
    assert.match(gradeMessageRealised(gradeRealisedCircuit(c, AND), AND), /the output LED followed the truth table/);
});

// ── Outputs are matched by NAME, not by where they sit ──────────────────────

test('the output LEDs carry their names, and discovery uses them', () => {
    const c = realiseHalfAdder();
    const io = discoverRealisation(c, HALF);
    assert.equal(io.matchedByName, true, 'matched by declName, not position');
    assert.deepEqual(io.outputs.map(o => o.name), ['sum', 'carry']);
    const leds = c.parts.filter(p => p.kind === 'led');
    assert.deepEqual(leds.map(l => l.declName).sort(), ['carry', 'sum'], 'the parts really are named');
});

test('a swapped LED ORDER still grades correctly, because names beat position', () => {
    // Move the carry LED above the sum LED. Nothing about the circuit changed,
    // so the verdict must not change either.
    const c = realiseHalfAdder();
    const sum = c.parts.find(p => p.kind === 'led' && p.declName === 'sum');
    const carry = c.parts.find(p => p.kind === 'led' && p.declName === 'carry');
    const y = sum.y; sum.y = carry.y; carry.y = y;
    const io = discoverRealisation(c, HALF);
    assert.equal(io.matchedByName, true);
    assert.deepEqual(io.outputs.map(o => o.name), ['sum', 'carry'], 'still sum first');
    assert.equal(io.outputs[0].led, sum.id, 'and still the LED actually named sum');
    assert.equal(gradeRealisedCircuit(c, HALF).pass, true, 'the verdict is unchanged');
});

test('with no names at all, outputs fall back to top-to-bottom', () => {
    const c = realiseHalfAdder();
    for (const p of c.parts) delete p.declName; // a hand-wired board names nothing
    const io = discoverRealisation(c, HALF);
    assert.equal(io.matchedByName, false, 'nothing to match by');
    assert.deepEqual(io.outputs.map(o => o.name), ['sum', 'carry'], 'positional, in challenge order');
    assert.equal(gradeRealisedCircuit(c, HALF).pass, true, 'the builder stacks them in that order, so it still passes');
});

// ── Wrong answers are caught ────────────────────────────────────────────────

test('a design that SWAPS sum and carry is caught', () => {
    // Both gates are individually right; the wiring reports them the wrong way
    // round. It must fail, and name the output that disagrees.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, {
        id: 'swapped', inputs: ['a', 'b'],
        gates: [{type: 'xor', in: ['a', 'b'], out: 'carry'}, {type: 'and', in: ['a', 'b'], out: 'sum'}],
        outputs: ['sum', 'carry']
    });
    const result = gradeRealisedCircuit(c, HALF);
    assert.equal(result.pass, false, 'a swap is not a half adder');
    assert.ok(['sum', 'carry'].includes(result.failing.output), 'it names which output is wrong');
    assert.match(gradeMessageRealised(result, HALF), /Not yet/);
});

test('getting the SUM right but the carry wrong is caught', () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, {
        id: 'or-carry', inputs: ['a', 'b'],
        gates: [{type: 'xor', in: ['a', 'b'], out: 'sum'}, {type: 'or', in: ['a', 'b'], out: 'carry'}],
        outputs: ['sum', 'carry']
    });
    const result = gradeRealisedCircuit(c, HALF);
    assert.equal(result.pass, false, 'OR is not the carry');
    assert.equal(result.failing.output, 'carry', 'and the SUM is not blamed for it');
    assert.equal(result.failing.expected, 0);
    assert.equal(result.failing.got, 1, 'OR lights the carry where AND would not');
});

test('one LED for a two-output challenge is a problem, not a wrong answer', () => {
    const c = new Circuit(5.0);
    buildLogicIcGate(c, 'xor'); // a single gate: right sum, no carry at all
    const result = gradeRealisedCircuit(c, HALF);
    assert.equal(result.pass, false);
    assert.ok(result.problem, 'it is a problem');
    assert.match(result.problem, /2 outputs \(sum, carry\)/, 'saying what is missing');
    assert.equal(result.failing, undefined, 'nothing was graded');
});

// ── The single-output path still behaves ────────────────────────────────────

test('single-output grading is unchanged by all this', () => {
    const AND = {id: 'and', inputs: [{name: 'a'}, {name: 'b'}], outputs: [{name: 'y'}], expect: i => ({y: i.a & i.b})};
    const c = new Circuit(5.0);
    buildLogicIcGate(c, 'and');
    const result = gradeRealisedCircuit(c, AND);
    assert.equal(result.pass, true, gradeMessageRealised(result, AND));
    assert.equal(result.checked, 4);
    // and the legacy `io.output` alias still points at the one LED
    const io = discoverRealisation(c, AND);
    assert.equal(io.output.led, io.outputs[0].led);
});
