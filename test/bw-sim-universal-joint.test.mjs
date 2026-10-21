// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Universal joint (kinds/universal-joint.js, physics/universal-joint.js): two Technic U-joint ends fork in
// fork are a Cardan joint. Checked against the closed form of a single Cardan joint,
//   ω2/ω1 = cos β / (1 − sin²β·cos²θ)   (β the bend, θ the input fork's angle from the plane of the shafts),
// whose average over a turn is 1; two in phase (the intermediate shaft's forks parallel, equal bends) give
// a constant output speed; and torque gets through it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {upgradeMechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {crossGeometry} from '../overlay/scratch-gui/src/lib/bw-sim/physics/universal-joint.js';
import {UJ_MAX_BEND_DEG} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/universal-joint.js';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const HZ = 200;
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (v, s) => v.map(x => x * s);
const rotate = (q, v) => {
    const [x, y, z, w] = q;
    const c = cross([x, y, z], v);
    const i = [c[0] + w * v[0], c[1] + w * v[1], c[2] + w * v[2]];
    const d = cross([x, y, z], i);
    return [v[0] + 2 * d[0], v[1] + 2 * d[1], v[2] + 2 * d[2]];
};
/** The quaternion turning +y onto the unit vector d. */
const yOnto = d => {
    const c = cross([0, 1, 0], d);
    const w = 1 + d[1];
    if (w < 1e-9) return [1, 0, 0, 0];
    const n = Math.hypot(c[0], c[1], c[2], w);
    return [c[0] / n, c[1] / n, c[2] / n, w / n];
};
const cardan = (beta, theta) => Math.cos(beta) / (1 - Math.sin(beta) ** 2 * Math.cos(theta) ** 2);

/** A shaft: a 3 mm rod along `dir` from `from`, 50 mm long, on a hinge to the world at its middle. */
const shaft = (id, from, dir, extra = {}) => {
    const mid = from.map((v, i) => v + dir[i] * 0.025);
    return {
        body: {id, motion: 'dynamic', position: mid, rotation: [0, 0, 0, 1], massKg: 0.01,
            colliders: [{shape: 'cylinder', radius: 0.003, halfHeight: 0.022, rotation: yOnto(dir)}], parts: []},
        joint: {id: `j${id}`, type: 'hinge', body1: id, body2: 'world', point: mid, axis: dir, ...extra}
    };
};
/** A hand-built mechanism: shafts and universal joints (fork1 on body1, fork2 on body2). */
const mechanism = (shafts, ujs) => {
    const m = upgradeMechanismV1({version: 1, gravity: [0, 0, 0], bodies: shafts.map(s => s.body), joints: shafts.map(s => s.joint), gears: [], diagnostics: []});
    ujs.forEach((u, i) => m.couplings.push({id: `u${i}`, kind: 'universalJoint', maxBendRad: UJ_MAX_BEND_DEG * DEG, ...u}));
    const pairs = new Set(m.noCollide.map(p => p.join('|')));
    for (const u of ujs) {
        const p = [u.body1, u.body2].sort();
        if (!pairs.has(p.join('|'))) m.noCollide.push(p);
    }
    return m;
};
const MOTOR = {motor: {port: 'A', maxTorqueNm: 1, maxSpeedRadPerSec: 20}};

/** One Cardan joint at bend β: input along +z towards the pivot at the origin, output along d2 = (sin β, 0, cos β). */
const single = (beta, {motor = MOTOR, outFriction} = {}) => {
    const d2 = [Math.sin(beta), 0, Math.cos(beta)];
    const s1 = shaft('in', [0, 0, -0.05], [0, 0, 1], motor);
    const s2 = shaft('out', [0, 0, 0], d2, outFriction ? {frictionNm: outFriction} : {});
    return {d2, mech: mechanism([s1, s2], [{body1: 'in', body2: 'out', point: [0, 0, 0], fork1: [1, 0, 0], fork2: [0, 1, 0], shaft1: [0, 0, -1], shaft2: d2}])};
};
const spin = (core, id, axis) => dot(core.bodyAngularVelocity(id), axis);

test('the cross\'s geometry: straight means no bend in either hinge; at 30° the bend is in the output fork\'s', () => {
    const straight = crossGeometry({fork1: [1, 0, 0], fork2: [0, 1, 0], shaft1: [0, 0, -1], shaft2: [0, 0, 1]});
    assert.ok(Math.abs(straight.bendA) < 1e-12 && Math.abs(straight.bendB) < 1e-12);
    const b = 30 * DEG;
    const bent = crossGeometry({fork1: [1, 0, 0], fork2: [0, 1, 0], shaft1: [0, 0, -1], shaft2: [Math.sin(b), 0, Math.cos(b)]});
    assert.ok(Math.abs(bent.bendA) < 1e-12);
    assert.ok(Math.abs(Math.abs(bent.bendB) - b) < 1e-12, `bend ${bent.bendB / DEG}°`);
});

