/**
 * The gate-level tier, and the loop it closes.
 *
 * Until this existed the pin bridge had nowhere to get values, and every output
 * correctly read "undriven". The last test here is the whole point of the FPGA
 * work: a synthesised design's output lights a real LED on the breadboard,
 * through the real solver.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boot} from '../scripts/lesson-bench.mjs';
import {GateLevelSim, fromYosys} from '../overlay/scratch-gui/src/lib/bw-fpga/sim.js';
import {parseCst} from '../overlay/scratch-gui/src/lib/bw-fpga/cst.js';
import {bridge} from '../overlay/scratch-gui/src/lib/bw-fpga/port-bridge.js';
import {applyPortValues} from '../overlay/scratch-gui/src/lib/bw-fpga/drive.js';
import {readPorts} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys.js';

const require = createRequire(import.meta.url);
const PART = require('bw-circuit-ui/parts-data/tang_nano_20k.json');
// digitaljs's ESM source cannot load under Node (@joint/core is CommonJS and
// does not export what it destructures) and its CommonJS build is not
// deep-importable (the package exports no subpaths). require() reaches the
// working build; webpack reaches the same file by alias. That split is exactly
// why GateLevelSim takes the engine as an argument.
const engine = require('digitaljs');
const {Circuit} = await boot();
const MS = 1_000_000n;

// digitaljs's own format. Hand-written for the same reason the Yosys fixtures
// are: the point is to exercise OUR wrapper, and a fixture produced by a
// toolchain we do not run would prove nothing about it.
const andGate = () => ({
    devices: {
        a: {type: 'Input', net: 'a', order: 0, bits: 1},
        b: {type: 'Input', net: 'b', order: 1, bits: 1},
        out: {type: 'Output', net: 'out', order: 2, bits: 1},
        g: {type: 'And', bits: 1}
    },
    connectors: [
        {from: {id: 'a', port: 'out'}, to: {id: 'g', port: 'in1'}},
        {from: {id: 'b', port: 'out'}, to: {id: 'g', port: 'in2'}},
        {from: {id: 'g', port: 'out'}, to: {id: 'out', port: 'in'}}
    ],
    subcircuits: {}
});

test('the headless simulator gives a correct truth table', () => {
    const sim = new GateLevelSim(andGate(), engine);
    const table = [];
    for (const [av, bv] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        sim.setInput('a', av).setInput('b', bv);
        const {settled} = sim.settle();
        assert.ok(settled, 'an AND gate must settle');
        table.push(sim.getOutput('out'));
    }
    assert.deepEqual(table, ['0', '0', '0', '1']);
});

test('settling is BOUNDED — a non-settling engine reports, it does not hang', () => {
    // Tested against a STUB engine that never runs out of events, not against a
    // real design. The first version of this test assumed a NOT gate feeding
    // itself would spin; digitaljs settles it to x instead, because it is a
    // three-valued simulator and x is the right answer. That made the test pass
    // for a reason unrelated to the guard.
    //
    // The guard is ours, so the test drives it directly. A tab that spun here
    // would be worse than one that refused.
    const neverSettles = {
        HeadlessCircuit: function () {
            this.hasPendingEvents = true;
            this.updateGates = () => {};
        }
    };
    const sim = new GateLevelSim({devices: {}, connectors: [], subcircuits: {}}, neverSettles);
    const r = sim.settle();
    assert.equal(r.settled, false);
    assert.ok(r.steps > 1000, 'the bound must actually be tried before giving up');
    assert.match(r.reason, /combinational loop/);
});

test('a real feedback loop settles to x, and x never reaches the board', () => {
    // What digitaljs actually does with a NOT gate feeding itself. The value is
    // undefined, and an undefined signal must not be coerced to a level.
    const sim = new GateLevelSim({
        devices: {
            out: {type: 'Output', net: 'out', order: 0, bits: 1},
            n: {type: 'Not', bits: 1}
        },
        connectors: [
            {from: {id: 'n', port: 'out'}, to: {id: 'n', port: 'in'}},
            {from: {id: 'n', port: 'out'}, to: {id: 'out', port: 'in'}}
        ],
        subcircuits: {}
    }, engine);
    assert.ok(sim.settle().settled, 'digitaljs resolves this rather than spinning');
    const {values, problems} = sim.outputValues({out: {direction: 'output'}});
    assert.deepEqual(values, {}, 'an x must not become a driven level');
    assert.deepEqual(problems.map(p => p.code), ['undefined-output']);
});

test('an output that never settles to 0 or 1 is OMITTED, not guessed', () => {
    // An unconnected Output reads as undefined. Coercing that to false would put
    // a confident wrong level on a real pin.
    const sim = new GateLevelSim({
        devices: {floating: {type: 'Output', net: 'floating', order: 0, bits: 1}},
        connectors: [], subcircuits: {}
    }, engine);
    sim.settle();
    const {values, problems} = sim.outputValues({floating: {direction: 'output'}});
    assert.deepEqual(values, {}, 'nothing may be driven from an undefined output');
    assert.deepEqual(problems.map(p => p.code), ['undefined-output']);
});

test('a malformed netlist is a named problem, not a throw', () => {
    const {circuit, problems} = fromYosys({not: 'a netlist'});
    assert.equal(circuit, null);
    assert.deepEqual(problems.map(p => p.code), ['conversion-failed']);
});

// A T flip-flop: Q toggles on every rising edge of clk (D is fed by ~Q). The
// initial is pinned to 0 so the design is defined before the first clock, which
// is the same thing the tab's reset does for a real counter.
const toggleFF = () => ({
    devices: {
        clk: {type: 'Input', net: 'clk', order: 0, bits: 1},
        q: {type: 'Output', net: 'q', order: 1, bits: 1},
        ff: {type: 'Dff', bits: 1, initial: '0', polarity: {clock: true}},
        inv: {type: 'Not', bits: 1}
    },
    connectors: [
        {from: {id: 'clk', port: 'out'}, to: {id: 'ff', port: 'clk'}},
        {from: {id: 'ff', port: 'out'}, to: {id: 'inv', port: 'in'}},
        {from: {id: 'inv', port: 'out'}, to: {id: 'ff', port: 'in'}},
        {from: {id: 'ff', port: 'out'}, to: {id: 'q', port: 'in'}}
    ],
    subcircuits: {}
});

test('tickClock advances a clocked design one whole cycle at a time', () => {
    const sim = new GateLevelSim(toggleFF(), engine);
    sim.settle();
    assert.equal(sim.getOutput('q'), '0', 'the flop holds its initial before any clock');
    const seen = [];
    for (let i = 0; i < 4; i++) {
        const r = sim.tickClock('clk', 1);
        assert.ok(r.settled, 'a single flop must settle each edge');
        assert.equal(r.cycles, 1);
        seen.push(sim.getOutput('q'));
    }
    assert.deepEqual(seen, ['1', '0', '1', '0'], 'each cycle is one toggle');
});

test('tickClock runs many cycles in one call', () => {
    const sim = new GateLevelSim(toggleFF(), engine);
    sim.settle();
    const r = sim.tickClock('clk', 8);   // even number of toggles -> back to 0
    assert.ok(r.settled);
    assert.equal(r.cycles, 8);
    assert.equal(sim.getOutput('q'), '0');
});

test('tickClock is BOUNDED — an edge that never settles reports, it does not hang', () => {
    const neverSettles = {
        HeadlessCircuit: function () {
            this.hasPendingEvents = true;
            this.setInput = () => {};
            this.updateGates = () => {};
        }
    };
    const sim = new GateLevelSim({devices: {}, connectors: [], subcircuits: {}}, neverSettles);
    const r = sim.tickClock('clk', 5);
    assert.equal(r.settled, false);
    assert.equal(r.cycles, 0, 'it failed on the first edge, so no cycle completed');
    assert.match(r.reason, /combinational loop/);
});

test('THE LOOP: a design output lights a real LED on the breadboard', () => {
    // sim -> outputValues -> bridge bindings -> setPin -> MNA solver -> LED.
    const sim = new GateLevelSim(andGate(), engine);
    const ports = {
        a: {direction: 'input', width: 1},
        b: {direction: 'input', width: 1},
        out: {direction: 'output', width: 1}
    };
    const {constraints} = parseCst('IO_LOC "out" 73;');
    const {bindings, refusals} = bridge({constraints, part: PART, netlistPorts: ports});
    assert.deepEqual(refusals.filter(r => r.code !== 'port-unplaced'), []);

    const c = new Circuit(3.3);
    const tang = c.addPart('tang_nano_20k', {}, 0, 0);
    const r = c.addPart('resistor', {ohms: 330}, 0, 0);
    const led = c.addPart('led', {}, 0, 0);
    const gnd = c.addPart('gnd', {}, 0, 0);
    c.addWire(tang.id, 'p73', r.id, 'a');
    c.addWire(r.id, 'b', led.id, 'anode');
    c.addWire(led.id, 'cathode', gnd.id, 'gnd');

    const run = (av, bv) => {
        sim.setInput('a', av).setInput('b', bv);
        assert.ok(sim.settle().settled);
        const {values} = sim.outputValues(ports);
        applyPortValues(c, bindings, values);
    };

    run(1, 0);
    c.advanceTo(25n * MS);
    assert.ok(c.board.ledBrightness(led.id) < 0.05, 'AND of 1,0 is 0 — the LED must be dark');

    run(1, 1);
    c.advanceTo(50n * MS);
    const lit = c.board.ledBrightness(led.id);
    assert.ok(lit > 0.1, `AND of 1,1 is 1 — the LED must light, got ${lit}`);

    const mA = -c.board.branchCurrent(led.id, 'anode') * 1000;
    assert.ok(mA > 2 && mA < 6, `${mA.toFixed(2)} mA is not a 330R red LED at 3.3 V`);
});
