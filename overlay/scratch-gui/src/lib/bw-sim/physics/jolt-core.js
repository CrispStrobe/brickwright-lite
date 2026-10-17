// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Jolt physics core for Sim Lab (overlay/scratch-gui/src/lib/bw-sim/physics/).
//
// Runs a CompiledMechanism in Jolt under node --test. No worker, no DOM,
// no three.js. The worker wrapper will call this module.
//
// Bodies: one Jolt body per mechanism body, shape = compound of colliders
// (box / cylinder local +y / sphere), mass overridden to massKg.
// Joints: hinge / slider at point/axis (world at t=0), body2:'world' fixed.
// Gears: contract ratio ω(joint2)=ratio·ω(joint1) mapped to a Jolt
// GearConstraint between the two gear bodies, r = -1/ratio (see GearConstraint.h).
// Collisions v1: dynamic-dynamic disabled, dynamic-static enabled.
// Motors: velocity / position (as velocity controller for unwrapped angle)
// / coast / brake / hold, torque limited to ±maxTorqueNm.

import { validateCompiledMechanism } from '../contracts.js';
import initJolt from 'jolt-physics/wasm-compat';

let joltPromise = null;

/** Contact tolerances at LEGO scale, metres (see the PhysicsSettings block below). */
export const LEGO_SPECULATIVE_CONTACT_M = 0.002;
export const LEGO_PENETRATION_SLOP_M = 0.0002;

