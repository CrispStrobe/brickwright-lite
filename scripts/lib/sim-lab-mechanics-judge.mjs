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
const worldPoint = (f, p) => {
    const pose = f.bodies[p.body];
    assert.ok(pose, `rope point body ${p.body}`);
    const turned = mul(mul(pose.rotation, [...p.local, 0]), conjugate(pose.rotation));
    return pose.position.map((v, i) => v + turned[i]);
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
    if (id === 'crane') {
        const body = part => bodyFor(m, part);
        const hub = body('hub');
        const upper = body('ttTop');
        const bottom = body('ttBottom');
        const boom = body('boom');
        const drumBody = body('hoistDrum');
        const guideBody = body('tipGuide');
        const load = body('load');
        assert.equal(hub, frame, 'the crane hub is the observed base');
        assert.equal(body('hookLink'), load, 'the hook link retains its load');
        assert.notEqual(load, boom, 'the load is not fixed to the boom');
        assert.notEqual(drumBody, upper, 'the drum spins separately from its frame');
        assert.notEqual(guideBody, load, 'the tip guide is not fixed to the load');
        assert.deepEqual(m.actuators.map(a => a.port).sort(), ['A', 'B', 'C']);
        const ropes = m.couplings.filter(c => c.kind === 'rope');
        const ropeIndex = ropes.findIndex(c => c.parts?.join('/') === 'hoistDrum/tipGuide/hookLink');
        assert.equal(ropes.length, 1, 'one physical hoist rope');
        assert.equal(ropeIndex, 0, 'the hoist rope connects drum, tip guide and hook in order');
        const rope = ropes[ropeIndex];
        assert.ok(rope.drumJoint && m.joints.some(j => j.id === rope.drumJoint && j.type === 'hinge'), 'the drum turns on a real hinge');
        assert.ok(m.joints.some(j => j.id === rope.drumJoint && [j.body1, j.body2].includes(drumBody)), 'the rope uses the hoist drum body');
        assert.ok(Math.abs(rope.radiusM - 7 * 0.0004) < 1e-9, `7 LDU drum radius: ${rope.radiusM}`);
        const drive = m.couplings.find(c => c.kind === 'gear' && c.parts?.includes('hoistGear16') && c.parts?.includes('hoistMotorGear'));
        assert.ok(drive && Math.abs(Math.abs(drive.ratio) - 1) < 1e-9, 'motor C drives the drum through two 16T gears');
        const cJoint = motorFor(m, 'C');
        assert.ok([drive.joint1, drive.joint2].includes(cJoint) && [drive.joint1, drive.joint2].includes(rope.drumJoint),
            'the C gear pair reaches the rope drum hinge');
        const slewJoint = m.joints.find(j => j.type === 'hinge' &&
            ((j.body1 === upper && j.body2 === bottom) || (j.body2 === upper && j.body1 === bottom)));
        assert.ok(slewJoint, 'real upper-to-base turntable hinge');
        const screw = m.couplings.find(c => c.kind === 'screw' && c.parts?.includes('luffLaSpindle'));
        assert.ok(screw && m.joints.some(j => j.id === screw.sliderJoint && j.type === 'slider'), 'real luffing screw and slider');

        // Count a motor already busy in the first captured frame as a phase start.
        const starts = [];
        track.forEach((f, i) => {
            for (const port of ['A', 'B', 'C']) if (f.busy[port] && (i === 0 || !track[i - 1].busy[port])) starts.push({port, i});
        });
        assert.equal(starts.map(s => s.port).join(''), 'BABACC', 'lift, slew, lower, slew back, hoist, payout');
        const before = i => track[Math.max(0, i - 1)];
        const start = track[0];
        const lifted = before(starts[1].i);
        const slewed = before(starts[2].i);
        const lowered = before(starts[3].i);
        const returned = before(starts[4].i);
        const wound = before(starts[5].i);
        const bJoint = motorFor(m, 'B');
        const aJoint = motorFor(m, 'A');
        const angle = (f, j) => f.joints[j].angle;
        const turnB = angle(lifted, bJoint) - angle(start, bJoint);
        const turnA = angle(slewed, aJoint) - angle(lifted, aJoint);
        const extension = lifted.joints[screw.sliderJoint].position - start.joints[screw.sliderJoint].position;
        assert.ok(Math.abs(Math.abs(turnB) * DEG - 1800) < 5, `B made its 1800° luff turn: ${turnB * DEG}`);
        assert.ok(Math.abs(Math.abs(extension) - Math.abs(turnB * screw.ratio)) < 0.0005 && Math.abs(extension) > 0.003,
            `luff slider follows the screw: ${extension}`);
        assert.ok(Math.abs(lowered.joints[screw.sliderJoint].position - start.joints[screw.sliderJoint].position) < 0.001,
            'the boom returns to its initial luff length');
        assert.ok(Math.abs(angle(returned, bJoint) - angle(start, bJoint)) * DEG < 5, 'motor B returns to its initial angle');
        const guideHeight = f => worldPoint(f, rope.points.at(-1))[1];
        assert.ok(guideHeight(lifted) - guideHeight(start) > 0.02, 'luffing raises the real tip guide');
        const slew = angle(slewed, slewJoint.id) - angle(lifted, slewJoint.id);
        assert.ok(Math.abs(Math.abs(turnA) * DEG - 315) < 5, `A made its 315° slew turn: ${turnA * DEG}`);
        assert.ok(Math.abs(Math.abs(slew) - Math.abs(turnA) * 8 / 28) * DEG < 2 && Math.abs(slew) * DEG > 80,
            `8:28 gearing turns the upper assembly: ${slew * DEG}`);
        assert.ok(Math.abs(angle(returned, slewJoint.id) - angle(start, slewJoint.id)) * DEG < 2, 'slew returns');
        assert.ok(Math.abs(angle(returned, aJoint) - angle(start, aJoint)) * DEG < 5, 'motor A returns to its initial angle');

        const state = f => {
            const s = f.ropes?.[ropeIndex];
            assert.ok(s && Number.isFinite(s.free) && Number.isFinite(s.tension) && s.tension >= 0,
                'each crane frame records finite native rope free length and tension');
            return s;
        };
        const world = (f, p) => worldPoint(f, p);
        const fixed = f => rope.points.slice(1).reduce((n, p, i) => n + Math.hypot(...world(f, p).map((x, k) => x - world(f, rope.points[i])[k])), 0);
        const wind = f => rope.drumSign * (angle(f, rope.drumJoint) - angle(start, rope.drumJoint));
        const freeByGeometry = f => Math.max(0.002, rope.lengthM - rope.radiusM * wind(f) - fixed(f));
        for (const f of track) state(f);
        for (const f of [start, lifted, returned, wound, end]) {
            assert.ok(Math.abs(state(f).free - freeByGeometry(f)) < 0.001,
                `rope free length follows measured drum and moving guide at ${f.t}`);
        }
        const drumTurn = angle(wound, rope.drumJoint) - angle(returned, rope.drumJoint);
        const motorTurn = angle(wound, cJoint) - angle(returned, cJoint);
        assert.ok(Math.abs(Math.abs(motorTurn) * DEG - 540) < 5, `C winds by 540°: ${motorTurn * DEG}`);
        assert.ok(Math.abs(Math.abs(drumTurn) - Math.abs(motorTurn)) * DEG < 2 && rope.drumSign * drumTurn > 0,
            'C drives the drum in the winding direction at 1:1');
        const payoutTurn = angle(end, cJoint) - angle(wound, cJoint);
        assert.ok(Math.abs(Math.abs(payoutTurn) * DEG - 540) < 5 && payoutTurn * motorTurn < 0,
            'C reverses 540° to pay the rope out');
        assert.ok(Math.abs(angle(end, rope.drumJoint) - angle(returned, rope.drumJoint)) * DEG < 2,
            'the drum returns after payout');
        const height = f => f.bodies[load].position[1];
        const lift = height(wound) - height(returned);
        assert.ok(lift > 0.01, `motor C lifts the actual load more than 10 mm: ${lift}`);
        // For a taut near-vertical hanging segment: h_hook = h_guide - L + r*w + fixed path.
        const hookHeight = f => world(f, rope.hook)[1];
        const predictedChange = (a, b) => guideHeight(b) - guideHeight(a) + rope.radiusM * (wind(b) - wind(a)) + fixed(b) - fixed(a);
        assert.ok(Math.abs((hookHeight(wound) - hookHeight(returned)) - predictedChange(returned, wound)) < 0.002,
            'settled hoist rise follows drum radius and the moving fixed path within 2 mm');
        assert.ok(Math.abs((hookHeight(end) - hookHeight(wound)) - predictedChange(wound, end)) < 0.002,
            'settled payout follows the same rope equation within 2 mm');
        assert.ok(Math.abs(height(end) - height(returned)) < 0.002, 'the load returns within 2 mm after payout');
        const stop = track.findIndex((f, i) => i > starts[4].i && !f.busy.C);
        assert.ok(stop > starts[4].i && stop < starts[5].i, 'C holds between wind and payout');
        const held = track.slice(stop, starts[5].i).filter(f => f.t >= wound.t - 200);
        assert.ok(held.length >= 3 && held.at(-1).t - held[0].t >= 100, 'a sustained settled hold is observed');
        assert.ok(range(held.map(height)) < 0.002, 'held load drift stays below 2 mm');
        assert.ok(held.every(f => state(f).tension > 0.005), 'the held rope carries finite positive load tension');
        const yaw = f => 2 * Math.atan2(f.bodies[frame].rotation[1], f.bodies[frame].rotation[3]);
        assert.ok(Math.max(...track.map(f => Math.abs(yaw(f) - yaw(start)))) * DEG < 1, 'the crane base remains stable');
        return {luffMm: extension * 1000, slewDeg: slew * DEG, hoistMm: lift * 1000,
            drumTurnDeg: drumTurn * DEG, radiusMm: rope.radiusM * 1000,
            heldTensionN: Math.min(...held.map(f => state(f).tension)), returnErrorMm: (height(end) - height(returned)) * 1000};
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
