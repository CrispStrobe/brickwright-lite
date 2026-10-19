// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Technic gearboxes end to end (gearbox lane): real-part benches
 * (test/fixtures/bw-sim/gearbox/*.json, each $comment has the geometry) → compile →
 * Jolt core, measuring what turns.
 *
 *   - clutch gears (round centre hole) spin free on their axle until the driving ring
 *     takes one; the ring is shifted at runtime by a second motor swinging the
 *     changeover catch; each gear's ratio is the tooth ratio of the parts;
 *   - the differential (LDraw's assembly 65414c01) obeys Willis: the casing turns at the
 *     pinion's tooth ratio, its sides sum to twice the casing, a held side sends the other
 *     round at twice the casing;
 *   - the white 24T clutch gear holds below its stamped 2.5 N·cm and slips above 5;
 *   - two gear paths between the same axles: run when their ratios agree, lock when not.
 *
 * Every expected number comes from the catalogue's tooth counts or the part's stamped
 * rating, never from the compiled mechanism. The bench: the motor housings (and the frame
 * pinned to them) are made static, so the frame does not turn (as in
 * test/bw-sim-gear-trains.test.mjs). Ratios are compared with a 3 % relative tolerance.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {SLIP_CLUTCH_RANGE_NM} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/slip-clutch.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const fixture = name => json(`test/fixtures/bw-sim/gearbox/${name}.json`);

const STEP_HZ = 200;
const REL_TOL = 0.03;
const MOTOR_RAD_PER_SEC = 300 * Math.PI / 180;
const relErr = (actual, expected) => Math.abs(actual - expected) / Math.abs(expected);

/** Tooth count of the gear part a placed part id is, from the catalogue. */
const teethOf = (model, id) => CATALOG.get(model.parts.find(p => p.id === id).part).gear.teeth;
const bodyOf = (mech, partId) => mech.bodies.find(b => b.parts.includes(partId)).id;
const makeStatic = (mech, bodyId) => {
    const b = mech.bodies.find(x => x.id === bodyId);
    b.motion = 'static';
    b.massKg = 0;
};
const motorOn = (mech, port) => mech.joints.find(j => j.motor && j.motor.port === port);
/** The hinge between two bodies (either way round), or undefined. */
const hingeBetween = (mech, a, b) => mech.joints.find(j => j.type === 'hinge' && ((j.body1 === a && j.body2 === b) || (j.body1 === b && j.body2 === a)));

const compileBench = (name, ports = ['A']) => {
    const model = fixture(name);
    const mech = compile(model, CATALOG, {version: 2, ground: false});
    for (const port of ports) makeStatic(mech, motorOn(mech, port).body1);
    return {model, mech};
};

/** Step the core for `seconds`; returns the change of each listed joint's angle (rad). */
const advance = (core, seconds, jointIds) => {
    const start = jointIds.map(id => core.jointState(id).angle);
    for (let i = 0; i < Math.round(seconds * STEP_HZ); i++) core.step(1 / STEP_HZ);
    return jointIds.map((id, k) => core.jointState(id).angle - start[k]);
};

test('the gearbox benches are real builds: no solid part pushes into another', () => {
    for (const name of ['two-speed', 'differential', 'slip-clutch', 'loop-consistent', 'loop-inconsistent']) {
        const model = fixture(name);
        for (const p of model.parts) assert.deepEqual(solidOverlaps(model, CATALOG, p), [], `${name}: ${p.id}`);
    }
});

test('clutch gears are derived as gears that turn freely: a round centre hole, the socket faces measured', () => {
    for (const part of ['18946.dat', '81346.dat', '2471.dat', '35185.dat']) {
        const meta = CATALOG.get(part);
        assert.ok(meta && meta.gear, `${part} is a gear`);
        assert.ok(!meta.connectors.some(c => c.type === 'axlehole'), `${part}: no axle hole`);
        assert.ok(meta.connectors.some(c => c.type === 'pinhole'), `${part}: a round hole`);
        assert.equal(meta.connectors.filter(c => c.type === 'clutch').length, 2, `${part}: clutch on both sides`);
    }
    // The driving ring and the ridged joiner it slides on; the catch's bar.
    assert.ok(CATALOG.get('6539.dat').connectors.some(c => c.type === 'spline-bore'));
    assert.ok(CATALOG.get('6538b.dat').connectors.some(c => c.type === 'spline'));
    assert.ok(CATALOG.get('6641.dat').connectors.some(c => c.type === 'fork'));
    // The slip clutch's hub carries its stamped rating.
    const hub = CATALOG.get('76019.dat').connectors.find(c => c.type === 'clutch-axlehole');
    assert.ok(hub.data.slipTorqueNm >= SLIP_CLUTCH_RANGE_NM[0] && hub.data.slipTorqueNm <= SLIP_CLUTCH_RANGE_NM[1]);
});

test('two-speed gearbox: neutral leaves the output still; each shift gives its tooth ratio', async t => {
    const {model, mech} = compileBench('two-speed', ['A', 'B']);
    assert.deepEqual(mech.diagnostics.filter(d => d.code !== 'loose-part'), [], 'only the bench motor B stands apart');
    assert.equal(mech.couplings.filter(c => c.kind === 'dogClutch').length, 2, 'the ring faces both clutch gears');
    assert.equal(mech.couplings.filter(c => c.kind === 'shiftFork').length, 1, 'the catch is in the ring');
    const motorA = motorOn(mech, 'A');
    const motorB = motorOn(mech, 'B');
    const frame = motorA.body1;
    const out = hingeBetween(mech, frame, bodyOf(mech, 'aO'));
    const gear24 = hingeBetween(mech, bodyOf(mech, 'aO'), bodyOf(mech, 'gO24'));
    const ring = mech.joints.find(j => j.type === 'slider');
    const fork = mech.couplings.find(c => c.kind === 'shiftFork');
    const clutch24 = mech.couplings.find(c => c.kind === 'dogClutch' && c.parts.includes('gO24'));
    const clutch16 = mech.couplings.find(c => c.kind === 'dogClutch' && c.parts.includes('gO16'));
    // The catch angle that puts the ring in the middle of each clutch's engaged travel.
    const angleFor = clutch => (clutch.engage[0] + clutch.engage[1]) / 2 / fork.ratio;

    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    core.setMotor(motorB.id, {mode: 'position', rad: 0});
    core.setMotor(motorA.id, {mode: 'velocity', radPerSec: MOTOR_RAD_PER_SEC});
    advance(core, 0.5, []);
    const [m0, o0, g0] = advance(core, 1, [motorA.id, out.id, gear24.id]);
    t.diagnostic(`neutral: motor ${m0.toFixed(2)} rad, output ${o0.toFixed(4)} rad, 24T clutch gear on its axle ${g0.toFixed(2)} rad`);
    assert.ok(m0 > 4, 'the motor turns');
    assert.ok(Math.abs(o0) < 0.01 * m0, `neutral: the output stays (${o0})`);
    assert.ok(Math.abs(g0) > 0.2 * m0, 'neutral: the clutch gear spins free on the still axle');

    const run = async (clutch, inputId, outputGearId) => {
        core.setMotor(motorB.id, {mode: 'position', rad: angleFor(clutch)});
        advance(core, 1, []);
        const x = core.jointState(ring.id).position;
        assert.ok(x >= clutch.engage[0] && x <= clutch.engage[1], `the ring is in (${x} m)`);
        const [m, o] = advance(core, 2, [motorA.id, out.id]);
        const expected = -teethOf(model, inputId) / teethOf(model, outputGearId);
        t.diagnostic(`${outputGearId}: output/motor ${(o / m).toFixed(5)} (tooth ratio ${expected.toFixed(5)})`);
        assert.ok(relErr(o / m, expected) <= REL_TOL, `${outputGearId}: ${o / m} vs ${expected}`);
        return o / m;
    };
    const low = await run(clutch24, 'gI8', 'gO24');
    const high = await run(clutch16, 'gI16', 'gO16');
    assert.ok(Math.abs(high) > 2.5 * Math.abs(low), 'the shift changes the ratio');
    core.destroy();
});

test('differential: the casing turns at the pinion ratio and the sides obey Willis', async t => {
    const J = await loadJolt();
    const measure = async hold => {
        const {model, mech} = compileBench('differential');
        const motor = motorOn(mech, 'A');
        const frame = motor.body1;
        const [L, R, C] = ['axleL', 'axleR', 'casing'].map(p => bodyOf(mech, p));
        if (hold) makeStatic(mech, hold === 'L' ? L : R);
        const jL = hingeBetween(mech, frame, L);
        const jR = hingeBetween(mech, frame, R);
        const jCL = hingeBetween(mech, C, L); // the left side in the casing
        // The three axes point the same way (+x), so the casing's rate is left − (left in casing).
        assert.ok([jL, jR, jCL].every(j => Math.abs(j.axis[0] - 1) < 1e-9), 'side and casing hinges along +x');
        assert.equal(jCL.body1, C);
        const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
        core.setMotor(motor.id, {mode: 'velocity', radPerSec: MOTOR_RAD_PER_SEC});
        advance(core, 0.5, []);
        const [m, l, r, lc] = advance(core, 2, [motor.id, jL.id, jR.id, jCL.id]);
        core.destroy();
        return {model, mech, m, l, r, c: l - lc};
    };
    const free = await measure(null);
    // The planets' meshes are in a turning frame: relative to the casing (a carrier).
    assert.equal(free.mech.couplings.filter(c => c.kind === 'relativeGear' && c.carrier).length, 6, 'three satellites, two sides');
    const ring = teethOf(free.model, 'cover');
    const pinion = teethOf(free.model, 'pinion');
    t.diagnostic(`casing/motor ${(free.c / free.m).toFixed(5)} (teeth ${pinion}/${ring} = ${(pinion / ring).toFixed(5)}); left/casing ${(free.l / free.c).toFixed(4)}, right/casing ${(free.r / free.c).toFixed(4)}`);
    assert.ok(relErr(Math.abs(free.c / free.m), pinion / ring) <= REL_TOL, 'casing at the tooth ratio');
    // Willis with equal side gears: ω_L − ω_C = −(ω_R − ω_C), i.e. L + R = 2C; free and alike, each turns with the casing.
    assert.ok(relErr(free.l + free.r, 2 * free.c) <= REL_TOL, `L + R = 2C (${free.l + free.r} vs ${2 * free.c})`);
    assert.ok(relErr(free.l, free.c) <= REL_TOL && relErr(free.r, free.c) <= REL_TOL, 'equal sides turn with the casing');
    for (const side of ['L', 'R']) {
        const held = await measure(side);
        const other = side === 'L' ? held.r : held.l;
        const still = side === 'L' ? held.l : held.r;
        t.diagnostic(`${side} held: the other side/casing ${(other / held.c).toFixed(4)}`);
        assert.ok(Math.abs(still) < 1e-9, 'the held side stays');
        assert.ok(relErr(other, 2 * held.c) <= REL_TOL, `${side} held: the other side turns twice the casing (${other / held.c})`);
    }
});

test('slip clutch: holds below its stamped 2.5 N·cm, slips above 5 N·cm at its rating', async t => {
    const J = await loadJolt();
    const [lo, hi] = SLIP_CLUTCH_RANGE_NM;
    const damping = 0.001; // N·m·s/rad: the motor command τ = T − c·ω (torque mode)
    const spin = async torqueNm => {
        const {mech} = compileBench('slip-clutch');
        makeStatic(mech, bodyOf(mech, 'aOut')); // the driven gear is held
        const motor = motorOn(mech, 'A');
        const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
        core.setMotor(motor.id, {mode: 'torque', torqueNm, dampingNmsPerRad: damping});
        advance(core, 1, []);
        const [a] = advance(core, 1, [motor.id]);
        core.destroy();
        return a; // rad in 1 s: the slip speed
    };
    const below = await spin(0.8 * lo);
    const above = await spin(1.2 * hi);
    // Slipping at a steady speed, the clutch passes on the torque the motor does not lose to its damping.
    const passed = 1.2 * hi - damping * above;
    t.diagnostic(`at ${(0.8 * lo * 100).toFixed(1)} N·cm: ${below.toFixed(4)} rad/s; at ${(1.2 * hi * 100).toFixed(1)} N·cm: ${above.toFixed(2)} rad/s, passing ${(passed * 100).toFixed(2)} N·cm`);
    assert.ok(Math.abs(below) < 0.01, 'below its rating the clutch holds: the motor stands');
    assert.ok(Math.abs(above) > 5, 'above its rating it slips');
    assert.ok(passed >= lo && passed <= hi, `it slips at its stamped range: ${passed} N·m`);
});

test('two gear paths between the same axles: agreeing ones run, disagreeing ones lock', async t => {
    const ok = compileBench('loop-consistent');
    assert.deepEqual(ok.mech.diagnostics, []);
    assert.equal(ok.mech.couplings.filter(c => c.kind === 'gear').length, 2, 'both paths are kept');
    const motor = motorOn(ok.mech, 'A');
    const out = hingeBetween(ok.mech, motor.body1, bodyOf(ok.mech, 'aO'));
    const J = await loadJolt();
    const core = createPhysicsCore(J, ok.mech, {stepHz: STEP_HZ});
    core.setMotor(motor.id, {mode: 'velocity', radPerSec: MOTOR_RAD_PER_SEC});
    const [m, o] = advance(core, 2, [motor.id, out.id]);
    core.destroy();
    const expected = -teethOf(ok.model, 'gIa') / teethOf(ok.model, 'gOa');
    t.diagnostic(`consistent loop: output/motor ${(o / m).toFixed(5)}`);
    assert.ok(m > 8, 'the motor turns: the paths do not fight');
    assert.ok(relErr(o / m, expected) <= REL_TOL);

    const bad = compile(fixture('loop-inconsistent'), CATALOG, {version: 2, ground: false});
    const lock = bad.diagnostics.find(d => d.code === 'gear-loop-locked');
    assert.ok(lock, 'the inconsistent loop is reported');
    assert.deepEqual(lock.parts, ['gI16', 'gI8', 'gO16', 'gO24']);
    assert.ok(!bad.diagnostics.some(d => d.code === 'gear-not-on-hinge'), 'the locked gears are not reported again');
    // Locked: the output axle and the motor's shaft are one body with the frame — nothing turns.
    assert.equal(bodyOf(bad, 'aO'), bodyOf(bad, 'beam'));
    assert.equal(bodyOf(bad, 'aI'), bodyOf(bad, 'beam'));
});
