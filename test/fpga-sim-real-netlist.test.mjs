/**
 * The gate-level sim, fed a REAL synthesised netlist — the case every other test
 * dodged by hand-writing digitaljs fixtures.
 *
 * These fixtures come out of `yosys` (via bw-synth's generic sim-netlist pass:
 * `read_verilog; hierarchy; proc; opt; memory -nomap; wreduce -memx; opt -full;
 * write_json`), NOT hand-written. That difference is the whole point: real
 * yosys2digitaljs output names its devices dev0/dev1/... and carries the port
 * name in `net`, whereas the hand fixtures used net-as-id. GateLevelSim addressed
 * ports by name, so it drove the fixtures and silently failed on real output
 * (setInput('clk') -> getCell(undefined)). This holds the fix.
 *
 * No lesson-bench boot() here: this exercises sim.js against the digitaljs engine
 * only, so it runs without the circuit/board layer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {GateLevelSim, fromYosys} from '../overlay/scratch-gui/src/lib/bw-fpga/sim.js';
import {readPorts, detectClockPort} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys.js';

const require = createRequire(import.meta.url);
const engine = require('digitaljs');
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/fpga/${name}`, import.meta.url)));

test('a real combinational netlist drives its output (blink: led tied high)', () => {
    const nl = fixture('blink-sim.json');
    const {ports, top} = readPorts(nl);
    assert.equal(top, 'blink', 'readPorts finds the binary-marked top');
    const {circuit, problems} = fromYosys(nl);
    assert.deepEqual(problems, [], 'a generic netlist converts cleanly');
    const sim = new GateLevelSim(circuit, engine);
    assert.ok(sim.settle().settled);
    // The whole point: a REAL netlist's port is addressable and driven.
    assert.deepEqual(sim.outputValues(ports).values, {led: true},
        'led must settle HIGH — this failed before the net->id fix');
});

test('a real SEQUENTIAL netlist counts when clocked (the #2 payoff, end to end)', () => {
    const nl = fixture('sequence-sim.json');
    const {ports} = readPorts(nl);
    const clk = detectClockPort(ports);
    assert.equal(clk, 'clk');
    const {circuit, problems} = fromYosys(nl);
    assert.deepEqual(problems, []);

    // This mirrors THE TAB EXACTLY: it rebuilds the sim from scratch on every
    // step (deps [netlistText, inputs, clockCycles]) and only ever tickClocks —
    // it never asserts-then-releases a reset. So the design must be reset-FREE
    // with an initialised register: cnt starts defined at 0 (the flop's `initial`,
    // from the Verilog `= 0`) and counts on the clock alone. An async-reset design
    // would sit at x here, which is why the example carries no rst_n.
    const step = n => {
        const sim = new GateLevelSim(circuit, engine);   // fresh, like the tab
        if (n > 0) assert.ok(sim.tickClock(clk, n).settled, 'each edge settles');
        else assert.ok(sim.settle().settled);
        return sim.outputValues(ports).values.led;
    };
    assert.equal(step(0), 0, 'the initialised counter is a defined 0 before any clock');
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(step),
        [1, 2, 3, 4, 5, 6],
        'the counter advances one per clock, from scratch each time — what the tab does');
});

test('port addressing is by NET name even when device ids are dev0/dev1', () => {
    // Guards the fix directly: the fixture's Input devices are dev-N, and the
    // ports must still be reachable by their declared names.
    const nl = fixture('sequence-sim.json');
    const {circuit} = fromYosys(nl);
    const sim = new GateLevelSim(circuit, engine);
    // If addressing regressed to device-id, these throw "Invalid call to setInput".
    assert.doesNotThrow(() => sim.setInput('clk', 0, 1).setInput('clk', 1, 1));
    assert.doesNotThrow(() => sim.getOutput('led'));
});

test('the LED chaser rotates a single lit bit (real netlist, clock-only)', () => {
    const nl = fixture('chaser-sim.json');
    const {ports} = readPorts(nl);
    assert.equal(detectClockPort(ports), 'clk');
    const {circuit, problems} = fromYosys(nl);
    assert.deepEqual(problems, []);
    // Mirror the tab: fresh sim per step, clock-only, from an initialised flop.
    const step = n => {
        const sim = new GateLevelSim(circuit, engine);
        if (n > 0) assert.ok(sim.tickClock('clk', n).settled);
        else assert.ok(sim.settle().settled);
        return sim.outputValues(ports).values.led;
    };
    assert.equal(step(0), 1, 'the light starts at led[0] (0001)');
    assert.deepEqual([1, 2, 3, 4, 5].map(step), [2, 4, 8, 1, 2],
        'the lit bit rotates left and wraps: 0001→0010→0100→1000→0001→0010');
});
