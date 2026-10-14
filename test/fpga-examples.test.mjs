/**
 * The starter designs must actually build and actually reach the board.
 *
 * An example that shows "cannot reach the board" on load, or that names a pin
 * the Tang Nano 20K does not bring out, teaches the first-time user the wrong
 * thing on their first click. So each example's constraints are run through the
 * SAME bridge the tab uses, and every port must bind to a real header pin.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

import {EXAMPLES} from '../overlay/scratch-gui/src/lib/bw-fpga/examples.js';
import {parseCst} from '../overlay/scratch-gui/src/lib/bw-fpga/cst.js';
import {bridge} from '../overlay/scratch-gui/src/lib/bw-fpga/port-bridge.js';

const require = createRequire(import.meta.url);
const TANG = require('bw-circuit-ui/parts-data/tang_nano_20k.json');

test('there are a few examples and each has verilog + a matching cst', () => {
    assert.ok(EXAMPLES.length >= 3, 'a blank box wants more than one way in');
    for (const e of EXAMPLES) {
        assert.ok(e.id && e.label && e.blurb, `${e.id}: needs id/label/blurb`);
        assert.match(e.verilog, /module\s+\w+/, `${e.id}: verilog must declare a module`);
        assert.match(e.cst, /IO_LOC/, `${e.id}: needs pin constraints`);
    }
});

test('every example binds its ports; only on-board clock/reset may miss a header', () => {
    // A starter design's OUTPUTS must reach the breadboard, or the very first
    // click teaches the wrong thing. The one honest exception is a clock or reset
    // that lives on the board (the 27 MHz oscillator, the reset button) — those
    // are real FPGA pins with no header, and flagging them is correct, not a bug.
    for (const e of EXAMPLES) {
        const {constraints, problems} = parseCst(e.cst);
        assert.deepEqual(problems, [], `${e.id}: its own .cst does not parse: ${JSON.stringify(problems)}`);
        const {bindings, refusals} = bridge({constraints, part: TANG});
        assert.ok(bindings.length > 0, `${e.id}: nothing bound`);
        for (const r of refusals) {
            assert.match(r.port, /clk|rst|reset/i,
                `${e.id}: "${r.port}" cannot reach the board and is not an on-board clock/reset — `
                + `a starter example must not strand a real signal: ${r.reason}`);
        }
    }
});

test('the example ids are unique and stable', () => {
    const ids = EXAMPLES.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate example id');
    // blink and counter are the proven reference designs; they must stay.
    assert.ok(ids.includes('blink') && ids.includes('counter'),
        'the two designs the toolchain was proven on must remain as examples');
});
