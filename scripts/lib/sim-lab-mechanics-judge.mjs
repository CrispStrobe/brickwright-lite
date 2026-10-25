// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Independent mechanism equations, shared by the VM and visible-control browser gates.
import assert from 'node:assert/strict';
const DEG = 180 / Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const mul = ([x, y, z, w], [a, b, c, d]) => [w * a + x * d + y * c - z * b,
    w * b - x * c + y * d + z * a, w * c + x * b - y * a + z * d, w * d - x * a - y * b - z * c];
const conjugate = ([x, y, z, w]) => [-x, -y, -z, w];
const relative = (f, id, frame) => mul(conjugate(f.bodies[frame].rotation), f.bodies[id].rotation);
const turn = (f, id, frame, axis) => {
    const q = relative(f, id, frame);
    return wrap(2 * Math.atan2(q.slice(0, 3).reduce((s, v, i) => s + v * axis[i], 0), q[3]));
};
const localPoint = (f, id, frame) => {
    const v = f.bodies[id].position.map((n, i) => n - f.bodies[frame].position[i]);
    return mul(mul(conjugate(f.bodies[frame].rotation), [...v, 0]), f.bodies[frame].rotation).slice(0, 3);
};
const range = xs => Math.max(...xs) - Math.min(...xs);
const bodyFor = (m, part) => {
    const b = m.bodies.find(b => b.parts.includes(part));
    assert.ok(b, `body for ${part}`);
    return b.id;
};
const motorFor = (m, port) => {
    const a = m.actuators.find(a => a.port === port);
    assert.ok(a, `motor ${port}`);
    return a.joint;
};
const sweep = (r, port) => r.track.map(f => f.joints[motorFor(r.mechanism, port)].angle);

// Intersections of |C - B| = 100 and |C - D| = 60 for a=40, d=100 LDU.
const rockerAt = (theta, near) => {
    const B = [40 * Math.cos(theta), 40 * Math.sin(theta)];
    const dx = 100 - B[0]; const dz = -B[1]; const length = Math.hypot(dx, dz);
    const along = (10000 - 3600 + length * length) / (2 * length);
    const h = Math.sqrt(10000 - along * along);
    return [-1, 1].map(sign => Math.atan2(B[1] + along * dz / length + sign * h * dx / length,
        B[0] + along * dx / length - sign * h * dz / length - 100))
        .reduce((best, phi) => Math.abs(wrap(phi - near)) < Math.abs(wrap(best - near)) ? phi : best);
};

