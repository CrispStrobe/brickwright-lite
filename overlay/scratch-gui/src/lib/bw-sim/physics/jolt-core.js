// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Jolt physics core for Sim Lab (overlay/scratch-gui/src/lib/bw-sim/physics/).
//
// Runs a CompiledMechanism (v2; a v1 one is lifted by contracts.js
// upgradeMechanismV1, so every hand-built v1 mechanism runs unchanged) in Jolt
// under node --test. It reads joints, `actuators` (a motorised hinge's torque
// and speed limits) and `couplings`, never the v1 view (`joint.motor`,
// `gears`). No worker, no DOM, no three.js. In the app it runs inside the physics worker
// (../physics-worker.js, ../sim-worker-protocol.js), or on the main thread where
// there is no worker (sim-session.js).
//
// Bodies: one Jolt body per mechanism body, shape = compound of colliders
// (box / cylinder local +y / sphere), mass overridden to massKg.
// Joints: hinge / slider at point/axis (world at t=0), body2:'world' fixed.
// Gears: contract ratio ω(joint2)=ratio·ω(joint1) mapped to a Jolt
// GearConstraint between the two gear bodies, r = -1/ratio (see GearConstraint.h).
// Collisions (owner decision D2, R3): EVERYTHING collides — robot parts with the
// world, with loads and with each other — except the body pairs in the
// mechanism's `noCollide` list (bodies joined by a joint or a coupling, parts
// seated in each other's holes: contracts.js noCollidePairs). The pairs are a
// Jolt GroupFilterTable (one group, a sub-group per body), checked in C++ when
// the broad phase pairs two bodies: no JavaScript runs per contact.
// Motors: velocity / position (as velocity controller for unwrapped angle)
// / coast / brake / hold, torque limited to ±maxTorqueNm; and `torque`, the
// DC-motor actuator's command (physics/actuators.js): τ = T − c·ω on the
// hinge, a drive torque and a viscous damper on the relative speed, solved
// IMPLICITLY by Jolt as one soft motor constraint (applyHingeTorque), so it
// stays stable however light the driven parts are; and setRotorInertia, the
// motor's rotor reflected through its gearbox. Sliders are driven the same
// way in metres (velocity / position / coast / brake / hold), force limited.
// Per-step JavaScript state is in the state registry (state-registry.js).

import { validateCompiledMechanism, upgradeMechanismV1 } from '../contracts.js';
import { BUILTIN_KINDS } from '../kinds/index.js';
import { createStateRegistry } from './state-registry.js';

let joltPromise = null;

/** Contact tolerances at LEGO scale, metres (see the PhysicsSettings block below). */
export const LEGO_SPECULATIVE_CONTACT_M = 0.002;
export const LEGO_PENETRATION_SLOP_M = 0.0002;

/**
 * Jolt's WebAssembly (3 MB of JavaScript) is imported here, on first use, and not at the
 * top of this module: the Sim Lab's main thread imports createPhysicsCore through
 * sim-session.js, and when the physics runs in the worker (physics-worker.js) the main
 * thread never needs Jolt at all, so its chunk must not carry it
 * (scripts/verify-boot-payload.mjs, "Jolt physics").
 */
export const loadJolt = async () => {
    if (!joltPromise) {
        joltPromise = import(/* webpackChunkName: "bw-sim-jolt" */ 'jolt-physics/wasm-compat')
            .then(m => (m.default || m)());
    }
    return joltPromise;
};

const normalizeAngle = a => {
    const twoPi = 2 * Math.PI;
    let c = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    return c;
};
const deltaAngle = (a, b) => normalizeAngle(a - b);
const perpForAxis = axis => {
    let [x, y, z] = axis;
    let ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let line = [x, y, z];
    if (ax >= ay && ax >= az) { if (x < 0) line = [-x, -y, -z]; }
    else if (ay >= ax && ay >= az) { if (y < 0) line = [-x, -y, -z]; }
    else if (z < 0) line = [-x, -y, -z];
    let tmp;
    if (Math.abs(line[0]) < 0.9) tmp = [1, 0, 0];
    else if (Math.abs(line[1]) < 0.9) tmp = [0, 1, 0];
    else tmp = [0, 0, 1];
    const dot = tmp[0] * line[0] + tmp[1] * line[1] + tmp[2] * line[2];
    let px = tmp[0] - dot * line[0];
    let py = tmp[1] - dot * line[1];
    let pz = tmp[2] - dot * line[2];
    const len = Math.hypot(px, py, pz);
    if (len < 1e-9) { tmp = [0, 1, 0]; const d2 = tmp[0] * line[0] + tmp[1] * line[1] + tmp[2] * line[2]; px = tmp[0] - d2 * line[0]; py = tmp[1] - d2 * line[1]; pz = tmp[2] - d2 * line[2]; const l2 = Math.hypot(px, py, pz); return [px / l2, py / l2, pz / l2]; }
    return [px / len, py / len, pz / len];
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/**
 * Box convex radius (metres), as for cylinders: a quarter of the thinnest half
 * extent, at most 0.5 mm. Jolt keeps the box's outer extents and rounds its
 * edges. With radius 0 (until 2026-10-17) box-vs-box contacts were found only
 * once the boxes were deep inside each other (measured: a liftarm swinging into
 * an obstacle passed 45° through it before anything pushed back).
 */
const boxConvexRadius = halfExtents => Math.min(0.0005, 0.25 * Math.min(...halfExtents));

/**
 * Solver velocity iterations for an island holding a gear (Jolt's default is
 * 10, kept for everything else). A load on a gear train reaches the motor
 * through motor → gear → contact; with 10 iterations that chain did not
 * converge and an arm on a driven 24T swung straight through a static obstacle
 * (measured); from 15 up it is stopped, 30 stops it within 2° of first touch.
 */
const GEAR_VELOCITY_STEPS = 30;

/**
 * Solver position iterations for an island holding a gear (Jolt's default is 2). With
 * gears at their true inertia (fixSmallInertia) a stalled DC motor pushing an arm on a
 * driven 24T into a static block (first touch at 13.3°) held it at 19.5° with the default
 * — 6° (2 mm at the tip) inside the block — and at 13.7–13.9° with 5 to 20 (measured).
 */
const GEAR_POSITION_STEPS = 10;

/**
 * Solver iterations for an island holding a motorised hinge (Jolt's defaults 10 / 2). The DC motor
 * (applyHingeTorque) is a stiff implicit spring on the hinge; a load reaches it through motor → hinge →
 * contact, the chain GEAR_VELOCITY_STEPS describes, without a gear in it. With the defaults a medium
 * motor drove a beam-5 arm straight through a static block (test/bw-sim-validation.test.mjs, stall:
 * first touch +92.35° / −33.52°, the arm stopped at +276.6° / −401°). Measured, arm stop minus first
 * touch (+ / −), and the step time of the shipped examples (whole robot = one island, 51 µs before):
 *   velocity/position  30/2: +3.5° / −2.1°, 53 µs   30/10: +2.9° / −0.8°, 103 µs
 *                      60/2: +3.4° / −1.1°, 61 µs   60/5:  +1.4° / −0.9°,  78 µs   60/10: +1.1° / −0.7°, 111 µs
 * The position steps are the cost (they re-solve every contact of the island) and the velocity steps the
 * accuracy: 60/5 halves 30/10's overshoot for less time.
 */
const MOTOR_VELOCITY_STEPS = 60;
const MOTOR_POSITION_STEPS = 5;

/**
 * Solver velocity iterations for an island holding a worm (R4). A worm's 1:24 puts the wheel's
 * load on the worm 24 times smaller and the worm's inertia on the wheel 576 times larger, and the
 * gear constraint slips where the solve has not converged: a 102 g arm 5 cm out (0.05 N·m) on a
 * 24T driven by a worm turned 1.49 % faster than ω/24 over 1.6 s with 30 iterations, 0.28 % with
 * 120 (measured; the plain 'gear' kind does the same at this ratio and load). Islands without a
 * worm keep GEAR_VELOCITY_STEPS, so every gear train runs as before.
 */
const WORM_VELOCITY_STEPS = 120;

/**
 * Principal moments and axes of a symmetric 3×3 inertia tensor (cyclic Jacobi).
 * @param {number[][]} m row-major, symmetric
 * @returns {{values: number[], vectors: number[][]}} vectors[k] = the k-th axis (unit)
 */
const symmetricEigen3 = m => {
    const a = m.map(r => r.slice());
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
        const scale = a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2;
        if (off <= 1e-30 * scale) break;
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            if (a[p][q] === 0) continue;
            const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1);
            const sn = t * c;
            for (let k = 0; k < 3; k++) {
                const akp = a[k][p], akq = a[k][q];
                a[k][p] = c * akp - sn * akq;
                a[k][q] = sn * akp + c * akq;
            }
            for (let k = 0; k < 3; k++) {
                const apk = a[p][k], aqk = a[q][k];
                a[p][k] = c * apk - sn * aqk;
                a[q][k] = sn * apk + c * aqk;
            }
            for (let k = 0; k < 3; k++) {
                const vkp = v[k][p], vkq = v[k][q];
                v[k][p] = c * vkp - sn * vkq;
                v[k][q] = sn * vkp + c * vkq;
            }
        }
    }
    const vectors = [0, 1, 2].map(k => [v[0][k], v[1][k], v[2][k]]);
    // Right-handed: z = x × y.
    const [x, y] = vectors;
    vectors[2] = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return {values: [a[0][0], a[1][1], a[2][2]], vectors};
};

