// A 4-BIT RIPPLE-CARRY ADDER in real parts: twenty 74HC chips, nine switches,
// five LEDs — and the first challenge that does NOT exhaust its input space.
//
// Nine inputs is 512 combinations, which on the real board is minutes of
// simulation; that is not a thing to do inside a click. So the challenge names
// the rows it wants driven, and the verdict says what they covered instead of
// implying an exhaustiveness it did not perform. The coverage criterion is
// exact and checked here independently of the code that produces it: every
// stage must see all eight (a, b, carry-in) triples its full adder can face.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, rippleAdder, carryCoverRows, IC_CIRCUITS, RIPPLE_ADDER_4}
    from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeMessageRealised} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const RIPPLE = challengeById('ripple_adder_real');

const realise = spec => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, spec);
    return c;
};

// ── The coverage claim, checked independently of the code that makes it ─────

/** Replay the carry in pure arithmetic and report what each stage saw. */
function stageTriples (rows, n) {
    const seen = new Set();
    for (const row of rows) {
        let carry = row.cin;
        for (let i = 0; i < n; i++) {
            const a = row[`a${i}`];
            const b = row[`b${i}`];
            seen.add(`${i}:${(a << 2) | (b << 1) | carry}`);
            carry = ((a + b + carry) >= 2) ? 1 : 0;
        }
    }
    return seen;
}

for (const n of [2, 3, 4]) {
    test(`carryCoverRows(${n}) shows every stage all eight of its cases`, () => {
        const rows = carryCoverRows(n);
        const seen = stageTriples(rows, n);
        assert.equal(seen.size, n * 8, `every one of ${n} stages must see all 8 triples`);
        assert.ok(rows.length < (1 << ((2 * n) + 1)), 'and do it without exhausting the space');
    });
}

test('the row set is far smaller than the input space, and deterministic', () => {
    const rows = carryCoverRows(4);
    assert.ok(rows.length <= 40, `expected a small set, got ${rows.length} of 512`);
    assert.deepEqual(rows, carryCoverRows(4), 'the same rows every run');
});

test('dropping any row breaks the coverage — none of them is padding', () => {
    // If a row could be removed and coverage still held, the set would be
    // claiming work it does not need to do.
    const rows = carryCoverRows(4);
    for (let i = 0; i < rows.length; i++) {
        const without = rows.filter((_, j) => j !== i);
        assert.ok(stageTriples(without, 4).size < 32, `row ${i} is redundant`);
    }
});

// ── It adds ─────────────────────────────────────────────────────────────────

test('twenty 74HC chips add two 4-bit numbers on the real board', () => {
    const result = gradeRealisedCircuit(realise(RIPPLE_ADDER_4), RIPPLE);
    assert.equal(result.pass, true, gradeMessageRealised(result, RIPPLE));
    assert.equal(result.checked, carryCoverRows(4).length, 'it drove the declared rows');
    assert.ok(result.covering, 'and recorded what they covered');
});

test('1111 + 0001 rolls over: every sum dark, carry lit', () => {
    // The row a learner is told to try. Read off the board, not via the grader.
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, RIPPLE_ADDER_4);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    const MS = 1000000n;
    const set = (name, v) => board.setControl(built.inputs.find(i => i.name === name).switch, v);
    for (let i = 0; i < 4; i++) { set(`a${i}`, 1); set(`b${i}`, 0); }
    set('b0', 1); set('cin', 0); // 15 + 1
    let t = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    for (let k = 0; k < 8; k++) { t += 25n * MS; board.advanceTo(t); }
    const read = n => board.ledBrightness(built.outputs.find(o => o.name === n).led);
    for (let i = 0; i < 4; i++) assert.ok(read(`sum${i}`) < 0.05, `sum${i} must be dark, got ${read(`sum${i}`)}`);
    assert.ok(read('cout') > 0.1, `the carry must light, got ${read('cout')}`);
});

