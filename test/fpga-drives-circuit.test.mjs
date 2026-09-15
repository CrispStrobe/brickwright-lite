/**
 * The end of the bridge: an FPGA design's port lights a real LED on the
 * breadboard, through the real solver.
 *
 * This is the claim TN2b exists to make true, so it is tested against the
 * actual circuit engine rather than a mock of setPin. A test that asserted
 * "setPin was called" would pass just as happily if the Tang Nano part were not
 * wired into the engine at all, which is the exact defect PASSTHROUGH_KINDS was
 * added to prevent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boot} from '../scripts/lesson-bench.mjs';
import {parseCst} from '../overlay/scratch-gui/src/lib/bw-fpga/cst.js';
import {bridge} from '../overlay/scratch-gui/src/lib/bw-fpga/port-bridge.js';
import {applyPortValues} from '../overlay/scratch-gui/src/lib/bw-fpga/drive.js';

const require = createRequire(import.meta.url);
const PART = require('bw-circuit-ui/parts-data/tang_nano_20k.json');
const {Circuit} = await boot();
const MS = 1_000_000n;

// One Tang Nano pin -> 330R -> LED -> ground.
//
// The return leg goes to a `gnd` PART, not to the board's own gnd_1 terminal.
// tang_nano_20k is a PASSTHROUGH kind: the engine models its pins as driveable
// terminals and nothing else, so its power and ground pins are inert -- they
// are places to wire, not sources. Wiring the cathode to gnd_1 leaves the loop
// open and the LED reads 1.3e-10, which looks exactly like "the bridge does not
// work" and is really "there is no return path".
function bench (pin) {
    const c = new Circuit(3.3);
    const tang = c.addPart('tang_nano_20k', {}, 0, 0);
    const r = c.addPart('resistor', {ohms: 330}, 0, 0);
    const led = c.addPart('led', {}, 0, 0);
    const gnd = c.addPart('gnd', {}, 0, 0);
    const terminal = PART.terminals.find(t => t._fpgaPin === pin).name;
    c.addWire(tang.id, terminal, r.id, 'a');
    c.addWire(r.id, 'b', led.id, 'anode');
    c.addWire(led.id, 'cathode', gnd.id, 'gnd');
    return {c, led, terminal};
}

test('a bound output port lights a real LED through the real solver', () => {
    const {c, led} = bench(73);
    const {constraints} = parseCst('IO_LOC "led" 73;');
    const {bindings, refusals} = bridge({
        constraints, part: PART, netlistPorts: {led: {direction: 'output'}}
    });
    assert.deepEqual(refusals, [], 'the bench pin must be reachable');

    applyPortValues(c, bindings, {led: false});
    c.advanceTo(25n * MS);
    assert.ok(c.board.ledBrightness(led.id) < 0.05,
        'a port driven low must leave the LED dark');

    applyPortValues(c, bindings, {led: true});
    c.advanceTo(50n * MS);
    const lit = c.board.ledBrightness(led.id);
    assert.ok(lit > 0.1, `a port driven high must light the LED, got ${lit}`);

    // And the current is right, which a wiring bug cannot fake: 3.3 V across
    // 330R and a red LED's ~2 V drop is a few mA. Positive-OUT contract, so the
    // anode -- which the current ENTERS -- reads negative.
    const mA = -c.board.branchCurrent(led.id, 'anode') * 1000;
    assert.ok(mA > 2 && mA < 6, `${mA.toFixed(2)} mA is not a 330R red LED at 3.3 V`);
});

test('a bus drives bit by bit, and the bit order is the written one', () => {
    const {c, led} = bench(74);
    const {constraints} = parseCst('IO_LOC "q[0]" 73;\nIO_LOC "q[1]" 74;');
    const {bindings} = bridge({constraints, part: PART, netlistPorts: {q: {direction: 'output'}}});

    // 0b10 -> bit 1 high, which is the pin the LED is on.
    applyPortValues(c, bindings, {q: 0b10});
    c.advanceTo(25n * MS);
    assert.ok(c.board.ledBrightness(led.id) > 0.1, 'bit 1 high must light the LED on pin 74');

    applyPortValues(c, bindings, {q: 0b01});
    c.advanceTo(50n * MS);
    assert.ok(c.board.ledBrightness(led.id) < 0.05, 'bit 1 low must darken it again');
});

test('an input port is high-Z, not driven low', () => {
    // The difference matters electrically: a design that READS a pin must not
    // fight whatever the breadboard has on it.
    const {c} = bench(73);
    const calls = [];
    const spy = {setPin: (...a) => calls.push(a)};
    const {bindings} = bridge({
        constraints: parseCst('IO_LOC "btn" 73;').constraints,
        part: PART, netlistPorts: {btn: {direction: 'input'}}
    });
    applyPortValues(spy, bindings, {});
    assert.deepEqual(calls, [['p73', 'input']]);
    assert.ok(c);
});

test('an output nobody drives is REPORTED, not quietly pulled low', () => {
    const {bindings} = bridge({
        constraints: parseCst('IO_LOC "led" 73;').constraints,
        part: PART, netlistPorts: {led: {direction: 'output'}}
    });
    const calls = [];
    const {applied, unset} = applyPortValues({setPin: (...a) => calls.push(a)}, bindings, {});
    assert.deepEqual(applied, []);
    assert.deepEqual(calls, [], 'nothing may be driven on the strength of a missing value');
    assert.equal(unset.length, 1);
    assert.equal(unset[0].code, 'no-value-for-port');
    assert.match(unset[0].reason, /floating pin, not a low one/);
});
