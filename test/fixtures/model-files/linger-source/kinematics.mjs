// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Independent planar closure for Linger. No native state or motor command is
// read here. Input is the measured physical OA direction in the X/Z plane.

export const GEOMETRY = Object.freeze({
    kind: 'cascaded-four-bar-six-link-near-dwell',
    fixedPointsXZLdu: Object.freeze({ O: [0, 0], D: [100, 0], E: [120, 40] }),
    lengthsLdu: Object.freeze({ OA: 40, AB: 120, DB: 80, DC: 80, CP: 60, EP: 40 }),
    outputTipRadiusLdu: 100,
    initialThetaDegrees: 0,
    lduToMm: 0.4,
    firstCircleBranch: 1,
    secondCircleBranch: -1,
    cEqualsB: true,
    dwellWindowDegrees: [186, 276],
    expectedRigidBodies: 6,
    expectedHinges: 7,
    expectedSliders: 0,
    expectedCouplings: [],
});

const TAU = 2 * Math.PI;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const norm = a => Math.hypot(...a);
const perp = a => [-a[1], a[0]];
const anglePositive = a => ((Math.atan2(a[1], a[0]) % TAU) + TAU) % TAU;

/** The branch sign is sign(cross(b-a, result-a)). All lengths are LDU. */
export function circleIntersection(a, ra, b, rb, branch) {
    const ab = sub(b, a);
    const d = norm(ab);
    if (!(d > 0) || (branch !== 1 && branch !== -1)) {
        throw new Error('Degenerate centre spacing or invalid circle branch');
    }
    const u = mul(ab, 1 / d);
    const s = (ra * ra - rb * rb + d * d) / (2 * d);
    const h2 = ra * ra - s * s;
    if (!(h2 > 0)) throw new Error('Linger closure reached a singular or unreachable triangle');
    return add(add(a, mul(u, s)), mul(perp(u), branch * Math.sqrt(h2)));
}

/** Solve row0·v=rhs0, row1·v=rhs1 without numerical differentiation. */
function solveVelocity(row0, row1, rhs0, rhs1) {
    const determinant = cross(row0, row1);
    if (Math.abs(determinant) < 1e-10) throw new Error('Singular velocity closure');
    return {
        velocity: [
            (rhs0 * row1[1] - row0[1] * rhs1) / determinant,
            (row0[0] * rhs1 - rhs0 * row1[0]) / determinant,
        ],
        determinant,
    };
}

/**
 * Return the independent six-link geometry and its first derivative.
 * Angles are radians. Point arrays are [X,Z] in LDU. Point derivatives are
 * LDU per radian of physical input theta. Output/intermediate angles are
 * absolute mathematical directions in [0,2π); they are not motor encoders.
 */
export function linkage(thetaRadians) {
    if (!Number.isFinite(thetaRadians)) throw new Error('Input theta must be finite');
    const { O, D, E } = GEOMETRY.fixedPointsXZLdu;
    const L = GEOMETRY.lengthsLdu;
    const A = add(O, [L.OA * Math.cos(thetaRadians), L.OA * Math.sin(thetaRadians)]);
    const B = circleIntersection(A, L.AB, D, L.DB, GEOMETRY.firstCircleBranch);
    const C = [...B];
    const P = circleIntersection(C, L.CP, E, L.EP, GEOMETRY.secondCircleBranch);
    const tipScale = GEOMETRY.outputTipRadiusLdu / L.EP;
    const Q = add(E, mul(sub(P, E), tipScale));
    const aPrime = [-L.OA * Math.sin(thetaRadians), L.OA * Math.cos(thetaRadians)];
    const ab = sub(B, A);
    const db = sub(B, D);
    const first = solveVelocity(ab, db, dot(ab, aPrime), 0);
    const cp = sub(P, C);
    const ep = sub(P, E);
    const second = solveVelocity(cp, ep, dot(cp, first.velocity), 0);
    return {
        O: [...O], A, B, D: [...D], C, P, Q, E: [...E],
        inputThetaRadians: thetaRadians,
        intermediateRadians: anglePositive(db),
        outputRadians: anglePositive(ep),
        derivatives: {
            O: [0, 0], A: aPrime, B: first.velocity, D: [0, 0],
            C: [...first.velocity], P: second.velocity,
            Q: mul(second.velocity, tipScale), E: [0, 0],
            intermediateRadiansPerRadian: cross(db, first.velocity) / (L.DB * L.DB),
            outputRadiansPerRadian: cross(ep, second.velocity) / (L.EP * L.EP),
        },
        normalizedLoopDeterminants: [
            first.determinant / (L.AB * L.DB),
            second.determinant / (L.CP * L.EP),
        ],
        circleCentreDistancesLdu: [norm(sub(D, A)), norm(sub(E, C))],
    };
}

