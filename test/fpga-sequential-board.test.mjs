// A REGISTER in real parts — the first realisation that remembers.
//
// Every other realise challenge is combinational: drive the switches, read the
// LEDs, and the board forgets instantly. A 74HC74 holds its output until the
// next clock edge, and grading that needs a different kind of check — because
// the interesting failure is not "wrong value", it is "no memory at all".
//
// A plain wire from d to the LED reproduces the right value on every cycle. The
// thing that catches it is moving d WITHOUT clocking and demanding q stay put.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, IC_CIRCUITS, DFF_CHIP, TOGGLE_CHIP, COUNTER2_CHIP} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {gradeRealisedCircuit, gradeRealisedSequential, gradeMessageRealised}
    from '../overlay/scratch-gui/src/lib/bw-fpga/grader.js';
import {challengeById} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';

const {Circuit} = await boot();
const REG = challengeById('register_real');

const realiseDff = () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, DFF_CHIP);
    return c;
};

test('a 74HC74 on the board passes the register challenge', () => {
    const result = gradeRealisedCircuit(realiseDff(), REG);
    assert.equal(result.pass, true, gradeMessageRealised(result, REG));
    assert.equal(result.sequential, true, 'graded as a sequential challenge');
    assert.equal(result.checked, REG.stimulus.d.length, 'every clock cycle was driven');
});

test('gradeRealisedCircuit routes a sequential challenge to the clocking grader', () => {
    // Not a separate entry point the panel has to know about.
    const direct = gradeRealisedSequential(realiseDff(), REG);
    const routed = gradeRealisedCircuit(realiseDff(), REG);
    assert.equal(direct.pass, routed.pass);
    assert.equal(routed.sequential, true);
});

test('THE test that matters: a wire from d to the LED is caught', () => {
    // Build a board where the "output" is just the d switch driving the LED —
    // no flip-flop at all. It shows the right value every single cycle, and it
    // is not a register.
    const c = new Circuit(5.0);
    const conn = {};
    const join = (n, i, t) => { (conn[n] = conn[n] || []).push([i, t]); };
    const vcc = c.addPart('vcc', {}, 60, 40); join('vcc', vcc.id, 'vcc');
    const gnd = c.addPart('gnd', {}, 60, 600); join('gnd', gnd.id, 'gnd');
    for (const name of ['d', 'clk']) {
        const sw = c.addPart('switch', {}, 130, name === 'd' ? 120 : 230, name);
        join('vcc', sw.id, 'a'); join(name, sw.id, 'b');
        const pull = c.addPart('resistor', {ohms: 100000}, 130, 0);
        join(name, pull.id, 'a'); join('gnd', pull.id, 'b');
    }
    const r = c.addPart('resistor', {ohms: 330}, 700, 120);
    const led = c.addPart('led', {}, 830, 120, 'q');
    join('d', r.id, 'a');                       // the LED just follows d
    join('Lq', r.id, 'b'); join('Lq', led.id, 'anode'); join('gnd', led.id, 'cathode');
    for (const net of Object.keys(conn)) {
        const cs = conn[net];
        for (let i = 1; i < cs.length; i++) c.addWire(cs[i - 1][0], cs[i - 1][1], cs[i][0], cs[i][1]);
    }

    const result = gradeRealisedCircuit(c, REG);
    assert.equal(result.pass, false, 'a wire is not a register');
    assert.equal(result.failing.reasonKey, 'grade.real.notARegister', 'and the reason says why');
    // The learner is told, in their own language.
    assert.match(gradeMessageRealised(result, REG, 'en'), /wire, not a register/);
    assert.match(gradeMessageRealised(result, REG, 'de'), /Draht, kein Register/);
    assert.match(gradeMessageRealised(result, REG, 'en'), /clock cycle 0/, 'caught on the very first cycle');
    assert.match(gradeMessageRealised(result, REG, 'de'), /Taktzyklus 0/);
});