/** Unit quaternion [x, y, z, w] of the rotation whose matrix has the given columns. */
const quatFromColumns = ([c0, c1, c2]) => {
    const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, 0.25 * S]; }
    else if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S]; }
    else if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / S, 0.25 * S, (m12 + m21) / S, (m02 - m20) / S]; }
    else { const S = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / S, (m12 + m21) / S, 0.25 * S, (m10 - m01) / S]; }
    const n = Math.hypot(...q);
    return q.map(x => x / n);
};

/**
 * @param {object} J the Jolt namespace (loadJolt())
 * @param {object} compiled a CompiledMechanism, v1 or v2
 * @param {{stepHz?: number, recordContacts?: boolean, kinds?: object}} [options]
 *        recordContacts: count contacts per body pair (contactPairs()); a JavaScript
 *        callback per contact, so for tests and benches only, never the app;
 *        kinds: the kind registries the mechanism was compiled with (default the built-in
 *        ones, kinds/index.js) — what a coupling of a registered kind (worm) is validated by
 */
export const createPhysicsCore = (J, compiled, { stepHz = 120, recordContacts = false, kinds = BUILTIN_KINDS } = {}) => {
    const problems = validateCompiledMechanism(compiled, { kinds });
    if (problems.length) throw new Error(problems.join('\n'));
    const mechanism = upgradeMechanismV1(compiled);
    /** joint id -> its actuator (CompiledMechanism v2): the motorised hinges */
    const actuatorOf = new Map(mechanism.actuators.map(a => [a.joint, a]));
    const dtFixed = 1 / stepHz;
    const LAYER_DYNAMIC = 0;
    const LAYER_STATIC = 1;
    // A static body made of model parts is the machine's own fixed frame (a
    // gearbox clamped to the bench). Since D2 (R3) it collides with the machine's
    // moving parts like any other body, except those jointed to it (an axle turns
    // inside the frame's hole: noCollide). It stays a layer of its own so the
    // ground and obstacles (LAYER_STATIC, no parts) remain distinguishable.
    const LAYER_FRAME = 2;
    const NUM_OBJECT_LAYERS = 3;

    const joltSettings = new J.JoltSettings();
    const maxBodies = Math.max(32, mechanism.bodies.length + 16);
    joltSettings.mMaxBodies = maxBodies;
    joltSettings.mMaxBodyPairs = Math.max(1024, maxBodies * 8);
    joltSettings.mMaxContactConstraints = Math.max(1024, maxBodies * 8);

    const objectLayerPairFilter = new J.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
    objectLayerPairFilter.EnableCollision(LAYER_DYNAMIC, LAYER_DYNAMIC);
    objectLayerPairFilter.EnableCollision(LAYER_DYNAMIC, LAYER_STATIC);
    objectLayerPairFilter.DisableCollision(LAYER_STATIC, LAYER_STATIC);
    objectLayerPairFilter.EnableCollision(LAYER_FRAME, LAYER_DYNAMIC);
    objectLayerPairFilter.DisableCollision(LAYER_FRAME, LAYER_STATIC);
    objectLayerPairFilter.DisableCollision(LAYER_FRAME, LAYER_FRAME);

    // The pairs that must not collide (D2): one collision group for the whole scene,
    // sub-group = the body's index, and the noCollide pairs disabled in the table.
    // Jolt keeps the filter alive by reference from every body's CollisionGroup.
    const bodyIndex = new Map(mechanism.bodies.map((b, i) => [b.id, i]));
    let groupFilter = null;
    if (mechanism.noCollide.length > 0) {
        groupFilter = new J.GroupFilterTable(mechanism.bodies.length);
        for (const [a, b] of mechanism.noCollide) groupFilter.DisableCollision(bodyIndex.get(a), bodyIndex.get(b));
    }

    const bpInterface = new J.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, 2);
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_DYNAMIC, new J.BroadPhaseLayer(0));
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(1));
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_FRAME, new J.BroadPhaseLayer(1));

    const ovbFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bpInterface, 2, objectLayerPairFilter, NUM_OBJECT_LAYERS);

    joltSettings.mObjectLayerPairFilter = objectLayerPairFilter;
    joltSettings.mBroadPhaseLayerInterface = bpInterface;
    joltSettings.mObjectVsBroadPhaseLayerFilter = ovbFilter;

    const joltInterface = new J.JoltInterface(joltSettings);
    J.destroy(joltSettings);
    const physicsSystem = joltInterface.GetPhysicsSystem();
    const bodyInterface = physicsSystem.GetBodyInterface();

    {
        const ps = new J.PhysicsSettings();
        ps.mDeterministicSimulation = true;
        ps.mAllowSleeping = false;
        if (typeof ps.mUseBodyPairContactCache !== 'undefined') ps.mUseBodyPairContactCache = false;
        // Jolt's defaults are tuned for metre-scale game worlds (2 cm speculative contacts,
        // 2 cm penetration slop). LEGO parts are millimetres: a motor hub turning 16 mm above
        // the floor sat inside the default speculative distance and dragged the driving base
        // 15 % slower than its wheels. Scale the tolerances to the parts.
        ps.mSpeculativeContactDistance = LEGO_SPECULATIVE_CONTACT_M;
        ps.mPenetrationSlop = LEGO_PENETRATION_SLOP_M;
        ps.mLinearCastThreshold = 0.25;
        physicsSystem.SetPhysicsSettings(ps);
        J.destroy(ps);
    }

    const gravVec = new J.Vec3(...mechanism.gravity);
    physicsSystem.SetGravity(gravVec);
    J.destroy(gravVec);

    const worldBody = joltInterface.sGetFixedToWorldBody();

    const bodyMap = new Map();
    const bodyOrder = mechanism.bodies.map(b => b.id);
    const jointOrder = mechanism.joints.map(j => j.id);
    const jointMap = new Map();
    const hingeMap = new Map();
    const sliderMap = new Map();
    const ballMap = new Map();
    const allConstraints = [];
    const allBodyIDs = [];

    let destroyed = false;
    let timeSteps = 0;
    let acc = 0;
    /** checkpoint()/rollback(): Jolt's recorded state and this core's own. */
    let recorder = null;
    let saved = null;

    const ensureAlive = () => { if (destroyed) throw new Error('core destroyed'); };

    /**
     * Jolt treats a principal-moment vector shorter than 1e-6 kg·m² as degenerate
     * (MotionProperties::SetMassProperties → Vec3::IsNearZero) and falls back to the
     * inertia of a 1 m sphere, 0.4·m — for a 2–7 g LEGO gear on its axle that is about
     * 1000× its real inertia (measured: 8T body 2.8e-3 kg·m² instead of ~3e-7). Rigid
     * velocity servos hid it; a torque-driven motor (`torque` mode) spun such a gear up
     * a thousand times too slowly. Here the body gets its shape's own inertia, scaled to
     * its mass, whenever the fallback struck.
     */
    const fixSmallInertia = (body, massKg) => {
        const mp = body.GetMotionProperties();
        const d = mp.GetInverseInertiaDiagonal();
        const fallback = 1 / (0.4 * massKg);
        const isFallback = [d.GetX(), d.GetY(), d.GetZ()].every(x => Math.abs(x - fallback) <= 1e-6 * fallback);
        if (!isFallback) return;
        const props = body.GetShape().GetMassProperties();
        const k = massKg / props.mMass;
        const I = props.mInertia;
        const cols = [I.GetAxisX(), I.GetAxisY(), I.GetAxisZ()].map(c => [c.GetX() * k, c.GetY() * k, c.GetZ() * k]);
        const sym = [0, 1, 2].map(r => [0, 1, 2].map(c => 0.5 * (cols[c][r] + cols[r][c])));
        setInertia(mp, sym);
    };
    /** Give a body's motion properties a body-space inertia tensor (symmetric 3×3, kg·m²). */
    const setInertia = (mp, tensor) => {
        const {values, vectors} = symmetricEigen3(tensor);
        if (!values.every(x => x > 0)) return;
        const inv = new J.Vec3(1 / values[0], 1 / values[1], 1 / values[2]);
        const rot = new J.Quat(...quatFromColumns(vectors));
        mp.SetInverseInertia(inv, rot);
        J.destroy(inv);
        J.destroy(rot);
    };
    /** A body's body-space inertia tensor (the inverse of Jolt's local-space inverse inertia). */
    const inertiaOf = mp => {
        const m = mp.GetLocalSpaceInverseInertia();
        const c = [m.GetAxisX(), m.GetAxisY(), m.GetAxisZ()].map(v => [v.GetX(), v.GetY(), v.GetZ()]);
        const a = [0, 1, 2].map(r => [0, 1, 2].map(k => c[k][r]));
        const det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
            a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
        const inv = [
            [a[1][1] * a[2][2] - a[1][2] * a[2][1], a[0][2] * a[2][1] - a[0][1] * a[2][2], a[0][1] * a[1][2] - a[0][2] * a[1][1]],
            [a[1][2] * a[2][0] - a[1][0] * a[2][2], a[0][0] * a[2][2] - a[0][2] * a[2][0], a[0][2] * a[1][0] - a[0][0] * a[1][2]],
            [a[1][0] * a[2][1] - a[1][1] * a[2][0], a[0][1] * a[2][0] - a[0][0] * a[2][1], a[0][0] * a[1][1] - a[0][1] * a[1][0]]
        ].map(r => r.map(v => v / det));
        return [0, 1, 2].map(r => [0, 1, 2].map(k => 0.5 * (inv[r][k] + inv[k][r])));
    };

    for (const b of mechanism.bodies) {
        let shape = null;
        let releaseAfterBody = [];
        if (b.colliders.length === 1 && !b.colliders[0].position && !b.colliders[0].rotation) {
            const col = b.colliders[0];
            if (col.shape === 'box') {
                shape = new J.BoxShape(new J.Vec3(...col.halfExtents), boxConvexRadius(col.halfExtents));
            } else if (col.shape === 'cylinder') {
                const convexRadius = Math.min(0.0005, 0.25 * Math.min(col.halfHeight, col.radius));
                shape = new J.CylinderShape(col.halfHeight, col.radius, convexRadius);
            } else if (col.shape === 'sphere') {
                shape = new J.SphereShape(col.radius);
            } else throw new Error(`unknown collider shape ${col.shape}`);
        } else {
            const compoundSettings = new J.StaticCompoundShapeSettings();
            for (const col of b.colliders) {
                const pos = col.position ? new J.Vec3(...col.position) : new J.Vec3(0, 0, 0);
                const rot = col.rotation ? new J.Quat(...col.rotation) : new J.Quat(0, 0, 0, 1);
                let shapeSettings = null;
                if (col.shape === 'box') {
                    shapeSettings = new J.BoxShapeSettings(new J.Vec3(...col.halfExtents), boxConvexRadius(col.halfExtents));
                } else if (col.shape === 'cylinder') {
                    const convexRadius = Math.min(0.0005, 0.25 * Math.min(col.halfHeight, col.radius));
                    shapeSettings = new J.CylinderShapeSettings(col.halfHeight, col.radius, convexRadius);
                } else if (col.shape === 'sphere') {
                    shapeSettings = new J.SphereShapeSettings(col.radius);
                } else throw new Error(`unknown collider shape ${col.shape}`);
                compoundSettings.AddShape(pos, rot, shapeSettings, 0);
            }
            const shapeResult = compoundSettings.Create();
            if (shapeResult.HasError()) {
                const err = shapeResult.GetError();
                J.destroy(shapeResult);
                J.destroy(compoundSettings);
                throw new Error(`shape creation failed for body ${b.id}: ${err}`);
            }
            shape = shapeResult.Get();
            // The compound shape is reference-counted and, until the body below takes
            // its own reference, owned only by the settings cache and this result:
            // releasing them first would free the shape under the body.
            releaseAfterBody = [shapeResult, compoundSettings];
        }

        const posR = new J.RVec3(...b.position);
        const rotQ = new J.Quat(...b.rotation);
        const motionType = b.motion === 'static' ? J.EMotionType_Static : J.EMotionType_Dynamic;
        const layer = motionType !== J.EMotionType_Static ? LAYER_DYNAMIC : (b.parts.length > 0 ? LAYER_FRAME : LAYER_STATIC);
        const bcs = new J.BodyCreationSettings(shape, posR, rotQ, motionType, layer);
        J.destroy(posR);
        J.destroy(rotQ);
        if (groupFilter) {
            const group = new J.CollisionGroup(groupFilter, 0, bodyIndex.get(b.id));
            bcs.mCollisionGroup = group;
            J.destroy(group);
        }
        if (b.motion === 'dynamic') {
            // Continuous collision (LinearCast) for every moving body: with Discrete, a brick dropped
            // 50 cm (3.1 m/s, 16 mm per 5 ms step) passed through an 8 mm beam (measured). Jolt casts
            // only a body that moves more than mLinearCastThreshold (0.25, below) of its inner radius
            // in one step, so a slow body costs one comparison; measured cost in
            // docs/ROBOT-LAB-ARCHITECTURE.md ("Motion quality").
            bcs.mMotionQuality = J.EMotionQuality_LinearCast;
            bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
            const mp = bcs.mMassPropertiesOverride;
            mp.mMass = b.massKg;
            bcs.mMassPropertiesOverride = mp;
        }
        if (typeof b.friction === 'number') bcs.mFriction = b.friction;
        if (typeof b.restitution === 'number') bcs.mRestitution = b.restitution;
        if (typeof b.linearDamping === 'number') bcs.mLinearDamping = b.linearDamping;
        if (typeof b.angularDamping === 'number') bcs.mAngularDamping = b.angularDamping;

        const body = bodyInterface.CreateBody(bcs);
        const bodyID = body.GetID();
        if (b.motion === 'dynamic') fixSmallInertia(body, b.massKg);
        bodyInterface.AddBody(bodyID, J.EActivation_Activate);
        bodyMap.set(b.id, { body, bodyID, motionType, layer, shape });
        allBodyIDs.push(bodyID);
        J.destroy(bcs);
        for (const o of releaseAfterBody) J.destroy(o);
    }

    const getBodyForId = id => {
        if (id === 'world') return worldBody;
        const e = bodyMap.get(id);
        if (!e) throw new Error(`unknown body ${id}`);
        return e.body;
    };
    const getBodyIDForId = id => {
        if (id === 'world') return null;
        const e = bodyMap.get(id);
        return e ? e.bodyID : null;
    };

    /** A world direction in a body's frame at t = 0 (the body's start rotation inverted). */
    const toLocal = (bodyIdStr, worldAxis) => {
        if (bodyIdStr === 'world') return [...worldAxis];
        const bd = mechanism.bodies.find(x => x.id === bodyIdStr);
        if (!bd) return [...worldAxis];
        const q = bd.rotation;
        const qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
        const vx = worldAxis[0], vy = worldAxis[1], vz = worldAxis[2];
        const ix = qy * vz - qz * vy;
        const iy = qz * vx - qx * vz;
        const iz = qx * vy - qy * vx;
        const ix2 = qy * iz - qz * iy;
        const iy2 = qz * ix - qx * iz;
        const iz2 = qx * iy - qy * ix;
        const rx = vx + 2 * (qw * ix + ix2);
        const ry = vy + 2 * (qw * iy + iy2);
        const rz = vz + 2 * (qw * iz + iz2);
        return [rx, ry, rz];
    };
    for (const j of mechanism.joints) {
        jointMap.set(j.id, j);
        const bodyA = getBodyForId(j.body1);
        const bodyB = getBodyForId(j.body2);
        if (j.type === 'hinge') {
            const hs = new J.HingeConstraintSettings();
            hs.mSpace = J.EConstraintSpace_WorldSpace;
            hs.mPoint1 = new J.RVec3(...j.point);
            hs.mPoint2 = new J.RVec3(...j.point);
            hs.mHingeAxis1 = new J.Vec3(...j.axis);
            hs.mHingeAxis2 = new J.Vec3(...j.axis);
            const perp = perpForAxis(j.axis);
            hs.mNormalAxis1 = new J.Vec3(...perp);
            hs.mNormalAxis2 = new J.Vec3(...perp);
            const actuator = actuatorOf.get(j.id);
            if (actuator) {
                hs.mMotorSettings.mMinTorqueLimit = -actuator.maxTorqueNm;
                hs.mMotorSettings.mMaxTorqueLimit = actuator.maxTorqueNm;
            } else {
                hs.mMotorSettings.mMinTorqueLimit = -1e6;
                hs.mMotorSettings.mMaxTorqueLimit = 1e6;
            }
            // Joint v2 (R3): end stops in rad from the start pose, and bearing friction
            // (Jolt applies it while the motor is off: a coasting or unpowered hinge).
            if (j.limits) { hs.mLimitsMin = j.limits[0]; hs.mLimitsMax = j.limits[1]; }
            if (typeof j.frictionNm === 'number') hs.mMaxFrictionTorque = j.frictionNm;
            if (actuator) {
                // A motorised hinge's island solves with more iterations than Jolt's default (MOTOR_VELOCITY_STEPS).
                hs.mNumVelocityStepsOverride = MOTOR_VELOCITY_STEPS;
                hs.mNumPositionStepsOverride = MOTOR_POSITION_STEPS;
            }
            const constraint = hs.Create(bodyA, bodyB);
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            const hinge = J.castObject(constraint, J.HingeConstraint);
            const localAxis1 = toLocal(j.body1, j.axis);
            const localAxis2 = toLocal(j.body2, j.axis);
            const isMotor = !!actuator;
            hingeMap.set(j.id, {
                hinge, constraint, bodyA, bodyB,
                bodyAID: getBodyIDForId(j.body1),
                bodyBID: getBodyIDForId(j.body2),
                axis: [...j.axis], point: [...j.point], perp: [...perp],
                localAxis1, localAxis2,
                rawPrev: 0, unwrapped: 0, velocity: 0,
                maxTorque: actuator ? actuator.maxTorqueNm : 10,
                maxSpeed: actuator ? actuator.maxSpeedRadPerSec : 30,
                mode: 'coast', target: 0, targetSpeed: null, kp: 10, isMotor,
                driveTorque: 0, damping: 0, rotorInertia: 0,
                frictionNm: typeof j.frictionNm === 'number' ? j.frictionNm : 0,
            });
            hinge.SetMotorState(J.EMotorState_Off);
            J.destroy(hs);
        } else if (j.type === 'slider') {
            const ss = new J.SliderConstraintSettings();
            ss.mSpace = J.EConstraintSpace_WorldSpace;
            ss.mPoint1 = new J.RVec3(...j.point);
            ss.mPoint2 = new J.RVec3(...j.point);
            ss.mSliderAxis1 = new J.Vec3(...j.axis);
            ss.mSliderAxis2 = new J.Vec3(...j.axis);
            const perp = perpForAxis(j.axis);
            ss.mNormalAxis1 = new J.Vec3(...perp);
            ss.mNormalAxis2 = new J.Vec3(...perp);
            // Joint v2 (R3): end stops in m from the start pose (none: ±1e6, as before),
            // and sliding friction (applied by Jolt while the motor is off).
            ss.mLimitsMin = j.limits ? j.limits[0] : -1e6;
            ss.mLimitsMax = j.limits ? j.limits[1] : 1e6;
            if (typeof j.frictionN === 'number') ss.mMaxFrictionForce = j.frictionN;
            const maxForce = typeof j.maxForceN === 'number' ? j.maxForceN : 0;
            ss.mMotorSettings.mMinForceLimit = -maxForce;
            ss.mMotorSettings.mMaxForceLimit = maxForce;
            const constraint = ss.Create(bodyA, bodyB);
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            const slider = J.castObject(constraint, J.SliderConstraint);
            slider.SetMotorState(J.EMotorState_Off);
            sliderMap.set(j.id, {
                slider, constraint, bodyA, bodyB,
                bodyAID: getBodyIDForId(j.body1),
                bodyBID: getBodyIDForId(j.body2),
                axis: [...j.axis], point: [...j.point],
                localAxis1: toLocal(j.body1, j.axis), localAxis2: toLocal(j.body2, j.axis),
                position: 0, velocity: 0,
                maxForce, maxSpeed: typeof j.maxSpeedMPerSec === 'number' ? j.maxSpeedMPerSec : Infinity,
                mode: 'coast', target: 0, targetSpeed: null, kp: 10,
            });
            J.destroy(ss);
        } else if (j.type === 'ball') {
            const ps2 = new J.PointConstraintSettings();
            ps2.mSpace = J.EConstraintSpace_WorldSpace;
            ps2.mPoint1 = new J.RVec3(...j.point);
            ps2.mPoint2 = new J.RVec3(...j.point);
            const constraint = ps2.Create(bodyA, bodyB);
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            ballMap.set(j.id, { constraint, bodyA, bodyB, point: [...j.point] });
            J.destroy(ps2);
        } else throw new Error(`unknown joint type ${j.type}`);
    }

    // Gears are Jolt GearConstraints between the two GEAR bodies, so the mesh
    // works both ways: a load on the driven gear (an obstacle, a heavy arm) comes
    // back through the teeth to the driving motor and can stall it. (Until
    // 2026-10-17 a gear was a velocity servo on the driven hinge with an
    // unlimited torque: the motor never felt its load, and which hinge drove
    // which depended on joint id order.)
    //
    // The two hinges of a mesh share the frame body that holds both axles
    // (mech/gears.js only couples such pairs); the gear body of each hinge is
    // its other body. A gear on the hinge's body2 turns by +ω about the hinge
    // axis, one on body1 by −ω, so Jolt gets the signed axes a = s·axis and
    // ω1·a1 + r·ω2·a2 = 0 (GearConstraintPart) gives ω(joint2) = −ω(joint1)/r:
    // r = −1/ratio. Jolt 1.1.0's gear constraint diverges (NaN within a few
    // steps, measured) for a negative r or r < 1 (e.g. ratio −3 or +1/3), so the
    // pair is ordered to make |ratio| ≤ 1 and a positive ratio is expressed by
    // flipping axis 2: r = 1/|ratio| ≥ 1 always. Jolt constrains the gear bodies' WORLD rotation rates: exact
    // while the frame does not turn about the gear axes (a gearbox clamped or
    // standing still); on a frame that itself turns about them the coupling is
    // off by that frame rate (documented in docs/SIM-LAB.md).
    /**
     * Gear bodies get principal moments of at least GEAR_MIN_INERTIA. A mesh couples a
     * 2–7 g gear (true inertia ~1e-7 kg·m²) to a motor whose rotor alone is 3e-4 kg·m² at
     * its output (devices/dc-motors.js) — reflected through the mesh, ratios of 1000–5000
     * — and Jolt's iterative solver cannot hold a gear constraint and a contact against
     * such ratios: an arm on a driven 24T that hit a static block was pushed back out of it
     * and then through it, the gear constraint slipping (measured; GEAR_VELOCITY_STEPS does
     * not help, convergence needs iterations ∝ the ratio). With 3e-5 kg·m² (measured: the
     * smallest floor that stalls that arm at the block) the ratio is ~100. It is a numerical
     * floor, not a property of the parts: a small gear spins up ~100× more slowly on its
     * own than a real one, which no motor-driven train notices (the rotor dominates).
     */
    const GEAR_MIN_INERTIA = 3e-5;
    const floorInertia = id => {
        const e = bodyMap.get(id);
        if (!e || e.motionType === J.EMotionType_Static) return;
        const mp = e.body.GetMotionProperties();
        const {values, vectors} = symmetricEigen3(inertiaOf(mp));
        if (values.every(v => v >= GEAR_MIN_INERTIA)) return;
        const v = values.map(x => Math.max(x, GEAR_MIN_INERTIA));
        setInertia(mp, [0, 1, 2].map(r => [0, 1, 2].map(c => vectors.reduce((acc, u, k) => acc + v[k] * u[r] * u[c], 0))));
    };
    const gearInfos = [];
    /** A Jolt GearConstraint for ω(j2) = ratio·ω(j1) between the two gear bodies (the 'gear' kind's rules). */
    const buildGearConstraint = (id, j1, j2, ratio0, velocitySteps = GEAR_VELOCITY_STEPS) => {
        if (!j1 || !j2) throw new Error(`gear ${id} joint not found`);
        if (j1.type !== 'hinge' || j2.type !== 'hinge') throw new Error(`gear ${id} must couple two hinges`);
        const shared = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
        const gearSide = j => {
            // No shared frame (a hand-built mechanism): the gear is the hinge's body2.
            if (shared === undefined || j.body1 === j.body2) return { body: j.body2, sign: 1 };
            return j.body2 === shared ? { body: j.body1, sign: -1 } : { body: j.body2, sign: 1 };
        };
        let A = { j: j1, side: gearSide(j1) };
        let B = { j: j2, side: gearSide(j2) };
        let ratio = ratio0;
        if (Math.abs(ratio) > 1) { [A, B] = [B, A]; ratio = 1 / ratio; }
        const gs = new J.GearConstraintSettings();
        gs.mSpace = J.EConstraintSpace_WorldSpace;
        const flip = ratio > 0 ? -1 : 1;
        gs.mHingeAxis1 = new J.Vec3(...A.j.axis.map(v => v * A.side.sign));
        gs.mHingeAxis2 = new J.Vec3(...B.j.axis.map(v => v * B.side.sign * flip));
        gs.mRatio = 1 / Math.abs(ratio);
        gs.mNumVelocityStepsOverride = velocitySteps;
        gs.mNumPositionStepsOverride = GEAR_POSITION_STEPS;
        const constraint = gs.Create(getBodyForId(A.side.body), getBodyForId(B.side.body));
        physicsSystem.AddConstraint(constraint);
        allConstraints.push(constraint);
        J.destroy(gs);
        for (const bid of [A.side.body, B.side.body]) floorInertia(bid);
        return constraint;
    };
    /** Self-locking worms (built below): {wormJoint, wheel (hinge entry), holdNm, driver (hinge entry|null), held}. */
    const worms = [];
    for (const g of mechanism.couplings) {
        if (g.kind === 'gear') {
            buildGearConstraint(g.id, jointMap.get(g.joint1), jointMap.get(g.joint2), g.ratio);
            gearInfos.push({ type: 'gear', id: g.id, joint1: g.joint1, joint2: g.joint2, ratio: g.ratio });
        } else if (g.kind === 'worm') {
            // A worm and its wheel (kinds/worm.js): the mesh is a gear constraint, ratio = 1/teeth
            // (signed by the thread's hand); the SELF-LOCK is a hold on the wheel's hinge, applied
            // per step while nothing drives the worm (wormHolds below).
            buildGearConstraint(g.id, jointMap.get(g.wormJoint), jointMap.get(g.wheelJoint), g.ratio, WORM_VELOCITY_STEPS);
            const wheel = hingeMap.get(g.wheelJoint);
            worms.push({ id: g.id, wormJoint: g.wormJoint, wheel, holdNm: g.holdTorqueNm / Math.abs(g.ratio), driver: null, held: false });
            gearInfos.push({ type: 'worm', id: g.id, wormJoint: g.wormJoint, wheelJoint: g.wheelJoint, ratio: g.ratio });
        } else if (g.kind === 'rackAndPinion') {
            // A Jolt RackAndPinionConstraint between the pinion body (the hinge's side
            // not shared with the slider) and the rack body (the slider's other side),
            // signed the way the gear's axes are. Contract: v(slider) = ratio·ω(hinge),
            // m/s per rad/s; Jolt's part is ω1·a = r·v2·b (rad/s per m/s), so r = 1/|ratio|
            // and the ratio's sign goes into the slider axis b. Like a gear it couples
            // WORLD rates: exact while the frame holding both does not turn about the
            // pinion axis. Measured in test/bw-sim-sliders.test.mjs (both signs).
            const jh = jointMap.get(g.hingeJoint);
            const js = jointMap.get(g.sliderJoint);
            if (!jh || !js) throw new Error(`rack and pinion ${g.id} joint not found`);
            if (jh.type !== 'hinge' || js.type !== 'slider') throw new Error(`rack and pinion ${g.id} must couple a hinge and a slider`);
            const shared = [jh.body1, jh.body2].find(b => b === js.body1 || b === js.body2);
            const sideOf = j => {
                if (shared === undefined) return { body: j.body2, sign: 1 };
                return j.body2 === shared ? { body: j.body1, sign: -1 } : { body: j.body2, sign: 1 };
            };
            const pinion = sideOf(jh);
            const rack = sideOf(js);
            const rs = new J.RackAndPinionConstraintSettings();
            rs.mSpace = J.EConstraintSpace_WorldSpace;
            rs.mHingeAxis = new J.Vec3(...jh.axis.map(v => v * pinion.sign));
            rs.mSliderAxis = new J.Vec3(...js.axis.map(v => v * rack.sign * Math.sign(g.ratio)));
            rs.mRatio = 1 / Math.abs(g.ratio);
            rs.mNumVelocityStepsOverride = GEAR_VELOCITY_STEPS;
            rs.mNumPositionStepsOverride = GEAR_POSITION_STEPS;
            floorInertia(pinion.body);
            const constraint = rs.Create(getBodyForId(pinion.body), getBodyForId(rack.body));
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            J.destroy(rs);
            gearInfos.push({ type: 'rackAndPinion', id: g.id, hingeJoint: g.hingeJoint, sliderJoint: g.sliderJoint, ratio: g.ratio });
        } else throw new Error(`no physics builder for coupling kind '${g.kind}' (${g.id})`);
    }

    try { physicsSystem.OptimizeBroadPhase(); } catch (_) {}

    // Self-lock (kinds/worm.js has the physics): a worm cannot be turned from its wheel. Jolt has
    // no friction that depends on which side drives, so the core tells the two cases apart by the
    // motor that drives the worm — the worm's own hinge's, or the first motorised hinge a chain of
    // gear couplings reaches from it. While that motor DRIVES (a velocity, position or torque
    // command that is not zero) the mesh is the gear constraint alone; otherwise (coast, brake,
    // no motor at all) the wheel's hinge holds with friction holdTorqueNm / |ratio| on top of its
    // bearing friction (Jolt applies hinge friction while the hinge's own motor is off: the
    // wheel's has none). Decided before every step from the commands of that step.
    const wormDriverOf = jointId => {
        const seen = new Set([jointId]);
        const queue = [jointId];
        while (queue.length) {
            const id = queue.shift();
            const e = hingeMap.get(id);
            if (e && e.isMotor) return e;
            for (const g of mechanism.couplings) {
                if (g.kind !== 'gear') continue;
                const next = g.joint1 === id ? g.joint2 : g.joint2 === id ? g.joint1 : null;
                if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
            }
        }
        return null;
    };
    for (const w of worms) w.driver = wormDriverOf(w.wormJoint);
    const wormDriven = e => {
        if (!e) return false;
        if (e.mode === 'velocity') return e.targetSpeed !== 0;
        if (e.mode === 'position') return true;
        if (e.mode === 'torque') return e.driveTorque !== 0;
        return false;
    };
    const setWormHold = (w, held) => {
        w.held = held;
        w.wheel.hinge.SetMaxFrictionTorque(w.wheel.frictionNm + (held ? w.holdNm : 0));
    };
    const applyWormHolds = () => {
        for (const w of worms) {
            const held = !wormDriven(w.driver);
            if (held !== w.held) setWormHold(w, held);
        }
    };

    const quatRotateVec = (q, v) => {
        const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        const vx = v[0], vy = v[1], vz = v[2];
        const cx = qy * vz - qz * vy;
        const cy = qz * vx - qx * vz;
        const cz = qx * vy - qy * vx;
        const ix = cx + qw * vx;
        const iy = cy + qw * vy;
        const iz = cz + qw * vz;
        const jx = qy * iz - qz * iy;
        const jy = qz * ix - qx * iz;
        const jz = qx * iy - qy * ix;
        return [vx + 2 * jx, vy + 2 * jy, vz + 2 * jz];
    };
    const computeVelocity = entry => {
        let worldAxis;
        if (entry.bodyAID) {
            const rot = bodyInterface.GetRotation(entry.bodyAID);
            const q = [rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()];
            worldAxis = quatRotateVec(q, entry.localAxis1);
        } else if (entry.bodyBID) {
            const rot = bodyInterface.GetRotation(entry.bodyBID);
            const q = [rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()];
            worldAxis = quatRotateVec(q, entry.localAxis2);
        } else worldAxis = entry.axis;
        const len = Math.hypot(...worldAxis);
        if (len > 0) worldAxis = worldAxis.map(v => v / len);
        let wA = [0, 0, 0], wB = [0, 0, 0];
        if (entry.bodyAID) { const av = bodyInterface.GetAngularVelocity(entry.bodyAID); wA = [av.GetX(), av.GetY(), av.GetZ()]; }
        if (entry.bodyBID) { const av = bodyInterface.GetAngularVelocity(entry.bodyBID); wB = [av.GetX(), av.GetY(), av.GetZ()]; }
        const rel = [wB[0] - wA[0], wB[1] - wA[1], wB[2] - wA[2]];
        return rel[0] * worldAxis[0] + rel[1] * worldAxis[1] + rel[2] * worldAxis[2];
    };
    /** The hinge axis in world space now (body1's frame, else body2's, else as compiled). */
    const worldAxisOf = entry => {
        let worldAxis;
        if (entry.bodyAID) {
            const rot = bodyInterface.GetRotation(entry.bodyAID);
            worldAxis = quatRotateVec([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], entry.localAxis1);
        } else if (entry.bodyBID) {
            const rot = bodyInterface.GetRotation(entry.bodyBID);
            worldAxis = quatRotateVec([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], entry.localAxis2);
        } else worldAxis = entry.axis;
        const len = Math.hypot(...worldAxis);
        return len > 0 ? worldAxis.map(v => v / len) : worldAxis;
    };
    /**
     * `torque` mode, once per Jolt step. The command τ = T − c·ω (ω the hinge's relative
     * speed) is one SOFT position motor: Jolt's spring part is an implicit spring–damper,
     * the constraint torque −k·(θ − θt) − (c_j + k·dt)·ω_end with ω_end the speed at the END
     * of the step; with k = c/(2·dt), c_j = c/2 and the target θt = θ + T/k it is exactly
     * T − c·ω_end (backward Euler: stable for any inertia). The drive torque goes through
     * the constraint, not as a torque applied to the bodies: Jolt clamps a body's predicted
     * angular velocity (47 rad/s by default) BEFORE the constraints act, so a large torque
     * on a light shaft was cut off there (measured: a 4e-6 kg·m² wheel stopped at 3.7 rad/s
     * whatever the torque).
     */
    const applyHingeTorque = entry => {
        const k = entry.damping / (2 * dtFixed);
        const offset = clamp(entry.driveTorque / k, -3, 3);
        entry.hinge.SetTargetAngle(normalizeAngle(entry.hinge.GetCurrentAngle() + offset));
    };
    /** Motor torque limits and spring of a hinge (Jolt reads them in the next step). */
    const setMotorSettings = (entry, {limit, damping = null}) => {
        const ms = entry.hinge.GetMotorSettings();
        ms.mMinTorqueLimit = -limit;
        ms.mMaxTorqueLimit = limit;
        if (damping !== null) {
            const spring = ms.mSpringSettings;
            spring.mMode = J.ESpringMode_StiffnessAndDamping;
            spring.mStiffness = damping / (2 * dtFixed);
            spring.mDamping = damping / 2;
        }
    };
    /**
     * A slider's rate: body2's velocity minus body1's, both at body2's centre of mass,
     * along the slider axis as body1 carries it. The slider locks the two bodies'
     * relative rotation, so the point chosen does not change the result (the ω×d terms
     * cancel along the axis): it is d/dt of GetCurrentPosition().
     */
    const sliderVelocity = entry => {
        let worldAxis = entry.axis;
        if (entry.bodyAID) {
            const rot = bodyInterface.GetRotation(entry.bodyAID);
            worldAxis = quatRotateVec([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], entry.localAxis1);
        } else if (entry.bodyBID) {
            const rot = bodyInterface.GetRotation(entry.bodyBID);
            worldAxis = quatRotateVec([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], entry.localAxis2);
        }
        let vB = [0, 0, 0];
        let vA = [0, 0, 0];
        if (entry.bodyBID) {
            const v = bodyInterface.GetLinearVelocity(entry.bodyBID);
            vB = [v.GetX(), v.GetY(), v.GetZ()];
            if (entry.bodyAID) {
                const com = entry.bodyB.GetCenterOfMassPosition();
                const va = bodyInterface.GetPointVelocity(entry.bodyAID, com);
                vA = [va.GetX(), va.GetY(), va.GetZ()];
            }
        } else if (entry.bodyAID) {
            const v = bodyInterface.GetLinearVelocity(entry.bodyAID);
            vA = [v.GetX(), v.GetY(), v.GetZ()];
        }
        return (vB[0] - vA[0]) * worldAxis[0] + (vB[1] - vA[1]) * worldAxis[1] + (vB[2] - vA[2]) * worldAxis[2];
    };
    const updateJointStates = () => {
        for (const [, entry] of hingeMap) {
            const raw = entry.hinge.GetCurrentAngle();
            const delta = deltaAngle(raw, entry.rawPrev);
            entry.unwrapped += delta;
            entry.rawPrev = raw;
            entry.velocity = computeVelocity(entry);
        }
        for (const [, entry] of sliderMap) {
            entry.position = entry.slider.GetCurrentPosition();
            entry.velocity = sliderVelocity(entry);
        }
    };
    updateJointStates();

    /** A slider motor's force limit: in Jolt's MotorSettings, which SaveState does not record. */
    const applySliderForce = (entry, maxForce) => {
        entry.maxForce = maxForce;
        const ms = entry.slider.GetMotorSettings();
        ms.mMinForceLimit = -maxForce;
        ms.mMaxForceLimit = maxForce;
    };

    // Optional contact log (tests, benches): contacts per body pair, Jolt's
    // OnContactAdded/OnContactPersisted per manifold per step.
    const bodyIdOfIndex = new Map();
    for (const [id, e] of bodyMap) bodyIdOfIndex.set(e.bodyID.GetIndexAndSequenceNumber(), id);
    let contactLog = null;
    let contactListener = null;
    if (recordContacts) {
        contactLog = { pairs: new Map(), manifolds: 0 };
        contactListener = new J.ContactListenerJS();
        const note = (body1Ptr, body2Ptr) => {
            const b1 = J.wrapPointer(body1Ptr, J.Body);
            const b2 = J.wrapPointer(body2Ptr, J.Body);
            const a = bodyIdOfIndex.get(b1.GetID().GetIndexAndSequenceNumber()) || '?';
            const b = bodyIdOfIndex.get(b2.GetID().GetIndexAndSequenceNumber()) || '?';
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            contactLog.pairs.set(key, (contactLog.pairs.get(key) || 0) + 1);
            contactLog.manifolds += 1;
        };
        contactListener.OnContactValidate = () => J.ValidateResult_AcceptAllContactsForThisBodyPair;
        contactListener.OnContactAdded = (b1, b2) => note(b1, b2);
        contactListener.OnContactPersisted = (b1, b2) => note(b1, b2);
        contactListener.OnContactRemoved = () => {};
        physicsSystem.SetContactListener(contactListener);
    }


    // The per-step state registry (§6.4): everything a step carries to the next that
    // Jolt's SaveState does not record (it records bodies, contacts and each
    // constraint's motor state and targets, not its MotorSettings or friction).
    // Couplings with per-step logic register here too (core.registerState).
    const stateRegistry = createStateRegistry();
    stateRegistry.register('clock', {
        save: () => [acc, timeSteps],
        restore: ([a, t]) => { acc = a; timeSteps = t; }
    });
    stateRegistry.register('hinges', {
        save: () => [...hingeMap.values()].map(e => [e.rawPrev, e.unwrapped, e.velocity, e.mode, e.target, e.targetSpeed, e.driveTorque, e.damping,
            e.hinge.GetMaxFrictionTorque(), e.rotorInertia]),
        restore: saved => {
            let i = 0;
            for (const [id, e] of hingeMap) {
                let friction, rotorInertia;
                [e.rawPrev, e.unwrapped, e.velocity, e.mode, e.target, e.targetSpeed, e.driveTorque, e.damping, friction, rotorInertia] = saved[i++];
                // Motor settings are not part of Jolt's saved state: put back the checkpoint's.
                if (e.isMotor) {
                    setMotorSettings(e, e.mode === 'torque' ? {limit: 1e6, damping: e.damping} : {limit: e.maxTorque});
                    e.hinge.SetMaxFrictionTorque(friction);
                    if (rotorInertia !== e.rotorInertia) core.setRotorInertia(id, rotorInertia);
                }
            }
        }
    });
    stateRegistry.register('sliders', {
        save: () => [...sliderMap.values()].map(e => [e.position, e.velocity, e.mode, e.target, e.targetSpeed, e.maxForce]),
        restore: saved => {
            let i = 0;
            for (const [, e] of sliderMap) {
                let maxForce;
                [e.position, e.velocity, e.mode, e.target, e.targetSpeed, maxForce] = saved[i++];
                applySliderForce(e, maxForce);
            }
        }
    });
    // A worm's hold (friction on its wheel's hinge, which Jolt's SaveState does not record).
    if (worms.length) {
        stateRegistry.register('worms', {
            save: () => worms.map(w => w.held),
            restore: saved => worms.forEach((w, i) => setWormHold(w, saved[i]))
        });
    }
    // The collision filter (noCollide) is fixed when the scene is built: no per-step
    // state. The contact log, when kept, is.
    if (contactLog) {
        stateRegistry.register('contacts', {
            save: () => [[...contactLog.pairs], contactLog.manifolds],
            restore: ([pairs, manifolds]) => { contactLog.pairs = new Map(pairs); contactLog.manifolds = manifolds; }
        });
    }

    /**
     * A slider's motor (R3): velocity {mPerSec}, position {m, mPerSec?} (the hinge's
     * P-controller on the measured position), coast, brake, hold. The force limit is the
     * joint's `maxForceN`, or the command's `maxForceN` (kept for later commands); a
     * slider with neither cannot be driven.
     */
    const setSliderMotor = (jointId, entry, cmd) => {
        if (!cmd || typeof cmd.mode !== 'string') throw new Error(`invalid motor command for ${jointId}`);
        if (cmd.maxForceN !== undefined) {
            if (typeof cmd.maxForceN !== 'number' || !Number.isFinite(cmd.maxForceN) || cmd.maxForceN < 0) throw new Error(`maxForceN must be a non-negative number`);
            applySliderForce(entry, cmd.maxForceN);
        }
        if (cmd.mode !== 'coast' && !(entry.maxForce > 0)) throw new Error(`slider ${jointId} has no motor force: give the joint maxForceN or the command maxForceN`);
        const s = entry.slider;
        switch (cmd.mode) {
            case 'velocity': {
                if (typeof cmd.mPerSec !== 'number' || !Number.isFinite(cmd.mPerSec)) throw new Error(`velocity needs mPerSec`);
                const v = clamp(cmd.mPerSec, -entry.maxSpeed, entry.maxSpeed);
                entry.mode = 'velocity'; entry.targetSpeed = v;
                s.SetMotorState(J.EMotorState_Velocity);
                s.SetTargetVelocity(v); break;
            }
            case 'position': {
                if (typeof cmd.m !== 'number' || !Number.isFinite(cmd.m)) throw new Error(`position needs m`);
                let lim = entry.maxSpeed;
                if (typeof cmd.mPerSec === 'number' && Number.isFinite(cmd.mPerSec)) lim = clamp(cmd.mPerSec, 0, entry.maxSpeed);
                entry.mode = 'position'; entry.target = cmd.m; entry.targetSpeed = lim;
                s.SetMotorState(J.EMotorState_Velocity);
                s.SetTargetVelocity(clamp((entry.target - entry.position) * entry.kp, -lim, lim)); break;
            }
            case 'coast': entry.mode = 'coast'; s.SetMotorState(J.EMotorState_Off); break;
            case 'brake': entry.mode = 'brake'; s.SetMotorState(J.EMotorState_Velocity); s.SetTargetVelocity(0); break;
            case 'hold': entry.mode = 'position'; entry.target = entry.position; entry.targetSpeed = entry.maxSpeed; s.SetMotorState(J.EMotorState_Velocity); s.SetTargetVelocity(0); break;
            default: throw new Error(`unknown motor mode ${cmd.mode}`);
        }
    };

    const core = {
        get time() { ensureAlive(); return timeSteps * dtFixed; },
        step(dtSeconds) {
            ensureAlive();
            if (typeof dtSeconds !== 'number' || !Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('dtSeconds must be a non-negative finite number');
            acc += dtSeconds;
            const eps = 1e-12;
            while (acc + eps >= dtFixed) {
                for (const [, entry] of hingeMap) if (entry.mode === 'position') {
                    const err = entry.target - entry.unwrapped;
                    const lim = entry.targetSpeed !== null && entry.targetSpeed !== undefined ? entry.targetSpeed : entry.maxSpeed;
                    const desired = clamp(err * entry.kp, -lim, lim);
                    entry.hinge.SetTargetAngularVelocity(desired);
                    if (entry.hinge.GetMotorState() !== J.EMotorState_Velocity) entry.hinge.SetMotorState(J.EMotorState_Velocity);
                }
                for (const [, entry] of hingeMap) if (entry.mode === 'torque') applyHingeTorque(entry);
                for (const [, entry] of sliderMap) if (entry.mode === 'position') {
                    const err = entry.target - entry.position;
                    const lim = entry.targetSpeed !== null && entry.targetSpeed !== undefined ? entry.targetSpeed : entry.maxSpeed;
                    entry.slider.SetTargetVelocity(clamp(err * entry.kp, -lim, lim));
                    if (entry.slider.GetMotorState() !== J.EMotorState_Velocity) entry.slider.SetMotorState(J.EMotorState_Velocity);
                }
                if (worms.length) applyWormHolds();
                joltInterface.Step(dtFixed, 1);
                timeSteps += 1;
                acc -= dtFixed;
                if (acc < 0 && acc > -1e-12) acc = 0;
                updateJointStates();
            }
            if (acc < 0) acc = 0;
            if (acc > dtFixed) acc = 0;
        },
        setMotor(jointId, cmd) {
            ensureAlive();
            if (sliderMap.has(jointId)) return setSliderMotor(jointId, sliderMap.get(jointId), cmd);
            const entry = hingeMap.get(jointId);
            if (!entry) {
                const j = jointMap.get(jointId);
                if (!j) throw new Error(`unknown joint ${jointId}`);
                throw new Error(`joint ${jointId} is not a motorised hinge (type ${j.type})`);
            }
            if (!entry.isMotor) throw new Error(`joint ${jointId} is not a motorised hinge`);
            if (!cmd || typeof cmd.mode !== 'string') throw new Error(`invalid motor command for ${jointId}`);
            const maxSpeed = entry.maxSpeed;
            if (entry.mode === 'torque' && cmd.mode !== 'torque') {
                setMotorSettings(entry, {limit: entry.maxTorque});
                entry.driveTorque = 0;
                entry.damping = 0;
            }
            if (cmd.mode !== 'coast') entry.hinge.SetMaxFrictionTorque(0);
            switch (cmd.mode) {
                case 'velocity': {
                    if (typeof cmd.radPerSec !== 'number' || !Number.isFinite(cmd.radPerSec)) throw new Error(`velocity needs radPerSec`);
                    const v = clamp(cmd.radPerSec, -maxSpeed, maxSpeed);
                    entry.mode = 'velocity'; entry.targetSpeed = v;
                    entry.hinge.SetMotorState(J.EMotorState_Velocity);
                    entry.hinge.SetTargetAngularVelocity(v); break;
                }
                case 'position': {
                    if (typeof cmd.rad !== 'number' || !Number.isFinite(cmd.rad)) throw new Error(`position needs rad`);
                    let lim = maxSpeed;
                    if (typeof cmd.radPerSec === 'number' && Number.isFinite(cmd.radPerSec)) lim = clamp(cmd.radPerSec, 0, maxSpeed);
                    entry.mode = 'position'; entry.target = cmd.rad; entry.targetSpeed = lim;
                    entry.hinge.SetMotorState(J.EMotorState_Velocity);
                    const err = entry.target - entry.unwrapped;
                    entry.hinge.SetTargetAngularVelocity(clamp(err * entry.kp, -lim, lim)); break;
                }
                case 'coast': {
                    // Optional friction (N·m) while the motor is off: a gearbox's drag (default:
                    // the joint's own bearing friction, frictionNm).
                    const friction = typeof cmd.frictionNm === 'number' && Number.isFinite(cmd.frictionNm) ? Math.max(0, cmd.frictionNm) : entry.frictionNm;
                    entry.mode = 'coast'; entry.hinge.SetMotorState(J.EMotorState_Off);
                    entry.hinge.SetMaxFrictionTorque(friction); break;
                }
                case 'torque': {
                    // τ = torqueNm − dampingNmsPerRad·ω on the hinge (applyHingeTorque).
                    const {torqueNm, dampingNmsPerRad} = cmd;
                    if (typeof torqueNm !== 'number' || !Number.isFinite(torqueNm)) throw new Error('torque needs torqueNm');
                    if (typeof dampingNmsPerRad !== 'number' || !Number.isFinite(dampingNmsPerRad) || dampingNmsPerRad <= 0) {
                        throw new Error('torque needs dampingNmsPerRad > 0');
                    }
                    if (entry.mode !== 'torque' || entry.damping !== dampingNmsPerRad) {
                        setMotorSettings(entry, {limit: 1e6, damping: dampingNmsPerRad});
                    }
                    entry.mode = 'torque'; entry.driveTorque = torqueNm; entry.damping = dampingNmsPerRad;
                    if (entry.hinge.GetMotorState() !== J.EMotorState_Position) entry.hinge.SetMotorState(J.EMotorState_Position);
                    break;
                }
                case 'brake': entry.mode = 'brake'; entry.hinge.SetMotorState(J.EMotorState_Velocity); entry.hinge.SetTargetAngularVelocity(0); break;
                case 'hold': entry.mode = 'position'; entry.target = entry.unwrapped; entry.targetSpeed = maxSpeed; entry.hinge.SetMotorState(J.EMotorState_Velocity); entry.hinge.SetTargetAngularVelocity(0); break;
                default: throw new Error(`unknown motor mode ${cmd.mode}`);
            }
        },
        /**
         * A motor's rotor inertia reflected through its gearbox (kg·m² at the output), J. The
         * rotor turns with the hinge's RELATIVE angle (kinetic energy ½·J·(ω2 − ω1)²), which no
         * body inertia can express; it is added about the hinge axis to BOTH bodies that move
         * (½·J·ω1² + ½·J·ω2²). That is exact whenever one side does not turn about the axis —
         * a clamped motor (the housing static: only the output gets it), a driving base's wheel
         * on a level chassis, or a planted wheel under a pitching chassis, where the rotor
         * really does resist the chassis — and wrong only when both turn together about the
         * axis (the rotor then adds nothing, here 2·J). As body inertia, unlike a term in the
         * motor constraint, the rotor's momentum is in the bodies the gear and contact
         * constraints see (measured: as a motor term the rotor drove a light 24T and arm
         * through a static block, the gear constraint slipping). Setting, not adding: a second
         * call with the same value changes nothing.
         */
        setRotorInertia(jointId, inertiaKgM2) {
            ensureAlive();
            const entry = hingeMap.get(jointId);
            if (!entry || !entry.isMotor) throw new Error(`joint ${jointId} is not a motorised hinge`);
            const I = Number(inertiaKgM2);
            if (!(I >= 0) || !Number.isFinite(I)) throw new Error('setRotorInertia needs a finite inertia >= 0');
            const delta = I - entry.rotorInertia;
            if (delta === 0) return;
            const j = jointMap.get(jointId);
            for (const [id, body, local] of [[j.body1, entry.bodyA, entry.localAxis1], [j.body2, entry.bodyB, entry.localAxis2]]) {
                const e = bodyMap.get(id);
                if (!e || e.motionType === J.EMotionType_Static) continue;
                const n = Math.hypot(...local);
                const a = local.map(v => v / n);
                const mp = body.GetMotionProperties();
                setInertia(mp, inertiaOf(mp).map((row, r) => row.map((v, k) => v + delta * a[r] * a[k])));
            }
            entry.rotorInertia = I;
        },
        /** A hinge: {angle, velocity} (rad, rad/s); a slider: {position, velocity} (m, m/s), body2 relative to body1 along the axis, zero at t = 0. */
        jointState(jointId) {
            ensureAlive();
            const slider = sliderMap.get(jointId);
            if (slider) return { position: slider.position, velocity: slider.velocity };
            const entry = hingeMap.get(jointId);
            if (!entry) { const j = jointMap.get(jointId); if (!j) throw new Error(`unknown joint ${jointId}`); throw new Error(`joint ${jointId} is not a hinge or a slider`); }
            return { angle: entry.unwrapped, velocity: entry.velocity };
        },
        /**
         * Contacts per body pair since the start (only with {recordContacts: true}):
         * {pairs: {'a|b': manifold-steps}, manifolds}. Rolled back with the checkpoint.
         */
        contactPairs() {
            ensureAlive();
            if (!contactLog) throw new Error('contacts are recorded only with createPhysicsCore(…, {recordContacts: true})');
            return { pairs: Object.fromEntries(contactLog.pairs), manifolds: contactLog.manifolds };
        },
        /**
         * Registers per-step JavaScript state with the checkpoint (§6.4): a coupling or
         * device module that keeps state from one step to the next.
         */
        registerState(key, registrant) {
            ensureAlive();
            stateRegistry.register(key, registrant);
        },
        /** The registered state keys, in checkpoint order. */
        stateKeys() { return stateRegistry.keys(); },
        bodyPose(bodyId) {
            ensureAlive();
            const e = bodyMap.get(bodyId);
            if (!e) throw new Error(`unknown body ${bodyId}`);
            const pos = bodyInterface.GetPosition(e.bodyID);
            const rot = bodyInterface.GetRotation(e.bodyID);
            const res = { position: [pos.GetX(), pos.GetY(), pos.GetZ()], rotation: [rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()] };
            return res;
        },
        bodyLinearVelocity(bodyId) {
            ensureAlive();
            const e = bodyMap.get(bodyId);
            if (!e) throw new Error(`unknown body ${bodyId}`);
            const v = bodyInterface.GetLinearVelocity(e.bodyID);
            return [v.GetX(), v.GetY(), v.GetZ()];
        },
        bodyAngularVelocity(bodyId) {
            ensureAlive();
            const e = bodyMap.get(bodyId);
            if (!e) throw new Error(`unknown body ${bodyId}`);
            const v = bodyInterface.GetAngularVelocity(e.bodyID);
            return [v.GetX(), v.GetY(), v.GetZ()];
        },
        snapshot() {
            ensureAlive();
            const t = timeSteps * dtFixed;
            const bodies = new Float32Array(bodyOrder.length * 7);
            let biIdx = 0;
            for (const id of bodyOrder) {
                const e = bodyMap.get(id);
                const pos = bodyInterface.GetPosition(e.bodyID);
                const rot = bodyInterface.GetRotation(e.bodyID);
                bodies[biIdx++] = pos.GetX(); bodies[biIdx++] = pos.GetY(); bodies[biIdx++] = pos.GetZ();
                bodies[biIdx++] = rot.GetX(); bodies[biIdx++] = rot.GetY(); bodies[biIdx++] = rot.GetZ(); bodies[biIdx++] = rot.GetW();
            }
            const joints = new Float32Array(jointOrder.length * 2);
            let jiIdx = 0;
            for (const id of jointOrder) {
                const h = hingeMap.get(id);
                const sl = h ? null : sliderMap.get(id);
                if (h) { joints[jiIdx++] = h.unwrapped; joints[jiIdx++] = h.velocity; }
                else if (sl) { joints[jiIdx++] = sl.position; joints[jiIdx++] = sl.velocity; }
                else { joints[jiIdx++] = 0; joints[jiIdx++] = 0; }
            }
            return { t, bodyIds: [...bodyOrder], jointIds: [...jointOrder], bodies, joints };
        },
        castRay(origin, direction, maxDistance, { ignoreBodies = [] } = {}) {
            ensureAlive();
            if (!Array.isArray(origin) || origin.length !== 3) throw new Error('origin must be Vec3');
            if (!Array.isArray(direction) || direction.length !== 3) throw new Error('direction must be Vec3');
            if (typeof maxDistance !== 'number' || !Number.isFinite(maxDistance) || maxDistance <= 0) throw new Error('maxDistance must be positive');
            const len = Math.hypot(...direction);
            if (len < 1e-9) throw new Error('direction must be non-zero');
            const dir = direction.map(v => v / len);
            const ray = new J.RRayCast();
            const originVec = new J.RVec3(...origin);
            const dirVec = new J.Vec3(...dir.map(v => v * maxDistance));
            ray.mOrigin = originVec;
            ray.mDirection = dirVec;
            const raySettings = new J.RayCastSettings();
            const collector = new J.CastRayClosestHitCollisionCollector();
            // Ray queries must hit both static and dynamic bodies. Jolt's layer
            // filters are configured for collisions (dynamic-static only), so a
            // naive DefaultBroadPhaseLayerFilter/DefaultObjectLayerFilter with
            // either layer as the query's pretend object layer hits only one
            // side. Use permissive filters that pass all layers.
            const permissiveOVB = new J.ObjectVsBroadPhaseLayerFilterJS();
            permissiveOVB.ShouldCollide = () => true;
            const bpFilter = new J.DefaultBroadPhaseLayerFilter(permissiveOVB, 0);
            const objectFilter = new J.ObjectLayerFilterJS();
            objectFilter.ShouldCollide = () => true;
            let bodyFilter = new J.BodyFilter();
            if (ignoreBodies.length) {
                const ignoreFilter = new J.IgnoreMultipleBodiesFilter();
                for (const id of ignoreBodies) {
                    const e = bodyMap.get(id);
                    if (e) ignoreFilter.IgnoreBody(e.bodyID);
                }
                bodyFilter = ignoreFilter;
            }
            const shapeFilter = new J.ShapeFilter();
            const query = physicsSystem.GetNarrowPhaseQuery();
            query.CastRay(ray, raySettings, collector, bpFilter, objectFilter, bodyFilter, shapeFilter);
            const hadHit = collector.HadHit();
            let result = null;
            if (hadHit) {
                const hit = collector.mHit;
                const fraction = hit.mFraction;
                const distance = fraction * maxDistance;
                const bodyID = hit.mBodyID;
                // Find bodyId string from bodyMap
                let hitBodyId = null;
                for (const [id, entry] of bodyMap) {
                    if (entry.bodyID.GetIndex() === bodyID.GetIndex()) { hitBodyId = id; break; }
                }
                // If not found, try to get from allBodyIDs
                if (!hitBodyId) {
                    for (const bid of allBodyIDs) {
                        if (bid.GetIndex() === bodyID.GetIndex()) {
                            for (const [id, entry] of bodyMap) if (entry.bodyID === bid) { hitBodyId = id; break; }
                            break;
                        }
                    }
                }
                const point = [origin[0] + dir[0] * distance, origin[1] + dir[1] * distance, origin[2] + dir[2] * distance];
                // Get normal at hit point — GetSurfaceNormal wants the hit
                // point in the shape's local frame, not world.
                let normal = [0, 1, 0];
                try {
                    const bodyLock = physicsSystem.GetBodyLockInterfaceNoLock();
                    const body = bodyLock.TryGetBody(bodyID);
                    if (body) {
                        const shape = body.GetShape();
                        const subShapeID = hit.mSubShapeID2;
                        // Inverse body rotation: conjugate of body quat, then
                        // local = invRot * (world - bodyPos).
                        const bPos = body.GetPosition();
                        const bRot = body.GetRotation();
                        const bx = bRot.GetX(), by = bRot.GetY(), bz = bRot.GetZ(), bw = bRot.GetW();
                        const dx = point[0] - bPos.GetX();
                        const dy = point[1] - bPos.GetY();
                        const dz = point[2] - bPos.GetZ();
                        // invQ = (-x,-y,-z,w)
                        const qx = -bx, qy = -by, qz = -bz, qw = bw;
                        const ix = qy * dz - qz * dy;
                        const iy = qz * dx - qx * dz;
                        const iz = qx * dy - qy * dx;
                        const ix2 = qy * iz - qz * iy;
                        const iy2 = qz * ix - qx * iz;
                        const iz2 = qx * iy - qy * ix;
                        const lx = dx + 2 * (qw * ix + ix2);
                        const ly = dy + 2 * (qw * iy + iy2);
                        const lz = dz + 2 * (qw * iz + iz2);
                        const localHit = new J.Vec3(lx, ly, lz);
                        const nLocal = shape.GetSurfaceNormal(subShapeID, localHit);
                        let nx = nLocal.GetX(), ny = nLocal.GetY(), nz = nLocal.GetZ();
                        J.destroy(localHit); J.destroy(nLocal);
                        // Local normal → world: rotate by body quat (no translation).
                        const cx = by * nz - bz * ny;
                        const cy = bz * nx - bx * nz;
                        const cz = bx * ny - by * nx;
                        const jx = by * cz - bz * cy + bw * cx;
                        const jy = bz * cx - bx * cz + bw * cy;
                        const jz = bx * cy - by * cx + bw * cz;
                        nx = nx + 2 * jx; ny = ny + 2 * jy; nz = nz + 2 * jz;
                        const nLen = Math.hypot(nx, ny, nz);
                        if (nLen > 1e-9) normal = [nx / nLen, ny / nLen, nz / nLen];
                        else normal = [nx, ny, nz];
                    }
                } catch (_) {}
                result = { distance, bodyId: hitBodyId, point, normal };
            }
            J.destroy(ray);
            J.destroy(raySettings);
            J.destroy(collector);
            J.destroy(bpFilter);
            J.destroy(permissiveOVB);
            J.destroy(objectFilter);
            J.destroy(bodyFilter);
            J.destroy(shapeFilter);
            return result;
        },
        /**
         * Remember the whole simulation state (Jolt's bodies, contacts and constraints, and
         * this core's own clock, unwrapped hinge angles and motor commands). rollback()
         * returns to it, and stepping again with the same commands gives bit-identical
         * results (test/bw-sim-physics-worker-session.test.mjs). The physics worker
         * checkpoints before every batch so a batch computed from motor commands that
         * changed while it was in flight can be redone (sim-worker-protocol.js, beside physics/).
         */
        checkpoint() {
            ensureAlive();
            if (!recorder) recorder = new J.StateRecorderImpl();
            recorder.Clear();
            physicsSystem.SaveState(recorder, J.EStateRecorderState_All);
            saved = stateRegistry.save();
        },
        rollback() {
            ensureAlive();
            if (!saved) throw new Error('rollback without a checkpoint');
            recorder.Rewind();
            if (!physicsSystem.RestoreState(recorder)) throw new Error('Jolt could not restore the checkpoint');
            stateRegistry.restore(saved);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (recorder) { J.destroy(recorder); recorder = null; }
            for (const c of allConstraints) physicsSystem.RemoveConstraint(c);
            for (const bid of allBodyIDs) { bodyInterface.RemoveBody(bid); bodyInterface.DestroyBody(bid); }
            J.destroy(joltInterface);
            if (contactListener) { J.destroy(contactListener); contactListener = null; }
            bodyMap.clear(); hingeMap.clear(); sliderMap.clear(); ballMap.clear(); jointMap.clear();
        },
    };
    return core;
};
