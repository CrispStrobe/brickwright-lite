// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Per-step body poses in the measurement observation: requested bodies only, bounded, read only, and absent
// (unchanged selection and samples) when no body is requested.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observationSelection, collectFixedObservations, OBSERVATION_BODY_LIMIT} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/precision.js';

const mechanism = {bodies: [{id: 'ground', motion: 'static'}, ...['a', 'b', 'c', 'd', 'e'].map(id => ({id, motion: 'dynamic'}))],
    joints: [{id: 'j', type: 'slider'}]};
const base = {revision: 1, joints: [], contacts: false, screws: false};

test('a selection without bodies is unchanged', () => {
    assert.deepEqual(observationSelection(base, mechanism), {revision: 1, joints: [], contacts: false, screws: false, mode: 'oscillation', thresholdDegrees: 0});
    assert.equal('bodies' in observationSelection({...base, bodies: []}, mechanism), false);
});
test('bodies are bounded, distinct, known and dynamic', () => {
    assert.equal(OBSERVATION_BODY_LIMIT, 4);
    assert.deepEqual(observationSelection({...base, bodies: ['a', 'b']}, mechanism).bodies, ['a', 'b']);
    for (const bodies of [['a', 'b', 'c', 'd', 'e'], ['a', 'a'], ['ground'], ['nope'], [1], 'a'])
        assert.throws(() => observationSelection({...base, bodies}, mechanism), /invalid measurement observation selection/);
});
test('each fixed step samples exactly the requested bodies and nothing when none is requested', () => {
    let listener = null, steps = 0;
    const core = {observeFixedSteps: fn => { listener = fn; return () => { listener = null; }; },
        jointState: () => ({position: .5, velocity: 0}), jointDynamics: () => null,
        bodyPose: id => ({position: [steps, 0, id === 'a' ? 1 : 2], rotation: [0, 0, 0, 1]})};
    const c = collectFixedObservations(core, mechanism, {...base, joints: ['j'], bodies: ['a', 'b']});
    for (; steps < 3; steps++) listener({t: steps * .005, stepSeconds: .005});
    const packet = c.take();
    assert.equal(packet.samples.length, 3);
    assert.deepEqual(packet.samples[2].bodies, [{id: 'a', position: [2, 0, 1], rotation: [0, 0, 0, 1]}, {id: 'b', position: [2, 0, 2], rotation: [0, 0, 0, 1]}]);
    c.detach();
    const plain = collectFixedObservations(core, mechanism, {...base, joints: ['j']});
    listener({t: 0, stepSeconds: .005});
    assert.equal('bodies' in plain.take().samples[0], false);
    plain.detach();
    const none = collectFixedObservations(core, mechanism, base);
    assert.equal(listener, null, 'no observer without joints or bodies');
    assert.equal(none.take().unavailable, false);
});
