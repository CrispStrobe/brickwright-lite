// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Worm drive (slice R4 of docs/ROBOT-LAB-ARCHITECTURE.md; kinds/worm.js, the core's 'worm' builder
 * in physics/jolt-core.js).
 *
 * Acceptance (binding, §7 R4): with a 24T wheel driven by a worm, on an arm loaded 0.05 N·m, the
 * arm turns θ_worm / 24 ± 1 % when driven, and when the motor coasts it does not move by more
 * than 0.5° in 5 s.
 *
 * The rig is built by hand so the load is exact: the wheel's body is a 102 g point mass 5 cm
 * from the wheel's axis on a horizontal arm, m·g·d = 0.1019 · 9.81 · 0.05 = 0.05 N·m. The worm
 * turns on a SPIKE medium motor's hinge (driven at a constant speed, then coasting, then with the
 * DC model's brake). The coast is run with the motor's own gearbox friction switched OFF
 * (frictionNm 0): the medium motor's 18 mN·m alone would hold the 2.1 mN·m the load puts on the
 * worm, and the test is about the worm's self-lock, not the motor's drag. The negative control is
 * the same rig with a hold of 0: the arm falls.
 *
 * Then the same mesh compiled from real parts (a SPIKE medium motor, the worm gear 4716 on its
 * output axle, a 24T on an axle in an L-beam 32526 pinned to the motor, a thin liftarm on it):
 * the compiler finds the coupling, ratio 1/24 derived from the thread's hand and the geometry —
 * flipping the worm end for end keeps it (a right-hand thread is right-handed either way round),
 * moving the wheel's axle off the mesh loses it — and the compiled rig runs at that ratio.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {upgradeMechanismV1, validateCompiledMechanism} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {WORM_HOLD_TORQUE_NM} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/worm.js';
import {dcMotorCommand} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));

const STEP_HZ = 200;
const DT = 1 / STEP_HZ;
const G = 9.81;
const TEETH = 24;
const LOAD_NM = 0.05;
const ARM_M = 0.05;
const MASS_KG = LOAD_NM / (G * ARM_M);
const DEG = 180 / Math.PI;

/** A clamped frame, a worm on a motorised hinge about x, a 24T + loaded arm on a hinge about z. */
const wormRig = ({hold = WORM_HOLD_TORQUE_NM} = {}) => {
    const v1 = {
        version: 1, gravity: [0, -G, 0], diagnostics: [], gears: [],
        bodies: [
            {id: 'frame', motion: 'static', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0,
                colliders: [{shape: 'box', halfExtents: [0.004, 0.004, 0.004]}], parts: ['frame']},
            {id: 'worm', motion: 'dynamic', position: [0, 0.1, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], massKg: 0.002,
                colliders: [{shape: 'cylinder', radius: 0.005, halfHeight: 0.008}], parts: ['worm']},
            // The wheel and its arm: all the mass in a ball 5 cm out along +x from the wheel's axis.
            {id: 'arm', motion: 'dynamic', position: [ARM_M, 0.1, -0.016], rotation: [0, 0, 0, 1], massKg: MASS_KG,
                colliders: [{shape: 'sphere', radius: 0.005}], parts: ['arm']}
        ],
        joints: [
            {id: 'jw', type: 'hinge', body1: 'frame', body2: 'worm', point: [0, 0.1, 0], axis: [1, 0, 0],
                motor: {port: 'A', maxTorqueNm: SPIKE_MEDIUM_ANGULAR.motor.stallTorqueNm, maxSpeedRadPerSec: 1000 * Math.PI / 180, deviceId: 48}},
            {id: 'jg', type: 'hinge', body1: 'frame', body2: 'arm', point: [0, 0.1, -0.016], axis: [0, 0, 1]}
        ]
    };
    const m = upgradeMechanismV1(v1);
    // A worm coupling is no v1 kind: added to the v2 couplings (the v1 view keeps none of it).
    m.couplings.push({id: 'w0', kind: 'worm', wormJoint: 'jw', wheelJoint: 'jg', ratio: 1 / TEETH, holdTorqueNm: hold, parts: ['worm', 'arm']});
    m.noCollide.push(['arm', 'worm']);
    assert.deepEqual(validateCompiledMechanism(m, {kinds: BUILTIN_KINDS}), []);
    return m;
};

const run = (core, seconds) => { for (let i = 0; i < Math.round(seconds * STEP_HZ); i++) core.step(DT); };