test('the hold check runs on every cycle, not just the first', () => {
    // Guard against a grader that checks holding once and then stops looking.
    const src = readFileSync(
        new URL('../overlay/scratch-gui/src/lib/bw-fpga/grader.js', import.meta.url), 'utf8');
    // The clocking body lives in the generator; the exported name is a thin
    // sync wrapper around it.
    const seq = src.slice(src.indexOf('function* gradeRealisedSequentialSteps'));
    assert.ok(seq.length, 'the sequential generator is where the clocking happens');
    const loopAt = seq.indexOf('for (let t = 0; t < cycles; t++)');
    const holdAt = seq.indexOf("reasonKey: 'grade.real.notARegister'");
    assert.ok(loopAt > 0 && holdAt > loopAt, 'the hold check sits INSIDE the per-cycle loop');
});

test('a board with no clock input is reported, not graded', () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, {
        id: 'noclock', chip: '74hc74', chipLabel: '74HC74',
        inputs: ['d'], outputs: ['q'], pins: {d: '1d', q: '1q'},
        tieHigh: ['1pre', '1clr'], gates: []
    });
    const result = gradeRealisedCircuit(c, REG);
    assert.equal(result.pass, false);
    assert.ok(result.problem, 'a problem, not a wrong answer');
    assert.equal(result.failing, undefined);
});

test('the pass message says it REMEMBERED, not that it computed', () => {
    const result = gradeRealisedCircuit(realiseDff(), REG);
    const msg = gradeMessageRealised(result, REG, 'en');
    assert.match(msg, /remembers/i);
    assert.match(msg, /held its value/, 'and that it held between edges');
    assert.ok(!/input combinations/.test(msg), 'combinational wording does not belong here');
    assert.match(gradeMessageRealised(result, REG, 'de'), /erinnert sich/, 'and it remembers in German too');
});

test('the flip-flop board ties preset and clear high', () => {
    // Active-low async pins. Left floating the part never holds, and the
    // challenge would be unmeetable for a reason no learner could see.
    assert.deepEqual(DFF_CHIP.tieHigh, ['1pre', '1clr']);
    const c = realiseDff();
    const ff = c.parts.find(p => p.kind === '74hc74');
    const vcc = c.parts.find(p => p.kind === 'vcc');
    const vccNets = new Set(c.wires
        .filter(w => w.from.part === vcc.id || w.to.part === vcc.id).map(w => w.netId));
    const onVcc = new Set();
    for (const w of c.wires) {
        if (!vccNets.has(w.netId)) continue;
        for (const end of [w.from, w.to]) if (end.part === ff.id) onVcc.add(end.terminal);
    }
    assert.ok(onVcc.has('1pre'), 'preset is tied high');
    assert.ok(onVcc.has('1clr'), 'clear is tied high');
});

test('the register challenge is sequential and sits at the end of the ladder', () => {
    assert.equal(REG.sequential, true);
    assert.equal(REG.circuit, 'dff');
    assert.ok(REG.requires.includes('register'), 'you design it on the canvas first');
    assert.ok(REG.stimulus.d.length >= 5, 'enough cycles to be convincing');
});

// ── The toggle: the first circuit whose output is its own input ────────────

test('a 74HC74 wired q̄ → d divides the clock by two', () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, TOGGLE_CHIP);
    const ch = challengeById('toggle_real');
    const result = gradeRealisedCircuit(c, ch);
    assert.equal(result.pass, true, gradeMessageRealised(result, ch, 'en'));
    assert.equal(result.checked, 8, 'eight clock edges');
});

test('the feedback is INSIDE the part — nothing outside carries it', () => {
    // q̄ → d is a pin-to-pin link. If it ran through a switch or an LED the
    // learner could break it by accident, and it would not be feedback.
    assert.deepEqual(TOGGLE_CHIP.link, [['1q_bar', '1d']]);
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, TOGGLE_CHIP);
    const ff = c.parts.find(p => p.kind === '74hc74');
    const linkNets = c.wires.filter(w =>
        (w.from.part === ff.id && (w.from.terminal === '1q_bar' || w.from.terminal === '1d')) ||
        (w.to.part === ff.id && (w.to.terminal === '1q_bar' || w.to.terminal === '1d')));
    assert.ok(linkNets.length, 'the link is wired');
    for (const w of linkNets) {
        assert.ok(w.from.part === ff.id && w.to.part === ff.id,
            'both ends of the feedback are on the chip itself');
    }
});

