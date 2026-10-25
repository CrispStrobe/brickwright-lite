// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A universal (Cardan) joint in Jolt (kinds/universal-joint.js detects it): what it physically is, a
// CROSS on two hinges. End 1 turns on the cross about fork1, the cross turns in end 2 about fork2; the
// two arms are square to each other and meet at the pivot. That is the whole mechanism, so its
// kinematics come out of the constraints: at a bend β the output's speed ripples,
// ω2/ω1 = cos β / (1 − sin²β·cos²θ) (θ the input fork's angle from the plane of the shafts), twice
// a turn, between cos β and 1/cos β; and torque crosses it the way the cross carries it.
// (Jolt's SwingTwist / SixDOF with the twist locked would be a CONSTANT-velocity joint instead: its
// swing–twist split is the bisecting-plane geometry of a Rzeppa joint, not a Cardan's.)
//
// The cross is a body of the core's own, not a mechanism body: not in snapshots or poses, on a layer
// that collides with nothing (its volume is inside the forks, which do not collide either:
// noCollide). Its real mass (~0.1 g) between two hinges would be the light-body-between-constraints
// problem (docs/ROBOT-LAB-VALIDATION.md round 1, bug 2), so it is solved as CROSS_MASS_KG with
// CROSS_INERTIA (the gears' kind of floor, jolt-core.js GEAR_MIN_*) and weighs what the real one does.
// Each hinge is limited to ±maxBendRad from straight (the fork's shoulder meets the other fork).
// Nothing here changes Jolt: it is HingeConstraints and a body.

/** The cross's solver mass and moment (a numerical floor; its weight is the real part's). */
export const CROSS_MASS_KG = 0.005;
export const CROSS_INERTIA = 3e-6;
/** The real cross's mass (62519 / 3326: about 0.1 g, a hollow 1 × 1 cm moulding). */
const CROSS_REAL_MASS_KG = 0.0001;
/**
 * Solver iterations for the cross's two hinges (Jolt's defaults 10 / 2): the chain end 1 → cross → end 2 and
 * the shafts' bearings close a loop. Two joints in phase kept the output within 1.3 % of constant speed with
 * 30 velocity steps, 0.23 % with 120 (measured, test/bw-sim-universal-joint.test.mjs), as the meshes' MESH_VELOCITY_STEPS.
 */
const UJ_VELOCITY_STEPS = 120;
const UJ_POSITION_STEPS = 10;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
/** The signed angle from a to b about k (all square to k). */
const angleAbout = (a, b, k) => Math.atan2(dot(k, cross(a, b)), dot(a, b));

/**
 * The cross's frame at t = 0 and each hinge's start angle off straight.
 * n, the cross's own axis (square to both arms), points from end 1 towards end 2.
 * Hinge A (end 1 → cross, about fork1): the bend in it is the angle from −shaft1 to n.
 * Hinge B (cross → end 2, about fork2): the bend in it is the angle from n to shaft2.
 */
export const crossGeometry = c => {
    const f1 = unit(c.fork1);
    // The arms are square: fork2's part along fork1 (within the detector's few degrees) is dropped.
    const f2 = unit(c.fork2.map((v, i) => v - dot(c.fork2, f1) * f1[i]));
    const e1 = c.shaft1.map(v => -v);
    let n = unit(cross(f1, f2));
    if (dot(n, e1) + dot(n, c.shaft2) < 0) n = n.map(v => -v);
    return {f1, f2, n, bendA: angleAbout(e1, n, f1), bendB: angleAbout(n, c.shaft2, f2)};
};

/**
 * Build one universal joint: the cross body and its two hinges.
 * @returns {{bodyID: object, constraints: object[], hinges: object[]}}
 */
export const buildUniversalJoint = ({J, c, bodyInterface, physicsSystem, bodyOf, layer}) => {
    const {f1, f2, n, bendA, bendB} = crossGeometry(c);
    const shape = new J.SphereShape(0.001);
    // Body frame: x along fork1, z along n, y = z × x (fork2, up to its sign): right-handed whichever way n points.
    const rot = quatFromColumns([f1, cross(n, f1), n]);
    const pos = new J.RVec3(...c.point);
    const q = new J.Quat(...rot);
    const bcs = new J.BodyCreationSettings(shape, pos, q, J.EMotionType_Dynamic, layer);
    J.destroy(pos);
    J.destroy(q);
    bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
    const mp0 = bcs.mMassPropertiesOverride;
    mp0.mMass = CROSS_MASS_KG;
    bcs.mMassPropertiesOverride = mp0;
    bcs.mGravityFactor = CROSS_REAL_MASS_KG / CROSS_MASS_KG;
    bcs.mLinearDamping = 0;
    bcs.mAngularDamping = 0;
    const body = bodyInterface.CreateBody(bcs);
    J.destroy(bcs);
    const inv = new J.Vec3(1 / CROSS_INERTIA, 1 / CROSS_INERTIA, 1 / CROSS_INERTIA);
    const ident = new J.Quat(0, 0, 0, 1);
    body.GetMotionProperties().SetInverseInertia(inv, ident);
    J.destroy(inv);
    J.destroy(ident);
    const bodyID = body.GetID();
    bodyInterface.AddBody(bodyID, J.EActivation_Activate);

    const hinge = (b1, b2, axis, normal, bend) => {
        const hs = new J.HingeConstraintSettings();
        hs.mSpace = J.EConstraintSpace_WorldSpace;
        const tmp = [new J.RVec3(...c.point), new J.RVec3(...c.point), new J.Vec3(...axis), new J.Vec3(...axis), new J.Vec3(...normal), new J.Vec3(...normal)];
        [hs.mPoint1, hs.mPoint2, hs.mHingeAxis1, hs.mHingeAxis2, hs.mNormalAxis1, hs.mNormalAxis2] = tmp;
        // The bend in this hinge is bend + θ (θ its angle from the start pose): within ±maxBendRad.
        hs.mLimitsMin = Math.min(0, -c.maxBendRad - bend);
        hs.mLimitsMax = Math.max(0, c.maxBendRad - bend);
        hs.mNumVelocityStepsOverride = UJ_VELOCITY_STEPS;
        hs.mNumPositionStepsOverride = UJ_POSITION_STEPS;
        const constraint = hs.Create(b1, b2);
        J.destroy(hs);
        for (const o of tmp) J.destroy(o);
        physicsSystem.AddConstraint(constraint);
        return constraint;
    };
    const a = hinge(bodyOf(c.body1), body, f1, n, bendA);
    const b = hinge(body, bodyOf(c.body2), f2, n, bendB);
    return {bodyID, constraints: [a, b], hinges: [J.castObject(a, J.HingeConstraint), J.castObject(b, J.HingeConstraint)]};
};

/** Unit quaternion [x, y, z, w] of the rotation with these (orthonormal) columns. */
const quatFromColumns = ([c0, c1, c2]) => {
    const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, 0.25 * S]; }
    else if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S]; }
    else if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / S, 0.25 * S, (m12 + m21) / S, (m02 - m20) / S]; }
    else { const S = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / S, (m12 + m21) / S, 0.25 * S, (m10 - m01) / S]; }
    const len = Math.hypot(...q);
    return q.map(x => x / len);
};
