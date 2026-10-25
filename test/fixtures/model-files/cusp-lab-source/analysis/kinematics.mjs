// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Independent rolling geometry. This module never reads or changes native
// state. Its input is the actual observed arm phase, not a motor target.

const freezeVector = values => Object.freeze(values);
export const GEOMETRY = Object.freeze({
    kind: 'fixed-rack-moving-pinion-cycloid-and-prolate-trochoid',
    pinionPart: '94925.dat',
    rackPart: '64781.dat',
    pinionTeeth: 16,
    moduleLdu: 2.5,
    pitchRadiusLdu: 20,
    cycloidRadiusLdu: 20,
    prolateRadiusLdu: 40,
    carriageStartXZLdu: freezeVector([-64, 0]),
    rackPitchMidpointXZLdu: freezeVector([0, 20]),
    rackNormalXZ: freezeVector([0, -1]),
    rackToothedLengthLdu: 176,
    initialThetaDegrees: 0,
    operatingIntervalDegrees: freezeVector([0, 360]),
    cuspWindowDegrees: freezeVector([170, 190]),
    prolateBacktrackingWindowDegrees: freezeVector([120, 240]),
    lduToMm: 0.4,
    expectedRigidBodies: 3,
    expectedHinges: 1,
    expectedSliders: 1,
    expectedCouplings: freezeVector(['rackAndPinion']),
});

export const DEG = 180 / Math.PI;
export const TAU = 2 * Math.PI;
const norm = vector => Math.hypot(...vector);
const difference = (a, b) => a.map((value, index) => value - b[index]);

/**
 * Point arrays are [X,Z] in LDU, measured in the fixed frame. The origin is
 * the rack pitch midpoint displaced one pitch radius along its tooth normal.
 * Theta comes from the actual same-layer arm connectors h1 (centre) and h2
 * (radius 20): atan2(armRadialX, -armRadialZ), unwrapped from zero. Actual
 * colored marker output points may occupy a separate parallel axial layer.
 * Positive theta is negative LDraw Y rotation, or native positive Y rotation.
 * The saved marker direction is -Z and the carriage moves toward +X.
 */
export function trajectory(thetaRadians) {
    if (!Number.isFinite(thetaRadians)) throw new Error('Finite physical input phase required');
    const {pitchRadiusLdu: R, cycloidRadiusLdu: p, prolateRadiusLdu: q} = GEOMETRY;
    const [x0, z0] = GEOMETRY.carriageStartXZLdu;
    const sine = Math.sin(thetaRadians), cosine = Math.cos(thetaRadians);
    const C = [x0 + R * thetaRadians, z0];
    const point = radius => [C[0] + radius * sine, C[1] - radius * cosine];
    const derivative = radius => [R + radius * cosine, radius * sine];
    const second = radius => [-radius * sine, radius * cosine];
    const derivatives = {C: [R, 0], P: derivative(p), Q: derivative(q)};
    return {
        inputThetaRadians: thetaRadians,
        C, P: point(p), Q: point(q),
        derivatives,
        secondDerivatives: {C: [0, 0], P: second(p), Q: second(q)},
        normalizedSpeeds: {C: 1, P: norm(derivatives.P) / R, Q: norm(derivatives.Q) / R},
        normalizedXVelocities: {C: 1, P: derivatives.P[0] / R, Q: derivatives.Q[0] / R},
        rackEndMarginLdu: GEOMETRY.rackToothedLengthLdu / 2 - Math.abs(C[0]),
    };
}

/** Exact geometric chord across two measured phases, before division by time. */
export function predictedChordMm(beforeThetaRadians, afterThetaRadians) {
    const before = trajectory(beforeThetaRadians), after = trajectory(afterThetaRadians);
    return Object.fromEntries(['C', 'P', 'Q'].map(name => [name,
        difference(after[name], before[name]).map(value => value * GEOMETRY.lduToMm)]));
}

