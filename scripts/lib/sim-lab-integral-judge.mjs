// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Integral as measured from the recorded bodies: the platter motor keeps
// turning, the carriage motor moves the wheel across the platter and returns,
// and the unmotorized wheel turns with the friction contact and reverses when
// the carriage crosses the platter's centre.
//
// The wheel's own angle comes from its passive hinge, so nothing here is
// prescribed: the motor encoders only say what was asked for.
import assert from 'node:assert/strict';

const DEG = 180 / Math.PI;
const unwrap = values => {
    let previous = values[0];
    let total = previous;
    return values.map(x => {
        const delta = Math.atan2(Math.sin(x - previous), Math.cos(x - previous));
        total += delta;
        previous = x;
        return total;
    });
};

export function judgeIntegral(id, r) {
    assert.deepEqual(r.issues.filter(issue => issue.severity === 'error'), []);
    const ports = r.mechanism.actuators.map(actuator => actuator.port).sort();
    assert.deepEqual(ports, ['A', 'B']);
    const wheelBody = r.mechanism.bodies.find(body => body.parts.includes('outputWheel'));
    assert.ok(wheelBody, 'the passive wheel has its own body');
    const forkBody = r.mechanism.bodies.find(body => body.parts.includes('gravityFork'));
    assert.ok(forkBody, 'the gravity fork has its own body');
    const wheelJoint = r.mechanism.joints.find(joint =>
        (joint.body1 === wheelBody.id && joint.body2 === forkBody.id) ||
        (joint.body1 === forkBody.id && joint.body2 === wheelBody.id));
    assert.ok(wheelJoint, 'the wheel turns in a passive hinge');

    const angleOf = port => {
        const actuator = r.mechanism.actuators.find(candidate => candidate.port === port);
        return r.track.map(frame => frame.joints[actuator.joint].angle);
    };
    const a = angleOf('A');
    const b = angleOf('B');
    const aSpan = (Math.max(...a) - Math.min(...a)) * DEG;
    const bSpan = (Math.max(...b) - Math.min(...b)) * DEG;
    const bHome = Math.abs(b.at(-1)) * DEG;

    const wheel = unwrap(r.track.map(frame => frame.joints[wheelJoint.id].angle));
    const wheelSpan = (Math.max(...wheel) - Math.min(...wheel)) * DEG;
    const deltas = wheel.slice(1).map((value, i) => value - wheel[i]);
    const forward = deltas.filter(delta => delta > 0.01).length;
    const backward = deltas.filter(delta => delta < -0.01).length;

    assert.ok(aSpan >= 1000, `the platter motor turns ${aSpan.toFixed(0)}°`);
    assert.ok(bSpan >= 100, `the carriage motor crosses ${bSpan.toFixed(0)}°`);
    assert.ok(bHome <= 5, `the carriage returns to the centre (${bHome.toFixed(2)}°)`);
    assert.ok(wheelSpan >= 180, `the passive wheel turns ${wheelSpan.toFixed(0)}°`);
    assert.ok(forward > 0 && backward > 0, 'the wheel turns forward and reverses across the centre');

    return {
        platterTurnDegrees: aSpan,
        carriageTravelDegrees: bSpan,
        carriageHomeDegrees: bHome,
        wheelTurnDegrees: wheelSpan,
        wheelForwardSamples: forward,
        wheelBackwardSamples: backward
    };
}
