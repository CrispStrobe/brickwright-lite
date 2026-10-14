// The CMOS transistor realization, through the REAL solver — the raw-silicon rung
// of the gate→chip→transistor ladder. fpga-cmos-board.test.mjs checks the netlist
// against a MOCK circuit; this builds each gate's transistors on a LIVE Circuit and
// asserts the output LED follows the gate's truth table with a CLEAN swing.
//
// This is the test the fix needed: buildCmosGate mapped every MOSFET a→drain,
// b→source, which left each pull-up PMOS with its source on the output node. The
// SPICE model refers a MOSFET's threshold to its source, so as the NMOS pulled the
// output down the PMOS's Vgs crossed threshold and it LEAKED — the output stuck
// ~4 V and the LED never went dark. The single-transistor and 74HC realizations
// were unaffected, so nothing caught it until a real-solver truth-table check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildCmosGate} from '../overlay/scratch-gui/src/lib/bw-fpga/cmos-board.js';

const {Circuit} = await boot();
const MS = 1_000_000n;

// Hold one input combination from power-on and read the output LED once the
// analog solve settles. Fresh board per combination (the LED brightness is a
// short moving average, and this is the honest "these inputs light this LED").
function litFor (type, combo) {
    const c = new Circuit(5.0);
    const built = buildCmosGate(c, type);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    combo.forEach((bit, i) => board.setControl(built.inputs[i].switch, bit ? 1 : 0));
    for (let t = 25n; t <= 150n; t += 25n) board.advanceTo(t * MS);
    return board.ledBrightness(built.output.led);
}

const TRUTH = {
    not:    {arity: 1, f: i => (i[0] ? 0 : 1)},
    buffer: {arity: 1, f: i => (i[0] ? 1 : 0)},
    nand:   {arity: 2, f: i => ((i[0] & i[1]) ? 0 : 1)},
    nor:    {arity: 2, f: i => ((i[0] | i[1]) ? 0 : 1)},
    and:    {arity: 2, f: i => (i[0] & i[1])},
    or:     {arity: 2, f: i => (i[0] | i[1])}
};

for (const [type, {arity, f}] of Object.entries(TRUTH)) {
    test(`CMOS ${type.toUpperCase()} computes its truth table on the board, output swinging fully`, () => {
        const combos = arity === 1 ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
        for (const combo of combos) {
            const lit = litFor(type, combo);
            if (f(combo) === 1) {
                assert.ok(lit > 0.1, `${type}(${combo}) = 1 -> LED lit, got ${lit}`);
            } else {
                // The regression this guards: a leaking PMOS left this ~0.35, not dark.
                assert.ok(lit < 0.05, `${type}(${combo}) = 0 -> LED dark (full swing), got ${lit}`);
            }
        }
    });
}

test('buildCmosGate places transistors, a switch per input, and an output LED', () => {
    const c = new Circuit(5.0);
    const built = buildCmosGate(c, 'nand');
    const kinds = {};
    for (const p of c.parts) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    assert.equal(kinds.pmos, 2, 'NAND: two PMOS');
    assert.equal(kinds.nmos, 2, 'NAND: two NMOS');
    assert.equal(kinds.switch, 2, 'a switch per input');
    assert.equal(kinds.led, 1, 'an output LED');
    assert.equal(built.inputs.length, 2);
});
