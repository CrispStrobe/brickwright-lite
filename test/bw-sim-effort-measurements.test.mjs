// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementReader, jointBinding, measurementText} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {measurementDefinitions} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import {inspectAssembly} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/inspection.js';
import {measurementModelContext} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/model-context.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';

const fixture = () => {
    const mechanism = {bodies: [{id: 'a', parts: ['base'], massKg: 0.01}, {id: 'b', parts: ['rotor'], massKg: 0.003}],
        joints: [{id: 'j', type: 'hinge', body1: 'a', body2: 'b'}], couplings: []};
    const dynamic = {configuredMassKg: 0.003, solverMassKg: 0.02, centerOfMassWorld: [1, 2, 3],
        inertiaKgM2: [[0.1, 0, 0], [0, 0.2, 0], [0, 0, 0.3]], motion: 'dynamic', massAdjusted: true, inertiaAdjusted: true};
    const session = {time: 5, mechanism, model: {parts: [{id: 'base'}, {id: 'rotor'}]},
        sample: {motorTorqueNm: -0.002, limitTorqueNm: 0.003, angularVelocityRadS: 4, motorPowerW: -0.008, stepSeconds: 0.005, t: 0.005},
        core: {time: 0.005, jointDynamics: () => session.sample, bodyDynamics: () => dynamic,
            bodyPose: () => ({position: [0, 0, 0], rotation: [0, 0, 0, 1]})}};
    const binding = jointBinding(mechanism, mechanism.joints[0]);
    session.definitions = measurementDefinitions(['motorTorque', 'limitTorque', 'motorPower'].map(kind => ({id: kind, kind, label: kind, joint: 'j', binding})));
    return session;
};
test('signed motor torque, local limit reaction and matching-step power stay distinct', () => {
    const s = fixture(), rows = createMeasurementReader(s).read(s.definitions);
    assert.deepEqual(rows.map(r => r.value), [-0.002, 0.003, -0.008]);
    assert.deepEqual(rows.map(r => r.source), ['jolt-motor-impulse', 'jolt-limit-impulse', 'jolt-motor-power']);
    assert.ok(rows.every(r => r.available && !r.vector));
    assert.equal(measurementText(rows[0]), '-0.002000 N·m');
    s.sample = {...s.sample, motorTorqueNm: 0, motorPowerW: 0, passiveTorqueNm: -0.1};
    assert.deepEqual(createMeasurementReader(s).read(s.definitions).map(r => r.value), [0, 0.003, 0]);
});
test('effort refuses initial, stale, nonfinite and rebound joint observations', () => {
    const s = fixture(), reader = createMeasurementReader(s), good = s.sample;
    for (const sample of [null, {...good, t: 0}, {...good, stepSeconds: 0}]) {
        s.sample = sample; assert.ok(reader.read(s.definitions).every(r => !r.available));
    }
    s.sample = {...good, motorPowerW: NaN}; assert.equal(reader.read(s.definitions)[2].available, false);
    s.sample = good;
    const rebound = s.definitions.map(d => ({...d, binding: 'sha256:wrong-body-membership'}));
    assert.ok(reader.read(rebound).every(r => r.reason === 'missing-target'));
});
test('inspection preserves assembly identity, solver mass and tensor independently of configured mass', () => {
    const s = fixture(), d = inspectAssembly(s, 'b');
    assert.equal(d.configuredMassKg, 0.003); assert.equal(d.solverMassKg, 0.02);
    assert.deepEqual(d.parts, ['rotor']); assert.deepEqual(d.centerOfMassWorld, [1, 2, 3]);
    d.inertiaKgM2[0][0] = 99; d.centerOfMassWorld[0] = 99;
    assert.equal(inspectAssembly(s, 'b').inertiaKgM2[0][0], 0.1);
    assert.equal(inspectAssembly(s, 'b').centerOfMassWorld[0], 1);
    assert.equal(inspectAssembly(s, 'a'), null, 'a different configured mass cannot borrow this observation');
    assert.equal(inspectAssembly(s, 'missing'), null);
    s.core.bodyDynamics = () => ({...d, centerOfMassWorld: [0, 0, 0], motion: 'static', inertiaKgM2: null, solverMassKg: null});
    assert.equal(inspectAssembly(s, 'b').solverMassKg, null);
});
test('model identity survives real LDraw serialization and excludes observations and header names', () => {
    const raw = '0 Original title\n0 Name: original.ldr\n0 !BW ID brick\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n';
    const model = parseModel(raw).model;
    assert.equal(model.parts.length, 1);
    const first = measurementModelContext(model, raw, serializeModel);
    const saved = serializeModel(model, {name: 'renamed.ldr', title: 'Saved project'});
    const reopened = parseModel(saved).model;
    const second = measurementModelContext(reopened, saved, serializeModel);
    assert.equal(second.modelSha256, first.modelSha256); assert.notEqual(second.rawModelSha256, first.rawModelSha256);
    reopened.experiments = {untrusted: true}; reopened.measurements = [{arbitrary: true}];
    assert.equal(measurementModelContext(reopened, saved, serializeModel).modelSha256, first.modelSha256);
    reopened.parts[0].position[0] = 1;
    assert.notEqual(measurementModelContext(reopened, saved, serializeModel).modelSha256, first.modelSha256);
});
