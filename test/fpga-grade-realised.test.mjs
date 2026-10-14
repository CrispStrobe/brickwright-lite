// Grading a REAL circuit against a truth table, through the real solver.
//
// The learning path's existing grader marks a design drawn on the abstract
// gate-builder canvas. This one marks the thing the learner BUILT in the
// Circuit tab: it drives the board's input switches through every combination
// and reads the output LED, so a pass means "these actual parts, wired this
// way, compute this function" — not "this diagram would".
//
// It grades by RESULT, never by topology, so every correct construction passes.
// These tests prove exactly that: the same AND challenge is met by a 74HC chip
// AND by six CMOS transistors, and a wrong gate is caught with the failing row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {gradeRealisedCircuit, gradeMessageRealised, discoverRealisation} from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {buildLogicIcGate} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-board.js';
import {buildCmosGate} from '../overlay/scratch-gui/src/lib/bw-fpga/cmos-board.js';

const {Circuit} = await boot();

// Stand-in challenges in the shape challenges.js uses — the grader only ever
// reads `inputs`, `outputs` and the pure `expect`, so these are the real thing.
const AND = {id: 'and', inputs: [{name: 'a'}, {name: 'b'}], outputs: [{name: 'y'}], expect: i => ({y: i.a & i.b})};
const OR = {id: 'or', inputs: [{name: 'a'}, {name: 'b'}], outputs: [{name: 'y'}], expect: i => ({y: i.a | i.b})};
const NAND = {id: 'nand', inputs: [{name: 'a'}, {name: 'b'}], outputs: [{name: 'y'}], expect: i => ({y: (i.a & i.b) ? 0 : 1})};
const NOT = {id: 'not', inputs: [{name: 'a'}], outputs: [{name: 'y'}], expect: i => ({y: i.a ? 0 : 1})};

const realise = (build, type) => {
    const c = new Circuit(5.0);
    build(c, type);
    return c;
};

// ── The chip rung ────────────────────────────────────────────────────────────

test('a 74HC AND chip on the board passes the AND challenge', () => {
    const result = gradeRealisedCircuit(realise(buildLogicIcGate, 'and'), AND);
    assert.equal(result.pass, true, gradeMessageRealised(result, AND));
    assert.equal(result.checked, 4, 'every input combination was driven');
    assert.equal(result.realised, true, 'the result is marked as a real-parts grade');
});

test('a 74HC inverter passes the one-input NOT challenge', () => {
    const result = gradeRealisedCircuit(realise(buildLogicIcGate, 'not'), NOT);
    assert.equal(result.pass, true, gradeMessageRealised(result, NOT));
    assert.equal(result.checked, 2, 'both input combinations were driven');
});

// ── The transistor rung: a DIFFERENT construction meeting the SAME challenge ──

test('CMOS transistors realising AND pass the same AND challenge', () => {
    const result = gradeRealisedCircuit(realise(buildCmosGate, 'and'), AND);
    assert.equal(result.pass, true, gradeMessageRealised(result, AND));
});

test('CMOS transistors realising NAND pass the NAND challenge', () => {
    const result = gradeRealisedCircuit(realise(buildCmosGate, 'nand'), NAND);
    assert.equal(result.pass, true, gradeMessageRealised(result, NAND));
});

// ── The wrong build is caught, with the row that proves it ───────────────────

test('an OR chip fails the AND challenge, naming the row that disagrees', () => {
    const result = gradeRealisedCircuit(realise(buildLogicIcGate, 'or'), AND);
    assert.equal(result.pass, false, 'OR is not AND');
    const f = result.failing;
    assert.ok(f, 'the failing combination is reported');
    // OR and AND first disagree at a=0,b=1 (or a=1,b=0): OR lights, AND must not.
    assert.equal(f.expected, 0, 'AND expects the LED dark on that row');
    assert.equal(f.got, 1, 'the OR chip lit it');
    assert.equal(f.inputs.a | f.inputs.b, 1, 'the disagreeing row has exactly one input high');
    assert.equal(f.inputs.a & f.inputs.b, 0);
    assert.match(gradeMessageRealised(result, AND), /Not yet/, 'the learner gets a concrete message');
});

