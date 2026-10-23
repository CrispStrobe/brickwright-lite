// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Offset Orbit as measured from the recorded bodies of the delivered revision.
//
// The machine is an Oldham coupling: two parallel shafts 24 mm apart, a rigid
// floating cross on two perpendicular sliding guides. What is checked here is
// measured, not assumed:
//   - the two shaft axes are 24 mm apart;
//   - the cross centre keeps a constant 12 mm distance from the midpoint of
//     the two axes (the Oldham circle);
//   - the orbit phase advances at twice the input guide phase;
//   - the two guides stay perpendicular and the passive output shaft turns
//     with the input, one turn for one turn;
//   - the two cross halves keep their 16 mm spacing.
//
// Every point comes from the recorded body poses; the double-angle law is a
// comparison against the measured input, never a source of the output.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = a => Math.hypot(...a);
const unit = a => { const n = norm(a) || 1; return a.map(v => v / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = ([x, y, z, w], [a, b, c, d]) => [w * a + x * d + y * c - z * b, w * b - x * c + y * d + z * a, w * c - x * b + y * a + z * d, w * d - x * a - y * b - z * c];
const conj = q => [-q[0], -q[1], -q[2], q[3]];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const unwrap = xs => {
    let previous = xs[0];
    let total = previous;
    return xs.map(x => {
        total += wrap(x - previous);
        previous = x;
        return total;
    });
};
const DEG = 180 / Math.PI;

/** The angle of a body's rotation relative to the chassis, in radians. */
const relativeAngle = (frame, body) => {
    const q = mul(conj(frame.bodies.b0.rotation), frame.bodies[body].rotation);
    return 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), q[3]);
};

/**
 * The axis the body turns about. The frame whose relative rotation is closest
 * to a half turn has the best-conditioned vector part; taking the extremes of
 * the (wrapping) quaternion angle can pick a pair that is almost the identity,
 * where the axis is numerical noise.
 */
const rotationAxis = (r, body) => {
    let best = null;
    for (const frame of r.track) {
        const q = mul(conj(frame.bodies.b0.rotation), frame.bodies[body].rotation);
        const s = Math.hypot(q[0], q[1], q[2]);
        if (!best || s > best.s) best = {s, q};
    }
    return best && best.s > 1e-6 ? unit([best.q[0], best.q[1], best.q[2]]) : [1, 0, 0];
};

export function judgeOffsetOrbit(r) {
    assert.deepEqual(r.issues.filter(issue => issue.severity === 'error'), []);
    assert.deepEqual(r.mechanism.actuators.map(actuator => actuator.port), ['A']);
    const o = observeAddon(r);
    const point = (frame, id, local) => o.point(frame, id, local);

    // The shaft axis from the input frame's own rotation; the two axis points
    // from the motor's output (the input shaft) and the output shaft.
    const axis = rotationAxis(r, 'b2');
    const inputAxis = point(r.track[0], 'motor_A', [0, -40, 0]);
    const outputAxis = point(r.track[0], 'output_shaft');
    const offset = sub(outputAxis, inputAxis);
    const perpendicular = sub(offset, axis.map((v, i) => v * dot(offset, axis)));
    const separation = norm(perpendicular) * 1000;
    const e1 = unit(perpendicular);
    const e2 = unit(cross(axis, e1));
    const midpoint = inputAxis.map((v, i) => (v + outputAxis[i]) / 2);

    const samples = r.track.map(frame => {
        const halfA = point(frame, 'cross_input_keyed_bridge');
        const halfB = point(frame, 'cross_output_keyed_bridge');
        const centre = halfA.map((v, i) => (v + halfB[i]) / 2);
        const radius = sub(centre, midpoint);
        const inPlane = sub(radius, axis.map((v, i) => v * dot(radius, axis)));
        const inputGuide = unit(sub(point(frame, 'input_seat_120_-20'), point(frame, 'input_seat_-120_-20')));
        const outputGuide = unit(sub(point(frame, 'output_seat_120_-20'), point(frame, 'output_seat_-120_-20')));
        return {
            radius: norm(inPlane) * 1000,
            inputAngle: Math.atan2(dot(inputGuide, e2), dot(inputGuide, e1)),
            outputGuide,
            inputGuide,
            orbitAngle: Math.atan2(dot(inPlane, e2), dot(inPlane, e1)),
            halfGap: norm(sub(halfA, halfB)) * 1000
        };
    });

    const radius = samples.map(s => s.radius);
    const radiusError = Math.max(...radius.map(value => Math.abs(value - 12)));
    const lawError = samples.map(s => Math.abs(wrap(s.orbitAngle - 2 * s.inputAngle)) * DEG);
    const guideError = samples.map(s => Math.asin(Math.min(1, Math.abs(dot(s.inputGuide, s.outputGuide)))) * DEG);
    const guide = unwrap(samples.map(s => s.inputAngle));
    const inputTurn = (Math.max(...guide) - Math.min(...guide)) * DEG;

    // One shaft turn for one shaft turn: the two shafts' own angles, both taken
    // relative to the chassis. The program returns to its datum, so compare the
    // unwrapped spans, not the end points.
    const inputShaft = unwrap(r.track.map(frame => relativeAngle(frame, 'b2')));
    const outputShaft = unwrap(r.track.map(frame => relativeAngle(frame, 'b3')));
    const shaftSpan = (Math.max(...inputShaft) - Math.min(...inputShaft)) * DEG;
    const outputSpan = (Math.max(...outputShaft) - Math.min(...outputShaft)) * DEG;
    const shaftAgreement = samples.map((_, i) => Math.abs(wrap(outputShaft[i] - inputShaft[i])) * DEG);
    const halfGap = samples.map(s => s.halfGap);

    assert.ok(Math.abs(separation - 24) <= 0.2, `the shafts are 24 mm apart (${separation.toFixed(3)} mm)`);
    assert.ok(radiusError <= 0.2, `the cross centre keeps its 12 mm radius (${radiusError.toFixed(3)} mm)`);
    assert.ok(Math.max(...lawError) <= 0.5, `the orbit follows twice the input phase (${Math.max(...lawError).toFixed(3)}°)`);
    assert.ok(Math.max(...guideError) <= 0.5, `the two guides stay perpendicular (${Math.max(...guideError).toFixed(3)}°)`);
    assert.ok(Math.abs(inputTurn) >= 90, `the input guide turns ${inputTurn.toFixed(1)}°`);
    assert.ok(Math.abs(outputSpan - shaftSpan) <= 2, `the output follows the input (${outputSpan.toFixed(2)}° vs ${shaftSpan.toFixed(2)}°)`);
    assert.ok(Math.max(...shaftAgreement) - Math.min(...shaftAgreement) <= 0.5, 'the two shaft phases keep their relation');
    assert.ok(Math.max(...halfGap) - Math.min(...halfGap) <= 0.2, 'the two cross halves keep their 16 mm spacing');

    return {
        shaftSeparationMm: separation,
        crossRadiusMm: radius.reduce((s, v) => s + v, 0) / radius.length,
        radiusErrorMm: radiusError,
        orbitLawErrorDegrees: Math.max(...lawError),
        guideAngleErrorDegrees: Math.max(...guideError),
        inputGuideTurnDegrees: inputTurn,
        inputShaftTurnDegrees: shaftSpan,
        outputShaftTurnDegrees: outputSpan,
        halfSeparationMm: halfGap.reduce((s, v) => s + v, 0) / halfGap.length
    };
}
