import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const consumer = file => import(path.join(root, 'node_modules/bw-circuit-ui/src', file));

async function pulseBench () {
    const {Circuit} = await loadCircuitModel(root);
    const circuit = Circuit.fromJSON({parts: [
        {id: 'pulse', kind: 'vsource', params: {wave: 'spice-pulse',
            v1: 0, v2: 4, td: .000025, tr: .000001, tf: .000001, pw: 0, per: .001}},
        {id: 'load', kind: 'resistor', params: {ohms: 1000}},
        {id: 'ground', kind: 'gnd', params: {}}
    ], wires: [
        {from: {part: 'pulse', terminal: 'pos'}, to: {part: 'load', terminal: 'a'}},
        {from: {part: 'pulse', terminal: 'neg'}, to: {part: 'ground', terminal: 'gnd'}},
        {from: {part: 'load', terminal: 'b'}, to: {part: 'ground', terminal: 'gnd'}}
    ]});
    assert.equal(circuit.netlistError, null);
    circuit.setPower(true);
    const signal = circuit.board.getNets().find(n => n.terminals.some(t =>
        t.part === 'pulse' && t.terminal === 'pos')).id;
    return {board: circuit.board, signal};
}

test('installed aperture capture retains authored triangle area beside unchanged point sampling', async () => {
    const {board, signal} = await pulseBench();
    const point = board.addScopeChannel({type: 'voltage', netId: signal,
        capture: 'sample', sampleRateHz: 10000, depth: 8192});
    const mean = board.addScopeChannel({type: 'voltage', netId: signal,
        capture: 'average', sampleRateHz: 10000, depth: 8192});
    board.advanceTo(100000000n);
    const points = board.getScopeData(point), data = board.getScopeData(mean);
    assert.equal(data.capture, 'average');
    assert.equal(data.apertureNs, 100000n);
    assert.equal(data.sampleIntervalNs, data.apertureNs);
    assert.equal(data.count, 1000);
    assert.ok([...points.samples.slice(0, 2000)].every(v => Math.abs(v) < 1e-8),
        'the control point record really misses the authored sub-cadence pulses');
    const area = Array.from({length: data.count}, (_, i) => data.samples[i * 2])
        .reduce((sum, value) => sum + value * .0001, 0);
    assert.ok(Math.abs(area - 100 * .000004) < 1e-9, `triangle area ${area}`);
    const {scopeAudio, scopeAudioWav} = await consumer('audio/scope-audio.js');
    const audio = scopeAudio(data, {bandwidthHz: 4000});
    assert.equal(audio.capture, 'average');
    assert.equal(audio.apertureNs, data.apertureNs);
    assert.equal(audio.bandwidthHz, 4000);
    assert.ok(audio.samples.some(v => Math.abs(v) > .00001));
    const wav = Buffer.from(scopeAudioWav(data, {bandwidthHz: 4000}));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 10000);
    assert.equal(wav.readUInt32LE(40), audio.samples.length * 2);
    for (let i = 0; i < audio.samples.length; i++) {
        assert.ok(Math.abs(wav.readInt16LE(44 + i * 2) / 32768 - audio.samples[i]) < 2 / 32768,
            'export and replay use the same bounded signal processing');
    }
    assert.throws(() => scopeAudio({...data, apertureNs: 1n}, {bandwidthHz: 4000}),
        /aperture|interval/i, 'invalid duration cannot be rendered as a uniform mean series');
    assert.equal(board.transientAnalysisStatus().accuracyMet, true);
    assert.equal(board.transientAnalysisStatus().failure, null);
    board.reset();
    assert.equal(board.getScopeData(mean).count, 0);
    assert.equal(board.getScopeData(mean).apertureNs, 100000n);
    assert.throws(() => scopeAudio(board.getScopeData(mean), {bandwidthHz: 4000}),
        /sample|capture|data/i, 'reset cannot replay an old ring');
});
