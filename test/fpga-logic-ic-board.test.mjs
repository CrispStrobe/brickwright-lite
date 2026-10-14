// The 74HC chip realisation, through the REAL solver: build each gate as its
// chip on a live Circuit, toggle the input switches through every combination,
// and assert the output LED follows the gate's truth table. A mock of addPart
// would pass with the chip unpowered or miswired; only the solver proves the
// part actually computes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcGate} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-board.js';
import {gateToLogicIc, evalLogicIc, LOGIC_IC_GATES} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic.js';

const {Circuit} = await boot();
const MS = 1_000_000n;

// Build the gate, hold one input combination from power-on, let the digital
// solve settle, and read the output LED. The 74HC parts model digitally (they
// settle through advanceTo, not a DC operating point), and the LED brightness is
// a short moving average — so each combination gets its own fresh board held
// steady, the honest reading of "these inputs light this LED".
function litFor (type, combo) {
    const c = new Circuit(5.0);
    const built = buildLogicIcGate(c, type);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);
    combo.forEach((bit, i) => board.setControl(built.inputs[i].switch, bit ? 1 : 0));
    // Advance in brightness-window steps, not one jump: the LED brightness is
    // sampled per advanceTo window, and the chip's digital output settles over
    // ~50 ms, so a single leap to 100 ms samples before the LED is steady and
    // reads 0. Stepping to 150 ms lets the settled LED fill a sampling window.
    for (let t = 25n; t <= 150n; t += 25n) board.advanceTo(t * MS);
    return board.ledBrightness(built.output.led);
}

for (const type of LOGIC_IC_GATES) {
    test(`74HC ${type.toUpperCase()} (${gateToLogicIc(type).label}) computes its truth table on the board`, () => {
        const combos = type === 'not' ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
        for (const combo of combos) {
            const lit = litFor(type, combo);
            const expect = evalLogicIc(type, combo);
            if (expect === 1) {
                assert.ok(lit > 0.1, `${type}(${combo}) = 1 -> LED lit, got ${lit}`);
            } else {
                assert.ok(lit < 0.05, `${type}(${combo}) = 0 -> LED dark, got ${lit}`);
            }
        }
    });
}

test('buildLogicIcGate places the chip, a switch per input, and an output LED', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcGate(c, 'nand');
    const kinds = {};
    for (const p of c.parts) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    assert.equal(kinds['74hc00'], 1, 'the NAND chip is placed');
    assert.equal(kinds.switch, 2, 'a switch per input');
    assert.equal(kinds.led, 1, 'an output LED');
    assert.ok(kinds.vcc >= 1 && kinds.gnd >= 1, 'powered');
});

test('a fresh build clears the previous one', () => {
    const c = new Circuit(5.0);
    buildLogicIcGate(c, 'and');
    const n1 = c.parts.length;
    buildLogicIcGate(c, 'or');
    assert.equal(c.parts.length, n1, 'rebuilding replaces rather than accretes');
});