/** Nontrivial loop intersection: alpha = lambda sin(alpha), lambda = r/R > 1. */
export function prolateCrossingPhasesRadians() {
    const lambda = GEOMETRY.prolateRadiusLdu / GEOMETRY.pitchRadiusLdu;
    if (!(lambda > 1)) throw new Error('A prolate loop requires marker radius greater than pitch radius');
    let low = 1e-8, high = Math.PI;
    for (let iteration = 0; iteration < 80; iteration++) {
        const middle = (low + high) / 2;
        if (middle - lambda * Math.sin(middle) > 0) high = middle;
        else low = middle;
    }
    const alpha = (low + high) / 2;
    return [Math.PI - alpha, Math.PI + alpha];
}

/** Pure analytic values for reviewing the design contract; never native proof. */
export function analyticalSummary() {
    const {pitchRadiusLdu: R, prolateRadiusLdu: q, lduToMm: mm} = GEOMETRY;
    const cusp = trajectory(Math.PI);
    const halfWindow = (GEOMETRY.cuspWindowDegrees[1] - GEOMETRY.cuspWindowDegrees[0]) / (2 * DEG);
    const cuspXSpan = 2 * R * (halfWindow - Math.sin(halfWindow));
    const cuspZSpan = R * (1 - Math.cos(halfWindow));
    const cuspPathLength = 8 * R * (1 - Math.cos(halfWindow / 2));
    const cuspCarriageTravel = 2 * R * halfWindow;
    const [backStart, backEnd] = GEOMETRY.prolateBacktrackingWindowDegrees.map(value => trajectory(value / DEG));
    const crossingPhases = prolateCrossingPhasesRadians();
    const crossingPoints = crossingPhases.map(theta => trajectory(theta).Q);
    // Composite Simpson integration is used only for the non-elementary full
    // prolate arc length. Its 7200 equal intervals are independent of native rows.
    const intervals = 7200, step = TAU / intervals;
    let integral = 0;
    for (let index = 0; index <= intervals; index++) {
        const weight = index === 0 || index === intervals ? 1 : index % 2 ? 4 : 2;
        integral += weight * norm(trajectory(index * step).derivatives.Q);
    }
    return {
        scope: 'independent mathematical prediction; not measured native runtime evidence',
        geometry: GEOMETRY,
        fullTurnCarriageTravelMm: TAU * R * mm,
        fullTurnCycloidPathLengthMm: 8 * R * mm,
        fullTurnProlatePathLengthMm: integral * step / 3 * mm,
        cycloidZSpanMm: 2 * R * mm,
        prolateZSpanMm: 2 * q * mm,
        cusp: {
            phaseDegrees: 180,
            pointMm: cusp.P.map(value => value * mm),
            idealInstantaneousSpeedMmPerRadian: 0,
            fixedWindowDegrees: [...GEOMETRY.cuspWindowDegrees],
            carriageTravelMm: cuspCarriageTravel * mm,
            tipAxisSpansMm: [cuspXSpan * mm, cuspZSpan * mm],
            tipBoundingDiagonalMm: Math.hypot(cuspXSpan, cuspZSpan) * mm,
            tipPathLengthMm: cuspPathLength * mm,
            tipPathLengthToCarriageTravelRatio: cuspPathLength / cuspCarriageTravel,
            maximumInstantaneousTipToCarriageSpeedRatio: 2 * Math.sin(halfWindow / 2),
        },
        prolateBacktracking: {
            fixedWindowDegrees: [...GEOMETRY.prolateBacktrackingWindowDegrees],
            carriageProgressMm: (backEnd.C[0] - backStart.C[0]) * mm,
            opposingMarkerProgressMm: (backStart.Q[0] - backEnd.Q[0]) * mm,
            centrePhaseSignedXSpeedRatio: 1 - q / R,
        },
        prolateLoopCrossing: {
            inputPhasesDegrees: crossingPhases.map(value => value * DEG),
            predictedPointMm: crossingPoints[0].map(value => value * mm),
            independentCoincidenceResidualMm: norm(difference(...crossingPoints)) * mm,
        },
        rackEndMarginsMm: [trajectory(0).rackEndMarginLdu, trajectory(TAU).rackEndMarginLdu].map(value => value * mm),
    };
}
