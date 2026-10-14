/**
 * The FPGA demo board, through the REAL circuit solver — not a mock.
 *
 * buildDemoBoard wires a Tang Nano's header pins to breadboard parts. The unit
 * tests for it (fpga-demo-board.test.mjs) assert addPart/addWire were CALLED,
 * which passes just as happily when the Tang has no header terminals and every
 * wire is silently dropped — the exact defect that shipped when tang_nano_20k
 * was missing from bw-circuit-ui's generated sidecar index and addPart returned
 * a 2-terminal ['a','b'] stub. This test builds the board on a live Circuit and
 * asserts the loop actually conducts: closing the input switch drives the FPGA
 * INPUT pin high (read path), and driving an OUTPUT pin lights its LED (write
 * path). A dropped Tang wire cannot fake either.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildDemoBoard} from '../overlay/scratch-gui/src/lib/bw-fpga/demo-board.js';

const {Circuit} = await boot();
const MS = 1_000_000n;

test('a demo-board input switch drives the FPGA input pin through the real solver', () => {
    const c = new Circuit(5.0);
    // Output LED on pin 73, input switch on pin 74 (the Button->LED example's pins).
    const {tang, switches, leds} = buildDemoBoard(c, {pins: [73], inputPins: [74]});
    assert.equal(switches.length, 1, 'an input pin must get a switch');
    assert.equal(leds.length, 1, 'an output pin must get an LED');
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);

    // The Tang's header pins must actually be modelled terminals on live nets —
    // not the ['a','b'] stub that drops every wire.
    const tangPart = c.getPart(tang);
    assert.ok((tangPart.terminals || []).includes('p74'),
        'the Tang part must expose header pin p74 (sidecar registered), not an [a,b] stub');
    assert.ok((tangPart.terminals || []).includes('p73'),
        'the Tang part must expose header pin p73');

    // READ PATH: switch open -> input reads 0; switch closed -> input reads 1.
    board.setControl(switches[0].switch, 0);
    c.advanceTo(25n * MS);
    assert.equal(board.readPin('p74'), 0, 'an open switch leaves the input low');
    board.setControl(switches[0].switch, 1);
    c.advanceTo(50n * MS);
    assert.equal(board.readPin('p74'), 1,
        'closing the breadboard switch must drive the FPGA input pin high');
});

test('a demo-board output pin lights its LED through the real solver', () => {
    const c = new Circuit(5.0);
    const {leds} = buildDemoBoard(c, {pins: [73], inputPins: [74]});
    const board = c.board;
    if (typeof board.setPower === 'function') board.setPower(true);

    board.setPin('p73', 'pushpull', 0);
    c.advanceTo(25n * MS);
    assert.ok(board.ledBrightness(leds[0].led) < 0.05, 'output low -> LED dark');
    board.setPin('p73', 'pushpull', 1);
    c.advanceTo(50n * MS);
    const lit = board.ledBrightness(leds[0].led);
    assert.ok(lit > 0.1, `driving the output pin high must light its LED, got ${lit}`);
});

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);

test('the pinned bw-circuit-ui registers tang_nano_20k in its generated sidecar index', () => {
    // The browser bundle reads sidecars ONLY from parts-data/index.js. Node tests
    // (boot() above) read the directory, so they cannot see a stale index — this
    // reads the pinned vendor's generated index as text and asserts the Tang is
    // registered, so a pin bumped back to a stale-index bw-circuit-ui is caught.
    const idxPath = require.resolve('bw-circuit-ui/parts-data/index.js');
    const idx = readFileSync(idxPath, 'utf8');
    assert.match(idx, /tang_nano_20k\.json/,
        'the pinned bw-circuit-ui must register tang_nano_20k in parts-data/index.js '
        + '(the browser sidecar source) — otherwise the Tang loses its header pins in '
        + 'the bundle and the FPGA demo board is silently disconnected');
});
