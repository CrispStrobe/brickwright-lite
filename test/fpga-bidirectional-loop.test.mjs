/**
 * The bidirectional loop, end to end, through the REAL solver — no browser, no
 * synthesis, no mock. This is the deterministic node twin of the manual browser
 * LOOK that proved "close the breadboard switch and the FPGA output LED lights":
 * it drives the whole round-trip the fpga-tab's read-poll drives —
 *
 *     board.readPin  ->  readBoardInputs  ->  design (led = btn)  ->
 *     applyPortValues  ->  board.setPin  ->  the LED
 *
 * so a break anywhere along it — the Tang losing its pins (the tang_nano_20k
 * sidecar regression), readBoardInputs assembling the wrong bit, applyPortValues
 * driving the wrong terminal — fails here rather than only in a hand-run browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildDemoBoard} from '../overlay/scratch-gui/src/lib/bw-fpga/demo-board.js';
import {parseCst} from '../overlay/scratch-gui/src/lib/bw-fpga/cst.js';
import {bridge} from '../overlay/scratch-gui/src/lib/bw-fpga/port-bridge.js';
import {applyPortValues, readBoardInputs} from '../overlay/scratch-gui/src/lib/bw-fpga/drive.js';

const require = createRequire(import.meta.url);
const PART = require('bw-circuit-ui/parts-data/tang_nano_20k.json');
const {Circuit} = await boot();
const MS = 1_000_000n;

// One turn of the loop the fpga-tab runs on a timer: read the board's input
// pins, evaluate the design, drive its outputs back onto the board.
function turn (c, bindings, board, design) {
    const inputs = readBoardInputs(bindings, board);
    const outputs = design(inputs);
    applyPortValues(c, bindings, outputs);
    return {inputs, outputs};
}

test('the bidirectional loop closes: a breadboard switch drives the FPGA output LED (led = btn)', () => {
    const c = new Circuit(5.0);
    const {switches, leds} = buildDemoBoard(c, {pins: [73], inputPins: [74]});
    assert.equal(switches.length, 1);
    assert.equal(leds.length, 1);
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);

    // Bindings exactly as the tab derives them: btn reads pin 74, led drives 73.
    const {constraints} = parseCst('IO_LOC "btn" 74;\nIO_LOC "led" 73;');
    const {bindings, refusals} = bridge({
        constraints, part: PART,
        netlistPorts: {btn: {direction: 'input'}, led: {direction: 'output'}}
    });
    assert.deepEqual(refusals, [], 'both ports must reach the header');
    // Put the input pin high-Z so the breadboard, not the FPGA, decides it.
    applyPortValues(c, bindings, {});

    const design = ins => ({led: ins.btn === 1});

    // Switch OPEN: btn reads 0, led computes 0, the LED stays dark.
    board.setControl(switches[0].switch, 0);
    c.advanceTo(25n * MS);
    const open = turn(c, bindings, board, design);
    c.advanceTo(50n * MS);
    assert.equal(open.inputs.btn, 0, 'an open switch reads btn = 0');
    assert.ok(board.ledBrightness(leds[0].led) < 0.05, 'btn 0 -> led 0 -> LED dark');

    // Switch CLOSED: btn reads 1, led computes 1, the LED lights — the loop.
    board.setControl(switches[0].switch, 1);
    c.advanceTo(75n * MS);
    const closed = turn(c, bindings, board, design);
    c.advanceTo(100n * MS);
    assert.equal(closed.inputs.btn, 1, 'a closed switch reads btn = 1');
    assert.equal(closed.outputs.led, true, 'led = btn, so led computes 1');
    assert.ok(board.ledBrightness(leds[0].led) > 0.1,
        'btn 1 -> led 1 -> the output LED lights: the loop ran both ways through the solver');

    // And back OPEN: the LED must follow down, not latch.
    board.setControl(switches[0].switch, 0);
    c.advanceTo(125n * MS);
    turn(c, bindings, board, design);
    c.advanceTo(150n * MS);
    assert.ok(board.ledBrightness(leds[0].led) < 0.05, 'reopening the switch takes the LED back dark');
});
