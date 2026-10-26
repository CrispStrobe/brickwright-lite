// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementReader, jointBinding} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {measurementDefinitions} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import {experimentsFromRuns, experimentsToRuns, canonicalRecordingDefinition, recordingDefinitionIdentity} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
const fixture = () => {
    const model = {parts: [{id: 'a', position: [0, 0, 0]}, {id: 'b', position: [0, 0, 0]}]};
    const mechanism = {gravity: [0,-10,0], bodies: [{id: 'one', parts: ['a'], position: [0,0,0]}, {id: 'two', parts: ['b'], position: [0,0,0]}],
        joints: [{id: 'h', type: 'hinge', body1: 'one', body2: 'two'}, {id: 's', type: 'slider', body1: 'one', body2: 'two'}]};
    const core = {time: .005, bodyPose: () => ({position: [0,0,0], rotation: [0,0,0,1]}),
        jointDynamics: id => ({t: .005, stepSeconds: .005, passiveTorqueNm: id === 'h' ? -.02 : null, motorForceN: -12, limitForceN: 4, motorPowerW: -3}),
        screwState: () => [{sliderJoint: 's', loadN: 8, slips: 2}], currentContactPairs: () => [['two','one']]};
    const definitions = measurementDefinitions(['passiveTorque','motorForce','limitForce','sliderPower','screwSlips','screwLoad','contact'].map(kind => ({id: kind, kind, label: kind,
        ...(kind === 'contact' ? {targets: ['a','b']} : {joint: kind === 'passiveTorque' ? 'h' : 's', binding: jointBinding(mechanism, mechanism.joints[kind === 'passiveTorque' ? 0 : 1])})})));
    return {session: {model, mechanism, core}, definitions};
};
test('existing native diagnostics retain signed force/power, separate friction, filtered load and contact provenance', () => {
    const {session, definitions} = fixture(), reader = createMeasurementReader(session), rows = reader.read(definitions);
    assert.deepEqual(rows.map(r => r.value), [-.02,-12,4,-3,2,8,1]);
    assert.deepEqual(rows.map(r => r.unit), ['N·m','N','N','W','count','N','0/1']);
    assert.equal(rows[5].source, 'screw-filtered-support-load'); assert.equal(rows[6].source, 'jolt-contact-presence');
    assert.ok(rows.every(r => !r.vector), 'scalar presence and constraint impulse are not invented world vectors');
    session.core.time = .010;
    assert.ok(reader.read(definitions.slice(0,4)).every(r => !r.available), 'stale dynamics cannot masquerade as current');
});
test('missing, ambiguous, same-body and oversized contact/screw readers refuse rather than invent zero', () => {
    const {session, definitions} = fixture(), reader = createMeasurementReader(session);
    session.core.screwState = () => [{sliderJoint:'s',slips:2},{sliderJoint:'s',slips:3}];
    assert.equal(reader.read([definitions[4]])[0].available, false);
    session.core.currentContactPairs = () => null; assert.equal(reader.read([definitions[6]])[0].available, false);
    session.core.currentContactPairs = () => []; assert.equal(reader.read([definitions[6]])[0].value, 0);
    session.core.time = 0; assert.equal(reader.read([definitions[6]])[0].available, false, 'no completed native step yet'); session.core.time = .005;
    assert.equal(reader.read([{...definitions[6], targets:['a','a']}])[0].available, false, 'same-body contact is not an independent pair');
    session.mechanism.bodies.push({id:'duplicate-owner',parts:['a']});
    assert.equal(reader.read([definitions[6]])[0].available, false, 'ambiguous authored ownership is refused');
    session.mechanism.bodies.pop();
    session.mechanism.bodies.push(...Array.from({length:127},(_,i)=>({id:`extra${i}`,parts:[]})));
    session.core.currentContactPairs = () => {throw new Error('oversized scan must not run');};
    assert.equal(reader.read([definitions[6]])[0].available, false);
});
test('new quantities retain exact definitions, units and sources through compact history admission', () => {
    const {session, definitions} = fixture(), rows = createMeasurementReader(session).read(definitions), modelSha256 = 'b'.repeat(64);
    for (const [i,d] of definitions.entries()) {
        const defs = [canonicalRecordingDefinition(d)], run = {id:'run-1', modelSha256, definitions:defs, identity:recordingDefinitionIdentity(defs), samples:[{elapsedMs:0,timeMs:5,readings:[rows[i]]}]};
        const packet = experimentsFromRuns([run],{modelSha256});
        assert.deepEqual(experimentsToRuns(packet,{modelSha256})[0].samples[0].readings[0].value,rows[i].value);
        const bad=structuredClone(packet); bad.runs[0].samples[0][2][0][1]='contact-force';
        assert.throws(()=>experimentsToRuns(bad,{modelSha256}),/source/);
    }
});
