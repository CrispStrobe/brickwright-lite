import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';
import {REFUSED} from '../overlay/scratch-gui/src/lib/bw-parts/profiles.js';

const root = path.resolve(import.meta.dirname, '..');
const fixture = JSON.parse(readFileSync(
    path.join(root, 'test/fixtures/lm741-voltage-follower.json'), 'utf8'));
const terminals = ['offset_1', 'inn', 'inp', 'vneg', 'offset_5', 'out', 'vpos', 'nc'];

test('the exact installed packages expose and solve the physical LM741', async () => {
    const pins = JSON.parse(readFileSync(path.join(root, 'vendor-pins.json'), 'utf8'));
    assert.equal(pins['bw-board'], 'd26e2a878d6d2051449a76af11ea1fe601ce207f');
    assert.equal(pins['bw-circuit-ui'], 'ea94554dc0fd8d329bc3349d8abe5be6601ddfcb');

    const sidecar = JSON.parse(readFileSync(
        path.join(root, 'node_modules/bw-circuit-ui/src/parts-data/lm741.json'), 'utf8'));
    assert.equal(sidecar.kind, 'lm741');
    assert.deepEqual(sidecar.terminals.map(pin => pin.name), terminals);
    assert.deepEqual(sidecar.footprint.leads.out, {dRow: 5, dCol: 2});
    assert.deepEqual(sidecar.footprint.leads.vpos, {dRow: 5, dCol: 1});
    assert.ok(REFUSED['analog-only'].includes('lm741'),
        'the real analog IC must be catalogued without inventing a programmable-part profile');

    const {Circuit} = await loadCircuitModel(root);
    const circuit = Circuit.fromJSON(structuredClone(fixture));
    assert.equal(circuit.netlistError, null);
    circuit.board.advanceTo(10_000n);
    const output = circuit.board.nets.find(item => item.terminals.some(endpoint =>
        endpoint.part === 'u1' && endpoint.terminal === 'out'));
    assert.ok(output, 'LM741 output must belong to a solved net');
    assert.ok(Math.abs(circuit.board.nodeVoltage(output.id) - 1.001) < 0.02,
        `physical LM741 follower output was ${circuit.board.nodeVoltage(output.id)} V`);
});

test('the production browser gate requires the LM741 face, pins and live solve', () => {
    const source = readFileSync(path.join(root, 'scripts/verify-circuit-rendering.mjs'), 'utf8');
    assert.match(source, /data-dip-body="lm741"/);
    assert.match(source, /lm741\.terminals === 8/);
    assert.match(source, /Math\.abs\(lm741\.output - 1\.001\) < 0\.02/);
});