test('worm acceptance: driven, the loaded arm turns θ_worm/24 ± 1 %; coasting, it moves ≤ 0.5° in 5 s', t => {
    const core = createPhysicsCore(J, wormRig(), {stepHz: STEP_HZ});
    try {
        // The arm starts horizontal: the full 0.05 N·m. Drive the worm 3 turns against it (lifting).
        core.setMotor('jw', {mode: 'velocity', radPerSec: 12});
        run(core, 0.2);
        const w0 = core.jointState('jw').angle;
        const a0 = core.jointState('jg').angle;
        run(core, 1.6);
        const dw = core.jointState('jw').angle - w0;
        const da = core.jointState('jg').angle - a0;
        const ratio = da / dw;
        t.diagnostic(`driven: worm ${(dw * DEG).toFixed(1)}°, arm ${(da * DEG).toFixed(3)}° — ratio 1/${(1 / ratio).toFixed(3)}`);
        assert.ok(Math.abs(dw) > 4 * Math.PI, `the worm turned ${dw} rad`);
        assert.ok(da > 0, 'the arm was lifted (turned against the load)');
        assert.ok(Math.abs(ratio * TEETH - 1) <= 0.01, `arm/worm = ${ratio}, not 1/24 ± 1 %`);
        // Coast, the motor's gearbox friction off: only the worm's self-lock holds the arm.
        core.setMotor('jw', {mode: 'coast', frictionNm: 0});
        run(core, 0.05);
        const held0 = core.jointState('jg').angle;
        run(core, 5);
        const fell = Math.abs(core.jointState('jg').angle - held0) * DEG;
        t.diagnostic(`coasting (no motor drag): the arm moved ${fell.toFixed(4)}° in 5 s`);
        assert.ok(fell <= 0.5, `the arm moved ${fell}° in 5 s`);
        // The DC model's brake (duty 0, back-EMF damping only) holds it as well: the worm is not driven.
        core.setMotor('jw', dcMotorCommand(SPIKE_MEDIUM_ANGULAR, 0, 'brake'));
        const b0 = core.jointState('jg').angle;
        run(core, 5);
        const crept = Math.abs(core.jointState('jg').angle - b0) * DEG;
        t.diagnostic(`braked: the arm moved ${crept.toFixed(4)}° in 5 s`);
        assert.ok(crept <= 0.5, `braked, the arm moved ${crept}°`);
    } finally {
        core.destroy();
    }
});

test('negative control: without the self-lock (hold 0) the coasting worm lets the loaded arm fall', t => {
    const core = createPhysicsCore(J, wormRig({hold: 0}), {stepHz: STEP_HZ});
    try {
        core.setMotor('jw', {mode: 'coast', frictionNm: 0});
        const a0 = core.jointState('jg').angle;
        run(core, 5);
        const fell = Math.abs(core.jointState('jg').angle - a0) * DEG;
        t.diagnostic(`no hold: the arm fell ${fell.toFixed(1)}° in 5 s`);
        assert.ok(fell > 10, `without a hold the arm moved only ${fell}°`);
    } finally {
        core.destroy();
    }
});

test('the hold is per-step state: checkpoint and rollback give bit-identical runs', () => {
    const core = createPhysicsCore(J, wormRig(), {stepHz: STEP_HZ});
    try {
        core.setMotor('jw', {mode: 'velocity', radPerSec: 10});
        run(core, 0.3);
        core.checkpoint();
        const go = () => {
            core.setMotor('jw', {mode: 'coast', frictionNm: 0});
            run(core, 0.3);
            core.setMotor('jw', {mode: 'velocity', radPerSec: -10});
            run(core, 0.3);
            const s = core.snapshot();
            return [Array.from(s.bodies), Array.from(s.joints)];
        };
        const first = go();
        core.rollback();
        assert.deepEqual(go(), first);
        assert.ok(core.stateKeys().includes('worms'));
    } finally {
        core.destroy();
    }
});

// ---- compiled from real parts ------------------------------------------------------------

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rows = (c1, c2, c3) => [c1[0], c2[0], c3[0], c1[1], c2[1], c3[1], c1[2], c2[2], c3[2]];
/**
 * A SPIKE medium motor (output along LDraw −y); the worm on an axle in its output; a 3 × 5 L-beam
 * pinned to the motor's side holds a 24T's axle along x, 40 LDU from the worm's axis, the wheel's
 * mid-plane through it; a thin liftarm on the wheel's axle is the arm.
 */
