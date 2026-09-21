// A FULL ADDER in real parts — five 74HC chips, wired chip to chip.
//
// The half adder proved two chips can share switches. This is the first circuit
// where a chip's OUTPUT feeds another chip's INPUT: `n1` (a XOR b) is computed
// once and read by both the sum XOR and the carry AND, which is the textbook
// "two half adders and an OR". Nothing exercised that path before.
//
// Three inputs means eight rows, and the row that makes it a FULL adder rather
// than a half one is 1+1+1 = 11 — sum lit AND carry lit, which no half adder can
// produce.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, FULL_ADDER, HALF_ADDER, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeMessageRealised, discoverRealisation} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';

const {Circuit} = await boot();

const FULL = {
    id: 'full_adder_real',
    inputs: [{name: 'a'}, {name: 'b'}, {name: 'cin'}],
    outputs: [{name: 'sum'}, {name: 'cout'}],
    expect: i => ({sum: i.a ^ i.b ^ i.cin, cout: (i.a + i.b + i.cin) >= 2 ? 1 : 0})
};

const realise = spec => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, spec);
    return c;
};

// ── It adds three bits ──────────────────────────────────────────────────────

test('five 74HC chips on the board add three bits', () => {
    const result = gradeRealisedCircuit(realise(FULL_ADDER), FULL);
    assert.equal(result.pass, true, gradeMessageRealised(result, FULL));
    assert.equal(result.checked, 8, 'all eight input combinations were driven');
});

test('1+1+1 = 11: the row no half adder can produce', () => {
    // Read off the board directly, not through the grader.
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, FULL_ADDER);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    const MS = 1000000n;
    built.inputs.forEach(i => board.setControl(i.switch, 1)); // a=1 b=1 cin=1
    let t = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    for (let k = 0; k < 8; k++) { t += 25n * MS; board.advanceTo(t); }
    const by = Object.fromEntries(built.outputs.map(o => [o.name, board.ledBrightness(o.led)]));
    assert.ok(by.sum > 0.1, `1+1+1 must light the sum, got ${by.sum}`);
    assert.ok(by.cout > 0.1, `1+1+1 must light the carry, got ${by.cout}`);
});

test('carry-in alone is what makes it different from a half adder', () => {
    // a=0 b=0 cin=1 -> sum 1, cout 0. A half adder has nowhere to put cin.
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, FULL_ADDER);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    const MS = 1000000n;
    const cin = built.inputs.find(i => i.name === 'cin');
    board.setControl(cin.switch, 1);
    let t = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    for (let k = 0; k < 8; k++) { t += 25n * MS; board.advanceTo(t); }
    const by = Object.fromEntries(built.outputs.map(o => [o.name, board.ledBrightness(o.led)]));
    assert.ok(by.sum > 0.1, `0+0+1 must light the sum, got ${by.sum}`);
    assert.ok(by.cout < 0.05, `0+0+1 must leave the carry dark, got ${by.cout}`);
});

// ── The build: chips chained, internal nets unread ──────────────────────────

test('it is five chips, three switches and exactly two LEDs', () => {
    const c = realise(FULL_ADDER);
    const kinds = {};
    for (const p of c.parts) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    assert.equal(kinds['74hc86'], 2, 'two XOR chips');
    assert.equal(kinds['74hc08'], 2, 'two AND chips');
    assert.equal(kinds['74hc32'], 1, 'one OR chip to merge the carries');
    assert.equal(kinds.switch, 3, 'a switch per input, cin included');
    assert.equal(kinds.led, 2, 'internal nets get NO LED — only sum and cout are read');
});

test('the internal nets really are internal', () => {
    const c = realise(FULL_ADDER);
    const ledNames = c.parts.filter(p => p.kind === 'led').map(p => p.declName).sort();
    assert.deepEqual(ledNames, ['cout', 'sum'], 'nothing reads n1, t1 or t2');
    // The chips ARE named for the net they drive, so a learner can see which is which.
    const chipNames = c.parts.filter(p => String(p.kind).startsWith('74hc')).map(p => p.declName).sort();
    assert.deepEqual(chipNames, ['cout', 'n1', 'sum', 't1', 't2']);
});

test('a chip output feeds another chip input — the path nothing exercised before', () => {
    // n1 is produced by one chip and consumed by two others. Structurally: the
    // spec says so, and the built circuit has no LED and no switch on that net,
    // so the only thing that can drive it is the chip.
    const consumers = FULL_ADDER.gates.filter(g => g.in.includes('n1'));
    assert.equal(consumers.length, 2, 'n1 is read twice (the sum XOR and the carry AND)');
    assert.ok(FULL_ADDER.gates.some(g => g.out === 'n1'), 'and produced once');
    const c = realise(FULL_ADDER);
    assert.equal(c.parts.filter(p => p.kind === 'switch' && p.declName === 'n1').length, 0,
        'n1 is not a switch — it is genuinely driven by a chip');
});

// ── Wrong builds are caught ────────────────────────────────────────────────

test('forgetting the second carry term is caught, on the row that needs it', () => {
    // cout = a AND b only. Correct until a carry has to come OUT of the low
    // half adder: a=0 b=1 cin=1 should carry, and this build will not.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, {
        id: 'broken', inputs: ['a', 'b', 'cin'],
        gates: [
            {type: 'xor', in: ['a', 'b'], out: 'n1'},
            {type: 'xor', in: ['n1', 'cin'], out: 'sum'},
            {type: 'and', in: ['a', 'b'], out: 'cout'}
        ],
        outputs: ['sum', 'cout']
    });
    const result = gradeRealisedCircuit(c, FULL);
    assert.equal(result.pass, false, 'a missing carry term is not a full adder');
    assert.equal(result.failing.output, 'cout', 'and it is the CARRY that is wrong, not the sum');
    assert.equal(result.failing.expected, 1);
    assert.equal(result.failing.got, 0, 'the carry that should have propagated did not');
    assert.equal(result.failing.inputs.a + result.failing.inputs.b + result.failing.inputs.cin, 2,
        'the first disagreeing row is one where exactly two inputs are high');
});

test('a HALF adder does not satisfy the full adder challenge', () => {
    // The right idea, one input short — it has two switches, not three.
    const result = gradeRealisedCircuit(realise(HALF_ADDER), FULL);
    assert.equal(result.pass, false);
    assert.ok(result.problem, 'reported as a problem, not a wrong answer');
    assert.match(result.problem, /3 inputs \(a, b, cin\)/, 'saying what is missing');
});

// ── Registry and spec hygiene ──────────────────────────────────────────────

test('the full adder is in the registry the UI and tests share', () => {
    assert.equal(IC_CIRCUITS.full_adder, FULL_ADDER);
    assert.deepEqual(Object.keys(IC_CIRCUITS), ['half_adder', 'full_adder', 'ripple_adder_4'],
        'simplest first — the picker shows them in this order');
});

test('every gate in the spec is produced before it is consumed', () => {
    // A spec that reads a net nothing has driven yet would build a circuit with
    // a floating input, which grades as a fault rather than a wrong answer.
    for (const spec of Object.values(IC_CIRCUITS)) {
        const available = new Set(spec.inputs);
        for (const g of spec.gates) {
            for (const net of g.in) {
                assert.ok(available.has(net), `${spec.id}: ${g.out} reads ${net} before anything drives it`);
            }
            available.add(g.out);
        }
        for (const out of spec.outputs) {
            assert.ok(available.has(out), `${spec.id}: nothing drives the output ${out}`);
        }
    }
});