test('a single Cardan joint at 0°, 30° and 45°: the output follows cos β / (1 − sin²β·cos²θ), on average 1:1', t => {
    for (const betaDeg of [0, 30, 45]) {
        const beta = betaDeg * DEG;
        const {d2, mech} = single(beta);
        const core = createPhysicsCore(J, mech, {stepHz: HZ});
        core.setMotor('jin', {mode: 'velocity', radPerSec: 2 * Math.PI});
        const in0 = core.jointState('jin').angle;
        const out0 = core.jointState('jout').angle;
        let worst = 0;
        let worstAngle = 0;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < 2.5 * HZ; i++) {
            core.step(1 / HZ);
            if (i < 0.5 * HZ) continue;
            const w1 = spin(core, 'in', [0, 0, 1]);
            const w2 = spin(core, 'out', d2);
            // θ: the input fork (x at the start) from the plane of the shafts (x–z), as the input body carries it.
            const fork = rotate(core.bodyPose('in').rotation, [1, 0, 0]);
            // Jolt moves a body by its END-of-step velocity: that velocity belongs half a step back.
            const theta = Math.atan2(fork[1], fork[0]) - w1 / HZ / 2;
            const want = cardan(beta, theta);
            // A sample is one step's mean: allow the closed form's own change over that step (steep at 45°).
            const dTheta = w1 / HZ / 2;
            const spread = Math.abs(cardan(beta, theta + dTheta) - cardan(beta, theta - dTheta)) / want;
            worst = Math.max(worst, Math.abs(w2 / w1 / want - 1) - spread);
            // The angles themselves: tan φ = tan θ / cos β (both from the start pose, where θ = φ = 0).
            const th = core.jointState('jin').angle - in0;
            const phi = core.jointState('jout').angle - out0;
            const wantPhi = th + Math.atan2(Math.sin(th) * Math.cos(th) * (1 - Math.cos(beta)), Math.cos(th) ** 2 * Math.cos(beta) + Math.sin(th) ** 2);
            worstAngle = Math.max(worstAngle, Math.abs(phi - wantPhi));
            lo = Math.min(lo, w2 / w1);
            hi = Math.max(hi, w2 / w1);
        }
        const turnsIn = core.jointState('jin').angle - in0;
        const turnsOut = core.jointState('jout').angle - out0;
        core.destroy();
        t.diagnostic(`β ${betaDeg}°: ω2/ω1 ${lo.toFixed(4)} … ${hi.toFixed(4)} (cos β ${Math.cos(beta).toFixed(4)}, 1/cos β ${(1 / Math.cos(beta)).toFixed(4)}); ` +
            `worst ${(worst * 100).toFixed(2)} % off the closed form (beyond its change over a step), angle ${(worstAngle / DEG).toFixed(3)}° off; over 2.5 s out/in ${(turnsOut / turnsIn).toFixed(5)}`);
        assert.ok(worst <= 0.005, `β ${betaDeg}°: ${worst * 100} % off the closed form`);
        assert.ok(worstAngle <= 0.25 * DEG, `β ${betaDeg}°: output angle ${worstAngle / DEG}° off tan φ = tan θ / cos β`);
        assert.ok(Math.abs(lo - Math.cos(beta)) <= 0.01 && Math.abs(hi - 1 / Math.cos(beta)) <= 0.01, `β ${betaDeg}°: range ${lo} … ${hi}`);
        // 2.5 s at one turn a second is 2.5 turns: the output's angle lags or leads by at most the ripple's amplitude.
        const lag = Math.atan(Math.tan(turnsIn) / Math.cos(beta)) - Math.atan(Math.tan(turnsIn));
        assert.ok(Math.abs(turnsOut - turnsIn) <= Math.abs(lag) + 0.01, `β ${betaDeg}°: out ${turnsOut} vs in ${turnsIn}`);
    }
});