export const loadJolt = async () => {
    if (!joltPromise) joltPromise = initJolt();
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

export const createPhysicsCore = (J, mechanism, { stepHz = 120 } = {}) => {
    const problems = validateCompiledMechanism(mechanism);
    if (problems.length) throw new Error(problems.join('\n'));
    const dtFixed = 1 / stepHz;
    const LAYER_DYNAMIC = 0;
    const LAYER_STATIC = 1;
    const NUM_OBJECT_LAYERS = 2;

    const joltSettings = new J.JoltSettings();
    const maxBodies = Math.max(32, mechanism.bodies.length + 16);
    joltSettings.mMaxBodies = maxBodies;
    joltSettings.mMaxBodyPairs = Math.max(1024, maxBodies * 8);
    joltSettings.mMaxContactConstraints = Math.max(1024, maxBodies * 8);

    const objectLayerPairFilter = new J.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
    objectLayerPairFilter.DisableCollision(LAYER_DYNAMIC, LAYER_DYNAMIC);
    objectLayerPairFilter.EnableCollision(LAYER_DYNAMIC, LAYER_STATIC);
    objectLayerPairFilter.DisableCollision(LAYER_STATIC, LAYER_STATIC);

    const bpInterface = new J.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, 2);
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_DYNAMIC, new J.BroadPhaseLayer(0));
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(1));

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

    const ensureAlive = () => { if (destroyed) throw new Error('core destroyed'); };

    for (const b of mechanism.bodies) {
        let shape = null;
        let releaseAfterBody = [];
        if (b.colliders.length === 1 && !b.colliders[0].position && !b.colliders[0].rotation) {
            const col = b.colliders[0];
            if (col.shape === 'box') {
                shape = new J.BoxShape(new J.Vec3(...col.halfExtents), 0.0);
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
                    shapeSettings = new J.BoxShapeSettings(new J.Vec3(...col.halfExtents), 0.0);
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
        const layer = motionType === J.EMotionType_Static ? LAYER_STATIC : LAYER_DYNAMIC;
        const bcs = new J.BodyCreationSettings(shape, posR, rotQ, motionType, layer);
        J.destroy(posR);
        J.destroy(rotQ);
        if (b.motion === 'dynamic') {
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
            if (j.motor) {
                hs.mMotorSettings.mMinTorqueLimit = -j.motor.maxTorqueNm;
                hs.mMotorSettings.mMaxTorqueLimit = j.motor.maxTorqueNm;
            } else {
                hs.mMotorSettings.mMinTorqueLimit = -1e6;
                hs.mMotorSettings.mMaxTorqueLimit = 1e6;
            }
            const constraint = hs.Create(bodyA, bodyB);
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            const hinge = J.castObject(constraint, J.HingeConstraint);
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
            const localAxis1 = toLocal(j.body1, j.axis);
            const localAxis2 = toLocal(j.body2, j.axis);
            const isMotor = !!j.motor;
            hingeMap.set(j.id, {
                hinge, constraint, bodyA, bodyB,
                bodyAID: getBodyIDForId(j.body1),
                bodyBID: getBodyIDForId(j.body2),
                axis: [...j.axis], point: [...j.point], perp: [...perp],
                localAxis1, localAxis2,
                rawPrev: 0, unwrapped: 0, velocity: 0,
                maxTorque: j.motor ? j.motor.maxTorqueNm : 10,
                maxSpeed: j.motor ? j.motor.maxSpeedRadPerSec : 30,
                mode: 'coast', target: 0, targetSpeed: null, kp: 10, isMotor,
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
            ss.mLimitsMin = -1e6;
            ss.mLimitsMax = 1e6;
            const constraint = ss.Create(bodyA, bodyB);
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            sliderMap.set(j.id, { constraint, bodyA, bodyB, axis: [...j.axis], point: [...j.point] });
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
    const gearInfos = [];
    for (const g of mechanism.gears) {
        if (g.type === 'gear') {
            const j1 = jointMap.get(g.joint1);
            const j2 = jointMap.get(g.joint2);
            if (!j1 || !j2) throw new Error(`gear ${g.id} joint not found`);
            if (j1.type !== 'hinge' || j2.type !== 'hinge') throw new Error(`gear ${g.id} must couple two hinges`);
            const shared = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
            const gearSide = j => {
                // No shared frame (a hand-built mechanism): the gear is the hinge's body2.
                if (shared === undefined || j.body1 === j.body2) return { body: j.body2, sign: 1 };
                return j.body2 === shared ? { body: j.body1, sign: -1 } : { body: j.body2, sign: 1 };
            };
            let A = { j: j1, side: gearSide(j1) };
            let B = { j: j2, side: gearSide(j2) };
            let ratio = g.ratio;
            if (Math.abs(ratio) > 1) { [A, B] = [B, A]; ratio = 1 / ratio; }
            const gs = new J.GearConstraintSettings();
            gs.mSpace = J.EConstraintSpace_WorldSpace;
            const flip = ratio > 0 ? -1 : 1;
            gs.mHingeAxis1 = new J.Vec3(...A.j.axis.map(v => v * A.side.sign));
            gs.mHingeAxis2 = new J.Vec3(...B.j.axis.map(v => v * B.side.sign * flip));
            gs.mRatio = 1 / Math.abs(ratio);
            const constraint = gs.Create(getBodyForId(A.side.body), getBodyForId(B.side.body));
            physicsSystem.AddConstraint(constraint);
            allConstraints.push(constraint);
            J.destroy(gs);
            gearInfos.push({ type: 'gear', id: g.id, joint1: g.joint1, joint2: g.joint2, ratio: g.ratio });
        } else if (g.type === 'rackAndPinion') {
            gearInfos.push(g);
        }
    }

    try { physicsSystem.OptimizeBroadPhase(); } catch (_) {}

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
    const updateJointStates = () => {
        for (const [, entry] of hingeMap) {
            const raw = entry.hinge.GetCurrentAngle();
            const delta = deltaAngle(raw, entry.rawPrev);
            entry.unwrapped += delta;
            entry.rawPrev = raw;
            entry.velocity = computeVelocity(entry);
        }
    };
    updateJointStates();

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
            const entry = hingeMap.get(jointId);
            if (!entry) {
                const j = jointMap.get(jointId);
                if (!j) throw new Error(`unknown joint ${jointId}`);
                throw new Error(`joint ${jointId} is not a motorised hinge (type ${j.type})`);
            }
            if (!entry.isMotor) throw new Error(`joint ${jointId} is not a motorised hinge`);
            if (!cmd || typeof cmd.mode !== 'string') throw new Error(`invalid motor command for ${jointId}`);
            const maxSpeed = entry.maxSpeed;
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
                case 'coast': entry.mode = 'coast'; entry.hinge.SetMotorState(J.EMotorState_Off); break;
                case 'brake': entry.mode = 'brake'; entry.hinge.SetMotorState(J.EMotorState_Velocity); entry.hinge.SetTargetAngularVelocity(0); break;
                case 'hold': entry.mode = 'position'; entry.target = entry.unwrapped; entry.targetSpeed = maxSpeed; entry.hinge.SetMotorState(J.EMotorState_Velocity); entry.hinge.SetTargetAngularVelocity(0); break;
                default: throw new Error(`unknown motor mode ${cmd.mode}`);
            }
        },
        jointState(jointId) {
            ensureAlive();
            const entry = hingeMap.get(jointId);
            if (!entry) { const j = jointMap.get(jointId); if (!j) throw new Error(`unknown joint ${jointId}`); throw new Error(`joint ${jointId} is not a hinge`); }
            return { angle: entry.unwrapped, velocity: entry.velocity };
        },
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
                if (h) { joints[jiIdx++] = h.unwrapped; joints[jiIdx++] = h.velocity; }
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
        destroy() {
            if (destroyed) return;
            destroyed = true;
            for (const c of allConstraints) physicsSystem.RemoveConstraint(c);
            for (const bid of allBodyIDs) { bodyInterface.RemoveBody(bid); bodyInterface.DestroyBody(bid); }
            J.destroy(joltInterface);
            bodyMap.clear(); hingeMap.clear(); sliderMap.clear(); ballMap.clear(); jointMap.clear();
        },
    };
    return core;
};