/** Pure analytical sampling for contract review; never used as a native pass. */
export function analyticalSweep(stepDegrees = 0.01) {
    if (!(stepDegrees > 0 && stepDegrees <= 1)) throw new Error('Choose a sweep step in (0,1] degrees');
    const count = Math.ceil(360 / stepDegrees);
    const [dwellStart, dwellEnd] = GEOMETRY.dwellWindowDegrees;
    const range = () => ({ min: Infinity, max: -Infinity });
    const include = (r, x) => { r.min = Math.min(r.min, x); r.max = Math.max(r.max, x); };
    const output = range();
    const intermediate = range();
    const dwellOutput = range();
    const distances = [range(), range()];
    const minimumAbsoluteNormalizedDeterminants = [Infinity, Infinity];
    let maximumAbsoluteOutputSpeedRatio = 0;
    let maximumAbsoluteDwellSpeedRatio = 0;
    for (let i = 0; i <= count; i++) {
        const degrees = 360 * i / count;
        const k = linkage(degrees * Math.PI / 180);
        const phi = k.outputRadians * 180 / Math.PI;
        include(output, phi);
        include(intermediate, k.intermediateRadians * 180 / Math.PI);
        const speed = Math.abs(k.derivatives.outputRadiansPerRadian);
        maximumAbsoluteOutputSpeedRatio = Math.max(maximumAbsoluteOutputSpeedRatio, speed);
        if (degrees >= dwellStart && degrees <= dwellEnd) {
            include(dwellOutput, phi);
            maximumAbsoluteDwellSpeedRatio = Math.max(maximumAbsoluteDwellSpeedRatio, speed);
        }
        for (let loop = 0; loop < 2; loop++) {
            include(distances[loop], k.circleCentreDistancesLdu[loop]);
            minimumAbsoluteNormalizedDeterminants[loop] = Math.min(
                minimumAbsoluteNormalizedDeterminants[loop], Math.abs(k.normalizedLoopDeterminants[loop]));
        }
    }
    const outputRangeDegrees = output.max - output.min;
    const dwellRangeDegrees = dwellOutput.max - dwellOutput.min;
    return {
        scope: 'independent analytical geometry; not native runtime evidence',
        stepDegrees: 360 / count,
        sampleCount: count + 1,
        outputDegrees: output,
        outputRangeDegrees,
        intermediateDegrees: intermediate,
        dwellInputDegrees: [...GEOMETRY.dwellWindowDegrees],
        dwellOutputDegrees: dwellOutput,
        dwellRangeDegrees,
        dwellFractionOfFullRange: dwellRangeDegrees / outputRangeDegrees,
        circleCentreDistancesLdu: distances,
        minimumAbsoluteNormalizedDeterminants,
        minimumAcuteTransmissionAnglesDegrees: minimumAbsoluteNormalizedDeterminants.map(v => Math.asin(v) * 180 / Math.PI),
        maximumAbsoluteOutputSpeedRatio,
        maximumAbsoluteDwellSpeedRatio,
    };
}
