// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Robot Lab validation, round 2: more test machines built from real LEGO parts
 * (test/fixtures/bw-sim/machines-2/*.ldr, each header says how it is built), run through the
 * real pipeline — LDraw text → parseModel → compile (CompiledMechanism v2) → the Jolt core →
 * the virtual SPIKE hub with its DC motor model (hub-bridge.js) where a motor drives, the
 * hub's sensors where one measures — and compared with answers derived HERE from the parts'
 * catalogue geometry and documented physics. No expected number is read back from a simulation.
 * Round 1 is test/bw-sim-validation.test.mjs; docs/ROBOT-LAB-VALIDATION.md has both tables.
 *
 * Every fixture is a real build: test/bw-sim-models-solid.test.mjs walks
 * test/fixtures/bw-sim/ (colliders and LDraw meshes do not interpenetrate, no pin
 * overreaches, no two pins share a hole); the first test here checks that each one is
 * connected and compiles without diagnostics.
 *
 * A machine the simulation gets wrong is a `todo` test that states the expected value, the
 * measured one and the diagnosis. Benches: as in round 1, a machine "on the bench" has the
 * body that carries its frame made static (the vice).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {LDU_M} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SimHubBridge, STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {deviceModels} from '../overlay/scratch-gui/src/lib/bw-sim/devices/catalog.js';
import {SPIKE_PRIME_PROFILE} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/profile.js';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const MACHINES = path.join(ROOT, 'test/fixtures/bw-sim/machines-2');
const STEP_HZ = 1000 / STEP_MS; // 200 Hz, the app's step
const DT = 1 / STEP_HZ;
const DEG = 180 / Math.PI;

const ldr = file => parseModel(readFileSync(file, 'utf8'), {catalog: CATALOG}).model;
const machine = name => ldr(path.join(MACHINES, name));
const shipped = name => ldr(path.join(GUI, MODELS_BASE, name));
const meta = part => CATALOG.get(part);
const teeth = part => meta(part).gear.teeth;
const bodyOf = (mech, partId) => mech.bodies.find(b => b.parts.includes(partId));
const motorJoints = mech => mech.joints.filter(j => j.motor);
const motorJoint = mech => {
    const motors = motorJoints(mech);
    assert.equal(motors.length, 1, 'one motor');
    return motors[0];
};
/** The hinge that carries a body (the one joint with it on either side, other than `except`). */
const hingeOf = (mech, bodyId) => {
    const js = mech.joints.filter(j => j.type === 'hinge' && (j.body1 === bodyId || j.body2 === bodyId));
    assert.equal(js.length, 1, `one hinge on ${bodyId}`);
    return js[0];
};
const clamp = (mech, bodyId) => {
    const b = mech.bodies.find(x => x.id === bodyId);
    b.motion = 'static';
    b.massKg = 0;
    return b.id;
};
const run = (core, seconds, each) => {
    for (let i = 0; i < Math.round(seconds * STEP_HZ); i++) {
        core.step(DT);
        if (each) each(i);
    }
};
const withHub = (mech, hubBody) => {
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    const hub = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState: hub, core, mechanism: mech, hubBody});
    return {core, hub, bridge, dispose: () => { bridge.dispose(); core.destroy(); }};
};
/** Advance the hub's world in STEP_MS steps for `ms`, letting the hub's promises settle every 50 ms. */
const tick = async (bridge, ms, each) => {
    for (let t = 0; t < ms; t += STEP_MS) {
        const frame = bridge.step();
        if (each) each(t, frame);
        if (t % 50 === 0) {
            for (const h of bridge.hubs) h.hub.publish();
            await new Promise(resolve => setImmediate(resolve));
        }
    }
    for (const h of bridge.hubs) h.hub.publish();
};
const relErr = (a, e) => Math.abs(a - e) / Math.abs(e);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
/** A 3 × 3 row-major matrix times a vector. */
const mul = (m, v) => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
/** LDraw (LDU, −y up, the model's frame) to world (m, y up), as contracts.js lduToWorld: (x, −y, −z)·LDU. */
const toWorld = p => [p[0] * LDU_M, -p[1] * LDU_M, -p[2] * LDU_M];
const dirWorld = d => [d[0], -d[1], -d[2]];
const qmul = ([ax, ay, az, aw], [bx, by, bz, bw]) => [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
const qconj = ([x, y, z, w]) => [-x, -y, -z, w];
/** Rotate v by the unit quaternion [x, y, z, w]. */
const qrot = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
/** Rotation of a body about world +y (counter-clockwise seen from above positive), rad. */
const yawOf = q => {
    const v = qrot(q, [1, 0, 0]);
    return Math.atan2(-v[2], v[0]);
};
/**
 * A hinge's rate sign: a hinge angle θ measures body2 about the joint axis a relative to body1
 * (the frame here), so a gear's world rate along a is s·θ̇, s = +1 if the gear is body2, −1 if body1.
 */
const sideOf = (j, bodyId) => (j.body2 === bodyId ? 1 : -1);

/** Diagnostics a fixture has by design: its loose parts are the point of the machine. */
const EXPECTED_DIAGNOSTICS = {
    'tilt-table-tower.ldr': ['loose-part'], // the tower stands on the table, unfastened
    'carts.ldr': ['loose-part', 'loose-part'] // two free carts ahead of the robot
};

// ---------------------------------------------------------------------------------------------
test('the round-2 machines are real, connected builds that compile cleanly', () => {
    const names = readdirSync(MACHINES).filter(f => f.endsWith('.ldr')).sort();
    assert.ok(names.length >= 6, names.join(', '));
    for (const name of names) {
        const model = machine(name);
        for (const p of model.parts) assert.deepEqual(solidOverlaps(model, CATALOG, p), [], `${name}: ${p.id}`);
        const mech = compile(model, CATALOG, {version: 2});
        assert.deepEqual(mech.diagnostics.map(d => d.code), EXPECTED_DIAGNOSTICS[name] || [], `${name}: ${JSON.stringify(mech.diagnostics)}`);
    }
});

// ---- A. a 1:243 gear train ------------------------------------------------------------------
test('gear train 1:243 (five 8:24 stages): ratio exact, sign by the stage count, no drift over 10 s', async t => {
    // Expected: each 8:24 external mesh of parallel axes turns the driven gear the other way at
    // 8/24: θ̇_out/θ̇_in = (−8/24)^5 · s_in·s_out·(a_in·a_out) = −1/243 (a = the hinge axes).
    // Tolerance 0.5 % on the ratio (gear constraints are exact kinematics; solver residual) and
    // the same ratio over the run's first and second halves within 0.5 % (no creep through five
    // compliant stages). The output moves ~40° in 10 s, so 0.5 % is 0.2°.
    const mech = compile(machine('gear-train-243.ldr'), CATALOG, {version: 2, ground: false});
    const mj = motorJoint(mech);
    const housing = clamp(mech, mj.body1);
    const out = bodyOf(mech, 'gOut').id;
    const oj = hingeOf(mech, out);
    const model = machine('gear-train-243.ldr');
    const partOf = id => model.parts.find(p => p.id === id).part;
    // Stage k: the 8T g{k}in8 drives the 24T on the next axle (g{k+1}out24; the last is gOut).
    const stages = [0, 1, 2, 3, 4].map(k => -teeth(partOf(`g${k}in8`)) / teeth(partOf(k === 4 ? 'gOut' : `g${k + 1}out24`)));
    const expected = stages.reduce((a, b) => a * b, 1) * sideOf(mj, mj.body2) * sideOf(oj, out) * dot(mj.axis, oj.axis);
    const {core, hub, bridge, dispose} = withHub(mech, housing);
    const m0 = core.jointState(mj.id).angle;
    const o0 = core.jointState(oj.id).angle;
    hub.motors.runAtSpeed('A', 900);
    await tick(bridge, 200);
    const sample = () => [core.jointState(mj.id).angle, core.jointState(oj.id).angle];
    const s1 = sample();
    await tick(bridge, 5000);
    const s2 = sample();
    await tick(bridge, 5000);
    const s3 = sample();
    // Then stop and hold: the controller overshoots ~60° and is back on its target within 0.5 s;
    // from 1 s on, the output must not creep while the motor holds.
    hub.motors.stop('A', 'hold');
    await tick(bridge, 1000);
    const s4 = sample();
    await tick(bridge, 2000);
    const s5 = sample();
    dispose();
    const r1 = (s2[1] - s1[1]) / (s2[0] - s1[0]);
    const r2 = (s3[1] - s2[1]) / (s3[0] - s2[0]);
    const total = (s3[1] - o0) / (s3[0] - m0);
    t.diagnostic(`motor ${((s3[0] - m0) * DEG).toFixed(0)}°, output ${((s3[1] - o0) * DEG).toFixed(3)}°; ratio ${(1 / total).toFixed(3)}:1 ` +
        `(first half 1/${(1 / r1).toFixed(3)}, second 1/${(1 / r2).toFixed(3)}) vs 1/${(1 / expected).toFixed(0)}; ` +
        `held 2 s: motor ${((s5[0] - s4[0]) * DEG).toFixed(4)}°, output ${((s5[1] - s4[1]) * DEG).toFixed(5)}°`);
    assert.ok(Math.abs((s3[0] - m0) * DEG) > 5000, 'the motor turned');
    assert.ok(relErr(total, expected) <= 0.005, `ratio ${total} vs ${expected}`);
    assert.ok(relErr(r1, r2) <= 0.005, `ratio drifted: ${r1} then ${r2}`);
    assert.ok(Math.abs((s5[1] - s4[1]) * DEG) <= 0.05, 'the held output does not creep');
});

// ---- B. worm then spur: ratio and direction from the thread's hand ----------------------------
test('worm then spur: 1/24 with the direction a right-hand thread gives', async t => {
    // Derived from the placed parts (fixture header), world frame. A right-hand single-start thread
    // r(φ) = (r cos φ, r sin φ, k·φ) along the worm's axis a, k = lead/2π = π·m/2π = 1.25 LDU per rad
    // (module m = 1 mm = 2.5 LDU): turning the worm by +Δ about +a, the thread at a fixed place drops
    // by k·Δ along a (the helix point now there came from angle −Δ). The wheel's tooth in the thread
    // at the contact P (the wheel's pitch point nearest the worm axis) moves with it:
    //   ω_wheel·((a_w × (P − C_w))·a) = −hand·k·ω_worm.
    // Then two 8T on parallel axes: ω_out = −ω_wheel·(8/8). Tolerance 0.5 % (exact kinematics).
    const model = machine('worm-then-spur.ldr');
    const placed = id => model.parts.find(p => p.id === id);
    const axisOf = id => dirWorld(mul(placed(id).rotation, meta(placed(id).part).gear?.axis ||
        meta(placed(id).part).connectors.find(c => c.type === 'worm').axis));
    const worm = placed('worm');
    const thread = meta(worm.part).connectors.find(c => c.type === 'worm').data;
    const a = axisOf('worm');
    const aw = axisOf('wheel');
    const Cw = toWorld(placed('wheel').position);
    const wormAt = toWorld(worm.position);
    // P: from the wheel centre towards the worm axis, one wheel pitch radius (1.25 LDU per tooth).
    const toAxis = sub(sub(wormAt, Cw), a.map(v => v * dot(sub(wormAt, Cw), a)));
    const n = toAxis.map(v => v / Math.hypot(...toAxis));
    const P = Cw.map((v, i) => v + n[i] * 1.25 * teeth(placed('wheel').part) * LDU_M);
    const k = 1.25 * LDU_M * thread.starts;
    const wheelPerWorm = -thread.hand * k / dot(cross(aw, sub(P, Cw)), a);
    const ao = axisOf('gOut');
    const outPerWheel = -(teeth(placed('g8a').part) / teeth(placed('gOut').part)) * dot(aw, ao);
    const expected = wheelPerWorm * outPerWheel; // ω_out about ao per ω_worm about a

    const mech = compile(model, CATALOG, {version: 2, ground: false});
    const mj = motorJoint(mech);
    const housing = clamp(mech, mj.body1);
    const out = bodyOf(mech, 'gOut').id;
    const oj = hingeOf(mech, out);
    const {core, hub, bridge, dispose} = withHub(mech, housing);
    hub.motors.runAtSpeed('A', 600);
    await tick(bridge, 300);
    const m0 = core.jointState(mj.id).angle;
    const o0 = core.jointState(oj.id).angle;
    await tick(bridge, 3000);
    const wm = (core.jointState(mj.id).angle - m0) * sideOf(mj, mj.body2) * dot(mj.axis, a);
    const wo = (core.jointState(oj.id).angle - o0) * sideOf(oj, out) * dot(oj.axis, ao);
    dispose();
    t.diagnostic(`worm turned ${(wm * DEG).toFixed(0)}° about its axis; output/worm ${(wo / wm).toFixed(5)} vs ${expected.toFixed(5)} ` +
        `(hand ${thread.hand}, wheel ${teeth(placed('wheel').part)}T, then 8:8)`);
    assert.ok(Math.abs(wm * DEG) > 1000, 'the worm turned');
    assert.ok(relErr(wo / wm, expected) <= 0.005, `output/worm ${wo / wm} vs ${expected}`);
});

// ---- C. motor under load: slip-clutch brake dynamometers ------------------------------------------
/**
 * The DC line of the medium motor at the hub port's supply, from Philo's raw 9 V measurements (the
 * device's `measured.philo`) by the method devices/catalog.js documents: R = 9 V / I_stall,
 * k_t = τ_stall / (I_stall − i0), k_e = (9 V − R·i0) / ω_noLoad; at V: τs = k_t·(V/R − i0),
 * ω0 = (V − R·i0)/k_e. At full duty against a load τL at the shaft the motor settles where
 * τs·(1 − ω/ω0) = τL: ω = ω0·(1 − τL/τs).
 */
const MEDIUM_LINE = (() => {
    const p = deviceModels.get('spike-medium-angular').measured.philo;
    const R = 9 / p.stallA;
    const kt = p.stallNcm / 100 / (p.stallA - p.noLoadA);
    const ke = (9 - R * p.noLoadA) / (p.noLoadRpm * 2 * Math.PI / 60);
    const V = SPIKE_PRIME_PROFILE.ports.find(q => q.id === 'A').supplyVolts;
    return {V, stallNm: kt * (V / R - p.noLoadA), noLoadRadPerSec: (V - R * p.noLoadA) / ke};
})();
/** The white 24T clutch gear's slip torque, from its catalogue entry (the stamped 2.5–5 N·cm, centre). */
const SLIP_NM = meta('76019.dat').connectors.find(c => c.type === 'clutch-axlehole').data.slipTorqueNm;

const dynoRuns = new Map();
/** Run a dynamometer at full duty (the hub asked for more than the motor can do); memoised per fixture. */
const dyno = async name => {
    if (dynoRuns.has(name)) return dynoRuns.get(name);
    const model = machine(name);
    const mech = compile(model, CATALOG, {version: 2, ground: false});
    const mj = motorJoint(mech);
    const housing = clamp(mech, mj.body1);
    clamp(mech, bodyOf(mech, 'axleOut').id); // the brake: the output axle is held
    const clutch = bodyOf(mech, 'clutch').id;
    const {core, hub, bridge, dispose} = withHub(mech, housing);
    hub.motors.runAtSpeed('A', deviceModels.get('spike-medium-angular').motor.servoMaxDegPerSec);
    await tick(bridge, 1000);
    const m0 = core.jointState(mj.id).angle;
    const duties = [];
    let ring = 0;
    await tick(bridge, 2000, (ms, frame) => {
        duties.push(Object.values(frame.hubs)[0].drives[0].duty);
        ring += Math.abs(core.bodyAngularVelocity(clutch)[1]) * DT;
    });
    const r = {motor: (core.jointState(mj.id).angle - m0) / 2, ring: ring / 2, duty: [Math.min(...duties), Math.max(...duties)], model};
    dispose();
    dynoRuns.set(name, r);
    return r;
};

test('motor under load, direct: a medium motor against the slip clutch settles on its DC line', async t => {
    // The clutch's ring is held by the 24T on the held axle; its hub turns with the motor and slips at
    // SLIP_NM: τL = SLIP_NM at the shaft. Expected ω = ω0·(1 − τL/τs). Tolerance 1 %: the DC model is
    // applied exactly (implicit back-EMF damping); what remains is the hub's speed loop at saturation
    // and the step.
    const r = await dyno('dyno-direct.ldr');
    const expected = MEDIUM_LINE.noLoadRadPerSec * (1 - SLIP_NM / MEDIUM_LINE.stallNm);
    t.diagnostic(`line at ${MEDIUM_LINE.V} V: τs ${(MEDIUM_LINE.stallNm * 100).toFixed(2)} N·cm, ω0 ${MEDIUM_LINE.noLoadRadPerSec.toFixed(3)} rad/s; ` +
        `load ${(SLIP_NM * 100).toFixed(2)} N·cm → ${expected.toFixed(3)} rad/s; measured ${r.motor.toFixed(3)} rad/s ` +
        `(${(relErr(r.motor, expected) * 100).toFixed(2)} %), duty ${r.duty.map(v => v.toFixed(3)).join('…')}`);
    assert.deepEqual(r.duty, [1, 1], 'the hub drives at full duty');
    assert.ok(relErr(r.motor, expected) <= 0.01, `ω ${r.motor} vs ${expected}`);
});

test('motor under load through an 8:24 mesh: the clutch\'s torque reaches the motor divided by 3', {
    todo: 'GEAR TORQUE 1:1 — the gear constraint (Jolt GearConstraint as jolt-core.js buildGearConstraint makes it) ' +
        'enforces ω2 = ratio·ω1 but passes torque 1:1: the motor works against the full slip torque, as if direct ' +
        '(upstream Jolt GearConstraintPart applies λ, not ratio·λ, to body 2); see docs/ROBOT-LAB-VALIDATION.md'
}, async t => {
    // The 8T drives the clutch gear (24T) whose hub is held: its ring turns at ω/3 and slips at SLIP_NM,
    // which an ideal mesh brings to the motor as SLIP_NM·8/24: ω = ω0·(1 − SLIP_NM/(3·τs)). Tolerance 1 %.
    const r = await dyno('dyno-geared.ldr');
    const placed = id => r.model.parts.find(p => p.id === id).part;
    const n = teeth(placed('gIn')) / teeth(placed('clutch'));
    const expected = MEDIUM_LINE.noLoadRadPerSec * (1 - SLIP_NM * n / MEDIUM_LINE.stallNm);
    const asIfDirect = MEDIUM_LINE.noLoadRadPerSec * (1 - SLIP_NM / MEDIUM_LINE.stallNm);
    t.diagnostic(`expected ${expected.toFixed(3)} rad/s (load ${(SLIP_NM * n * 100).toFixed(2)} N·cm at the motor); measured ` +
        `${r.motor.toFixed(3)} rad/s — the direct bench's ${asIfDirect.toFixed(3)}; ring/motor ${(r.ring / r.motor).toFixed(4)} (kinematics right)`);
    assert.ok(relErr(r.motor, expected) <= 0.01, `ω ${r.motor} vs ${expected}`);
});

test('gearbox efficiency under load: power out of the 8:24 mesh = power in (ideal gears)', {
    todo: 'the same gear-torque bug: the motor puts in 3× the power the slipping clutch takes out (η = 1/3)'
}, async t => {
    // Input power at the shaft: the DC line's torque at the measured speed (full duty) times that
    // speed, τ_in = τs·(1 − ω/ω0) (it contains the gearbox friction, which is the motor's, not the
    // mesh's). Output: the clutch slipping at SLIP_NM at the ring's speed. Ideal spur gears: η = 1;
    // tolerance 3 % (the speed loop's residual on both speeds).
    const r = await dyno('dyno-geared.ldr');
    const tauIn = MEDIUM_LINE.stallNm * (1 - r.motor / MEDIUM_LINE.noLoadRadPerSec);
    const eta = SLIP_NM * r.ring / (tauIn * r.motor);
    t.diagnostic(`in ${(tauIn * r.motor * 1000).toFixed(1)} mW (${(tauIn * 100).toFixed(2)} N·cm at ${r.motor.toFixed(2)} rad/s), ` +
        `out ${(SLIP_NM * r.ring * 1000).toFixed(1)} mW (${(SLIP_NM * 100).toFixed(2)} N·cm at ${r.ring.toFixed(2)} rad/s): η ${eta.toFixed(3)}`);
    assert.ok(Math.abs(eta - 1) <= 0.03, `η ${eta}`);
});

test('rack and pinion carries force in proportion (control for the gear bug): the Forklift holds its carriage with m·g·r', t => {
    // Statics: the carriage (every part on the mast's slider body, catalogue masses) hangs on the
    // 8T pinion, r = 1.25 LDU per tooth = 4 mm: holding torque m·g·r. The motor in torque mode (the
    // DC model's form: τ = T − c·ω) with T 10 % below and above it: the carriage sinks, then rises.
    // (Jolt's RackAndPinionConstraint — the same constraint family as the gear — passes the force
    // right: the gear bug is the GearConstraint's alone.)
    const model = shipped('forklift.ldr');
    const mech0 = compile(model, CATALOG, {version: 2, ground: false});
    const slider = mech0.joints.find(j => j.type === 'slider');
    const carriage = bodyOf(mech0, 'rack');
    assert.ok(slider.body1 === carriage.id || slider.body2 === carriage.id, 'the rack rides the slider');
    const m = carriage.parts.reduce((s, id) => s + meta(model.parts.find(p => p.id === id).part).massGrams, 0) / 1000;
    const pinion = model.parts.find(p => p.id === 'pinion');
    const hold = m * 9.81 * 1.25 * teeth(pinion.part) * LDU_M;
    const trial = T => {
        const mech = compile(model, CATALOG, {version: 2, ground: false});
        clamp(mech, bodyOf(mech, 'hub').id);
        const mj = motorJoint(mech);
        const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
        core.setMotor(mj.id, {mode: 'torque', torqueNm: T, dampingNmsPerRad: 0.0005});
        const y0 = core.bodyPose(carriage.id).position[1];
        run(core, 0.3);
        const dy = core.bodyPose(carriage.id).position[1] - y0;
        core.destroy();
        return dy;
    };
    // The sign of the lifting torque: the Forklift program raises with a positive turn (round 1, test 3).
    const below = trial(0.9 * hold);
    const above = trial(1.1 * hold);
    t.diagnostic(`carriage ${(m * 1000).toFixed(1)} g, hold ${(hold * 1000).toFixed(3)} mN·m; at 0.9× it moved ${(below * 1000).toFixed(3)} mm, ` +
        `at 1.1× ${(above * 1000).toFixed(3)} mm in 0.3 s`);
    assert.ok(below < 0 && above > 0, 'the holding torque lies within ±10 % of m·g·r');
});

// ---- D. a driving base on a circle; its gyro and encoders ---------------------------------------
/**
 * The shipped driving base (round 1, test 8): wheel radius 70 LDU (catalogue collider) = 28 mm,
 * wheel centres at x = ±170 LDU: track 136 mm. Left wheel A (forward = negative), right wheel B
 * (forward = positive). Rolling without slip, with v_L = −θ̇_A·r and v_R = θ̇_B·r measured by the
 * encoders: yaw rate Ω = (v_R − v_L)/track (counter-clockwise from above positive), the axle
 * midpoint runs on a circle of radius R = track/2 · (v_R + v_L)/(v_R − v_L) (outer/inner wheel speed
 * ratio = (R + t/2)/(R − t/2)).
 */
const circleRun = (() => {
    let result = null;
    return async () => {
        if (result) return result;
        const model = shipped('driving-base.ldr');
        const r = meta('39367p01.dat').colliders[0].radius * LDU_M;
        const xs = model.parts.filter(p => p.part === '39367p01.dat').map(p => p.position[0]);
        const track = (Math.max(...xs) - Math.min(...xs)) * LDU_M;
        const mech = compile(model, CATALOG, {version: 2});
        const hubBody = bodyOf(mech, 'hub').id;
        const wl = bodyOf(mech, 'wheelL').id;
        const wr = bodyOf(mech, 'wheelR').id;
        const jl = motorJoints(mech).find(j => j.motor.port === 'A');
        const {core, hub, bridge, dispose} = withHub(mech, hubBody);
        hub.motors.runAtSpeed('A', -300);
        hub.motors.runAtSpeed('B', 150);
        await tick(bridge, 1000);
        const mid = () => {
            const a = core.bodyPose(wl).position;
            const b = core.bodyPose(wr).position;
            return [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
        };
        // The left wheel's turn relative to the chassis about the chassis's axle direction (its x at t = 0).
        const wheelTurn = () => {
            const q = qmul(qconj(core.bodyPose(hubBody).rotation), core.bodyPose(wl).rotation);
            const s = dot(q.slice(0, 3), dirOfHinge);
            return 2 * Math.atan2(s, q[3]);
        };
        const dirOfHinge = jl.axis; // the hinge's world axis at t = 0 = the chassis-frame axle direction (the chassis starts unrotated)
        let yaw = 0;
        let prev = yawOf(core.bodyPose(hubBody).rotation);
        let path = 0;
        let pm = mid();
        let turn = 0;
        let prevTurn = wheelTurn();
        let gyro = 0;
        const encA0 = hub.data.motors[0].position;
        const encB0 = hub.data.motors[1].position;
        const imuYaw0 = hub.data.imu.yaw;
        const T = 3;
        await tick(bridge, T * 1000, () => {
            const y = yawOf(core.bodyPose(hubBody).rotation);
            yaw += wrap(y - prev);
            prev = y;
            const m = mid();
            path += Math.hypot(m[0] - pm[0], m[1] - pm[1]);
            pm = m;
            const w = wheelTurn();
            turn += wrap(w - prevTurn);
            prevTurn = w;
            gyro += hub.data.imu.angularVelocity.z * DT;
        });
        const encA = hub.data.motors[0].position - encA0;
        const encB = hub.data.motors[1].position - encB0;
        const imuYaw = hub.data.imu.yaw - imuYaw0;
        dispose();
        result = {r, track, T, yaw, path, turn, gyro, encA, encB, imuYaw};
        return result;
    };
})();

test('driving base on a circle (A 300 °/s, B 150 °/s): yaw rate and radius from the wheel speeds', async t => {
    // Tolerance 1 %: tyre scrub on a curve and the castor's drag (round 1's straight and spin runs: < 0.1 %).
    const c = await circleRun();
    const vL = -c.encA / DEG / c.T * c.r;
    const vR = c.encB / DEG / c.T * c.r;
    const omega = (vR - vL) / c.track;
    const R = c.track / 2 * (vR + vL) / (vR - vL);
    const measuredOmega = c.yaw / c.T;
    const measuredR = c.path / Math.abs(c.yaw);
    t.diagnostic(`encoders A ${c.encA.toFixed(1)}°, B ${c.encB.toFixed(1)}° in ${c.T} s: Ω ${(omega * DEG).toFixed(3)} °/s, R ${(Math.abs(R) * 1000).toFixed(2)} mm ` +
        `(outer/inner ${(Math.abs(vL) / Math.abs(vR)).toFixed(3)} = (R + t/2)/(R − t/2) ${((Math.abs(R) + c.track / 2) / (Math.abs(R) - c.track / 2)).toFixed(3)}); ` +
        `measured Ω ${(measuredOmega * DEG).toFixed(3)} °/s, R ${(measuredR * 1000).toFixed(2)} mm`);
    assert.ok(relErr(measuredOmega, omega) <= 0.01, `Ω ${measuredOmega} vs ${omega}`);
    assert.ok(relErr(measuredR, Math.abs(R)) <= 0.01, `R ${measuredR} vs ${R}`);
});

test('driving base on a circle: the hub\'s yaw and gyro agree with the body\'s turn; the encoder with the wheel\'s', async t => {
    // The SPIKE hub's yaw is clockwise positive seen from above (spike-hub-state.js setHeading), so it
    // reads minus the counter-clockwise geometric yaw; its gyro z is the rate about the hub's up axis,
    // right-hand (counter-clockwise positive), and integrates to the geometric yaw. The encoder of
    // port A reads the motor's shaft, on which the wheel sits: its change equals the wheel's turn
    // relative to the chassis about the axle. Tolerances: yaw and encoder 0.1° (the same rigid-body
    // pose, read two ways); gyro 0.5 % (a 5 ms rectangle-rule integral of a rate that ramps).
    const c = await circleRun();
    t.diagnostic(`geometric yaw ${(c.yaw * DEG).toFixed(3)}° (ccw); hub yaw ${c.imuYaw.toFixed(3)}° (cw); gyro ∫ ${c.gyro.toFixed(3)}°; ` +
        `encoder A ${c.encA.toFixed(3)}° vs wheel ${(c.turn * DEG).toFixed(3)}°`);
    assert.ok(Math.abs(c.imuYaw + c.yaw * DEG) <= 0.1, `hub yaw ${c.imuYaw} vs ${-c.yaw * DEG}`);
    assert.ok(relErr(c.gyro, c.yaw * DEG) <= 0.005, `gyro ${c.gyro} vs ${c.yaw * DEG}`);
    assert.ok(Math.abs(c.encA - c.turn * DEG) <= 0.1, `encoder ${c.encA} vs wheel ${c.turn * DEG}`);
});

// ---- E. sensors: distance to a wall, colour of the mat ------------------------------------------
/** A sensor's probe in world (m) at t = 0 from its placed part and the catalogue's probe. */
const probeOf = (model, id) => {
    const p = model.parts.find(q => q.id === id);
    const pr = meta(p.part).probe;
    return {origin: toWorld(mul(p.rotation, pr.origin).map((v, i) => v + p.position[i])), direction: dirWorld(mul(p.rotation, pr.direction))};
};

test('distance sensor (the Wall Stopper\'s) reads the ray distance to a wall at 0 … 40° and the 50 … 2000 mm range', async t => {
    // A 2 cm wall, 3 m wide, its face a perpendicular distance D from the probe origin and turned by
    // ψ about the vertical: the ray along the probe direction meets it at D / cos ψ (SPIKE: mm,
    // rounded; −1 outside 50 … 2000 mm, docs/SPIKE-ARENA.md). Tolerance 1 mm (rounding, and the robot
    // settling on its wheels by a fraction of a millimetre).
    const model = shipped('wall-stopper.ldr');
    const {origin: o, direction: d} = probeOf(model, 'eyes');
    const cases = [[0.03, 0], [0.1, 0], [0.3, 0], [0.3, 20], [0.3, 40], [0.8, 0], [1.5, 30], [2.2, 0]];
    const out = [];
    for (const [D, psi] of cases) {
        const yr = psi * Math.PI / 180;
        const n = [Math.sin(yr), 0, Math.cos(yr)]; // the face's normal, towards the robot (whose forward is −z)
        const th = 0.02;
        const foot = o.map((v, i) => v - n[i] * D);
        const centre = [foot[0] - n[0] * th / 2, 0, foot[2] - n[2] * th / 2];
        const mech = compile(model, CATALOG, {version: 2, obstacles: [{id: 'wall', shape: 'box', size: [3, 0.2, th], position: centre, yawDeg: psi}]});
        const {hub, bridge, dispose} = withHub(mech, bodyOf(mech, 'hub').id);
        await tick(bridge, 100);
        const reading = hub.data.sensors[3].distance;
        dispose();
        const along = D / -dot(n, d);
        const expected = along * 1000 >= 50 && along * 1000 <= 2000 ? along * 1000 : -1;
        out.push({D, psi, reading, expected});
    }
    t.diagnostic(out.map(c => `${c.D * 1000} mm at ${c.psi}°: ${c.reading} (expected ${c.expected === -1 ? -1 : c.expected.toFixed(1)})`).join('; '));
    for (const c of out) {
        if (c.expected === -1) assert.equal(c.reading, -1, `${c.D} m at ${c.psi}°`);
        else assert.ok(Math.abs(c.reading - c.expected) <= 1, `${c.D} m at ${c.psi}°: ${c.reading} vs ${c.expected}`);
    }
});

test('colour sensor (the Colour Explorer\'s) over the colour-zones mat: each zone\'s colour; reflection by height', async t => {
    // The mat (world/mats.js 'colour-zones', as documented there): 1 × 1 m white, a 20 mm black border
    // (|x| or |z| ≥ 0.48 m), squares of 0.3 m centred at (±0.35, ±0.35): red (−,−), yellow (+,−),
    // green (−,+), blue (+,+); off the mat white. SPIKE colour numbers: black 0, blue 3, green 6,
    // yellow 7, red 9, white 10. The robot is moved so its probe is over each spot. Reflection of
    // white: 100 · (1 − h/32 mm) (sensors.js's S1 model) at the probe's height h above the floor,
    // here from the geometry: probe origin minus the floor (the robot's lowest point) — ±2 (the robot
    // settling on its tyres).
    const base = shipped('colour-explorer.ldr');
    const eye = probeOf(base, 'eye');
    const spots = [[0, 0, 10], [-0.35, -0.35, 9], [0.35, -0.35, 7], [-0.35, 0.35, 6], [0.35, 0.35, 3], [0, 0.49, 0], [0.6, 0, 10]];
    const out = [];
    for (const [x, z, colour] of spots) {
        const dx = (x - eye.origin[0]) / LDU_M;
        const dz = -(z - eye.origin[2]) / LDU_M;
        const model = {...base, parts: base.parts.map(p => ({...p, position: [p.position[0] + dx, p.position[1], p.position[2] + dz]}))};
        const mech = compile(model, CATALOG, {version: 2, mat: 'colour-zones'});
        const ground = mech.bodies.find(b => b.id === 'ground');
        const h = eye.origin[1] - (ground.position[1] + ground.colliders[0].halfExtents[1]);
        const {hub, bridge, dispose} = withHub(mech, bodyOf(mech, 'hub').id);
        await tick(bridge, 300);
        out.push({x, z, colour, h, reading: {...hub.data.sensors[2]}});
        dispose();
    }
    t.diagnostic(out.map(c => `(${c.x}, ${c.z}): colour ${c.reading.color} (expected ${c.colour}), reflection ${c.reading.reflection}`).join('; ') +
        `; probe ${(out[0].h * 1000).toFixed(1)} mm above the floor → white ${(100 * (1 - out[0].h / 0.032)).toFixed(1)}`);
    for (const c of out) assert.equal(c.reading.color, c.colour, `(${c.x}, ${c.z})`);
    for (const c of out.filter(q => q.colour === 10)) assert.ok(Math.abs(c.reading.reflection - 100 * (1 - c.h / 0.032)) <= 2, `reflection ${c.reading.reflection}`);
});

// ---- F. a brick tower on a tilting table ------------------------------------------------------------
test('tilting table: a loose tower of two 1 × 1 × 3 bricks tips at tan θ = (half base) / (COM height)', {
    todo: 'the tower tips between 5° and 10° (direction-dependent) against 7.8°: it rocks on its 8 mm footprint — ' +
        'the loaded edge sinks into the 0.2 mm penetration slop (jolt-core.js LEGO_PENETRATION_SLOP_M; ' +
        'atan(0.2/8) = 1.4°, a static lean of 1.5° measured with the table still) and the table\'s steps set it rocking'
}, async t => {
    // Statics: the tower (one body: the bricks clutch stud in tube) stands on the table's top face
    // (y = −9 LDU) and tips over its bottom edge, 10 LDU (its collider's half width) from its centre
    // line, once the table is tilted by θc = atan(10 / h), h the centre of mass above the face —
    // each part's catalogue mass spread over its colliders (studs included) by volume. Static
    // friction 0.4 (PART_FRICTION) would let it slide only at 21.8°, so it tips first. The table is
    // tilted quasi-statically: 0.5° steps (run_for_degrees at 20 °/s), 0.5 s between; the tip angle
    // is the table angle at which the tower has turned 5° off it. Tolerance 0.5° (the steps).
    const model = machine('tilt-table-tower.ldr');
    const tower = model.parts.filter(p => p.id.startsWith('tower'));
    let mv = 0;
    let m = 0;
    let half = Infinity;
    for (const p of tower) {
        const cs = meta(p.part).colliders;
        const vol = cs.reduce((s, c) => s + c.halfExtents[0] * c.halfExtents[1] * c.halfExtents[2], 0);
        for (const c of cs) {
            const w = meta(p.part).massGrams * c.halfExtents[0] * c.halfExtents[1] * c.halfExtents[2] / vol;
            mv += w * (-9 - (p.position[1] + (c.position || [0, 0, 0])[1])); // height above the face (LDraw −y up)
            m += w;
            if (!c.region) half = Math.min(half, c.halfExtents[2]);
        }
    }
    const h = mv / m;
    const critical = Math.atan(half / h) * DEG;
    const tilt = async dir => {
        const mech = compile(model, CATALOG, {version: 2, ground: false});
        const mj = motorJoint(mech);
        const housing = clamp(mech, mj.body1);
        const towerBody = bodyOf(mech, 'towerLow').id;
        const {core, hub, bridge, dispose} = withHub(mech, housing);
        // Tilt about world x (the table's axis): the angle of a body's up vector in the y–z plane.
        const ang = q => {
            const v = qrot(q, [0, 1, 0]);
            return Math.atan2(v[2], v[1]) * DEG;
        };
        const t0 = ang(core.bodyPose(towerBody).rotation);
        const b0 = ang(core.bodyPose(mj.body2).rotation);
        await tick(bridge, 300);
        let standing = 0;
        let tipped = null;
        for (let k = 0; k < 40 && tipped === null; k++) {
            let done = false;
            hub.motors.runForDegrees('A', 0.5, 20 * dir).then(() => { done = true; });
            for (let i = 0; i < 40 && !done; i++) await tick(bridge, 50);
            await tick(bridge, 500);
            const table = ang(core.bodyPose(mj.body2).rotation) - b0;
            const towerTilt = wrap((ang(core.bodyPose(towerBody).rotation) - t0) / DEG) * DEG;
            if (Math.abs(towerTilt - table) > 5) tipped = table;
            else standing = table;
        }
        dispose();
        return {standing, tipped};
    };
    const out = [await tilt(1), await tilt(-1)];
    t.diagnostic(`COM ${h.toFixed(2)} LDU above the face, half base ${half} LDU: θc ${critical.toFixed(2)}°; ` +
        out.map(o => `stood at ${o.standing.toFixed(2)}°, tipped at ${o.tipped?.toFixed(2)}°`).join('; '));
    for (const o of out) assert.ok(o.tipped !== null && Math.abs(Math.abs(o.tipped) - critical) <= 0.5, `tipped at ${o.tipped}° vs ${critical}°`);
});

// ---- G. two free carts: momentum, restitution, rolling -------------------------------------------
/**
 * The robot pushes cart 1 by its rear tyres for 6 mm and stops (brake); cart 1 rolls on and hits cart 2
 * bumper to bumper (beam ends). Each cart's momentum is Σ m·v over its bodies (compiled masses = the
 * catalogue's part masses: 4.8 + 0.8 + 1.0 + 4 × 12 g = 54.6 g; checked against the catalogue below).
 */
const cartRuns = new Map();
const cartsRun = async ({heavyBumper = false} = {}) => {
    const key = heavyBumper ? 'heavy' : 'asBuilt';
    if (cartRuns.has(key)) return cartRuns.get(key);
    const model = machine('carts.ldr');
    const mech = compile(model, CATALOG, {version: 2});
    const bodiesOf = n => mech.bodies.filter(b => b.parts.some(p => p.startsWith(`cart${n}`)));
    const catalogueMass = n => model.parts.filter(p => p.id.startsWith(`cart${n}`)).reduce((s, p) => s + meta(p.part).massGrams, 0) / 1000;
    if (heavyBumper) for (const n of [1, 2]) bodyOf(mech, `cart${n}`).massKg = catalogueMass(n); // the control: all the mass in the bumper
    const mass = n => bodiesOf(n).reduce((s, b) => s + b.massKg, 0);
    const hubBody = bodyOf(mech, 'hub').id;
    const {core, hub, bridge, dispose} = withHub(mech, hubBody);
    // Forward is world −z: speeds along −z.
    const v = n => -bodiesOf(n).reduce((s, b) => s + b.massKg * core.bodyLinearVelocity(b.id)[2], 0) / mass(n);
    const z = n => core.bodyPose(bodyOf(mech, `cart${n}`).id).position[2];
    hub.motors.runAtSpeed('A', -400);
    hub.motors.runAtSpeed('B', 400);
    const z10 = z(1);
    for (let i = 0; i < 400 && Math.abs(z(1) - z10) < 0.006; i++) await tick(bridge, STEP_MS);
    hub.motors.stop('A', 'brake');
    hub.motors.stop('B', 'brake');
    const trace = [];
    await tick(bridge, 2000, ms => trace.push({ms, v1: v(1), v2: v(2)}));
    dispose();
    const hit = trace.findIndex(s => s.v2 > 1e-3);
    const before = trace[Math.max(0, hit - 4)];
    const after = trace[hit + 10];
    const end = trace[trace.length - 1];
    const r = {m1: mass(1), m2: mass(2), cat1: catalogueMass(1), cat2: catalogueMass(2), before, after, end, hit, trace};
    cartRuns.set(key, r);
    return r;
};

test('two carts collide: the sum of momenta is conserved', async t => {
    // During the 50 ms around the impact the only external horizontal forces are rolling losses
    // (Jolt's default 0.05 s⁻¹ damping: 0.25 % over 50 ms): Σ m·v before = Σ m·v after within 1 %.
    const c = await cartsRun();
    const p0 = c.m1 * c.before.v1 + c.m2 * c.before.v2;
    const p1 = c.m1 * c.after.v1 + c.m2 * c.after.v2;
    t.diagnostic(`carts ${(c.m1 * 1000).toFixed(1)} g / ${(c.m2 * 1000).toFixed(1)} g (catalogue ${(c.cat1 * 1000).toFixed(1)} g); ` +
        `before: v1 ${c.before.v1.toFixed(4)}, v2 ${c.before.v2.toFixed(4)} m/s; after: v1 ${c.after.v1.toFixed(4)}, v2 ${c.after.v2.toFixed(4)} m/s; ` +
        `momentum ${(p0 * 1000).toFixed(3)} → ${(p1 * 1000).toFixed(3)} g·m/s (${((p1 / p0 - 1) * 100).toFixed(2)} %)`);
    assert.ok(Math.abs(c.m1 - c.cat1) < 1e-9 && Math.abs(c.m2 - c.cat2) < 1e-9, 'compiled masses are the catalogue\'s');
    assert.ok(c.hit > 4, 'cart 1 was rolling free before it hit cart 2');
    assert.ok(relErr(p1, p0) <= 0.01, `momentum ${p0} → ${p1}`);
});

test('two carts collide: with restitution 0 (no part sets one) they leave together', {
    todo: 'they bounce apart (e ≈ 0.67): the bumper beam is a 4.8 g body hinged to two 25 g wheel sets, and the ' +
        'hinges\' compliance stores the impact and gives it back (control: the same carts with all their mass in ' +
        'the bumper body leave together, e ≈ 0); the light-body-between-hinges problem of round 1, bug 2'
}, async t => {
    // Jolt's restitution is 0 unless a body sets it (jolt-core.js; compile sets none for parts): a
    // perfectly inelastic impact, both carts at the common speed. e = (v2' − v1') / (v1 − v2) ≤ 0.05.
    const c = await cartsRun();
    t.diagnostic(`e ${restitution(c).toFixed(3)} (v1' ${c.after.v1.toFixed(4)}, v2' ${c.after.v2.toFixed(4)} m/s)`);
    assert.ok(Math.abs(restitution(c)) <= 0.05, `e ${restitution(c)}`);
});
const restitution = c => (c.after.v2 - c.after.v1) / (c.before.v1 - c.before.v2);

test('two carts collide, control (all of each cart\'s mass in its bumper body): restitution 0, they leave together', async t => {
    // The same carts and run with each cart's catalogue mass given to its beam body (the wheel sets
    // keep theirs too: the momentum check above does not apply to this altered machine). With the
    // bumper no longer a light body between two hinges, the impact is inelastic: e ≤ 0.05.
    const c = await cartsRun({heavyBumper: true});
    t.diagnostic(`e ${restitution(c).toFixed(3)} (v1' ${c.after.v1.toFixed(4)}, v2' ${c.after.v2.toFixed(4)} m/s)`);
    assert.ok(Math.abs(restitution(c)) <= 0.05, `e ${restitution(c)}`);
});

test('a free cart coasts with rolling resistance: deceleration ≥ c_rr·g, c_rr ≥ 0.005', {
    todo: 'there is no rolling resistance: the cart loses only Jolt\'s default 0.05 s⁻¹ velocity damping ' +
        '(a = 0.05·v, c_rr-equivalent ~0.0006 at 0.11 m/s), an order of magnitude below a hard tyre on a hard floor'
}, async t => {
    // A rolling tyre on a hard floor loses c_rr·m·g (textbook range for rubber on concrete-like floors
    // 0.005 … 0.03): over the last 1.5 s of the run cart 2 coasts alone; its deceleration should be at
    // least 0.005·g = 0.049 m/s².
    const c = await cartsRun();
    const late = c.trace.filter(s => s.ms >= c.trace[c.trace.length - 1].ms - 1500);
    const a = (late[0].v2 - late[late.length - 1].v2) / ((late[late.length - 1].ms - late[0].ms) / 1000);
    t.diagnostic(`cart 2 at ${late[0].v2.toFixed(4)} → ${late[late.length - 1].v2.toFixed(4)} m/s: deceleration ${a.toFixed(4)} m/s² ` +
        `(c_rr-equivalent ${(a / 9.81).toFixed(5)}; 0.05·v = ${(0.05 * late[0].v2).toFixed(4)})`);
    assert.ok(a >= 0.005 * 9.81, `deceleration ${a}`);
});

// ---- H. universal joint --------------------------------------------------------------------------------
test('universal joint: ω2/ω1 = cos β / (1 − sin²β·cos²θ); two in phase cancel', {
    todo: 'not buildable: the catalogue has only the U-joint\'s ends (62520, 3712, 575) as parts with an axle hole ' +
        'each and no connector between them, and no coupling kind joins two ends (the cross is not modelled), so ' +
        'two ends placed fork in fork are two loose parts'
}, () => {
    // What a universal joint must do (the closed form), stated for when the kind exists: at β = 30° the
    // output speed swings between cos β = 0.866 and 1/cos β = 1.155 of the input's, twice per turn.
    const ends = ['62520.dat', '3712.dat', '575.dat'].map(meta);
    assert.ok(ends.every(Boolean), 'the U-joint ends are in the catalogue');
    const joins = ends.some(e => e.connectors.some(c => !['axlehole', 'pinhole'].includes(c.type)));
    assert.ok(joins, 'a U-joint end has a connector that joins it to the other end (a cross/fork kind)');
});