test('a NAND chip fails the AND challenge on the very first row', () => {
    const result = gradeRealisedCircuit(realise(buildLogicIcGate, 'nand'), AND);
    assert.equal(result.pass, false);
    assert.deepEqual(result.failing.inputs, {a: 0, b: 0}, 'NAND lights at 0,0 where AND must be dark');
    assert.equal(result.failing.expected, 0);
    assert.equal(result.failing.got, 1);
});

// ── Grading is by RESULT, not topology ──────────────────────────────────────

test('the grader never inspects how the gate was built', () => {
    // Two completely different part lists — a 14-pin chip and six transistors —
    // both satisfy AND. That equivalence IS the pedagogical claim.
    const chip = realise(buildLogicIcGate, 'and');
    const cmos = realise(buildCmosGate, 'and');
    const chipKinds = new Set(chip.parts.map(p => p.kind));
    const cmosKinds = new Set(cmos.parts.map(p => p.kind));
    assert.ok(chipKinds.has('74hc08'), 'one is a chip');
    assert.ok(cmosKinds.has('nmos') && cmosKinds.has('pmos'), 'the other is transistors');
    assert.ok(!cmosKinds.has('74hc08'), 'they really are different constructions');
    assert.equal(gradeRealisedCircuit(chip, AND).pass, true);
    assert.equal(gradeRealisedCircuit(cmos, AND).pass, true);
});

// ── Interface discovery and its complaints ──────────────────────────────────

test('discoverRealisation finds the switches top-to-bottom and the output LED', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcGate(c, 'and');
    const io = discoverRealisation(c);
    assert.equal(io.inputs.length, 2, 'a switch per input');
    assert.equal(io.output.led, built.output.led, 'the output LED');
    // Top-to-bottom order must match the builder's own input order, so input `a`
    // is the switch the learner sees first. (Part ids run across circuits, so
    // this comparison only means anything within the one circuit.)
    assert.deepEqual(io.inputs.map(i => i.switch), built.inputs.map(i => i.switch));
});

test('too few switches for the challenge is reported, not graded', () => {
    // A one-input inverter cannot answer a two-input challenge.
    const result = gradeRealisedCircuit(realise(buildLogicIcGate, 'not'), AND);
    assert.equal(result.pass, false);
    assert.ok(result.problem, 'it is a problem, not a wrong answer');
    assert.match(result.problem, /switch/i, 'the message points at the switches');
    assert.equal(result.failing, undefined, 'nothing was graded');
});

test('an empty circuit asks the learner to build something', () => {
    const result = gradeRealisedCircuit(new Circuit(5.0), AND);
    assert.equal(result.pass, false);
    assert.ok(result.problem);
    assert.equal(gradeMessageRealised(result, AND), result.problem);
});

test('a circuit with no board at all is refused politely', () => {
    const result = gradeRealisedCircuit({parts: []}, AND);
    assert.equal(result.pass, false);
    assert.ok(result.problem, 'no crash — a message');
});

test('grading twice in a row gives the same verdict (the board is left usable)', () => {
    const c = realise(buildLogicIcGate, 'and');
    assert.equal(gradeRealisedCircuit(c, AND).pass, true);
    assert.equal(gradeRealisedCircuit(c, AND).pass, true, 'a second pass over the same live board still passes');
    // And a different challenge on that same board still reads honestly.
    assert.equal(gradeRealisedCircuit(c, OR).pass, false, 'an AND board is not an OR board');
});

test('the pass message says it was proven in real parts', () => {
    const c = realise(buildLogicIcGate, 'and');
    const msg = gradeMessageRealised(gradeRealisedCircuit(c, AND), AND);
    assert.match(msg, /✓/);
    assert.match(msg, /4/, 'it says how many combinations were driven');
});

