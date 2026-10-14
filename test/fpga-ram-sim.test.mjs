/**
 * A real hosted-Yosys 4x4 RAM netlist through the shipped simulation path.
 * The fixture is local so this regression never needs the network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

import {GateLevelSim, fromYosys} from '../overlay/scratch-gui/src/lib/bw-fpga/sim.js';

const require = createRequire(import.meta.url);
const engine = require('digitaljs');
const fixture = name => readFileSync(new URL(`./fixtures/fpga/${name}`, import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('the captured RAM source and netlist match their synthesis provenance', () => {
    const provenance = JSON.parse(fixture('ram4x4-provenance.json'));
    const source = fixture(provenance.source.path);
    const netlist = fixture(provenance.simNetlist.path);
    assert.equal(sha256(source), provenance.source.sha256, 'generated Verilog changed');
    assert.equal(sha256(netlist), provenance.simNetlist.sha256, 'real Yosys netlist changed');
});

test('real 4x4 RAM netlist preserves synchronous read-before-write and addresses', () => {
    const netlist = JSON.parse(fixture('ram4x4-sim.json'));
    const {circuit, problems} = fromYosys(netlist);
    assert.deepEqual(problems, []);
    const sim = new GateLevelSim(circuit, engine);
    const set = (addr, din, we) => sim.setInput('addr', addr, 2)
        .setInput('din', din, 4).setInput('we', we, 1);
    const edge = () => {
        const result = sim.tickClock('clk', 1);
        assert.equal(result.settled, true);
        return sim.getOutput('q');
    };

    set(0, 0xa, 1);
    assert.equal(edge(), 'xxxx', 'an unwritten word starts unknown');
    set(0, 0, 0);
    assert.equal(edge(), '1010', 'a write becomes readable on the following edge');

    set(0, 0x5, 1);
    assert.equal(edge(), '1010', 'same-edge read returns the value from before the write');
    set(0, 0, 0);
    assert.equal(edge(), '0101', 'the replacement is visible on the next read edge');

    set(1, 0xc, 1);
    assert.equal(edge(), 'xxxx', 'the second unwritten address is independently unknown');
    set(0, 0, 0);
    assert.equal(edge(), '0101', 'writing address 1 did not alter address 0');
    set(1, 0, 0);
    assert.equal(edge(), '1100', 'address 1 retained its own value');
});
