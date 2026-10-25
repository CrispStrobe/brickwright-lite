// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementReader} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {measurementDefinitions} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';

const acceleration = [{id: 'a', kind: 'acceleration', label: 'COM acceleration', targets: ['wheel']}];
const pressure = [{id: 'p', kind: 'pressure', label: 'Gauge pressure', targets: ['cylinder']}];
const fixture = () => {
    const session = {time: 0, model: {parts: [{id: 'wheel', position: [0, 0, 0]}, {id: 'cylinder', position: [0, 0, 0]}]},
        mechanism: {gravity: [0, -10, 0], bodies: [{id: 'b0', parts: ['wheel'], position: [0, 0, 0]},
            {id: 'b1', parts: ['cylinder'], position: [0, 0, 0]}], joints: [], couplings: [
            {kind: 'pneumatic', parts: ['cylinder', 'rod', 'valve'], network: {id: 'air:tank:l'}}]},
        core: {bodyPose: () => ({position: [0, 0, 0], rotation: [0, 0, 0, 1]}),
            bodyLinearVelocity: () => session.velocity, airState: () => session.networks}};
    session.velocity = [0, 0, 0]; session.networks = [{id: 'air:tank:l', kPa: 150}];
    return session;
};

test('sampled COM acceleration uses vector velocity change and actual simulated time; same-time reads are stable', () => {
    const s = fixture(), reader = createMeasurementReader(s), defs = measurementDefinitions(acceleration);
    assert.equal(reader.read(defs)[0].available, false, 'first sample has no preceding velocity');
    s.time = 100; s.velocity = [0.3, 0.4, 0];
    const first = reader.read(defs)[0];
    assert.equal(first.value, 5);
    assert.equal(first.source, 'sampled-jolt-com-acceleration');
    s.velocity = [3, 4, 0];
    assert.equal(reader.read(defs)[0].value, 5, 'duplicate time cannot recalculate from a later velocity');
    s.time = 200; s.velocity = [0.3, 0.4, 0];
    assert.equal(reader.read(defs)[0].value, 0, 'constant vector velocity has zero acceleration');
});

test('acceleration refuses time reversal, same-time first sample, gaps and nonfinite velocity', () => {
    const s = fixture(), reader = createMeasurementReader(s);
    const read = () => reader.read(acceleration)[0];
    assert.equal(read().available, false);
    assert.equal(read().available, false);
    s.time = 100; s.velocity = [1, 0, 0]; assert.equal(read().value, 10);
    s.time = 0; assert.equal(read().available, false);
    s.time = 400; assert.equal(read().available, false);
    s.time = 500; s.velocity = [2, 0, 0]; assert.equal(read().value, 10);
    s.time = 600; s.velocity = [NaN, 0, 0]; assert.equal(read().available, false);
    s.time = 700; s.velocity = [3, 0, 0]; assert.equal(read().available, false, 'invalid velocity breaks the sample chain');
});

test('pressure reads its unique connected network by ID and preserves gauge units', () => {
    const s = fixture(), reader = createMeasurementReader(s), read = () => reader.read(pressure)[0];
    assert.equal(read().value, 150);
    assert.equal(read().unit, 'kPa'); assert.equal(read().source, 'jolt-air-network-gauge-pressure');
    s.networks.unshift({id: 'other', kPa: 800}); assert.equal(read().value, 150, 'network array order is irrelevant');
    s.networks = [{id: 'other', kPa: 800}]; assert.equal(read().available, false, 'missing snapshot ID is unavailable');
    s.networks = [{id: 'air:tank:l', kPa: 150}, {id: 'air:tank:l', kPa: 170}];
    assert.equal(read().available, false, 'duplicate snapshot ID is ambiguous');
});

test('pressure refuses ambiguous connected networks and unconnected targets', () => {
    const s = fixture();
    s.mechanism.couplings.push({kind: 'pump', parts: ['cylinder', 'rod'], network: {id: 'other'}});
    assert.equal(createMeasurementReader(s).read(pressure)[0].available, false);
    s.mechanism.couplings = [];
    assert.equal(createMeasurementReader(s).read(pressure)[0].available, false);
});
