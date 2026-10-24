// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Circle Splitter as measured from the recorded bodies: the two tile centres
// must trace straight, perpendicular lines of the same 80 mm stroke, the bar
// between them must keep its 40 mm length, and the planet gear must turn
// backwards at twice the carrier's rate relative to the carrier itself.
//
// Nothing here is computed from the input formula: the marker positions come
// from the recorded body poses and the gear angles from the compiled joints.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = a => Math.hypot(...a);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = norm(a) || 1; return a.map(v => v / n); };
const unwrap = xs => {
    let previous = xs[0];
    let total = previous;
    return xs.map(x => {
        const delta = Math.atan2(Math.sin(x - previous), Math.cos(x - previous));
        total += delta;
        previous = x;
        return total;
    });
};
const DEG = 180 / Math.PI;

/** The best-fit line of a point cloud: its direction and the largest distance from it. */
const bestFitLine = points => {
    const centre = points.reduce((acc, p) => acc.map((v, i) => v + p[i]), [0, 0, 0]).map(v => v / points.length);
    const rows = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of points) {
        const d = sub(p, centre);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rows[i][j] += d[i] * d[j];
    }
    // Power iteration: the dominant eigenvector of the scatter matrix is the line's direction.
    let v = [1, 0.6, 0.3];
    for (let i = 0; i < 200; i++) {
        const next = [0, 1, 2].map(k => rows[0][k] * v[0] + rows[1][k] * v[1] + rows[2][k] * v[2]);
        const n = norm(next);
        if (n < 1e-12) break;
        v = next.map(x => x / n);
    }
    const direction = unit(v);
    const distances = points.map(p => norm(cross(sub(p, centre), direction)));
    const along = points.map(p => dot(sub(p, centre), direction));
    return {centre, direction, deviation: Math.max(...distances), extent: Math.max(...along) - Math.min(...along)};
};

/**
 * Measure the delivered Circle Splitter run.
 * @param {object} r the run record (track, mechanism, runModel)
 * @returns {object} the measured numbers
 */
export function judgeCircleSplitter(id, r) {
    assert.deepEqual(r.issues.filter(issue => issue.severity === 'error'), []);
    assert.deepEqual(r.mechanism.actuators.map(actuator => actuator.port), ['A']);
    const o = observeAddon(r);

    // observeAddon expresses every point in the chassis body's own frame, so the
    // marker paths are already free of the chassis' own drift.
    const markerPoints = id => r.track.map(frame => o.point(frame, id).map(v => v * 1000));
    const plus = markerPoints('tip_plus');
    const minus = markerPoints('tip_minus');

    const separation = plus.map((p, i) => norm(sub(p, minus[i])));
    const linePlus = bestFitLine(plus);
    const lineMinus = bestFitLine(minus);
    const perpendicular = Math.abs(dot(linePlus.direction, lineMinus.direction));

    const jointOf = (body1, body2) => r.mechanism.joints.find(j => j.body1 === body1 && j.body2 === body2) ||
        r.mechanism.joints.find(j => j.body1 === body2 && j.body2 === body1);
    const carrierJoint = jointOf('b1', 'b0');
    const planetJoint = jointOf('b1', 'b4');
    assert.ok(carrierJoint && planetJoint, 'the carrier and planet hinges exist');
    const carrier = unwrap(r.track.map(frame => frame.joints[carrierJoint.id].angle));
    const planetRelative = unwrap(r.track.map(frame => frame.joints[planetJoint.id].angle));
    const span = xs => (Math.max(...xs) - Math.min(...xs)) * DEG;
    const carrierTurn = span(carrier);
    const planetRelativeTurn = span(planetRelative);
    // The first quarter turn of the carrier, with the planet's relative turn over the
    // same window: the planet turns backwards at twice the carrier's rate.
    const firstLeg = carrier.findIndex(angle => Math.abs(angle - carrier[0]) >= 90 / DEG);
    assert.ok(firstLeg > 0, 'the carrier completes a quarter turn');
    const legCarrier = (carrier[firstLeg] - carrier[0]) * DEG;
    const legPlanet = (planetRelative[firstLeg] - planetRelative[0]) * DEG;
    const ratio = legCarrier === 0 ? NaN : legPlanet / legCarrier;

    const spans = [linePlus.extent, lineMinus.extent];
    const deviation = Math.max(linePlus.deviation, lineMinus.deviation);
    const separationMean = separation.reduce((s, v) => s + v, 0) / separation.length;
    const separationRange = Math.max(...separation) - Math.min(...separation);

    assert.ok(carrierTurn >= 350, `the carrier turns ${carrierTurn.toFixed(1)}°`);
    assert.ok(deviation <= 0.6, `each tile centre stays on its line (${deviation.toFixed(3)} mm)`);
    assert.ok(spans.every(s => Math.abs(s - 80) <= 3), `both strokes are 80 mm (${spans.map(s => s.toFixed(2)).join(', ')} mm)`);
    assert.ok(perpendicular <= 0.03, `the two lines are perpendicular (${(Math.asin(perpendicular) * DEG).toFixed(2)}°)`);
    assert.ok(Math.abs(separationMean - 40) <= 0.6 && separationRange <= 0.6,
        `the bar keeps its 40 mm length (${separationMean.toFixed(3)} mm, range ${separationRange.toFixed(3)} mm)`);
    assert.ok(Math.abs(ratio + 2) <= 0.05, `the planet turns back at twice the carrier's rate (${ratio.toFixed(3)})`);
    assert.ok(Math.abs(planetRelativeTurn / carrierTurn - 2) <= 0.05,
        `the planet's relative turn is twice the carrier's (${(planetRelativeTurn / carrierTurn).toFixed(3)})`);

    return {
        carrierTurnDegrees: carrierTurn,
        planetRelativeTurnDegrees: planetRelativeTurn,
        planetRelativeRatio: ratio,
        planetSpanRatio: planetRelativeTurn / carrierTurn,
        strokesMm: spans,
        lineDeviationMm: deviation,
        linesAngleDegrees: Math.asin(perpendicular) * DEG,
        separationMm: separationMean,
        separationRangeMm: separationRange,
        offLineMm: deviation
    };
}
