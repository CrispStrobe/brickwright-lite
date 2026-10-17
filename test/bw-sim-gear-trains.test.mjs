// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Gear trains end to end (Sim Lab P5): real-part gearboxes
 * (test/fixtures/bw-sim/gears/*.json) → compile → Jolt core (→ virtual hub),
 * measuring how far the driven gear's hinge actually turns per motor turn.
 *
 * The gearboxes (each fixture's $comment has the geometry): the medium motor's
 * output carries the 8T (or 12T bevel); a frame pinned to the motor HOUSING
 * holds the driven gears' axles in its round holes at true meshing distances.
 * Frame and housing are one body, so every gear turns relative to that one
 * frame, which is what a gear mesh needs (mech/gears.js).
 *
 * The bench: the housing is clamped, i.e. its body is made static. A static
 * body made of model parts is the machine's fixed frame to the core: it does
 * not collide with the machine's moving parts (the axles turn inside its
 * holes), only the ground and obstacles do. Clamping it this way, rather than
 * welding a light dynamic housing to the world with joints, gives the load in
 * the stall test a rigid path to the world (a 40 g housing held by two world
 * hinges let a blocked arm push straight through its obstacle, measured), and
 * makes the gears' world rotation equal their rotation in the frame, the case
 * the core's gear constraint is exact for.
 *
 * Joints are found by what they carry: the hinge whose turning body holds the
 * named gear. Ratios are measured over 2.5 s of the real core and compared
 * with a 3 % relative tolerance.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {LDU_M} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SimHubBridge, STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {partOverlaps, sitsInside, solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const fixture = name => json(`test/fixtures/bw-sim/gears/${name}.json`);

const DEG = 180 / Math.PI;
const STEP_HZ = 1000 / STEP_MS;
const MOTOR_DEG_PER_SEC = 300;
const SECONDS = 2.5;
const REL_TOL = 0.03;

const relErr = (actual, expected) => Math.abs(actual - expected) / Math.abs(expected);

/** The motor's hinge (the only motorised one in these gearboxes). */
const motorHinge = mech => {
    const motors = mech.joints.filter(j => j.motor);
    assert.equal(motors.length, 1, 'one motor');
    return motors[0];
};

/** The hinge whose turning body (body2) carries the part. */
const hingeTurning = (mech, partId) => {
    const body = mech.bodies.find(b => b.parts.includes(partId) && mech.joints.some(j => j.body2 === b.id));
    assert.ok(body, `no hinged body carries ${partId}`);
    const hinges = mech.joints.filter(j => j.type === 'hinge' && j.body2 === body.id);
    assert.equal(hinges.length, 1, `${partId}: one hinge turns its body`);
    return hinges[0];
};

/** Clamp the motor housing (the motor hinge's body1, frame included) to the bench. */
const clampToBench = mech => {
    const housing = mech.bodies.find(b => b.id === motorHinge(mech).body1);
    housing.motion = 'static';
    housing.massKg = 0;
    return housing.id;
};

const compileOnBench = (name, opts = {}) => {
    const mech = compile(fixture(name), CATALOG, {ground: false, ...opts});
    const housing = clampToBench(mech);
    return {mech, housing};
};

/**
 * Run the motor at a fixed speed and return each listed hinge's angle change
 * (rad) and the motor's.
 */
const runMotor = async (mech, {seconds = SECONDS, degPerSec = MOTOR_DEG_PER_SEC, watch = [], onStep} = {}) => {
    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    const motor = motorHinge(mech);
    const start = new Map([motor, ...watch].map(j => [j.id, core.jointState(j.id).angle]));
    core.setMotor(motor.id, {mode: 'velocity', radPerSec: degPerSec / DEG});
    const steps = Math.round(seconds * STEP_HZ);
    for (let i = 0; i < steps; i++) {
        core.step(1 / STEP_HZ);
        if (onStep) onStep(core, i);
    }
    const turned = id => core.jointState(id).angle - start.get(id);
    const result = {motor: turned(motor.id), core};
    for (const j of watch) result[j.id] = turned(j.id);
    return result;
};

test('the gearbox fixtures are real builds: only meshing gears share volume', () => {
    // Gear colliders are tip-radius discs, so two gears in mesh overlap by their tooth depth;
    // nothing else may (the build editor's rule, editor/overlap.js).
    const meshing = {
        '8-24': [['g24', 'g8']],
        '8-24-8': [['g24', 'g8'], ['g24', 'g8b']],
        '8-40': [['g40', 'g8']],
        '8-24-one-hole-too-far': [],
        '8-24-stalled': [['g24', 'g8']],
        'bevel-12-20': [['g12', 'g20']],
    };
    for (const [name, pairs] of Object.entries(meshing)) {
        const model = fixture(name);
        // Raw colliders: solid parts touch only where gears mesh (pins and axles sit in holes)...
        const found = new Set();
        const solid = model.parts.filter(p => !sitsInside(CATALOG.get(p.part)));
        for (const p of solid) {
            for (const o of partOverlaps(model, CATALOG, p)) {
                if (solid.some(q => q.id === o.part)) found.add([p.id, o.part].sort().join('|'));
            }
        }
        assert.deepEqual([...found].sort(), pairs.map(pr => pr.slice().sort().join('|')).sort(), name);
        // ...and the build editor's rule accepts exactly those as meshing, so it reports no collision.
        for (const p of model.parts) assert.deepEqual(solidOverlaps(model, CATALOG, p), [], `${name}: ${p.id}`);
    }
});

test('P5 §1 8T → 24T: the 24T turns −1/3 of the motor', async () => {
    const {mech} = compileOnBench('8-24');
    assert.deepEqual(mech.diagnostics, []);
    const motor = motorHinge(mech);
    const g24 = hingeTurning(mech, 'g24');
    assert.equal(g24.body1, motor.body1, 'the 24T turns in the motor housing frame');
    assert.equal(mech.gears.length, 1);
    const r = await runMotor(mech, {watch: [g24]});
    r.core.destroy();
    assert.ok(r.motor * DEG > 600, `motor turned ${r.motor * DEG}°`);
    const ratio = r[g24.id] / r.motor;
    assert.ok(relErr(ratio, -1 / 3) <= REL_TOL, `24T/motor ${ratio} vs −1/3`);
});

test('P5 §2 8T → 24T → 8T: the last 8T turns +1 with the motor, the idler −1/3', async () => {
    const {mech} = compileOnBench('8-24-8');
    assert.deepEqual(mech.diagnostics, []);
    assert.equal(mech.gears.length, 2, 'two meshes; the two 8Ts are 80 LDU apart');
    const g24 = hingeTurning(mech, 'g24');
    const last = hingeTurning(mech, 'g8b');
    const r = await runMotor(mech, {watch: [g24, last]});
    r.core.destroy();
    assert.ok(r.motor * DEG > 600, `motor turned ${r.motor * DEG}°`);
    assert.ok(relErr(r[last.id] / r.motor, 1) <= REL_TOL, `last 8T/motor ${r[last.id] / r.motor} vs +1`);
    assert.ok(relErr(r[g24.id] / r.motor, -1 / 3) <= REL_TOL, `24T/motor ${r[g24.id] / r.motor} vs −1/3`);
});

test('P5 §3 8T → 40T: the 40T turns −1/5 of the motor', async () => {
    const {mech} = compileOnBench('8-40');
    assert.deepEqual(mech.diagnostics, []);
    const g40 = hingeTurning(mech, 'g40');
    const r = await runMotor(mech, {watch: [g40]});
    r.core.destroy();
    assert.ok(r.motor * DEG > 600, `motor turned ${r.motor * DEG}°`);
    assert.ok(relErr(r[g40.id] / r.motor, -1 / 5) <= REL_TOL, `40T/motor ${r[g40.id] / r.motor} vs −1/5`);
});

test('P5 §4 bevel 12T → 20T: magnitude 12/20, sign from the geometry, confirmed by physics', async () => {
    const {mech} = compileOnBench('bevel-12-20');
    assert.deepEqual(mech.diagnostics, []);
    const motor = motorHinge(mech);
    const g20 = hingeTurning(mech, 'g20');
    assert.equal(g20.body1, motor.body1, 'the 20T turns in the housing frame');
    // Expected sign from the parts' placement and the hinges as compiled (world frame, metres).
    // The teeth touch at P, on the 12T's pitch circle (r 15 LDU) towards the 20T's centre, and on
    // the 20T's pitch circle (r 25 LDU) towards the 12T. The two gears' surface velocities at P,
    // ω1·a1 × (P − c1) and ω2·a2 × (P − c2), must be equal; a_i are the hinge axes.
    const model = fixture('bevel-12-20');
    const at = id => {
        const p = model.parts.find(x => x.id === id).position;
        return [p[0] * LDU_M, -p[1] * LDU_M, -p[2] * LDU_M];
    };
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const c1 = at('g12');
    const c2 = at('g20');
    // The axes meet at O: on the 12T's axis at the 20T's height.
    const O = [c1[0], c2[1], c1[2]];
    const towards20 = sub(c2, O).map(v => v / Math.hypot(...sub(c2, O)));
    const P = c1.map((v, i) => v + towards20[i] * 15 * LDU_M);
    const v1 = cross(motor.axis, sub(P, c1)); // per rad/s of the motor hinge
    const v2 = cross(g20.axis, sub(P, c2)); // per rad/s of the 20T hinge
    const t = v1.map(v => v / Math.hypot(...v1));
    const expected = dot(v1, t) / dot(v2, t);
    assert.ok(Math.abs(Math.abs(expected) - 12 / 20) < 1e-9, `geometry gives |ratio| ${Math.abs(expected)}`);
    assert.equal(mech.gears.length, 1);
    const g = mech.gears[0];
    assert.ok(Math.abs((g.joint1 === motor.id ? g.ratio : 1 / g.ratio) - expected) < 1e-9, `compiled ${JSON.stringify(g)} vs ${expected}`);
    const r = await runMotor(mech, {watch: [g20]});
    r.core.destroy();
    assert.ok(r.motor * DEG > 600, `motor turned ${r.motor * DEG}°`);
    const measured = r[g20.id] / r.motor;
    assert.ok(relErr(measured, expected) <= REL_TOL, `20T/motor ${measured} vs ${expected}`);
});

test('P5 §5 one hole too far: no mesh, and the 24T stays still while the motor turns', async () => {
    // With the housing clamped, the 24T's axle turns in a frame that does not move. Nothing
    // couples it to the motor: no gear constraint, no tooth contact (the moving parts of one
    // machine do not collide with each other), and its frame does not rotate. So it is not
    // driven at all; no friction or damping is needed for it to stay put, and a drift of
    // even 2° would show a coupling that should not exist.
    const {mech} = compileOnBench('8-24-one-hole-too-far');
    assert.deepEqual(mech.gears, []);
    assert.deepEqual(mech.diagnostics, [], 'gears 60 LDU apart simply do not mesh');
    const g24 = hingeTurning(mech, 'g24');
    const r = await runMotor(mech, {watch: [g24]});
    r.core.destroy();
    assert.ok(r.motor * DEG > 300, `motor turned ${r.motor * DEG}°`);
    assert.ok(Math.abs(r[g24.id] * DEG) < 2, `24T turned ${r[g24.id] * DEG}°`);
});

test('P5 §6 a blocked output stalls the motor (through the hub, DC model)', async () => {
    // A thin liftarm on the 24T's axle (8-24-stalled.json) swings into a static obstacle.
    // The obstacle is a real body in the arm's sweep, so the load reaches the motor only
    // through the gear mesh: the motor stalls only if the mesh carries load both ways.
    // Arm: LDraw y −85..−75, 18 LDU wide, reaching x 31..89 from the axle at x=40. Obstacle:
    // LDraw x 70..90, y −95..−72, z 20..40 (clear of the 24T, whose top is at y −69.6 and radius
    // 32 LDU). Seen from the axle the obstacle's near face is z = 20 for x 30..50. Two
    // candidates for the first contact: the arm's edge (9 LDU off its centre line) on the
    // obstacle's corner (30, 20), 36.06·sin(33.69° − θ) = 9 at θ = 19.2°; and the arm's tip
    // corner (49, 9) on that face, 49·sin θ + 9·cos θ = 20 at θ = 13.3° (the tip is then at
    // x = 45.6, on the face). The tip comes first. (Until 2026-10-17 this test took 19.2°:
    // with the core's 1 m-sphere inertia for small gears — jolt-core.js fixSmallInertia — the
    // arm sank ~6° into the obstacle, which the wrong first touch absorbed.)
    const cornerOnEdge = 33.69 - Math.asin(9 / Math.hypot(30, 20)) * DEG;
    const tipOnFace = (Math.asin(20 / Math.hypot(49, 9)) - Math.atan2(9, 49)) * DEG;
    const FIRST_TOUCH_DEG = Math.min(cornerOnEdge, tipOnFace);
    const ldu = v => v * LDU_M;
    const wall = {id: 'wall', shape: 'box', size: [ldu(20), ldu(23), ldu(20)], position: [ldu(80), ldu(72), -ldu(30)]};
    const commanded = MOTOR_DEG_PER_SEC;
    // The motor is driven as the hub drives it (owner decision D5): the SPIKE controller asks
    // for 300 °/s and puts a duty into the motor's DC model, so a blocked output meets the
    // motor's stall torque (through the 1:3 mesh) — not an ideal velocity source. (Until
    // 2026-10-17 this test drove the hinge as an ideal servo; at the gears' true inertia that
    // servo, stiff up to its torque limit, tears the gear constraint: the motor kept turning
    // at ~130 °/s with the 24T held, measured.)
    const measure = async obstacles => {
        const {mech, housing} = compileOnBench('8-24-stalled', {obstacles});
        assert.deepEqual(mech.diagnostics, []);
        const motor = motorHinge(mech);
        const g24 = hingeTurning(mech, 'g24');
        assert.ok(mech.bodies.find(b => b.id === g24.body2).parts.includes('arm'), 'the arm turns with the 24T');
        const J = await loadJolt();
        const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
        const hubState = new VirtualSpikeHubState();
        const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: housing});
        const start = core.jointState(g24.id).angle;
        hubState.motors.runAtSpeed('A', commanded);
        // The arm reaches the obstacle after ~0.2 s: the speed is the mean over the last full second of 4.
        const seconds = 4;
        let lastSecond = null;
        for (let i = 0; i < seconds * STEP_HZ; i++) {
            bridge.tick(STEP_MS);
            if (i === (seconds - 1) * STEP_HZ - 1) lastSecond = core.jointState(motor.id).angle;
        }
        const speed = (core.jointState(motor.id).angle - lastSecond) * DEG;
        const turned = (core.jointState(g24.id).angle - start) * DEG;
        const stalled = hubState.data.motors[0].stalled;
        bridge.dispose();
        core.destroy();
        return {speed, g24: turned, stalled};
    };
    const free = await measure([]);
    assert.ok(relErr(free.speed, commanded) < 0.05, `without the obstacle the motor runs at ${free.speed}°/s`);
    assert.equal(free.stalled, false);
    const blocked = await measure([wall]);
    assert.ok(Math.abs(blocked.speed) < 0.1 * commanded, `stalled motor still turns at ${blocked.speed}°/s of ${commanded}`);
    assert.equal(blocked.stalled, true, 'the hub reports the port stalled');
    // It stopped AT the obstacle: not before first touch, and not far into it (the contact is
    // slightly soft at this scale; a few degrees of creep under the stalled torque).
    assert.ok(Math.abs(blocked.g24) > FIRST_TOUCH_DEG - 2 && Math.abs(blocked.g24) < FIRST_TOUCH_DEG + 6,
        `the 24T stopped at ${blocked.g24}°, first touch at ${FIRST_TOUCH_DEG.toFixed(1)}°`);
});

test('P5 §7 through the hub: run_for_degrees(A, 360) turns the 24T −120°', async () => {
    const {mech, housing} = compileOnBench('8-24');
    const g24 = hingeTurning(mech, 'g24');
    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: STEP_HZ});
    const hubState = new VirtualSpikeHubState();
    // No hub part in a bench gearbox: the IMU reads the clamped housing.
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: housing});
    const start = core.jointState(g24.id).angle;
    let outcome;
    hubState.motors.runForDegrees('A', 360, 500).then(v => { outcome = v; });
    for (let t = 0; t < 2000; t += 50) bridge.tick(50);
    await new Promise(resolve => setImmediate(resolve));
    const motorDeg = hubState.data.motors[0].position;
    const drivenDeg = (core.jointState(g24.id).angle - start) * DEG;
    bridge.dispose();
    core.destroy();
    assert.equal(outcome, 'completed');
    assert.ok(Math.abs(motorDeg - 360) < 3, `motor ended at ${motorDeg}°`);
    assert.ok(relErr(drivenDeg / motorDeg, -1 / 3) <= REL_TOL, `24T turned ${drivenDeg}° for ${motorDeg}°`);
});