test('two Cardan joints in phase (Z arrangement, equal bends, the middle shaft\'s forks parallel) turn the output at constant speed', t => {
    const beta = 30 * DEG;
    const d = [Math.sin(beta), 0, Math.cos(beta)];
    const L = 0.06;
    const p2 = scale(d, L);
    const s1 = shaft('in', [0, 0, -0.05], [0, 0, 1], MOTOR);
    const mid = {
        body: {id: 'mid', motion: 'dynamic', position: scale(d, L / 2), rotation: [0, 0, 0, 1], massKg: 0.01,
            colliders: [{shape: 'cylinder', radius: 0.003, halfHeight: 0.02, rotation: yOnto(d)}], parts: []},
        joint: {id: 'jmid', type: 'hinge', body1: 'mid', body2: 'world', point: scale(d, L / 2), axis: d}
    };
    const s3 = shaft('out', p2, [0, 0, 1]);
    const mech = mechanism([s1, mid, s3], [
        {body1: 'in', body2: 'mid', point: [0, 0, 0], fork1: [1, 0, 0], fork2: [0, 1, 0], shaft1: [0, 0, -1], shaft2: d},
        {body1: 'mid', body2: 'out', point: p2, fork1: [0, 1, 0], fork2: [1, 0, 0], shaft1: scale(d, -1), shaft2: [0, 0, 1]}
    ]);
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    core.setMotor('jin', {mode: 'velocity', radPerSec: 2 * Math.PI});
    let worstOut = 0;
    let midLo = Infinity;
    let midHi = -Infinity;
    for (let i = 0; i < 2.5 * HZ; i++) {
        core.step(1 / HZ);
        if (i < 0.5 * HZ) continue;
        const w1 = spin(core, 'in', [0, 0, 1]);
        worstOut = Math.max(worstOut, Math.abs(spin(core, 'out', [0, 0, 1]) / w1 - 1));
        const r = spin(core, 'mid', d) / w1;
        midLo = Math.min(midLo, r);
        midHi = Math.max(midHi, r);
    }
    core.destroy();
    t.diagnostic(`middle shaft ${midLo.toFixed(4)} … ${midHi.toFixed(4)} of the input; output within ${(worstOut * 100).toFixed(3)} % of it`);
    assert.ok(midHi - midLo > 0.25, 'the middle shaft ripples (cos 30° … 1/cos 30°)');
    assert.ok(worstOut <= 0.01, `output ripple ${worstOut}`);
});

test('torque gets through: a load the motor can carry turns at 1:1 on average, one it cannot stalls it; no joint, no drive', t => {
    const beta = 30 * DEG;
    const load = 0.05; // N·m of bearing friction on the output
    const run = (maxTorqueNm, {coupled = true} = {}) => {
        const {d2, mech} = single(beta, {motor: {motor: {port: 'A', maxTorqueNm, maxSpeedRadPerSec: 20}}, outFriction: load});
        if (!coupled) mech.couplings = [];
        const core = createPhysicsCore(J, mech, {stepHz: HZ});
        core.setMotor('jin', {mode: 'velocity', radPerSec: 2 * Math.PI});
        const a0 = [core.jointState('jin').angle, core.jointState('jout').angle];
        for (let i = 0; i < 2 * HZ; i++) core.step(1 / HZ);
        const r = {in: core.jointState('jin').angle - a0[0], out: core.jointState('jout').angle - a0[1], d2};
        core.destroy();
        return r;
    };
    const strong = run(0.2);
    // The input must give T_out·ω2/ω1 ≥ load·cos β = 0.043 N·m: 0.03 N·m stalls at the first ripple.
    const weak = run(0.03);
    const loose = run(0.2, {coupled: false});
    t.diagnostic(`0.2 N·m: in ${(strong.in / DEG).toFixed(1)}°, out ${(strong.out / DEG).toFixed(1)}°; 0.03 N·m: in ${(weak.in / DEG).toFixed(1)}°; ` +
        `uncoupled: in ${(loose.in / DEG).toFixed(1)}°, out ${(loose.out / DEG).toFixed(1)}°`);
    assert.ok(Math.abs(strong.in - 4 * Math.PI) < 0.05 * 4 * Math.PI, `the motor turned ${strong.in / DEG}°`);
    assert.ok(Math.abs(Math.abs(strong.out) - Math.abs(strong.in)) < 15 * DEG, `out ${strong.out / DEG}° vs in ${strong.in / DEG}°`);
    assert.ok(Math.abs(weak.in) < 90 * DEG, `a 0.03 N·m motor turned ${weak.in / DEG}° against ${load} N·m`);
    assert.ok(Math.abs(loose.out) < 1 * DEG, 'without the joint nothing drives the output');
});

