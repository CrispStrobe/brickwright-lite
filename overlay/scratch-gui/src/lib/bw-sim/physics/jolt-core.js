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
// Gears: contract ratio ω(joint2)=ratio·ω(joint1) as a tooth contact at the pitch
// point between the two gear bodies (GearMeshConstraint, the Brickwright fork of Jolt).
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

import { validateCompiledMechanism, upgradeMechanismV1, colliderVolume } from '../contracts.js';
import { BUILTIN_KINDS } from '../kinds/index.js';
import { createStateRegistry } from './state-registry.js';
import { createScrewDrives } from './screw.js';
import { createRopes } from './rope.js';
import { createAir } from './air.js';
import { buildUniversalJoint } from './universal-joint.js';
import { createRollingResistance } from './rolling.js';
import { installMaterialPairs, MATERIAL_INDEX } from './materials.js';

let joltPromise = null;

/** Contact tolerances at LEGO scale, metres (see the PhysicsSettings block below). */
export const LEGO_SPECULATIVE_CONTACT_M = 0.002;
/**
 * Bodies with more colliders than this move without a continuous sweep (EMotionQuality_Discrete). Jolt
 * sweeps a body that moves more than mLinearCastThreshold of its inner radius in a step, and a compound's
 * inner radius is its thinnest sub-shape (a plate: 1.6 mm), so a 500-part frame was swept against
 * everything near it nearly every step: 350–600 ms a step on real Technic sets (2026-10-20, 42099/42052,
 * docs/ROBOT-LAB-REAL-MODELS.md), 10–30 ms without. A body of many parts is thick as a whole and does not
 * tunnel at the speeds a model reaches; the brick that fell through a beam is one part.
 */
export const CCD_MAX_COLLIDERS = 8;
export const LEGO_PENETRATION_SLOP_M = 0.0002;
/**
 * Impacts slower than this (m/s, along the contact normal) do not bounce, whatever the bodies'
 * restitution (Jolt's mMinVelocityForRestitution; this is its default, set here on purpose). A part
 * dropped from 5 cm or more bounces with its material's e (contracts.js MATERIALS); a robot driving
 * into a wall (SPIKE wheels at full speed: 0.5 m/s) or a part settling does not: at those speeds a
 * LEGO build's own give (pins, clutch) takes the energy, and every driving calibration stays as it was.
 */