const partRig = ({flipWorm = false, wheelZ = -40} = {}) => ({version: 1, parts: [
    {id: 'motor', part: '54696p01.dat', position: [0, 0, 0], rotation: I, port: 'A'},
    {id: 'pin', part: '2780.dat', position: [30, -20, -20], rotation: I},
    {id: 'frame', part: '32526.dat', position: [40, -20, -20], rotation: rows([0, 0, -1], [1, 0, 0], [0, -1, 0])},
    {id: 'wormAxle', part: '3705.dat', position: [0, -80, 0], rotation: rows([0, 1, 0], [-1, 0, 0], [0, 0, 1])},
    {id: 'worm', part: '4716.dat', position: [0, -100, 0], rotation: flipWorm ? rows([1, 0, 0], [0, 0, -1], [0, 1, 0]) : rows([1, 0, 0], [0, 0, 1], [0, -1, 0])},
    {id: 'wheelAxle', part: '3705.dat', position: [20, -100, wheelZ], rotation: I},
    {id: 'wheel', part: '3648.dat', position: [0, -100, wheelZ], rotation: rows([0, 0, -1], [0, 1, 0], [1, 0, 0])},
    {id: 'arm', part: '6632.dat', position: [-15, -100, wheelZ], rotation: rows([0, 1, 0], [1, 0, 0], [0, 0, -1])}
]});

test('the compiler finds the worm mesh in a real build: ratio 1/24 from the thread\'s hand, either way round; off the mesh, none', () => {
    const model = partRig();
    for (const p of model.parts) assert.deepEqual(solidOverlaps(model, CATALOG, p), [], `${p.id} overlaps no solid part`);
    const m = compile(model, CATALOG, {version: 2});
    assert.deepEqual(m.diagnostics, []);
    const [w, ...rest] = m.couplings;
    assert.deepEqual(rest, []);
    assert.equal(w.kind, 'worm');
    assert.equal(w.holdTorqueNm, WORM_HOLD_TORQUE_NM);
    assert.equal(m.actuators.find(a => a.joint === w.wormJoint).port, 'A', 'the worm is on the motor\'s hinge');
    // The sign, derived by hand: the right-hand worm turning +ω about its hinge axis (LDraw +y)
    // pushes the tooth at the contact (0, −100, −10) along −y by 1.25 LDU/rad; the wheel's hinge
    // axis is +x, so its tooth there moves ω_g·(x × (0, 0, 30)) = −30·ω_g·y: ω_g = +ω/24.
    assert.ok(Math.abs(w.ratio - 1 / 24) < 1e-12, `ratio ${w.ratio}`);
    assert.equal(compile(partRig({flipWorm: true}), CATALOG, {version: 2}).couplings[0].ratio, w.ratio, 'a flipped right-hand worm is still right-handed');
    // One LDU off the 40 LDU centre distance: 0.5 LDU is the tolerance, so no mesh.
    const off = compile(partRig({wheelZ: -41}), CATALOG, {version: 2});
    assert.deepEqual(off.couplings, []);
});

test('the compiled worm rig runs at its ratio and holds its arm when the motor coasts', t => {
    const m = compile(partRig(), CATALOG, {version: 2});
    // Clamp the motor: its housing's body is the frame.
    const housing = m.joints.find(j => j.id === m.couplings[0].wormJoint).body1;
    m.bodies = m.bodies.map(b => (b.id === housing ? {...b, motion: 'static', role: 'frame'} : b));
    const core = createPhysicsCore(J, m, {stepHz: STEP_HZ});
    try {
        const {wormJoint, wheelJoint, ratio} = m.couplings[0];
        core.setMotor(wormJoint, {mode: 'velocity', radPerSec: 10});
        run(core, 0.2);
        const w0 = core.jointState(wormJoint).angle;
        const g0 = core.jointState(wheelJoint).angle;
        run(core, 1);
        const measured = (core.jointState(wheelJoint).angle - g0) / (core.jointState(wormJoint).angle - w0);
        t.diagnostic(`compiled rig: wheel/worm ${measured.toFixed(6)} (contract ${ratio.toFixed(6)})`);
        assert.ok(Math.abs(measured / ratio - 1) <= 0.01, `measured ${measured} vs ${ratio}`);
        core.setMotor(wormJoint, {mode: 'coast', frictionNm: 0});
        const h0 = core.jointState(wheelJoint).angle;
        run(core, 2);
        assert.ok(Math.abs(core.jointState(wheelJoint).angle - h0) * DEG <= 0.5, 'held');
    } finally {
        core.destroy();
    }
});
