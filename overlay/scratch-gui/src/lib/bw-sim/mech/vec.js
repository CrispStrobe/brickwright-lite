// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Small vector / quaternion / 3x3 helpers for the mechanism compiler.
// Pure math, no DOM, no Jolt. Frame conversion (LDU -> world) lives in
// contracts.js (lduToWorld/dirToWorld); this module provides the linear
// algebra that graph/islands/joints/gears build on.

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[number, number, number, number]} Quat */
/** @typedef {[number, number, number, number, number, number, number, number, number]} Mat3 */

export const COS_1_DEG = Math.cos(Math.PI / 180);
export const SIN_1_DEG = Math.sin(Math.PI / 180);

export const EPS = 1e-9;

// --- Vec3 -------------------------------------------------------------------

/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {Vec3} v @param {number} s @returns {Vec3} */
export const vecScale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
/** @param {Vec3} v @returns {Vec3} */
export const vecNeg = v => [0 - v[0], 0 - v[1], 0 - v[2]];
/** @param {Vec3} a @param {Vec3} b @returns {number} */
export const vecDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export const vecCross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
/** @param {Vec3} v @returns {number} */
export const vecLen = v => Math.hypot(v[0], v[1], v[2]);
/** @param {Vec3} v @returns {number} */
export const vecLenSq = v => v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
/** @param {Vec3} v @returns {Vec3} unit or [0,0,0] if zero */
export const vecNormalize = v => {
    const l = vecLen(v);
    if (l < 1e-12) return [0, 0, 0];
    return [v[0] / l, v[1] / l, v[2] / l];
};
/** @param {Vec3} a @param {Vec3} b @returns {number} distance */
export const vecDist = (a, b) => vecLen(vecSub(a, b));
/** @param {Vec3} a @param {Vec3} b @returns {boolean} approx equal */
export const vecEq = (a, b, eps = 1e-9) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;

// --- Mat3 -------------------------------------------------------------------

/** Row-major 3x3 * Vec3: m * v */
export const mat3MulVec3 = (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** Row-major Mat3 * Mat3 (for completeness) */
export const mat3MulMat3 = (a, b) => [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

/** M = diag(1,-1,-1) * R (world rotation from LDraw rotation) */
export const worldMatFromLDrawMat = R => [
    R[0], R[1], R[2],
    0 - R[3], 0 - R[4], 0 - R[5],
    0 - R[6], 0 - R[7], 0 - R[8],
];

// --- Quat -------------------------------------------------------------------

/** Normalize quat xyzw */
export const quatNormalize = q => {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    if (l < 1e-12) return [0, 0, 0, 1];
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

/** Hamilton product a * b (apply b then a) */
export const quatMul = (a, b) => {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ];
};

/** Conjugate */
export const quatConj = q => [0 - q[0], 0 - q[1], 0 - q[2], q[3]];

/** Convert row-major Mat3 (proper rotation) to unit quat xyzw.
 *  Uses Shepperd method, robust. */
export const quatFromMat3 = m => {
    const m00 = m[0]; const m01 = m[1]; const m02 = m[2];
    const m10 = m[3]; const m11 = m[4]; const m12 = m[5];
    const m20 = m[6]; const m21 = m[7]; const m22 = m[8];
    const trace = m00 + m11 + m22;
    let x; let y; let z; let w;
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        w = 0.25 * s;
        x = (m21 - m12) / s;
        y = (m02 - m20) / s;
        z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }
    return quatNormalize([x, y, z, w]);
};

/** World quat from LDraw rotation matrix R (proper) */
export const quatFromLDrawMat = R => quatFromMat3(worldMatFromLDrawMat(R));

// --- Helpers ----------------------------------------------------------------

/** Perpendicular distance from point p to line (origin + dir* t) */
export const perpDistanceToLine = (p, origin, dir) => {
    const delta = vecSub(p, origin);
    const axial = vecDot(delta, dir);
    const perp = vecSub(delta, vecScale(dir, axial));
    return vecLen(perp);
};

/** Closest distance between two lines (p1+ t*a1, p2+ s*a2) */
export const lineDistance = (p1, a1, p2, a2) => {
    const cross = vecCross(a1, a2);
    const crossLen = vecLen(cross);
    if (crossLen < 1e-12) {
        // Parallel: distance from p2 to line1
        return perpDistanceToLine(p2, p1, a1);
    }
    const delta = vecSub(p2, p1);
    return Math.abs(vecDot(delta, vecNormalize(cross)));
};

/** Find closest points on two lines, return {o1,o2,mid} */
export const lineClosestMidpoint = (p1, a1, p2, a2) => {
    const cross = vecCross(a1, a2);
    const crossLenSq = vecLenSq(cross);
    // Solve for t,s minimizing |p1+ t a1 - (p2+ s a2)|^2
    // For parallel case, fallback to projection
    if (crossLenSq < 1e-14) {
        const delta = vecSub(p2, p1);
        const t = vecDot(delta, a1);
        const closestOn1 = vecAdd(p1, vecScale(a1, t));
        // Distance is perp distance, midpoint is average of closest pair
        return {o1: closestOn1, o2: p2, mid: vecScale(vecAdd(closestOn1, p2), 0.5)};
    }
    // Non-parallel: solve 2x2
    // We have delta = p2-p1
    // Want t,s such that (p1+ t a1 - p2 - s a2) perpendicular to both a1 and a2
    // i.e. dot( p1+ t a1 - p2 - s a2, a1)=0 and dot(...,a2)=0
    const delta = vecSub(p2, p1);
    const d11 = vecDot(a1, a1);
    const d22 = vecDot(a2, a2);
    const d12 = vecDot(a1, a2);
    const r1 = vecDot(delta, a1);
    const r2 = vecDot(delta, a2);
    // Actually equations: t*d11 - s*d12 = r1
    //                     t*d12 - s*d22 = r2
    const denom = d11 * d22 - d12 * d12;
    let t; let s;
    if (Math.abs(denom) < 1e-12) {
        t = 0; s = 0;
    } else {
        t = (r1 * d22 - r2 * d12) / denom;
        s = (r1 * d12 - r2 * d11) / denom;
        // Check sign: derived from algebra; we solved t*a1 - s*a2 = delta projected
        // Let's verify: p1+t a1 - (p2 + s a2) = -delta + t a1 - s a2
        // dot with a1: (-delta + t a1 - s a2).a1 = -r1 + t d11 - s d12 =0 => t d11 - s d12 = r1 good
        // dot with a2: (-delta + t a1 - s a2).a2 = -r2 + t d12 - s d22 =0 => t d12 - s d22 = r2 good
    }
    const o1 = vecAdd(p1, vecScale(a1, t));
    const o2 = vecAdd(p2, vecScale(a2, s));
    const mid = vecScale(vecAdd(o1, o2), 0.5);
    return {o1, o2, mid};
};