export const LEGO_MIN_BOUNCE_SPEED_M_S = 1;

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
 * Solver velocity iterations for an island holding a gear mesh (GearMeshConstraint). A mesh couples
 * the gears' frames too, and in a linear actuator's closed loop (the Excavator's boom: motor → 16T
 * pair → bevel pair in the actuator's body → spindle) the loop sagged under the mesh's impulses
 * with fewer: the boom left its law-of-cosines angle by 1.73° with 30, 0.73° with 120 (measured,
 * test/bw-sim-excavator.test.mjs; the planet-carrier contact this replaces needed 240). Islands
 * without a mesh keep their own counts.
 */
const MESH_VELOCITY_STEPS = 120;

/**
 * Solver position iterations for an island holding a gear (Jolt's default is 2). With
 * gears at their true inertia (fixSmallInertia) a stalled DC motor pushing an arm on a
 * driven 24T into a static block (first touch at 13.3°) held it at 19.5° with the default
 * — 6° (2 mm at the tip) inside the block — and at 13.7–13.9° with 5 to 20 (measured).
 */
const GEAR_POSITION_STEPS = 10;
/** How near its limit a joint counts as at its end (m for a slider, rad for a hinge), and the brake (N·m) on a pinion driven into it. */
const RACK_STOP_M = 0.0005;
const HINGE_STOP_RAD = 0.01;
const RACK_STOP_NM = 5;

/** A slider spring (kinds/shock.js) pushes with at most this (N): far beyond a LEGO spring, never the limit. */
const SPRING_MAX_FORCE_N = 50;
/** A chain whose sprockets' ratio is this close to 1 is driven 1:1 by the GearConstraint (kinds/chain.js). */
const CHAIN_EQUAL = 1e-3;
/** A rubber band's drive: few velocity steps, so it slips under a load a chain would carry. */
const BELT_VELOCITY_STEPS = 4;


/**
 * Solver iterations for an island holding a motorised hinge (Jolt's defaults 10 / 2). The DC motor
 * (applyHingeTorque) drives the hinge's output body, which carries the motor's rotor reflected through
 * its gearbox (setRotorInertia: ~3e-4 kg·m² about the axis) on a few grams of parts. A contact on that
 * body (an arm driven into a block) is solved as if it pushed an 8 g body: its impulse mostly
 * TRANSLATES the body, the hinge takes the translation back, and the turn the contact must stop is
 * reduced per iteration only by ε = m·r² / (I_axis + m·r²) (motorEpsilon). With Jolt's defaults a
 * medium motor drove a beam-5 arm (ε = 0.011) through a static block (test/bw-sim-validation.test.mjs,
 * stall: first touch +92.35° / −33.52°, the arm went to +276.6° / −401°). Measured on that bench,
 * stop minus first touch (+ / −): velocity steps hardly matter (30–500) and are not monotonic; the
 * POSITION steps are what pushes the arm back out of the block:
 *   position  5: +6.4° / −0.8° (after part masses moved the arm's centre of mass)   10: +6.5°
 *            20: +2.8° / −0.7°   30: +2.0° / −0.7°   40: +1.5° / −0.7°   60: +1.2° / −0.6°
 * Position steps re-solve every contact of the island, so they are what costs (the driving base:
 * 77 µs per step with 30/5, 155 µs with 20, 207 µs with 30). Each motorised hinge therefore gets
 * MOTOR_POSITION_PER_EPS / ε of them, within [MOTOR_POSITION_STEPS, MOTOR_POSITION_STEPS_MAX]: the arm
 * (ε 0.011) 30, a SPIKE wheel (ε 0.048) 7, a chassis side (ε ≈ 0.8) the minimum.
 */
const MOTOR_VELOCITY_STEPS = 30;
const MOTOR_POSITION_STEPS = 5;
const MOTOR_POSITION_STEPS_MAX = 40;
const MOTOR_POSITION_PER_EPS = 0.33;

/**
 * Solver velocity iterations for an island holding a worm (R4). A worm's 1:24 puts the wheel's
 * load on the worm 24 times smaller and the worm's inertia on the wheel 576 times larger, and the
 * gear constraint slips where the solve has not converged: a 102 g arm 5 cm out (0.05 N·m) on a
 * 24T driven by a worm turned 1.49 % faster than ω/24 over 1.6 s with 30 iterations, 0.28 % with
 * 120 (measured; the plain 'gear' kind does the same at this ratio and load). Islands without a
 * worm keep GEAR_VELOCITY_STEPS, so every gear train runs as before. (Since the tooth-contact mesh
 * every mesh has MESH_VELOCITY_STEPS, the same number.)
 */
const WORM_VELOCITY_STEPS = 120;

/**
 * Solver velocity iterations for an island holding a LIGHT BODY BETWEEN JOINTS: a dynamic body with two or more
 * joints whose mass is under LIGHT_BODY_RATIO of the lightest dynamic body it is jointed to (round 1's bug 2). An
 * impact on such a body (a cart's 4.8 g bumper beam hinged to two 25 g wheel sets) is passed on to its partners
 * only through the joints, and Jolt's iterations converge slowly along that light link: the colliding carts of
 * test/bw-sim-validation-2.test.mjs bounced apart with e 0.097 at Jolt's default 10, 0.011 with 60, 0.000 with
 * 100 or more (measured), though nothing in them is elastic. Islands without such a body keep their counts.
 */
const LIGHT_BODY_VELOCITY_STEPS = 120;
const LIGHT_BODY_RATIO = 0.25;

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
export const createPhysicsCore = (J, compiled, { stepHz = 120, recordContacts = false, kinds = BUILTIN_KINDS, experiments = {} } = {}) => {
    const problems = validateCompiledMechanism(compiled, { kinds });
    if (problems.length) throw new Error(problems.join('\n'));
    const mechanism = upgradeMechanismV1(compiled);
    /** joint id -> its actuator (CompiledMechanism v2): the motorised hinges */
    const actuatorOf = new Map(mechanism.actuators.map(a => [a.joint, a]));
    const dtFixed = 1 / stepHz;
    // A lightest weight for the solver (an experiment only: bodies weigh what their parts weigh; see lightLinks below).
    const massFloorKg = experiments.massFloorKg ?? 0;
    // Joints holding a light body against a far heavier one solve with more iterations (mechanism.solver.lightLinks,
    // mech/compile.js: models from elsewhere): {massKg, ratio, velocity, position}.
    const lightLinks = experiments.lightLinks ?? mechanism.solver?.lightLinks ?? null;
    const LAYER_DYNAMIC = 0;
    const LAYER_STATIC = 1;
    // A static body made of model parts is the machine's own fixed frame (a
    // gearbox clamped to the bench). Since D2 (R3) it collides with the machine's
    // moving parts like any other body, except those jointed to it (an axle turns
    // inside the frame's hole: noCollide). It stays a layer of its own so the
    // ground and obstacles (LAYER_STATIC, no parts) remain distinguishable.
    const LAYER_FRAME = 2;
    // The core's own helper bodies that touch nothing (a universal joint's cross: physics/universal-joint.js).
    const LAYER_GHOST = 3;
    const NUM_OBJECT_LAYERS = 4;

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
    // A pair in `noCollideParts` (mech/collision-filter.js) is filtered PART BY PART instead: it stays
    // enabled here and the SimShapeFilter below drops only its listed part pairs' sub-shape contacts.
    const bodyIndex = new Map(mechanism.bodies.map((b, i) => [b.id, i]));
    // experiments.wholePairs: every noCollide pair filtered whole (no part-level exceptions).
    const localPairs = new Map(experiments.wholePairs ? [] : (mechanism.noCollideParts || []).map(([a, b, parts, mode]) => [`${a}|${b}`, {parts, collide: mode === 'collide'}]));
    let groupFilter = null;
    if (mechanism.noCollide.length > 0) {
        groupFilter = new J.GroupFilterTable(mechanism.bodies.length);
        for (const [a, b] of mechanism.noCollide) if (!localPairs.has(`${a}|${b}`)) groupFilter.DisableCollision(bodyIndex.get(a), bodyIndex.get(b));
    }

    const bpInterface = new J.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, 2);
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_DYNAMIC, new J.BroadPhaseLayer(0));
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(1));
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_FRAME, new J.BroadPhaseLayer(1));
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_GHOST, new J.BroadPhaseLayer(0));

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
        // Speed experiments (A/B, docs/ROBOT-LAB-REAL-MODELS.md): off unless asked for.
        ps.mAllowSleeping = Boolean(experiments.sleeping);
        if (typeof ps.mUseBodyPairContactCache !== 'undefined') ps.mUseBodyPairContactCache = Boolean(experiments.contactCache);
        if (experiments.velocitySteps) ps.mNumVelocitySteps = experiments.velocitySteps;
        if (experiments.positionSteps) ps.mNumPositionSteps = experiments.positionSteps;
        // Jolt's defaults are tuned for metre-scale game worlds (2 cm speculative contacts,
        // 2 cm penetration slop). LEGO parts are millimetres: a motor hub turning 16 mm above
        // the floor sat inside the default speculative distance and dragged the driving base
        // 15 % slower than its wheels. Scale the tolerances to the parts.
        ps.mSpeculativeContactDistance = LEGO_SPECULATIVE_CONTACT_M;
        ps.mPenetrationSlop = LEGO_PENETRATION_SLOP_M;
        ps.mLinearCastThreshold = experiments.linearCastThreshold || 0.25;
        ps.mMinVelocityForRestitution = LEGO_MIN_BOUNCE_SPEED_M_S;
        physicsSystem.SetPhysicsSettings(ps);
        J.destroy(ps);
    }

    // Restitution per material pair (physics/materials.js), where the Jolt build has the fork's table.
    const materialPairs = installMaterialPairs(J, physicsSystem);

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
    /**
     * How well a contact on a body can turn it about a hinge axis, in one solver iteration: the body's
     * m·r² (r its colliders' outermost reach from the axis) against its moment about the axis.
     */
    const motorEpsilon = (bodyId, j) => {
        const bd = mechanism.bodies.find(x => x.id === bodyId);
        const e = bodyMap.get(bodyId);
        const mp = e.body.GetMotionProperties();
        const m = 1 / mp.GetInverseMass();
        const n = Math.hypot(...j.axis);
        const a = j.axis.map(v => v / n);
        let r = 0;
        for (const c of bd.colliders) {
            const p = (c.position || [0, 0, 0]).map((v, i) => v + bd.position[i] - j.point[i]);
            const along = p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
            const radial = Math.hypot(p[0] - along * a[0], p[1] - along * a[1], p[2] - along * a[2]);
            const reach = c.shape === 'box' ? Math.hypot(...c.halfExtents) : c.shape === 'cylinder' ? Math.hypot(c.radius, c.halfHeight) : c.radius;
            r = Math.max(r, radial + reach);
        }
        const T = inertiaOf(mp);
        // The body's own moment about the axis through its centre of mass is in T; the hinge adds m·d².
        const Ia = a.reduce((acc, x, row) => acc + x * a.reduce((s2, y, k) => s2 + T[row][k] * y, 0), 0);
        return {m, r, Ia, eps: m * r * r / (Ia + m * r * r)};
    };
    /** A motorised hinge's position steps from the worse-conditioned of its two bodies (MOTOR_POSITION_PER_EPS). */
    const setMotorSteps = (entry, j) => {
        let eps = 1;
        for (const id of [j.body1, j.body2]) {
            const e = bodyMap.get(id);
            if (e && e.motionType !== J.EMotionType_Static) eps = Math.min(eps, motorEpsilon(id, j).eps);
        }
        const steps = clamp(Math.ceil(MOTOR_POSITION_PER_EPS / eps), MOTOR_POSITION_STEPS, MOTOR_POSITION_STEPS_MAX);
        entry.constraint.SetNumPositionStepsOverride(steps);
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

    // Light bodies between joints (LIGHT_BODY_VELOCITY_STEPS).
    const lightBetweenJoints = new Set();
    {
        const massOf = new Map(mechanism.bodies.filter(b => b.motion === 'dynamic').map(b => [b.id, b.massKg]));
        for (const [id, m] of massOf) {
            const partners = mechanism.joints.filter(j => j.body1 === id || j.body2 === id).map(j => (j.body1 === id ? j.body2 : j.body1));
            const heavier = partners.map(p => massOf.get(p)).filter(x => x !== undefined);
            if (partners.length >= 2 && heavier.length && m < LIGHT_BODY_RATIO * Math.min(...heavier)) lightBetweenJoints.add(id);
        }
    }
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
            // Per-part masses (mech/islands.js: each collider carries its share of its part's mass):
            // each sub-shape gets the density massKg / volume, so Jolt's compound mass properties put
            // the centre of mass and the inertia (parallel axis per sub-shape) where the parts' masses
            // are. Without them (a hand-built mechanism) every collider has one density, as before.
            const byMass = b.colliders.every(c => typeof c.massKg === 'number' && c.massKg > 0);
            for (const [index, col] of b.colliders.entries()) {
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
                if (byMass) shapeSettings.mDensity = col.massKg / colliderVolume(col);
                // The leaf carries its collider index too: the native part filter (PartPairSimShapeFilter) reads it there.
                shapeSettings.mUserData = index;
                compoundSettings.AddShape(pos, rot, shapeSettings, index);
            }
            const shapeResult = compoundSettings.Create();
            if (shapeResult.HasError()) {
                const err = shapeResult.GetError();
                shapeResult.Clear();
                J.destroy(compoundSettings);
                throw new Error(`shape creation failed for body ${b.id}: ${err}`);
            }
            shape = shapeResult.Get();
            // The compound shape is reference-counted and, until the body below takes
            // its own reference, owned only by the settings cache and this result:
            // releasing them first would free the shape under the body. The result is the
            // binding's static temporary (Create() returns by value): it is cleared, never
            // destroyed — destroy freed memory that was never allocated (the debug build aborts;
            // the release build went on with a damaged heap).
            releaseAfterBody = [() => shapeResult.Clear(), compoundSettings];
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
            // Continuous collision (LinearCast) for every moving body of up to CCD_MAX_COLLIDERS: with Discrete, a brick dropped
            // 50 cm (3.1 m/s, 16 mm per 5 ms step) passed through an 8 mm beam (measured). Jolt casts
            // only a body that moves more than mLinearCastThreshold (0.25, below) of its inner radius
            // in one step, so a slow body costs one comparison; measured cost in
            // docs/ROBOT-LAB-ARCHITECTURE.md ("Motion quality").
            const sweep = !experiments.discrete && b.colliders.length <= (experiments.ccdMaxColliders ?? CCD_MAX_COLLIDERS);
            bcs.mMotionQuality = sweep ? J.EMotionQuality_LinearCast : J.EMotionQuality_Discrete;
            if (experiments.maxLinearVelocity) bcs.mMaxLinearVelocity = experiments.maxLinearVelocity;
            bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
            const mp = bcs.mMassPropertiesOverride;
            mp.mMass = Math.max(b.massKg, massFloorKg);
            bcs.mMassPropertiesOverride = mp;
        }
        if (typeof b.friction === 'number') bcs.mFriction = b.friction;
        if (typeof b.restitution === 'number') bcs.mRestitution = b.restitution;
        if (materialPairs && b.material && MATERIAL_INDEX.has(b.material)) bcs.mUserData = MATERIAL_INDEX.get(b.material);
        if (lightBetweenJoints.has(b.id)) bcs.mNumVelocityStepsOverride = LIGHT_BODY_VELOCITY_STEPS;
        if (typeof b.linearDamping === 'number') bcs.mLinearDamping = b.linearDamping;
        if (typeof b.angularDamping === 'number') bcs.mAngularDamping = b.angularDamping;

        const body = bodyInterface.CreateBody(bcs);
        const bodyID = body.GetID();
        if (b.motion === 'dynamic') fixSmallInertia(body, Math.max(b.massKg, massFloorKg));
        bodyInterface.AddBody(bodyID, J.EActivation_Activate);
        bodyMap.set(b.id, { body, bodyID, motionType, layer, shape });
        allBodyIDs.push(bodyID);
        J.destroy(bcs);
        for (const o of releaseAfterBody) {
            if (typeof o === 'function') o(); else J.destroy(o);
        }
    }

    // Self-collision is local (D2, mech/collision-filter.js localNoCollide): for a body pair in
    // noCollideParts, Jolt asks this filter about every pair of their sub-shapes whose bounds meet, and
    // it refuses only the listed part pairs (an arm and its motor's housing touch; the arm and a post
    // on that housing collide). It is JavaScript per sub-shape pair of EVERY body pair in the narrow
    // phase, so it is installed only when the mechanism has such a pair (measured: 0.19 µs a call, ~2,000
    // calls a step on the 2,054-part stress model, +28 % — which has none).
    let simShapeFilter = null;
    // The Jolt fork's PartPairSimShapeFilter (jolt-physics 1.1.0-bw.5) does the same in C++: no call into JavaScript
    // per sub-shape pair, and it runs on Jolt's worker threads (the multithreaded build cannot call a JS filter).
    if (localPairs.size && !experiments.noShapeFilter && typeof J.PartPairSimShapeFilter === 'function' && !experiments.jsShapeFilter) {
        const partNumbers = new Map();
        const partNumber = part => {
            if (!partNumbers.has(part)) partNumbers.set(part, partNumbers.size);
            return partNumbers.get(part);
        };
        simShapeFilter = new J.PartPairSimShapeFilter();
        const filtered = new Set();
        for (const [key, {parts, collide}] of localPairs) {
            const [a, b] = key.split('|');
            const ia = bodyMap.get(a).bodyID;
            const ib = bodyMap.get(b).bodyID;
            simShapeFilter.AddBodyPair(ia, ib, collide);
            for (const [x, y] of parts) simShapeFilter.AddPartPair(ia, ib, partNumber(x), partNumber(y));
            filtered.add(a);
            filtered.add(b);
        }
        for (const b of mechanism.bodies) {
            if (!filtered.has(b.id)) continue;
            const id = bodyMap.get(b.id).bodyID;
            b.colliders.forEach((c, i) => simShapeFilter.SetColliderPart(id, i, partNumber(c.part)));
        }
        physicsSystem.SetSimShapeFilter(simShapeFilter);
    } else if (localPairs.size && !experiments.noShapeFilter) {
        const byPtr = new Map();
        for (const b of mechanism.bodies) {
            const e = bodyMap.get(b.id);
            const shape = e.body.GetShape();
            const info = { parts: b.colliders.map(c => c.part), shapePtr: J.getPointer(shape), compound: false, mask: 0, collider: null, local: null };
            // One offset collider becomes a RotatedTranslatedShape, not a compound (Jolt's StaticCompoundShapeSettings).
            if (shape.GetSubType() === J.EShapeSubType_StaticCompound) {
                const compound = J.castObject(shape, J.CompoundShape);
                const n = compound.GetNumSubShapes();
                info.compound = true;
                info.mask = n > 1 ? (2 ** (32 - Math.clz32(n - 1))) - 1 : 0;
                info.collider = Int32Array.from({ length: n }, (_, i) => compound.GetSubShape(i).mUserData);
            }
            byPtr.set(J.getPointer(e.body), info);
            e.filterInfo = info;
        }
        // Each entry lists the part pairs kept apart, or ('collide') the only ones that may meet.
        for (const [key, {parts, collide}] of localPairs) {
            const [a, b] = key.split('|');
            const ia = bodyMap.get(a).filterInfo;
            const ib = bodyMap.get(b).filterInfo;
            const pa = J.getPointer(bodyMap.get(a).body);
            const pb = J.getPointer(bodyMap.get(b).body);
            (ia.local || (ia.local = new Map())).set(pb, {set: new Set(parts.map(([x, y]) => `${x}\n${y}`)), collide});
            (ib.local || (ib.local = new Map())).set(pa, {set: new Set(parts.map(([x, y]) => `${y}\n${x}`)), collide});
        }
        /** The collider index of a sub-shape pointer pair, or −1 for the whole compound (Jolt asks before descending). */
        const colliderOf = (info, shapePtr, subIdPtr) => {
            if (!info.compound) return 0;
            if (shapePtr === info.shapePtr) return -1;
            return info.collider[(J.HEAPU32[subIdPtr >> 2] & info.mask) >>> 0];
        };
        simShapeFilter = new J.SimShapeFilterJS();
        simShapeFilter.ShouldCollide = (body1, shape1, sub1, body2, shape2, sub2) => {
            const i1 = byPtr.get(body1);
            const pair = i1 && i1.local && i1.local.get(body2);
            if (!pair) return true;
            const c1 = colliderOf(i1, shape1, sub1);
            const i2 = byPtr.get(body2);
            const c2 = colliderOf(i2, shape2, sub2);
            if (c1 < 0 || c2 < 0) return true;
            return pair.set.has(`${i1.parts[c1]}\n${i2.parts[c2]}`) === pair.collide;
        };
        physicsSystem.SetSimShapeFilter(simShapeFilter);
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
    // A real set's linkages hang 1–3 g liftarms between frames of hundreds of grams; Jolt's iterative solver loses such
    // chains at its default iterations (parts flung). Measured on five unstable sets, 2026-10-20: these iterations held
    // more of them than weighing light bodies heavier did (docs/ROBOT-LAB-REAL-MODELS.md).
    const massOfBody = id => (id === 'world' ? Infinity : mechanism.bodies.find(b => b.id === id)?.massKg ?? Infinity);
    const lightLink = j => {
        const ll = lightLinks;
        if (!ll) return false;
        const [m1, m2] = [massOfBody(j.body1), massOfBody(j.body2)];
        const light = Math.min(m1, m2);
        return light < ll.massKg && Math.max(m1, m2) / light > ll.ratio;
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
                // A motorised hinge's island solves with more iterations than Jolt's default (MOTOR_VELOCITY_STEPS;
                // setMotorSteps raises the position steps once the rotor's inertia is on the body).
                hs.mNumVelocityStepsOverride = MOTOR_VELOCITY_STEPS;
                hs.mNumPositionStepsOverride = MOTOR_POSITION_STEPS;
            } else if (lightLink(j)) {
                hs.mNumVelocityStepsOverride = lightLinks.velocity;
                hs.mNumPositionStepsOverride = lightLinks.position;
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
            // A spring (kinds/shock.js): a position motor whose spring is the spring's stiffness and damping.
            const spring = j.spring && j.spring.stiffness > 0 ? j.spring : null;
            const maxForce = spring ? SPRING_MAX_FORCE_N : typeof j.maxForceN === 'number' ? j.maxForceN : 0;
            ss.mMotorSettings.mMinForceLimit = -maxForce;
            ss.mMotorSettings.mMaxForceLimit = maxForce;
            if (spring) {
                const sp = ss.mMotorSettings.mSpringSettings;
                sp.mMode = J.ESpringMode_StiffnessAndDamping;
                sp.mStiffness = spring.stiffness;
                sp.mDamping = spring.damping;
            }
            if (lightLink(j)) {
                ss.mNumVelocityStepsOverride = lightLinks.velocity;
                ss.mNumPositionStepsOverride = lightLinks.position;
            }
            const constraint = ss.Create(bodyA, bodyB);
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            const slider = J.castObject(constraint, J.SliderConstraint);
            slider.SetMotorState(spring ? J.EMotorState_Position : J.EMotorState_Off);
            if (spring) slider.SetTargetPosition(spring.restM);
            sliderMap.set(j.id, {
                slider, constraint, bodyA, bodyB,
                bodyAID: getBodyIDForId(j.body1),
                bodyBID: getBodyIDForId(j.body2),
                axis: [...j.axis], point: [...j.point],
                localAxis1: toLocal(j.body1, j.axis), localAxis2: toLocal(j.body2, j.axis),
                position: 0, velocity: 0,
                maxForce, maxSpeed: typeof j.maxSpeedMPerSec === 'number' ? j.maxSpeedMPerSec : Infinity,
                mode: spring ? 'spring' : 'coast', target: 0, targetSpeed: null, kp: 10,
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

    // Gears are tooth contacts between the two GEAR bodies: Jolt's GearMeshConstraint, which the
    // Brickwright fork of Jolt adds (jolt-physics 1.1.0-bw.2; the fork's BRICKWRIGHT.md,
    // https://github.com/CrispStrobe/JoltPhysics.js/blob/brickwright/gear-mesh/BRICKWRIGHT.md).
    // The mesh is what it physically is: n·(V2(P) − V1(P)) = 0 at the pitch point P along the
    // line of action n, with V_i(P) the velocity of gear i's material point there. The impulse is an
    // equal and opposite force pair at P, so torque crosses the mesh multiplied by the ratio (upstream
    // Jolt's GearConstraint passed it 1:1), the reaction reaches the frame holding the axles (each
    // gear's hinge names it: SetConstraints), and a machine on a free frame conserves angular
    // momentum. Because each gear's rate is taken RELATIVE TO ITS FRAME, a mesh on a frame that
    // turns (the Excavator's slew pinion on its turntable, a planet on its carrier) is exact too:
    // no special path for moving frames, no per-step re-anchoring.
    //
    // The hinges also give the mesh its PHASE (the accumulated hinge angles), from which the fork's
    // position steps would pull back any slip since SetConstraints. That is re-based before every
    // step (rebaseMeshes): the position steps then remove the drift of the step itself, not the slip
    // of the past. Accumulated phase correction fought the rest of the solve (measured): a stalled
    // motor's arm on a driven 24T was pushed 7.7° into a static block (the contact on a light arm
    // gives way before the mesh's correction does: test/bw-sim-gear-trains.test.mjs P5 §6 allows 6°),
    // and the Excavator's bucket actuator chain (motor → 16T pair → bevel pair → spindle) rang and
    // blew up (NaN) within a second of curling. With the re-base the velocity constraint is exact and
    // the per-step drift is removed; slip the solver cannot prevent (that arm's impact: 10.5° of the
    // 24T) stays slipped, as it did with the gear constraint.
    //
    // The two hinges of a mesh share the frame body that holds both axles (mech/gears.js only
    // couples such pairs); the gear body of each hinge is its other body. A gear on the hinge's
    // body2 turns by +ω about the hinge axis, one on body1 by −ω, so with the signed axes
    // a = s·axis each gear's rate about its axis IS its joint's rate, and the contract ratio
    // ω(joint2) = ratio·ω(joint1) is the mesh's mRatio as it is (any sign, any magnitude).
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
     * Re-measured with the tooth-contact mesh (2026-10-19, test/bw-sim-gear-trains.test.mjs P5 §6,
     * first touch 13.3°): 3e-5 stops the arm at 13.9° with the motor stalled; 1e-5 and 3e-6 let it
     * bounce back off the block (8.4°, 2.5°) with the motor still turning (17, 30 °/s). Kept.
     */
    const GEAR_MIN_INERTIA = 3e-5;
    /**
     * Gear bodies get a mass of at least GEAR_MIN_MASS_KG (their weight kept: the gravity factor is
     * scaled down by the same ratio; their inertia is kept, GEAR_MIN_INERTIA floors that), as
     * physics/screw.js floors an actuator's light parts (SCREW_MIN_MASS_KG, the same 20 g). A light
     * gear body between its hinge and a contact or a mesh is pushed SIDEWAYS by the contact, the
     * hinge takes that back, and only a small part of each iteration turns it: the Excavator's slew
     * pinion (8T on the 28T turntable) slipped 17° of the turntable in one dig cycle under the
     * swinging arm without the floor (−72.5° … +107.4° for ±90°), 9° with it (−81.1° … +98.7°); a
     * stalled DC motor's arm on a driven 24T kept rocking against its block (the motor at 17 °/s, not
     * reported stalled) without it, and stalls with it (measured). A numerical floor like GEAR_MIN_INERTIA: a light
     * gear accelerates along a line more slowly on its own, which nothing on a hinge notices.
     */
    const GEAR_MIN_MASS_KG = 0.02;
    const floorMass = id => {
        const e = bodyMap.get(id);
        if (!e || e.motionType === J.EMotionType_Static) return;
        const mp = e.body.GetMotionProperties();
        const inv = mp.GetInverseMass();
        if (!(inv > 0) || 1 / inv >= GEAR_MIN_MASS_KG) return;
        const inertia = inertiaOf(mp);
        const k = GEAR_MIN_MASS_KG * inv;
        mp.ScaleToMass(GEAR_MIN_MASS_KG);
        mp.SetGravityFactor(mp.GetGravityFactor() / k);
        setInertia(mp, inertia);
    };
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
    const unit = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    /** Closest points of the lines p + s·a and q + t·b: [on the first, on the second] (null when parallel). */
    const closestPoints = (p, a, q, b) => {
        const d = q.map((v, i) => v - p[i]);
        const ab = dot3(a, b);
        const den = 1 - ab * ab;
        if (den < 1e-9) return null;
        const s = (dot3(d, a) - ab * dot3(d, b)) / den;
        const t = (ab * dot3(d, a) - dot3(d, b)) / den;
        return [p.map((v, i) => v + a[i] * s), q.map((v, i) => v + b[i] * t)];
    };
    /** Axes closer to parallel than this (|a1 × a2|) are a spur/internal mesh (as the fork's cParallelThreshold). */
    const PARALLEL = 0.02;
    /**
     * A GearMeshConstraint between gear bodies b1 and b2 turning about the unit axes a1, a2
     * through points c1, c2 (world, t = 0): ω2 = ratio·ω1, each the gear's rate relative to its
     * frame about its axis. `contact` is the pitch point, needed only where the axes are not
     * parallel (worm, bevel; for parallel axes the fork places it on the line of centres from
     * the ratio). hinge1/hinge2 (Jolt HingeConstraints holding gear 1 / gear 2) give the frames
     * and the phase; without them the frames count as at rest.
     */
    /** Meshes with their hinges: {constraint, hinge1, hinge2} (re-based before every step: rebaseMeshes). */
    const meshes = [];
    const meshGear = ({b1, b2, a1, a2, c1, c2, ratio, contact, hinge1, hinge2, velocitySteps = MESH_VELOCITY_STEPS}) => {
        const ms = new J.GearMeshConstraintSettings();
        ms.mSpace = J.EConstraintSpace_WorldSpace;
        const tmp = [new J.RVec3(...c1), new J.Vec3(...a1), new J.RVec3(...c2), new J.Vec3(...a2)];
        [ms.mPoint1, ms.mHingeAxis1, ms.mPoint2, ms.mHingeAxis2] = tmp;
        if (contact) { tmp.push(new J.RVec3(...contact)); ms.mContactPoint = tmp[4]; }
        ms.mRatio = ratio;
        ms.mNumVelocityStepsOverride = velocitySteps;
        ms.mNumPositionStepsOverride = GEAR_POSITION_STEPS;
        const constraint = J.castObject(ms.Create(getBodyForId(b1), getBodyForId(b2)), J.GearMeshConstraint);
        J.destroy(ms);
        for (const o of tmp) J.destroy(o);
        physicsSystem.AddConstraint(constraint);
        allConstraints.push(constraint);
        if (hinge1 && hinge2) {
            constraint.SetConstraints(hinge1, hinge2);
            meshes.push({ constraint, hinge1, hinge2 });
        }
        for (const bid of [b1, b2]) { floorInertia(bid); floorMass(bid); }
        return constraint;
    };
    /**
     * The pitch point of two non-parallel gear axes for meshGear when the coupling does not carry
     * one (the 'gear' kind's bevel pairs): in the plane of the axes, through their closest point O,
     * at P − O ∝ a1 − ratio·a2. There the pitch speeds of the two gears are ratio : 1, so the tooth
     * contact holds the ratio exactly; the scale (1 cm) does not matter when both gears turn in one
     * frame (the reaction on it is the couple k1·a1 − k2·a2), which is the only case mech/gears.js emits.
     */
    const crossedPitchPoint = (c1, a1, c2, a2, ratio) => {
        const cp = closestPoints(c1, a1, c2, a2);
        if (!cp) return null;
        const O = cp[0].map((v, i) => (v + cp[1][i]) / 2);
        const dir = unit(a1.map((v, i) => v - ratio * a2[i]));
        return O.map((v, i) => v + 0.01 * dir[i]);
    };
    /** The 'gear' / 'worm' kinds' rules: two hinges, the gear the side not shared with the other hinge. */
    const hingeMesh = (id, j1, j2, ratio, {velocitySteps, worm = false} = {}) => {
        if (!j1 || !j2) throw new Error(`gear ${id} joint not found`);
        if (j1.type !== 'hinge' || j2.type !== 'hinge') throw new Error(`gear ${id} must couple two hinges`);
        const shared = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
        const gearSide = j => {
            // No shared frame (a hand-built mechanism): the gear is the hinge's body2.
            if (shared === undefined || j.body1 === j.body2) return { body: j.body2, sign: 1 };
            return j.body2 === shared ? { body: j.body1, sign: -1 } : { body: j.body2, sign: 1 };
        };
        const s1 = gearSide(j1);
        const s2 = gearSide(j2);
        const a1 = unit(j1.axis).map(v => v * s1.sign);
        const a2 = unit(j2.axis).map(v => v * s2.sign);
        let contact = null;
        if (Math.hypot(...cross3(a1, a2)) >= PARALLEL) {
            if (worm) {
                // The worm's pitch point towards the wheel: on the common perpendicular of the two axes,
                // the wheel's pitch radius (module 1 mm: 0.5 mm per tooth, |ratio| = 1/teeth for LEGO's
                // single-start worms) from the wheel's axis.
                const cp = closestPoints(j1.point, a1, j2.point, a2);
                if (cp) {
                    const [Q, R] = cp;
                    const D = Math.hypot(...R.map((v, i) => v - Q[i]));
                    const rWheel = 0.0005 / Math.abs(ratio);
                    const rWorm = rWheel < D ? D - rWheel : D / 2;
                    contact = D > 1e-9 ? Q.map((v, i) => v + (R[i] - v) * rWorm / D) : null;
                }
            }
            if (!contact) contact = crossedPitchPoint(j1.point, a1, j2.point, a2, ratio);
        }
        return meshGear({ b1: s1.body, b2: s2.body, a1, a2, c1: j1.point, c2: j2.point, ratio, contact,
            hinge1: hingeMap.get(j1.id).hinge, hinge2: hingeMap.get(j2.id).hinge, velocitySteps });
    };
    /** A chain drive (kinds/chain.js): ω(joint2) = ratio · ω(joint1), each the hinge's own rate. */
    // The constraint holds the contract's ω2 = ratio·ω1 with mRatio = −1/ratio (measured: test/bw-sim-chain.test.mjs).
    // With |mRatio| < 1 the fork's GearConstraint diverges (a 1:3 step-up spun the driven gear and stalled the
    // motor), so a step-up is built the other way round: ω1 = (1/ratio)·ω2, |mRatio| = |ratio| ≥ 1.
    const chainDrive = (id, jA, jB, ratioAB, { velocitySteps = MESH_VELOCITY_STEPS } = {}) => {
        if (!jA || !jB || jA.type !== 'hinge' || jB.type !== 'hinge') throw new Error(`chain ${id} must couple two hinges`);
        const [j1, j2, ratio] = Math.abs(ratioAB) > 1 ? [jB, jA, 1 / ratioAB] : [jA, jB, ratioAB];
        const shared = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
        const gearSide = j => (shared !== undefined && j.body2 === shared ? { body: j.body1, sign: -1 } : { body: j.body2, sign: 1 });
        const s1 = gearSide(j1);
        const s2 = gearSide(j2);
        const gs = new J.GearConstraintSettings();
        gs.mSpace = J.EConstraintSpace_WorldSpace;
        const tmp = [new J.Vec3(...unit(j1.axis).map(v => v * s1.sign)), new J.Vec3(...unit(j2.axis).map(v => v * s2.sign))];
        [gs.mHingeAxis1, gs.mHingeAxis2] = tmp;
        gs.mRatio = -1 / ratio;
        gs.mNumVelocityStepsOverride = velocitySteps;
        gs.mNumPositionStepsOverride = GEAR_POSITION_STEPS;
        const constraint = J.castObject(gs.Create(getBodyForId(s1.body), getBodyForId(s2.body)), J.GearConstraint);
        J.destroy(gs);
        for (const o of tmp) J.destroy(o);
        constraint.SetConstraints(hingeMap.get(j1.id).hinge, hingeMap.get(j2.id).hinge);
        physicsSystem.AddConstraint(constraint);
        allConstraints.push(constraint);
        for (const bid of [s1.body, s2.body]) { floorInertia(bid); floorMass(bid); }
        return constraint;
    };
    /**
     * A rubber band as a spring (kinds/belt.js): a distance constraint between the two anchor points,
     * free from 0 to the rest distance, soft beyond it (stiffness N/m, damping N·s/m).
     */
    const bandSpring = g => {
        const b1 = mechanism.bodies.find(b => b.id === g.body1);
        const b2 = mechanism.bodies.find(b => b.id === g.body2);
        if (!b1 || !b2) throw new Error(`spring ${g.id}: bodies not found`);
        const ds = new J.DistanceConstraintSettings();
        ds.mSpace = J.EConstraintSpace_WorldSpace;
        const p1 = new J.RVec3(...g.local1.map((v, i) => v + b1.position[i]));
        const p2 = new J.RVec3(...g.local2.map((v, i) => v + b2.position[i]));
        ds.mPoint1 = p1;
        ds.mPoint2 = p2;
        ds.mMinDistance = 0;
        ds.mMaxDistance = g.restM;
        const spring = ds.mLimitsSpringSettings;
        spring.mMode = J.ESpringMode_StiffnessAndDamping;
        spring.mStiffness = g.stiffness;
        spring.mDamping = g.damping;
        const constraint = ds.Create(getBodyForId(g.body1), getBodyForId(g.body2));
        J.destroy(ds);
        J.destroy(p1);
        J.destroy(p2);
        physicsSystem.AddConstraint(constraint);
        allConstraints.push(constraint);
        return constraint;
    };
    /** Self-locking worms (built below): {wormJoint, wheel (hinge entry), holdNm, driver (hinge entry|null), held}. */
    const worms = [];
    /** Linear actuators' screw couplings (physics/screw.js drives them). */
    const screwCouplings = [];
    /** Ropes (kinds/rope.js): built after the couplings, from the drum's hinge (physics/rope.js). */
    const ropeCouplings = [];
    /**
     * End stops through couplings: gears, chains, bands and racks tie WORLD rates, so with a joint they
     * drive at its end (a rack's slider limit, a boom hinge's) a motor still driving on is satisfied by
     * turning the whole frame (the forklift's lift motor, the excavator's boom motor tipped them over).
     * Each joint with limits is walked through the couplings (gears, chains, bands, racks)
     * to every hinge that drives it (rate = k·ω(hinge)); at the end, a motor pushing further is held at
     * speed 0 (it stalls against the end, as a real one does), any other hinge pushing further brakes
     * with RACK_STOP_NM until it turns back (applyEndStops).
     */
    let endStops = [];
    /** Pneumatic cylinders and their valves (kinds/pneumatic.js): driven before each step (physics/air.js). */
    const pneumaticCouplings = [];
    /** Pumps (kinds/pneumatic.js PUMP): their sliders put air into their networks (physics/air.js). */
    const pumpCouplings = [];
    /** Driving rings and their clutch gears (kinds/transmission.js): {gear (hinge entry), ring (slider entry), engage, holdNm, engaged}. */
    const dogClutches = [];
    for (const g of mechanism.couplings) {
        if (g.kind === 'gear') {
            hingeMesh(g.id, jointMap.get(g.joint1), jointMap.get(g.joint2), g.ratio);
            gearInfos.push({ type: 'gear', id: g.id, joint1: g.joint1, joint2: g.joint2, ratio: g.ratio });
        } else if (g.kind === 'chain') {
            // kinds/chain.js: a chain round two gears in one frame turns them the same way at the teeth's
            // ratio: the tooth contact a gear mesh has (GearMeshConstraint), its point outside the two on the
            // line of centres (as an internal gear's). Two equal sprockets would put it at infinity: those get
            // the fork's GearConstraint on the two hinges (exact at 1:1, but measured 27 % off at 16:24).
            if (Math.abs(Math.abs(g.ratio) - 1) < CHAIN_EQUAL) chainDrive(g.id, jointMap.get(g.joint1), jointMap.get(g.joint2), g.ratio);
            else hingeMesh(g.id, jointMap.get(g.joint1), jointMap.get(g.joint2), g.ratio);
            gearInfos.push({ type: 'chain', id: g.id, joint1: g.joint1, joint2: g.joint2, ratio: g.ratio });
        } else if (g.kind === 'band') {
            // kinds/belt.js: a rubber band round pulleys, the chain's coupling with few velocity steps, so it gives under load.
            if (Math.abs(Math.abs(g.ratio) - 1) < CHAIN_EQUAL) chainDrive(g.id, jointMap.get(g.joint1), jointMap.get(g.joint2), g.ratio, { velocitySteps: BELT_VELOCITY_STEPS });
            else hingeMesh(g.id, jointMap.get(g.joint1), jointMap.get(g.joint2), g.ratio, { velocitySteps: BELT_VELOCITY_STEPS });
            gearInfos.push({ type: 'band', id: g.id, joint1: g.joint1, joint2: g.joint2, ratio: g.ratio });
        } else if (g.kind === 'pneumatic') {
            pneumaticCouplings.push(g);
            gearInfos.push({ type: 'pneumatic', id: g.id, sliderJoint: g.sliderJoint, valveJoint: g.valveJoint });
        } else if (g.kind === 'pump') {
            pumpCouplings.push(g);
            gearInfos.push({ type: 'pump', id: g.id, sliderJoint: g.sliderJoint });
        } else if (g.kind === 'rope') {
            ropeCouplings.push(g);
            gearInfos.push({ type: 'rope', id: g.id, drumJoint: g.drumJoint });
        } else if (g.kind === 'spring') {
            // kinds/belt.js: a rubber band pulling two bodies together beyond its rest length.
            bandSpring(g);
        } else if (g.kind === 'worm') {
            // A worm and its wheel (kinds/worm.js): the mesh, ratio = 1/teeth (signed by the thread's
            // hand), at the worm's pitch point; the mesh has no friction, so the SELF-LOCK is a hold on
            // the wheel's hinge, applied per step while nothing drives the worm (wormHolds below).
            hingeMesh(g.id, jointMap.get(g.wormJoint), jointMap.get(g.wheelJoint), g.ratio, { velocitySteps: WORM_VELOCITY_STEPS, worm: true });
            const wheel = hingeMap.get(g.wheelJoint);
            worms.push({ id: g.id, wormJoint: g.wormJoint, wheel, holdNm: g.holdTorqueNm / Math.abs(g.ratio), driver: null, held: false });
            gearInfos.push({ type: 'worm', id: g.id, wormJoint: g.wormJoint, wheelJoint: g.wheelJoint, ratio: g.ratio });
        } else if (g.kind === 'relativeGear') {
            // kinds/relative-gear.js: (ω₂ − ω_F)·axis2 = ratio·(ω₁ − ω_F)·axis1 in a frame F. The same
            // tooth contact. Carrier (both gears' hinges turn in F, and F turns: a planet carrier):
            // those two hinges are the mesh's frames, exact however F moves. Chain (a gear on a hinge in
            // an axle that turns, coaxially, in F: a clutch gear free on its axle): the gear's own hinge
            // turns in that axle, not in F, so its angle is not the mesh's phase — no hinges, and the
            // frames count as at rest (F does not turn about the gears here: exact while it does not
            // turn at all, as the gear constraint was).
            const j1 = jointMap.get(g.joint1);
            const j2 = jointMap.get(g.joint2);
            const holds = (j, body) => j && j.type === 'hinge' && (j.body1 === body || j.body2 === body);
            if (!holds(j1, g.gear1) || !holds(j2, g.gear2)) throw new Error(`relativeGear ${g.id}: joint1/joint2 must be the gears' hinges`);
            const frameOf = (j, body) => (j.body1 === body ? j.body2 : j.body1);
            const sameFrame = frameOf(j1, g.gear1) === g.frame && frameOf(j2, g.gear2) === g.frame;
            const parallel = Math.hypot(...cross3(g.axis1, g.axis2)) < PARALLEL;
            meshGear({ b1: g.gear1, b2: g.gear2, a1: g.axis1, a2: g.axis2, c1: j1.point, c2: j2.point, ratio: g.ratio,
                contact: parallel ? null : g.anchor1,
                hinge1: sameFrame ? hingeMap.get(g.joint1).hinge : null, hinge2: sameFrame ? hingeMap.get(g.joint2).hinge : null });
            gearInfos.push({ type: 'relativeGear', id: g.id, gear1: g.gear1, gear2: g.gear2, frame: g.frame, ratio: g.ratio });
        } else if (g.kind === 'dogClutch') {
            const gear = hingeMap.get(g.gearJoint);
            const ring = sliderMap.get(g.sliderJoint);
            if (!gear || !ring) throw new Error(`dog clutch ${g.id}: joints not found`);
            dogClutches.push({ id: g.id, gear, ring, engage: g.engage, holdNm: g.holdTorqueNm, engaged: false });
            // The clutch puts the gear's load on the axle (and the ring): their inertia is floored as
            // a gear body's is (GEAR_MIN_INERTIA), so the solver holds the lock against the gear's.
            const gj = jointMap.get(g.gearJoint);
            const sj = jointMap.get(g.sliderJoint);
            for (const bid of new Set([gj.body1, gj.body2, sj.body1, sj.body2])) if (bid !== 'world') floorInertia(bid);
            gearInfos.push({ type: 'dogClutch', id: g.id, gearJoint: g.gearJoint, sliderJoint: g.sliderJoint });
        } else if (g.kind === 'rackAndPinion' || g.kind === 'shiftFork') {
            // shiftFork (kinds/transmission.js): a changeover catch's swing pushing a driving ring
            // along its axle is the same linear coupling of a hinge and a slider.
            // A Jolt RackAndPinionConstraint between the pinion body (the hinge's side
            // not shared with the slider) and the rack body (the slider's other side),
            // signed the way the gear's axes are. Contract: v(slider) = ratio·ω(hinge),
            // m/s per rad/s; Jolt's part is ω1·a = r·v2·b (rad/s per m/s), so r = 1/|ratio|
            // and the ratio's sign goes into the slider axis b. Like a gear it couples
            // WORLD rates: exact while the frame holding both does not turn about the
            // pinion axis. Measured in test/bw-sim-sliders.test.mjs (both signs).
            const jh = jointMap.get(g.hingeJoint);
            const js = jointMap.get(g.sliderJoint);
            if (!jh || !js) throw new Error(`${g.kind} ${g.id} joint not found`);
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
            gearInfos.push({ type: g.kind, id: g.id, hingeJoint: g.hingeJoint, sliderJoint: g.sliderJoint, ratio: g.ratio });
        } else if (g.kind === 'screw') {
            // A linear actuator (kinds/screw.js): the slider is driven from the spindle's relative
            // rotation by physics/screw.js, once the joint states are known (below).
            screwCouplings.push(g);
            gearInfos.push({ type: 'screw', id: g.id, hingeJoint: g.hingeJoint, sliderJoint: g.sliderJoint, ratio: g.ratio });
        } else if (g.kind === 'universalJoint') {
            // kinds/universal-joint.js: a cross on two hinges between the two ends (physics/universal-joint.js).
            const uj = buildUniversalJoint({ J, c: g, bodyInterface, physicsSystem, bodyOf: getBodyForId, layer: LAYER_GHOST });
            allBodyIDs.push(uj.bodyID);
            allConstraints.push(...uj.constraints);
            // The ends' shafts get a gear's inertia floor: a bare axle (~1e-8 kg·m²) on each side of the cross let a
            // load on the output stall the drive by turns (the solver's chain end → cross → end did not converge).
            for (const bid of [g.body1, g.body2]) floorInertia(bid);
            gearInfos.push({ type: 'universalJoint', id: g.id, body1: g.body1, body2: g.body2 });
        } else if (g.kind === 'turntable') {
            // kinds/turntable.js emits none; a hand-built mechanism naming the kind has nothing to build.
        } else throw new Error(`no physics builder for coupling kind '${g.kind}' (${g.id})`);
    }

    // Dog clutches (kinds/transmission.js): while the ring's teeth are in a clutch gear's socket
    // (the ring's slider within `engage`), the gear's hinge on the axle holds with holdNm on top of
    // its own friction — the gear turns with the axle; out of the socket the gear is free again.
    // Decided before every step from the ring's position.
    const setClutch = (c, engaged) => {
        c.engaged = engaged;
        c.gear.hinge.SetMaxFrictionTorque(c.gear.frictionNm + (engaged ? c.holdNm : 0));
    };
    const applyDogClutches = () => {
        for (const c of dogClutches) {
            const x = c.ring.position;
            const engaged = x >= c.engage[0] - 1e-6 && x <= c.engage[1] + 1e-6;
            if (engaged !== c.engaged) setClutch(c, engaged);
        }
    };
    if (dogClutches.length) applyDogClutches();

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
    const screws = screwCouplings.length
        ? createScrewDrives({ J, couplings: screwCouplings, hingeMap, sliderMap, jointMap, bodyInterface, bodyIdOf: getBodyIDForId, bodyOf: id => (bodyMap.get(id) || {}).body || null, dt: dtFixed })
        : null;
    // Tyres' rolling resistance (physics/rolling.js), applied before every step.
    const rolling = createRollingResistance({ J, mechanism, bodyMap, hingeMap, bodyInterface, dt: dtFixed, inertiaOf });
    if (screws) for (const d of screws.drives) floorInertia(mechanism.joints.find(j => j.id === d.c.hingeJoint)[d.sign > 0 ? 'body2' : 'body1']);

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
            e.hinge.GetMaxFrictionTorque(), e.rotorInertia, e.coastFrictionNm]),
        restore: saved => {
            let i = 0;
            for (const [id, e] of hingeMap) {
                let friction, rotorInertia;
                [e.rawPrev, e.unwrapped, e.velocity, e.mode, e.target, e.targetSpeed, e.driveTorque, e.damping, friction, rotorInertia, e.coastFrictionNm] = saved[i++];
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
    // A linear actuator's pairing of spindle angle and piston position (physics/screw.js).
    if (screws) stateRegistry.register('screws', screws.registrant);
    const ropes = ropeCouplings.length
        ? createRopes({ J, couplings: ropeCouplings, hingeMap, jointMap, bodyInterface, bodyIdOf: getBodyIDForId, bodyOf: getBodyForId,
            physicsSystem, allConstraints, dt: dtFixed })
        : null;
    if (ropes) stateRegistry.register('ropes', ropes.registrant);
    // Pneumatics (kinds/pneumatic.js, physics/air.js): the air networks, valves, cylinders and pumps.
    const air = pneumaticCouplings.length || pumpCouplings.length
        ? createAir({ J, cylinders: pneumaticCouplings, pumps: pumpCouplings, hingeMap, sliderMap, bodyInterface, applySliderForce })
        : null;
    if (air) stateRegistry.register('air', air.registrant);
    if (rolling) stateRegistry.register('rolling', rolling.registrant);
    if (dogClutches.length) {
        stateRegistry.register('dogClutches', {
            save: () => dogClutches.map(c => c.engaged),
            restore: saved => dogClutches.forEach((c, i) => setClutch(c, saved[i]))
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
        if (entry.mode === 'spring') throw new Error(`slider ${jointId} is a spring (a shock absorber), not a motor`);
        if (entry.mode === 'pneumatic') throw new Error(`slider ${jointId} is a pneumatic cylinder: its valve moves it`);
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

    // The end stops (endStops above). A joint's position against its limits: which end it is at, if any.
    const atEndOf = (jointId, limits) => {
        const h = hingeMap.get(jointId);
        const s = h ? null : sliderMap.get(jointId);
        const x = h ? h.unwrapped : s ? s.position : null;
        if (x === null) return 0;
        const tol = h ? HINGE_STOP_RAD : RACK_STOP_M;
        return x >= limits[1] - tol ? 1 : x <= limits[0] + tol ? -1 : 0;
    };
    // Every joint with limits, and the hinges that drive it: the couplings walked from it, rates multiplied.
    const buildEndStops = () => {
        const edges = new Map();
        const link = (a, b, k) => {
            if (!edges.has(a)) edges.set(a, []);
            if (!edges.has(b)) edges.set(b, []);
            edges.get(a).push([b, k]);
            if (k !== 0) edges.get(b).push([a, 1 / k]);
        };
        for (const g of mechanism.couplings || []) {
            if (['gear', 'chain', 'band', 'relativeGear'].includes(g.kind) && g.joint1 && g.joint2 && g.ratio) link(g.joint1, g.joint2, g.ratio);
            // (Not a linear actuator's screw: its clutch lets the spindle turn on at the end, physics/screw.js.)
            else if (['rackAndPinion', 'shiftFork'].includes(g.kind) && g.ratio) link(g.hingeJoint, g.sliderJoint, g.ratio);
        }
        const out = [];
        for (const j of mechanism.joints) {
            if (!j.limits || !edges.has(j.id)) continue;
            // rate(j) = k · ω(hinge): walked from j, k(hinge) is 1 / (the product from j to it).
            const seen = new Map([[j.id, 1]]);
            const queue = [j.id];
            while (queue.length) {
                const at = queue.shift();
                for (const [next, k] of edges.get(at) || []) {
                    if (seen.has(next)) continue;
                    seen.set(next, seen.get(at) * k);
                    queue.push(next);
                }
            }
            for (const [hingeId, kTo] of seen) {
                const entry = hingeMap.get(hingeId);
                if (entry && hingeId !== j.id && kTo !== 0) out.push({ hinge: entry, joint: j.id, k: 1 / kTo, limits: j.limits });
            }
        }
        return out;
    };
    const braked = new Set();
    const applyEndStops = () => {
        const brake = new Set();
        for (const st of endStops) {
            const end = atEndOf(st.joint, st.limits);
            if (end === 0) continue;
            const h = st.hinge;
            if (h.isMotor && h.mode === 'torque') {
                // A power drive (PWM: a torque through the hinge's spring, applyHingeTorque) pushing into the end: the
                // spring's target is where the hinge is, so only its damping (the back-EMF) acts this step.
                if (h.driveTorque !== 0 && Math.sign(st.k * h.driveTorque) === end) h.hinge.SetTargetAngle(normalizeAngle(h.hinge.GetCurrentAngle()));
            } else if (h.isMotor) {
                const drive = h.hinge.GetTargetAngularVelocity();
                if (drive !== 0 && h.hinge.GetMotorState() === J.EMotorState_Velocity && Math.sign(st.k * drive) === end) h.hinge.SetTargetAngularVelocity(0);
            } else if (Math.sign(st.k * h.velocity) === end) {
                brake.add(h);
            }
        }
        for (const h of new Set([...braked, ...brake])) {
            const on = brake.has(h);
            if (on === braked.has(h)) continue;
            if (on) braked.add(h); else braked.delete(h);
            h.hinge.SetMaxFrictionTorque(on ? RACK_STOP_NM : h.frictionNm);
        }
    };
    endStops = buildEndStops();
    // The brakes are hinge friction, which Jolt's state does not record: a rollback puts them back as they were.
    if (endStops.length) stateRegistry.register('endStops', {
        save: () => [...hingeMap].filter(([, h]) => braked.has(h)).map(([id]) => id),
        restore: ids => {
            const want = new Set(ids.map(id => hingeMap.get(id)));
            for (const h of new Set([...braked, ...want])) {
                const on = want.has(h);
                if (on) braked.add(h); else braked.delete(h);
                h.hinge.SetMaxFrictionTorque(on ? RACK_STOP_NM : h.frictionNm);
            }
        }
    });

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
                if (endStops.length) applyEndStops();
                if (worms.length) applyWormHolds();
                if (screws) screws.beforeStep();
                if (ropes) ropes.beforeStep();
                if (air) air.beforeStep();
                if (dogClutches.length) applyDogClutches();
                if (rolling) rolling.apply();
                // Re-base every mesh's phase on its hinges' angles now (see the gears' header comment).
                for (const m of meshes) m.constraint.SetConstraints(m.hinge1, m.hinge2);
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
                    entry.coastFrictionNm = friction; // physics/rolling.js adds a tyre's rolling resistance on top
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
            setMotorSteps(entry, j);
        },
        /**
         * A tyred wheel's rolling resistance (physics/rolling.js) as of the last step: {load (N, the
         * floor's normal force), radius (m), crr}, or null for a body that does not roll.
         */
        rollingWheel(bodyId) {
            ensureAlive();
            const w = rolling && rolling.wheels.find(x => x.id === bodyId);
            return w ? { load: w.load, radius: w.radius, crr: w.crr } : null;
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
        /** Each rope's free length (m) and tension (N) now (physics/rope.js); [] without a rope. */
        ropeState() { ensureAlive(); return ropes ? ropes.state() : []; },
        /** Each pneumatic cylinder's state now: 'out', 'in' or 'held' (kinds/pneumatic.js). */
        pneumaticState() { ensureAlive(); return air ? air.cylinders() : []; },
        /** Each air network's pressure now (kPa above the air's; physics/air.js). */
        airState() { ensureAlive(); return air ? air.networks() : []; },
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
        /**
         * A body's angular momentum about `about` (world, m), kg·m²/s: I·ω about its centre of mass plus
         * m·(c − about) × v, with the mass and inertia the solver uses (floors included). Static: zero.
         */
        bodyAngularMomentum(bodyId, about = [0, 0, 0]) {
            ensureAlive();
            const e = bodyMap.get(bodyId);
            if (!e) throw new Error(`unknown body ${bodyId}`);
            if (e.motionType === J.EMotionType_Static) return [0, 0, 0];
            const mp = e.body.GetMotionProperties();
            const m = 1 / mp.GetInverseMass();
            const r = bodyInterface.GetRotation(e.bodyID);
            const q = [r.GetX(), r.GetY(), r.GetZ(), r.GetW()];
            const I = inertiaOf(mp);
            const wv = bodyInterface.GetAngularVelocity(e.bodyID);
            const w = [wv.GetX(), wv.GetY(), wv.GetZ()];
            // I_world·ω = R·I·Rᵀ·ω
            const wl = quatRotateVec([-q[0], -q[1], -q[2], q[3]], w);
            const L = quatRotateVec(q, [0, 1, 2].map(i => I[i][0] * wl[0] + I[i][1] * wl[1] + I[i][2] * wl[2]));
            const c = e.body.GetCenterOfMassPosition();
            const d = [c.GetX() - about[0], c.GetY() - about[1], c.GetZ() - about[2]];
            const vv = bodyInterface.GetLinearVelocity(e.bodyID);
            const v = [vv.GetX(), vv.GetY(), vv.GetZ()];
            return [L[0] + m * (d[1] * v[2] - d[2] * v[1]), L[1] + m * (d[2] * v[0] - d[0] * v[2]), L[2] + m * (d[0] * v[1] - d[1] * v[0])];
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
            return { t, bodyIds: [...bodyOrder], jointIds: [...jointOrder], bodies, joints, ...(air ? { air: air.networks() } : {}) };
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
            let bodyFilter = null;
            if (ignoreBodies.length) {
                const ignoreFilter = new J.IgnoreMultipleBodiesFilter();
                for (const id of ignoreBodies) {
                    const e = bodyMap.get(id);
                    if (e) ignoreFilter.IgnoreBody(e.bodyID);
                }
                bodyFilter = ignoreFilter;
            } else bodyFilter = new J.BodyFilter();
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
                        // nLocal is the binding's static temporary (GetSurfaceNormal returns by value):
                        // never destroyed (that freed memory never allocated, under every hit).
                        J.destroy(localHit);
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
            J.destroy(originVec);
            J.destroy(dirVec);
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
            if (simShapeFilter) { J.destroy(simShapeFilter); simShapeFilter = null; }
            if (screws) screws.destroy();
            if (ropes) ropes.destroy();
            if (rolling) rolling.destroy();
            bodyMap.clear(); hingeMap.clear(); sliderMap.clear(); ballMap.clear(); jointMap.clear();
        },
    };
    return core;
};