export const judgeMechanicsRun = (id, r) => {
    assert.deepEqual(r.issues, [], `${id}: compiler issues`);
    assert.deepEqual(r.unsupported, [], `${id}: program words`);
    const {track, mechanism: m, hubId: frame} = r;
    assert.ok(track.length > 30, 'a substantial recorded run');
    for (const f of track) {
        for (const pose of Object.values(f.bodies)) assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
        for (const pose of Object.values(f.bodies)) {
            assert.ok(Math.hypot(...pose.position.map((v, i) => v - f.bodies[frame].position[i])) < 0.5, 'assembly stays together');
        }
        const [x, , z] = f.bodies[frame].rotation;
        assert.ok(1 - 2 * (x * x + z * z) > 0.97, 'base stays upright');
    }
    const end = track.at(-1);
    assert.ok(Object.values(end.busy).every(b => !b), 'all program motor commands finish');
    if (id === 'crank-rocker') {
        const crank = bodyFor(m, 'crank'); const rocker = bodyFor(m, 'rocker');
        // A positive world yaw increases the angle in the build's LDraw x-z plane.
        const axis = [0, 1, 0];
        const startTheta = turn(track[0], crank, frame, axis);
        const startPhi = turn(track[0], rocker, frame, axis);
        const phi0 = rockerAt(0, -Math.PI / 2);
        let predicted = phi0; let worst = 0;
        const measured = [];
        for (const f of track) {
            const theta = wrap(turn(f, crank, frame, axis) - startTheta);
            const phi = phi0 + wrap(turn(f, rocker, frame, axis) - startPhi);
            predicted = rockerAt(theta, predicted);
            worst = Math.max(worst, Math.abs(wrap(phi - predicted)) * DEG);
            measured.push(phi);
        }
        const turns = Math.max(...sweep(r, 'A')) / (2 * Math.PI);
        assert.ok(Math.abs(turns - 2) < 0.02, `two full crank turns: ${turns}`);
        assert.ok(range(measured) * DEG > 80 && range(measured) * DEG < 90, 'rocker oscillates instead of rotating');
        assert.ok(worst < 1.5, `closed-loop equation error ${worst} degrees`);
        assert.ok(Math.abs(sweep(r, 'A').at(-1)) < 0.03, 'crank returns');
        return {crankTurns: turns, rockerSweepDeg: range(measured) * DEG, worstErrorDeg: worst};
    }
    if (id === 'parallel-lift') {
        const tray = bodyFor(m, 'coupler');
        const points = track.map(f => localPoint(f, tray, frame));
        const tilt = Math.max(...track.map(f => 2 * Math.acos(Math.min(1, Math.abs(relative(f, tray, frame)[3]))))) * DEG;
        const horizontal = Math.max(...[0, 2].map(i => range(points.map(p => p[i]))));
        const rise = range(points.map(p => p[1]));
        // An 80 LDU arm swept ±45°: width 2r sin45°, rise r(1-cos45°).
        const expectedWidth = 2 * 80 * 0.0004 * Math.sin(Math.PI / 4);
        const expectedRise = 80 * 0.0004 * (1 - Math.cos(Math.PI / 4));
        assert.ok(tilt < 1, `tray stays level: ${tilt} degrees`);
        assert.ok(Math.abs(horizontal - expectedWidth) < 0.001, `curved-path width ${horizontal}`);
        assert.ok(Math.abs(rise - expectedRise) < 0.0005, `curved-path height ${rise}`);
        assert.ok(Math.abs(sweep(r, 'A').at(-1)) < 0.03, 'lift returns');
        return {trayTiltDeg: tilt, widthMm: horizontal * 1000, riseMm: rise * 1000};
    }
    if (id === 'screw-crane') {
        const c = m.couplings.find(c => c.kind === 'screw');
        assert.ok(c, 'real screw coupling');
        const xs = track.map(f => f.joints[c.sliderJoint].position);
        const peak = xs.indexOf(Math.max(...xs));
        const inputTurns = (sweep(r, 'A')[peak] - sweep(r, 'A')[0]) / (2 * Math.PI);
        const extension = xs[peak] - xs[0];
        const measuredLead = extension / Math.abs(inputTurns);
        // 60 LDU stroke / (7165° / 360°), independently measured for the small actuator.
        const expectedLead = 60 * 0.0004 / (7165 / 360);
        assert.ok(Math.abs(inputTurns - 5) < 0.02, `five input turns: ${inputTurns}`);
        assert.ok(Math.abs(measuredLead - expectedLead) < 0.00003, `lead ${measuredLead} metres per turn`);
        assert.ok(Math.abs(xs.at(-1) - xs[0]) < 0.0002, 'actuator retracts home');
        const top = bodyFor(m, 'frameFront');
        const yaw = track.map(f => turn(f, top, frame, [0, 1, 0]) * DEG);
        assert.ok(Math.min(...yaw) < -29 && Math.max(...yaw) > 29, 'crane slews both ways');
        assert.ok(Math.min(...yaw) > -32 && Math.max(...yaw) < 32, '105° at an 8:28 drive gives 30° of slew');
        assert.ok(Math.abs(yaw.at(-1)) < 1, 'slew returns home');
        const heights = track.map(f => localPoint(f, bodyFor(m, 'boom'), frame)[1]);
        assert.ok(range(heights) > 0.008, 'the boom physically lifts');
        return {inputTurns, leadMm: measuredLead * 1000, extensionMm: extension * 1000,
            slewDeg: [Math.min(...yaw), Math.max(...yaw)], boomRiseMm: range(heights) * 1000};
    }
    assert.equal(id, 'pivot-rover');
    const cs = sweep(r, 'C');
    assert.ok(Math.min(...cs) * DEG < -19 && Math.max(...cs) * DEG > 19, 'steering reaches both commanded angles');
    assert.ok(Math.abs(cs.at(-1)) * DEG < 1, 'steering returns to centre');
    let previous = null; let heading = 0;
    const segments = {positive: [], negative: []};
    track.forEach((f, i) => {
        const q = f.bodies[frame].rotation;
        const worldYaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] ** 2 + q[2] ** 2));
        heading += previous === null ? 0 : wrap(worldYaw - previous); previous = worldYaw;
        if (!f.busy.A || !f.busy.B) return;
        if (cs[i] > 0.25) segments.positive.push({heading, position: f.bodies[frame].position});
        if (cs[i] < -0.25) segments.negative.push({heading, position: f.bodies[frame].position});
    });
    const deltas = Object.values(segments).map(s => {
        assert.ok(s.length > 30, 'a sustained curve for each steering direction');
        const a = s[0]; const b = s.at(-1);
        const distance = Math.hypot(...b.position.map((v, i) => v - a.position[i]));
        assert.ok(distance > 0.04, `vehicle translates while turning: ${distance}`);
        return b.heading - a.heading;
    });
    assert.ok(deltas.every(a => Math.abs(a) > 0.1), 'both curves change the heading');
    assert.ok(deltas[0] * deltas[1] < 0, 'opposite steering angles produce opposite turn directions');
    return {steeringDeg: [Math.min(...cs) * DEG, Math.max(...cs) * DEG], curveHeadingDeg: deltas.map(a => a * DEG)};
};
