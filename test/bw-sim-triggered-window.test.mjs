// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementRecorder} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import {measurementExperiments, experimentsToRuns} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
const definitions = [{id: 'angle', kind: 'jointAngle', label: 'Angle', joint: 'j', binding: 'bound', visible: true}];
const modelSha256 = 'a'.repeat(64);
const fixture = () => {
    const session = {}, recorder = createMeasurementRecorder();
    const props = {session, modelKey: 'source', definitions, selected: ['angle'], sampleTime: 0, canonicalModelSha256: modelSha256};
    let rows = [{id: 'angle', unit: '°', source: 'jolt-joint', available: true, value: 12, reason: ''}];
    return {recorder, props, update: (t, fresh = true, overrides = {}) => recorder.update({...props, rows: fresh ? (rows = rows.map(r => ({...r}))) : rows, sampleTime: t, ...overrides})};
};
const window = {schema: 'bw.sim-lab.recording-window.v1', startTimeMs: 200000, durationMs: 1000};
test('long-run window retains no prestart samples, actual late arrival and versioned provenance through reopen', () => {
    const f = fixture(); f.recorder.start({...f.props, window});
    assert.equal(f.update(199000).armed, true); assert.equal(f.recorder.snapshot().sampleCount, 0);
    f.update(200050); f.update(200150); const ended = f.update(201000, false);
    assert.equal(ended.stoppedReason, 'window-complete');
    assert.deepEqual(ended.runs[0].samples.map(s => [s.elapsedMs, s.timeMs]), [[50, 200050], [150, 200150]]);
    const packet = f.recorder.exportExperiments({modelSha256});
    assert.deepEqual(measurementExperiments(JSON.parse(JSON.stringify(packet))).runs[0].window, window);
    assert.deepEqual(experimentsToRuns(packet, {modelSha256})[0].window, window);
    const altered = structuredClone(packet); altered.runs[0].window.startTimeMs++;
    assert.throws(() => measurementExperiments(altered), /window provenance/);
});
test('missed window is not rebased; unchanged row identity cannot suppress deadline cancellation', () => {
    const f = fixture(); f.recorder.start({...f.props, window}); f.update(199000);
    const ended = f.update(201000, false); assert.equal(ended.active, false); assert.equal(ended.stoppedReason, 'window-missed'); assert.equal(ended.runs.length, 0);
});
test('window refuses oversize or past requests; replacement and saving cancel arming', () => {
    const f = fixture();
    assert.throws(() => f.recorder.start({...f.props, window: {...window, durationMs: 60001}}));
    assert.throws(() => f.recorder.start({...f.props, sampleTime: 200001, window}));
    f.recorder.start({...f.props, window}); assert.equal(f.update(1000, true, {session: {}}).stoppedReason, 'session-reset');
    f.recorder.start({...f.props, window}); assert.equal(f.recorder.stop('model-or-project-save').active, false);
    assert.equal(f.recorder.restore(undefined, {modelSha256}).armed, false);
});
