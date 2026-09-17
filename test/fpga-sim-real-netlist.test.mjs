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
    const sim = new GateLevelSim(circuit, engine);

    // Held in reset: the counter is a defined 0 (not x).
    sim.setInput('rst_n', 0, 1);
    assert.ok(sim.settle().settled);
    assert.equal(sim.outputValues(ports).values.led, 0, 'reset holds the counter at 0');

    // Release reset and step the clock: the LEDs count up in binary.
    sim.setInput('rst_n', 1, 1);
    const seen = [];
    for (let i = 0; i < 6; i++) {
        const r = sim.tickClock(clk, 1);
        assert.ok(r.settled, 'each edge settles');
        seen.push(sim.outputValues(ports).values.led);
    }
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6],
        'the counter advances one per clock — this is what reaches the board');
});

test('port addressing is by NET name even when device ids are dev0/dev1', () => {
    // Guards the fix directly: the fixture's Input devices are dev-N, and the
    // ports must still be reachable by their declared names.
    const nl = fixture('sequence-sim.json');
    const {circuit} = fromYosys(nl);
    const sim = new GateLevelSim(circuit, engine);
    // If addressing regressed to device-id, these throw "Invalid call to setInput".
    assert.doesNotThrow(() => sim.setInput('clk', 0, 1).setInput('rst_n', 1, 1));
    assert.doesNotThrow(() => sim.getOutput('led'));
});
