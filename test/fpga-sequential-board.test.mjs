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
import {buildLogicIcCircuit, IC_CIRCUITS, DFF_CHIP} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
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
    assert.ok(result.failing.reason, 'and the reason says why');
    assert.match(result.failing.reason, /wire, not a register/);
    assert.match(gradeMessageRealised(result, REG), /clock cycle 0/, 'caught on the very first cycle');
});

test('the hold check runs on every cycle, not just the first', () => {
    // Guard against a grader that checks holding once and then stops looking.
    const src = readFileSync(
        new URL('../overlay/scratch-gui/src/lib/bw-fpga/grader.js', import.meta.url), 'utf8');
    const seq = src.slice(src.indexOf('export function gradeRealisedSequential'));
    const loopAt = seq.indexOf('for (let t = 0; t < cycles; t++)');
    const holdAt = seq.indexOf('that is a wire, not a register');
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
    const msg = gradeMessageRealised(gradeRealisedCircuit(realiseDff(), REG), REG);
    assert.match(msg, /remembers/i);
    assert.match(msg, /held its value/, 'and that it held between edges');
    assert.ok(!/input combinations/.test(msg), 'combinational wording does not belong here');
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
