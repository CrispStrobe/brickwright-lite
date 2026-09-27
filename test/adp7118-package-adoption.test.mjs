import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';
import {REFUSED} from '../overlay/scratch-gui/src/lib/bw-parts/profiles.js';

const root = path.resolve(import.meta.dirname, '..');
const fixture = JSON.parse(readFileSync(
    path.join(root, 'test/fixtures/adp7118-fixed-regulator.json'), 'utf8'));
const terminals = ['vout_1', 'vout_2', 'sense_adj', 'gnd', 'en', 'ss', 'vin_7', 'vin_8'];

test('the exact installed packages expose and solve the physical ADP7118', async () => {
    const pins = JSON.parse(readFileSync(path.join(root, 'vendor-pins.json'), 'utf8'));
    assert.equal(pins['bw-board'], 'eddc5f8b295a575056817f31856699febe06ef9d');
    assert.equal(pins['bw-circuit-ui'], 'ea94554dc0fd8d329bc3349d8abe5be6601ddfcb');

    const sidecar = JSON.parse(readFileSync(
        path.join(root, 'node_modules/bw-circuit-ui/src/parts-data/adp7118.json'), 'utf8'));
    assert.equal(sidecar.kind, 'adp7118');
    assert.deepEqual(sidecar.terminals.map(pin => pin.name), terminals);
    assert.equal(Object.hasOwn(sidecar, 'footprint'), false,
        'the SMT-only package must not acquire an invented breadboard seating');
    assert.ok(REFUSED.passive.includes('adp7118'),
        'the circuit-driven regulator must not be presented as a programmable Code-tab part');

    const {Circuit} = await loadCircuitModel(root);
    const circuit = Circuit.fromJSON(structuredClone(fixture));
    assert.equal(circuit.netlistError, null);
    circuit.board.advanceTo(10_000n);
    const output = circuit.board.nets.find(item => item.terminals.some(endpoint =>
        endpoint.part === 'u1' && endpoint.terminal === 'vout_1'));
    assert.ok(output, 'ADP7118 output must belong to a solved net');
    assert.ok(Math.abs(circuit.board.nodeVoltage(output.id) - 5) < 0.002,
        `physical ADP7118 output was ${circuit.board.nodeVoltage(output.id)} V`);
});

test('the production browser gate requires the ADP7118 face, pins and live solve', () => {
    const source = readFileSync(path.join(root, 'scripts/verify-circuit-rendering.mjs'), 'utf8');
    assert.match(source, /data-part-face="adp7118"/);
    assert.match(source, /adp7118\.terminals === 8/);
    assert.match(source, /Math\.abs\(adp7118\.output - 5\) < 0\.002/);
});
