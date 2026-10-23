// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementReader, jointBinding, ropeBinding, measurementPresets} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {measurementDefinitions} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import {placeMeasurementLabel} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/layout.js';
import {simLabRecord, simLabRecordFromText} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js';

const fixture = () => {
    const model = {parts: [{id: 'a', position: [0, 0, 0]}, {id: 'b', position: [250, 0, 0]}, {id: 'c', position: [250, -250, 0]}]};
    const mechanism = {gravity: [0, -10, 0], bodies: [{id: 'body', parts: ['a', 'b', 'c'], position: [0, 0, 0], massKg: 2, rollingResistance: 0.02}],
        joints: [{id: 'hinge', type: 'hinge', body1: 'world', body2: 'body', motor: {port: 'A'}}],
        couplings: [{id: 'rope', kind: 'rope', parts: ['a', 'b'], hook: {body: 'body', local: [0, 0, 0]}, points: [{body: 'body', local: [0, 1, 0]}]}]};
    let pose = {position: [1, 2, 3], rotation: [0, 0, 0, 1]};
    const core = {bodyPose: () => structuredClone(pose), bodyLinearVelocity: () => [3, 4, 0], bodyAngularVelocity: () => [0, Math.PI, 0],
        jointState: () => ({angle: Math.PI / 2, velocity: -Math.PI}), rollingWheel: () => ({load: 7}), ropeState: () => [{tension: 12}]};
    return {model, runModel: model, mechanism, core, turn: () => {pose = {position: [3, 4, 5], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2]};}};
};
const def = (kind, extra = {}) => ({id: kind, label: kind, kind, targets: kind === 'distance' ? ['a', 'b'] : kind === 'angle' ? ['a', 'b', 'c'] : ['a'], visible: true, ...extra});

test('distance and angle use live part origins, metres to mm, and vertex B through a rigid rotation', () => {
    const s = fixture(), reader = createMeasurementReader(s), defs = [def('distance'), def('angle')];
    for (let i = 0; i < 2; i++) {
        const [d, a] = reader.read(defs);
        assert.ok(d.available && a.available);
        assert.ok(Math.abs(d.value - 100) < 1e-10);
        assert.ok(Math.abs(a.value - 90) < 1e-10);
        assert.equal(d.unit, 'mm');
        s.turn();
    }
    assert.deepEqual(reader.read(defs)[0].points[0], [3, 4, 5]);
});

test('mass, speed, angular speed and forces retain units and distinct provenance without mutating physics', () => {
    const s = fixture(), before = structuredClone(s.mechanism), reader = createMeasurementReader(s);
    const rows = reader.read(['mass', 'weight', 'speed', 'angularSpeed', 'normalLoad'].map(k => def(k)));
    assert.deepEqual(rows.map(r => r.value), [2000, 20, 5, 180, 7]);
    assert.deepEqual(rows.map(r => r.unit), ['g', 'N', 'm/s', '°/s', 'N']);
    assert.deepEqual(rows[1].vector, [0, -20, 0]);
    assert.deepEqual(rows[2].vector, [3, 4, 0]);
    assert.deepEqual(rows[4].vector, [-0, 7, -0]);
    assert.equal(rows[4].source, 'rolling-load-estimate');
    assert.deepEqual(s.mechanism, before);
    assert.deepEqual(rows[0].assembly, ['a', 'b', 'c']);
});

test('joint and rope measurements bind the generated id to authored targets', () => {
    const s = fixture(), reader = createMeasurementReader(s), j = s.mechanism.joints[0], rope = s.mechanism.couplings[0];
    const defs = [def('jointAngle', {joint: j.id, binding: jointBinding(s.mechanism, j), targets: undefined}),
        def('tension', {rope: rope.id, binding: ropeBinding(rope), targets: undefined})];
    assert.deepEqual(reader.read(defs).map(r => r.value), [90, 12]);
    assert.deepEqual(reader.read(defs)[1].vector, [0, 12, 0]);
    s.mechanism.bodies[0].parts = ['other'];
    assert.equal(reader.read(defs)[0].reason, 'missing-target', 'a reused joint id cannot retarget the measurement');
    rope.parts = ['replacement'];
    assert.equal(reader.read(defs)[1].available, false);
});

test('missing parts, coincident angles and unsupported or nonfinite diagnostics are unavailable, never zero', () => {
    const s = fixture(), reader = createMeasurementReader(s);
    s.core.rollingWheel = () => null;
    s.core.bodyLinearVelocity = () => [NaN, 1, 2];
    const rows = reader.read([def('distance', {targets: ['a', 'gone']}), def('angle', {targets: ['a', 'a', 'c']}), def('normalLoad'), def('speed')]);
    assert.ok(rows.every(r => !r.available && r.value === null));
    assert.deepEqual(rows.map(r => r.reason), ['missing-target', 'coincident-points', 'not-a-rolling-wheel', 'unavailable']);
});

test('strict bounded definitions persist with the model and detach from caller arrays', () => {
    const defs = [def('distance')], ldraw = '1 4 0 0 0 1 0 0 0 1 0 0 0 1 beam.dat';
    const record = simLabRecordFromText(ldraw, {measurements: defs});
    assert.deepEqual(simLabRecord(JSON.parse(JSON.stringify(record))).measurements, measurementDefinitions(defs));
    defs[0].targets[0] = 'changed';
    assert.equal(record.measurements[0].targets[0], 'a');
    assert.deepEqual(simLabRecordFromText(ldraw, {measurements: []}).measurements, [], 'empty selections remain empty');
    for (const bad of [null, Array(65).fill(def('mass')), [def('mass'), def('mass')], [def('__proto__')], [def('mass', {visible: 1})],
        [def('distance', {targets: ['a']})], [def('jointAngle', {joint: 'j'})], [def('mass', {label: 'bad\nlabel'})]]) {
        assert.throws(() => measurementDefinitions(bad), /simLab.measurements/);
    }
    assert.equal(simLabRecord({ldraw}).measurements, undefined, 'old projects remain valid');
    assert.ok(measurementPresets(fixture()).length >= 3);
});

test('readings on the same assembly remain individually legible and stay within the horizontal view', () => {
    const occupied = [];
    const positions = ['Mass: 24.0 g', 'Speed: 0.250 m/s', 'Weight: 0.235 N'].map(t => placeMeasurementLabel([350, 60], t, 400, 300, occupied));
    assert.equal(new Set(positions.map(p => p[1])).size, 3);
    for (let i = 0; i < occupied.length; i++) {
        const a = occupied[i]; assert.ok(a.x >= 0 && a.x + a.w <= 400);
        for (const b of occupied.slice(i + 1)) assert.ok(a.y + a.h <= b.y || b.y + b.h <= a.y);
    }
});
