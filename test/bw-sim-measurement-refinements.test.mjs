// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256Text} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/binding-digest.js';
import {createMeasurementReader, measurementPresets, jointBinding, ropeBinding} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {measurementDefinitions} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import {jointTargetContext} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/target-context.js';

const fixture = () => {
    const model = {parts: ['housing', 'motor', 'axle'].map(id => ({id, position: [0, 0, 0]}))};
    const mechanism = {gravity: [0, -9.81, 0], bodies: [
        {id: 'frame', parts: ['housing', 'motor'], massKg: 0.04, motion: 'static', position: [0, 0, 0]},
        {id: 'output', parts: ['motor', 'axle'], massKg: 0.06, motion: 'dynamic', position: [0, 0.1, 0]},
        {id: 'ground', parts: [], massKg: 1000, motion: 'static', position: [0, 0, 0]},
        {id: 'mat-load', parts: ['scenery-token'], massKg: 500, motion: 'dynamic', position: [0, 0, 0]}
    ], joints: [{id: 'joint', type: 'hinge', body1: 'frame', body2: 'output'}],
    couplings: [{kind: 'rope', id: 'rope', parts: ['housing', 'axle'], hook: {body: 'output', local: [0, 0, 0]}, points: [{body: 'frame', local: [0, 1, 0]}]}]};
    const core = {bodyPose: id => ({position: mechanism.bodies.find(b => b.id === id).position.slice(), rotation: [0, 0, 0, 1]}),
        jointState: () => ({angle: Math.PI / 3, velocity: 0}), ropeState: () => [{tension: 0.2}], rollingWheel: () => null};
    return {model, mechanism, core};
};

test('compact identity digest matches NIST vectors and independent native SHA-256 across padding and Unicode', () => {
    assert.equal(sha256Text(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const text of [55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 4096, 8071].map(n => 'x'.repeat(n)).concat([
        'Längsträger 🧱 ↔ 轴', JSON.stringify(['\ud800', '\ud801']), 'a'.repeat(1000000)
    ])) assert.equal(sha256Text(text), createHash('sha256').update(text).digest('hex'));
    assert.throws(() => sha256Text(null), TypeError);
});

test('350-part identity fits the original field bound without truncating target membership', () => {
    const s = fixture(), ids = Array.from({length: 350}, (_, i) => `structural-part-${String(i).padStart(4, '0')}`);
    s.model.parts = [...ids, 'axle'].map(id => ({id, position: [0, 0, 0]}));
    s.mechanism.couplings = [];
    s.mechanism.bodies[0].parts = ids;
    s.mechanism.bodies[1].parts = ['axle'];
    const joint = s.mechanism.joints[0];
    const raw = JSON.stringify(['hinge', ids.slice().sort(), ['axle']]);
    assert.ok(raw.length > 4096);
    const binding = jointBinding(s.mechanism, joint);
    assert.equal(binding, `sha256:${createHash('sha256').update(raw).digest('hex')}`);
    assert.equal(binding.length, 71);
    const definition = {id: 'angle', label: 'Loaded hinge', kind: 'jointAngle', joint: joint.id, binding};
    assert.ok(measurementDefinitions([definition]));
    assert.throws(() => measurementDefinitions([{...definition, binding: raw}]), /joint binding/, 'the original field bound is still enforced');
    assert.ok(measurementPresets(s).some(d => d.kind === 'jointAngle'));
    const reader = createMeasurementReader(s);
    assert.ok(reader.read([definition])[0].available);
    ids[349] = 'replacement-at-the-end';
    assert.equal(reader.read([definition])[0].reason, 'missing-target', 'the complete membership, including its last element, participates in identity');
});

test('legacy joint and rope bindings still read, and changed targets invalidate both formats', () => {
    const s = fixture(), joint = s.mechanism.joints[0], rope = s.mechanism.couplings[0];
    const legacyJoint = JSON.stringify(['hinge', ['housing', 'motor'], ['axle', 'motor']]);
    const legacyRope = JSON.stringify(['housing', 'axle']);
    const definitions = [
        {id: 'old-angle', label: 'Angle', kind: 'jointAngle', joint: joint.id, binding: legacyJoint},
        {id: 'new-angle', label: 'Angle', kind: 'jointAngle', joint: joint.id, binding: jointBinding(s.mechanism, joint)},
        {id: 'old-rope', label: 'Tension', kind: 'tension', rope: rope.id, binding: legacyRope},
        {id: 'new-rope', label: 'Tension', kind: 'tension', rope: rope.id, binding: ropeBinding(rope)}
    ];
    const reader = createMeasurementReader(s);
    const rows = reader.read(measurementDefinitions(definitions));
    assert.ok(rows.every(r => r.available));
    assert.deepEqual(rows.map(r => r.value), [Math.PI / 3 * 180 / Math.PI, Math.PI / 3 * 180 / Math.PI, 0.2, 0.2]);
    s.mechanism.bodies[0].parts = ['different-housing', 'motor'];
    rope.parts = ['different-housing', 'axle'];
    assert.ok(reader.read(definitions).every(r => !r.available && r.reason === 'missing-target'));
});

test('model mass includes fixed pieces and both motor shares once, excluding ground and mat scenery', () => {
    const s = fixture(), reader = createMeasurementReader(s);
    const [total, assembly] = reader.read([
        {id: 'total', label: 'Model', kind: 'modelMass'},
        {id: 'assembly', label: 'Housing', kind: 'mass', targets: ['housing']}
    ]);
    assert.equal(total.value, 100); assert.equal(total.unit, 'g');
    assert.equal(total.source, 'configured-model-mass'); assert.equal(assembly.value, 40);
    assert.equal(measurementPresets(s)[0].kind, 'modelMass');
    s.mechanism.bodies[0].massKg = NaN;
    assert.equal(reader.read([{id: 'bad', label: 'Model', kind: 'modelMass'}])[0].available, false);
});

test('joint options name the connected authored parts and localize the world anchor', () => {
    const s = fixture(), j = s.mechanism.joints[0];
    assert.equal(jointTargetContext(j, s.mechanism), 'housing ↔ motor');
    assert.equal(jointTargetContext({...j, body1: 'world'}, s.mechanism, 'Boden'), 'Boden ↔ motor');
    s.mechanism.bodies[0].parts = ['beam', 'hub']; s.mechanism.hubs = [{id: 'hub', body: 'frame'}];
    assert.equal(jointTargetContext(j, s.mechanism), 'hub ↔ motor');
});