// ---- compiled from parts ---------------------------------------------------------------------------
// The medium motor (54696p01) at the origin, its output axle vertical: a 3L axle in it (y −90 … −30),
// a 62520 on its top end with the pivot at y −100, a second 62520 on that pivot turned 90° (fork along z),
// its 3L axle up through a beam 7's hole at y −150. `bend` turns the output side about the pivot.
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c]));
const mv = (m, v) => [0, 1, 2].map(r => m[3 * r] * v[0] + m[3 * r + 1] * v[1] + m[3 * r + 2] * v[2]);
const ujModel = (bendDeg = 0, end = '62520.dat') => {
    const b = bendDeg * DEG;
    const Rz = [Math.cos(b), -Math.sin(b), 0, Math.sin(b), Math.cos(b), 0, 0, 0, 1];
    const P = [0, -100, 0];
    const turned = (pos, rot) => ({position: mv(Rz, pos.map((v, i) => v - P[i])).map((v, i) => v + P[i]), rotation: mul(Rz, rot)});
    const AXLE_Y = [0, 1, 0, 1, 0, 0, 0, 0, -1];
    // 3712/575 have the pivot 30 LDU behind the origin along the shaft: the part sits 30 LDU further out.
    const off = end === '62520.dat' ? 0 : 30;
    return {version: 1, parts: [
        {id: 'm', part: '54696p01.dat', position: [0, 0, 0], rotation: I3, port: 'A'},
        {id: 'a1', part: '4519.dat', position: [0, -60, 0], rotation: AXLE_Y},
        {id: 'u1', part: end, position: [0, -100 + off, 0], rotation: [1, 0, 0, 0, 0, 1, 0, -1, 0]},
        {id: 'u2', part: end, ...turned([0, -100 - off, 0], [0, -1, 0, 0, 0, -1, 1, 0, 0])},
        {id: 'a2', part: '4519.dat', ...turned([0, off ? -150 : -140, 0], AXLE_Y)},
        {id: 'beam', part: '32524.dat', ...turned([0, off ? -160 : -150, 0], I3)}
    ]};
};
const compileUj = (bendDeg, end) => {
    const mech = compile(ujModel(bendDeg, end), CATALOG, {version: 2, ground: false});
    const motor = mech.joints.find(j => j.motor);
    mech.bodies.find(b => b.id === motor.body1).motion = 'static';
    mech.bodies.find(b => b.parts.includes('beam')).motion = 'static';
    return {mech, motor};
};

test('compiled: two U-joint ends fork in fork on two axles are one universal joint; too bent or not square, a warning', () => {
    for (const end of ['62520.dat', '3712.dat', '575.dat']) {
        const {mech} = compileUj(30, end);
        const ujs = mech.couplings.filter(c => c.kind === 'universalJoint');
        assert.equal(ujs.length, 1, `${end}: ${JSON.stringify(mech.diagnostics)}`);
        const u = ujs[0];
        const bend = Math.acos(-dot(u.shaft1, u.shaft2)) / DEG;
        assert.ok(Math.abs(bend - 30) < 1e-6, `${end}: bend ${bend}°`);
        assert.ok(Math.abs(dot(u.fork1, u.fork2)) < 1e-9);
        assert.ok(mech.noCollide.some(([a, b]) => [a, b].includes(u.body1) && [a, b].includes(u.body2)), 'the two ends do not collide');
    }
    const bent = compile(ujModel(UJ_MAX_BEND_DEG + 5), CATALOG, {version: 2, ground: false});
    assert.equal(bent.couplings.filter(c => c.kind === 'universalJoint').length, 0);
    assert.ok(bent.diagnostics.some(d => d.code === 'uj-too-bent'));
    const model = ujModel(0);
    model.parts.find(p => p.id === 'u2').rotation = [1, 0, 0, 0, 0, -1, 0, 1, 0]; // fork along x, like u1's
    const twisted = compile(model, CATALOG, {version: 2, ground: false});
    assert.ok(twisted.diagnostics.some(d => d.code === 'uj-not-square'));
});

test('compiled: the motor drives the second axle through the joint, 1:1 straight and on average at 30°', t => {
    for (const bendDeg of [0, 30]) {
        const {mech, motor} = compileUj(bendDeg);
        const shaft2 = mech.bodies.find(b => b.parts.includes('a2')).id;
        const out = mech.joints.find(j => j.type === 'hinge' && (j.body1 === shaft2 || j.body2 === shaft2));
        const core = createPhysicsCore(J, mech, {stepHz: HZ});
        const a0 = [core.jointState(motor.id).angle, core.jointState(out.id).angle];
        core.setMotor(motor.id, {mode: 'velocity', radPerSec: Math.PI});
        for (let i = 0; i < 2 * HZ; i++) core.step(1 / HZ); // one turn
        const din = core.jointState(motor.id).angle - a0[0];
        const dout = core.jointState(out.id).angle - a0[1];
        core.destroy();
        t.diagnostic(`bend ${bendDeg}°: motor ${(din / DEG).toFixed(2)}°, output ${(dout / DEG).toFixed(2)}°`);
        assert.ok(Math.abs(din) > 300 * DEG, `the motor turned ${din / DEG}°`);
        assert.ok(Math.abs(Math.abs(dout) - Math.abs(din)) < 2 * DEG, `bend ${bendDeg}°: output ${dout / DEG}° for ${din / DEG}°`);
    }
});