test('grading puts the learner\'s switches back where they left them', () => {
    // Check should not silently rearrange their board — without this it would
    // be left on whatever the last input combination happened to be.
    const c = new Circuit(5.0);
    const built = buildLogicIcGate(c, 'and');
    const board = c.board;
    board.setControl(built.inputs[0].switch, 1);
    board.setControl(built.inputs[1].switch, 0);

    assert.equal(gradeRealisedCircuit(c, AND).pass, true);

    assert.equal(board.getControl(built.inputs[0].switch), 1, 'the first switch is back on');
    assert.equal(board.getControl(built.inputs[1].switch), 0, 'the second is back off');
});

test('switches are restored even when the grade FAILS part-way through', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcGate(c, 'or'); // wrong gate: fails before the last row
    const board = c.board;
    board.setControl(built.inputs[0].switch, 1);
    board.setControl(built.inputs[1].switch, 1);

    const result = gradeRealisedCircuit(c, AND);
    assert.equal(result.pass, false, 'it really did bail out early');
    assert.ok(result.checked < 4, 'before driving every combination');

    assert.equal(board.getControl(built.inputs[0].switch), 1, 'restored anyway');
    assert.equal(board.getControl(built.inputs[1].switch), 1);
});

test('a board wired BY HAND, naming nothing, is graded the same as a built one', () => {
    // The panel tells learners "or wire it yourself", and the grader's
    // positional fallback exists for exactly that. Every other test here builds
    // with a builder, which does not exercise that promise: the builders name
    // their parts, so name-matching always wins. This wires an AND gate the way
    // a learner would — terminal by terminal, nothing named, switches placed in
    // reading order — and expects a pass.
    const c = new Circuit(5.0);
    const conn = {};
    const join = (net, id, term) => { (conn[net] = conn[net] || []).push([id, term]); };

    const vcc = c.addPart('vcc', {}, 60, 40);
    const gnd = c.addPart('gnd', {}, 60, 520);
    join('vcc', vcc.id, 'vcc');
    join('gnd', gnd.id, 'gnd');
    const chip = c.addPart('74hc08', {}, 400, 220);   // no declName — hand-placed
    join('vcc', chip.id, 'vcc');
    join('gnd', chip.id, 'gnd');

    // Two switches, stacked top to bottom: the first one read is input `a`.
    [['1a', 140], ['1b', 300]].forEach(([pin, y], i) => {
        const sw = c.addPart('switch', {}, 150, y);
        join('vcc', sw.id, 'a');
        join(`n${i}`, sw.id, 'b');
        const pull = c.addPart('resistor', {ohms: 100000}, 150, y + 60);
        join(`n${i}`, pull.id, 'a');
        join('gnd', pull.id, 'b');
        join(`n${i}`, chip.id, pin);
    });

    const r = c.addPart('resistor', {ohms: 330}, 700, 220);
    const led = c.addPart('led', {}, 830, 220);        // no declName either
    join('out', chip.id, '1y');
    join('out', r.id, 'a');
    join('lednet', r.id, 'b');
    join('lednet', led.id, 'anode');
    join('gnd', led.id, 'cathode');

    for (const net of Object.keys(conn)) {
        const cs = conn[net];
        for (let i = 1; i < cs.length; i++) c.addWire(cs[i - 1][0], cs[i - 1][1], cs[i][0], cs[i][1]);
    }

    const io = discoverRealisation(c, AND);
    assert.equal(io.matchedByName, false, 'nothing is named, so position is all there is');
    assert.equal(io.inputs.length, 2);

    const result = gradeRealisedCircuit(c, AND);
    assert.equal(result.pass, true, gradeMessageRealised(result, AND));
    assert.equal(result.checked, 4, 'and it really drove every row');

    // And the same hand-wired board must still be REFUSED by a different challenge.
    assert.equal(gradeRealisedCircuit(c, OR).pass, false, 'a hand-wired AND is not an OR');
});