test('a plain sum with no carries at all still works (9 + 4 = 13)', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, RIPPLE_ADDER_4);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    const MS = 1000000n;
    const set = (name, v) => board.setControl(built.inputs.find(i => i.name === name).switch, v);
    [1, 0, 0, 1].forEach((v, i) => set(`a${i}`, v)); // 9
    [0, 0, 1, 0].forEach((v, i) => set(`b${i}`, v)); // 4
    set('cin', 0);
    let t = typeof board.timeNs === 'bigint' ? board.timeNs : 0n;
    for (let k = 0; k < 8; k++) { t += 25n * MS; board.advanceTo(t); }
    const bit = n => (board.ledBrightness(built.outputs.find(o => o.name === n).led) > 0.1 ? 1 : 0);
    const value = bit('sum0') + (bit('sum1') << 1) + (bit('sum2') << 2) + (bit('sum3') << 3);
    assert.equal(value, 13, 'the LEDs read 13 in binary');
    assert.equal(bit('cout'), 0, 'and nothing carried out');
});

// ── The build ───────────────────────────────────────────────────────────────

test('it is five chips per bit, laid out in a grid rather than one long column', () => {
    const c = realise(RIPPLE_ADDER_4);
    const chips = c.parts.filter(p => String(p.kind).startsWith('74hc'));
    assert.equal(chips.length, 20, 'five chips per bit, four bits');
    assert.equal(c.parts.filter(p => p.kind === 'switch').length, 9, 'a switch per input');
    assert.equal(c.parts.filter(p => p.kind === 'led').length, 5, 'four sums and a carry');
    // Twenty chips stacked vertically would be a ~3,800px strip nobody can read.
    const xs = new Set(chips.map(p => p.x));
    assert.equal(xs.size, 4, 'one column per bit');
    const height = Math.max(...chips.map(p => p.y)) - Math.min(...chips.map(p => p.y));
    assert.ok(height < 1000, `the stack must stay lookable, got ${height}px tall`);
});

test('the output LEDs are to the RIGHT of every chip, not on top of them', () => {
    const c = realise(RIPPLE_ADDER_4);
    const rightmostChip = Math.max(...c.parts.filter(p => String(p.kind).startsWith('74hc')).map(p => p.x));
    for (const led of c.parts.filter(p => p.kind === 'led')) {
        assert.ok(led.x > rightmostChip, `${led.declName} at x=${led.x} overlaps the chips`);
    }
});

// ── A wrong build is caught ────────────────────────────────────────────────

test('breaking ONE stage\'s carry hand-off is caught', () => {
    // Stage 1 ignores the carry coming up from stage 0 — correct whenever bit 0
    // does not carry, wrong the moment it does.
    const spec = rippleAdder(4);
    const broken = {
        ...spec, id: 'broken',
        gates: spec.gates.map(g => (g.out === 'sum1' ? {...g, in: ['n1', 'cin']} : g))
    };
    const result = gradeRealisedCircuit(realise(broken), RIPPLE);
    assert.equal(result.pass, false, 'a dropped carry is not an adder');
    assert.ok(result.failing, 'and it names a row and an output');
    assert.match(gradeMessageRealised(result, RIPPLE), /Not yet/);
});

// ── The verdict does not overclaim ─────────────────────────────────────────

test('the pass message says it covered rows, NOT that it tried everything', () => {
    const msg = gradeMessageRealised(gradeRealisedCircuit(realise(RIPPLE_ADDER_4), RIPPLE), RIPPLE);
    assert.match(msg, /across \d+ rows covering/, 'it says how many rows and what they covered');
    assert.ok(!/all \d+ input combinations/.test(msg), 'and never claims exhaustiveness');
    assert.match(msg, /512 combinations would take minutes/, 'and is honest about why');
});

test('an exhaustively graded challenge still says "all N input combinations"', () => {
    // The honesty above must not have cost the stronger claim where it holds.
    const full = challengeById('full_adder_real');
    const msg = gradeMessageRealised(gradeRealisedCircuit(realise(IC_CIRCUITS.full_adder), full), full);
    assert.match(msg, /all 8 input combinations/);
    assert.ok(!/rows covering/.test(msg));
});
