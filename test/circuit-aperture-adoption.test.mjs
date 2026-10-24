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

for (let key = 1; key <= 8; key++) {
    test(`installed organ Widget key${key} retains actual pulses in audio means and releases`, async () => {
        const {readFileSync} = await import('node:fs');
        const {Circuit} = await loadCircuitModel(root);
        const boardModule = file => import(path.join(root, 'node_modules/bw-board/src', file));
        const {ControllerPanel} = await boardModule('controller.js');
        const {ControllerExtension} = await boardModule('controller-extension.js');
        const {bindPanelToBoard} = await boardModule('controller-binding.js');
        const fixture = path.join(root, 'overlay/scratch-gui/examples/school-miniorgan-107056');
        const circuit = Circuit.fromJSON(JSON.parse(readFileSync(path.join(fixture, 'circuit.json'))));
        const panel = ControllerPanel.fromJSON(JSON.parse(readFileSync(path.join(fixture, 'controller.json'))));
        const extension = new ControllerExtension(); extension.setPanel(panel);
        const binding = bindPanelToBoard(panel, circuit.board);
        try {
            const board = circuit.board, speaker = circuit.parts.find(p => p.label === 'LS-8ohm');
            const signal = board.getNets().find(n => n.terminals.some(t =>
                t.part === speaker.id && t.terminal === 'a')).id;
            board.addScopeChannel({type: 'voltage', netId: signal,
                capture: 'sample', sampleRateHz: 10000, depth: 16000});
            const envelope = board.addScopeChannel({type: 'voltage', netId: signal,
                capture: 'envelope', sampleRateHz: 100000, depth: 16000});
            const mean = board.addScopeChannel({type: 'voltage', netId: signal,
                capture: 'average', sampleRateHz: 100000, depth: 16000});
            extension.setWidget({NAME: `key${key}`, VALUE: 1});
            assert.equal(board.getControl(panel.getWidget(`key${key}`).binding.partId), 1);
            for (let ms = 1; ms <= 90; ms++) circuit.advanceTo(BigInt(ms) * 1000000n);
            const data = board.getScopeData(mean), peaks = board.getScopeData(envelope);
            assert.equal(data.apertureNs, 10000n);
            assert.equal(data.count, 9000);
            const means = Array.from({length: data.count}, (_, i) => data.samples[i * 2]);
            const tail = means.slice(2001), low = Math.min(...tail), high = Math.max(...tail);
            assert.ok(high > low);
            const edges = (values, threshold) => {
                const found = [];
                for (let i = 2001; i < values.length; i++) {
                    if (values[i - 1] < threshold && values[i] >= threshold) found.push(i * .00001);
                }
                return found;
            };
            const captured = edges(means, low + (high - low) * .35);
            const reference = edges(Array.from({length: peaks.count}, (_, i) => peaks.samples[i * 2 + 1]), 4);
            assert.ok(captured.length >= 8);
            assert.ok(Math.abs(captured.length - reference.length) <= 1,
                `${captured.length} mean pulses versus ${reference.length} actual envelope pulses`);
            const frequency = points => (points.length - 1) / (points.at(-1) - points[0]);
            assert.ok(Math.abs(frequency(captured) - frequency(reference)) < 1);
            const target = [261.625565, 293.664768, 329.627557, 349.228231,
                391.995436, 440, 493.883301, 523.251131][key - 1];
            assert.ok(Math.abs(1200 * Math.log2(frequency(captured) / target)) < 5);
            const {scopeAudio} = await consumer('audio/scope-audio.js');
            const audio = scopeAudio(data, {bandwidthHz: 8000});
            assert.equal(audio.sampleRateHz, 100000);
            assert.equal(audio.capture, 'average');
            assert.equal(audio.bandwidthHz, 8000);
            assert.ok(audio.samples.every(Number.isFinite));
            assert.ok(audio.samples.some(value => Math.abs(value) > .00001));
            extension.setWidget({NAME: `key${key}`, VALUE: 0});
            assert.equal(board.getControl(panel.getWidget(`key${key}`).binding.partId), 0);
            for (let ms = 91; ms <= 115; ms++) circuit.advanceTo(BigInt(ms) * 1000000n);
            assert.ok(Math.abs(board.nodeVoltage(signal)) < .001, 'released key settles');
            assert.equal(board.transientAnalysisStatus().accuracyMet, true);
            assert.equal(board.transientAnalysisStatus().failure, null);
        } finally {
            binding.dispose();
        }
    });
}