test('the toggle board has a clock and nothing else to set', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, TOGGLE_CHIP);
    assert.deepEqual(built.inputs.map(i => i.name), ['clk'], 'only a clock');
    assert.equal(c.parts.filter(p => p.kind === 'switch').length, 1);
    assert.equal(c.parts.filter(p => p.kind === 'led').length, 1);
});

test('a plain D flip-flop does NOT satisfy the toggle challenge', () => {
    // Without the feedback, q copies d — and d is tied to nothing, so it never
    // alternates. The right part, wired the wrong way, must fail.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, {
        id: 'nofeedback', chip: '74hc74', chipLabel: '74HC74',
        inputs: ['clk'], outputs: ['q'], pins: {clk: '1clk', q: '1q'},
        tieHigh: ['1pre', '1clr'], tieLow: ['1d'], gates: []
    });
    const ch = challengeById('toggle_real');
    const result = gradeRealisedCircuit(c, ch);
    assert.equal(result.pass, false, 'a DFF with d held low never toggles');
    assert.equal(result.failing.cycle, 0, 'and it is wrong from the first edge');
});

test('the toggle challenge follows the register, and is sequential', () => {
    const ch = challengeById('toggle_real');
    assert.equal(ch.sequential, true);
    assert.ok(ch.requires.includes('register_real'), 'you build a register before you fold one back');
    assert.ok(ch.requires.includes('toggle'), 'and you design it on the canvas first');
    assert.deepEqual(ch.inputs.map(i => i.name), ['clk'], 'nothing to drive but the clock');
});

// ── The counter: two toggles, one package, and it counts ──────────────────

test('two flip-flops in ONE 74HC74 count 0,1,2,3 and wrap', () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, COUNTER2_CHIP);
    const ch = challengeById('counter_real');
    const result = gradeRealisedCircuit(c, ch);
    assert.equal(result.pass, true, gradeMessageRealised(result, ch, 'en'));
    assert.equal(result.checked, 8, 'eight edges — two full laps');
});

test('it really is ONE package and one switch', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, COUNTER2_CHIP);
    assert.equal(c.parts.filter(p => String(p.kind).startsWith('74hc')).length, 1,
        'a 74HC74 holds two flip-flops; a counter does not need two chips');
    assert.equal(built.inputs.length, 1, 'only a clock');
    assert.equal(built.outputs.length, 2, 'and two LEDs to read as a number');
});

test('the counter reads as a binary NUMBER, low bit changing fastest', () => {
    // The property that makes it a counter rather than two unrelated blinkers:
    // q0 changes on every edge, q1 on every second one.
    const seq = challengeById('counter_real').seqExpect({});
    const values = seq.map(o => o.q0 + (o.q1 << 1));
    for (let i = 1; i < values.length; i++) {
        assert.equal(values[i], (values[i - 1] + 1) % 4, `step ${i} must add one`);
    }
    assert.equal(new Set(values).size, 4, 'and it visits every value');
    const q0Changes = seq.filter((o, i) => i && o.q0 !== seq[i - 1].q0).length;
    const q1Changes = seq.filter((o, i) => i && o.q1 !== seq[i - 1].q1).length;
    assert.ok(q0Changes > q1Changes, 'the low bit changes faster than the high one');
});

test('a single toggle does NOT satisfy the counter challenge', () => {
    // One flip-flop has nothing to carry into, so there is no second bit.
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, TOGGLE_CHIP);
    const result = gradeRealisedCircuit(c, challengeById('counter_real'));
    assert.equal(result.pass, false, 'one bit is not two');
    assert.ok(result.problem, 'and it is reported as an incomplete board');
});
