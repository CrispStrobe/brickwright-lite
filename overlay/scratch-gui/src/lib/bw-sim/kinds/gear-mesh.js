// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// What every tooth mesh shares (moved from mech/gears.js unchanged): axis
// tests and the contract ratio from the contact point. A gear here is the
// compiler's gear info: {type, teeth, r (pitch radius, LDU), centerLdu, axisLdu}
// in the LDraw model frame; a hinge is {joint, frame, sign} (mech/gears.js).

import {COS_1_DEG, SIN_1_DEG, vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize} from '../mech/vec.js';
import {dirToWorld, LDU_M} from '../contracts.js';

const COS_1 = COS_1_DEG;
const SIN_1 = SIN_1_DEG;
/** Positional tolerance, LDU. */
export const TOL = 0.5;

export const parallelAxes = (a1, a2) => Math.abs(vecDot(a1, a2)) >= COS_1 - 1e-12;
export const perpendicularAxes = (a1, a2) => Math.abs(vecDot(a1, a2)) <= SIN_1 + 1e-12;

/**
 * Signed contract ratio ω(h2) = ratio · ω(h1) for a mesh with contact point P.
 * @returns {number|null} null when degenerate
 */
export const meshRatio = (g1, h1, g2, h2, P) => {
    const a1 = vecScale(vecNormalize(dirToWorld(h1.joint.axis)), h1.sign);
    const a2 = vecScale(vecNormalize(dirToWorld(h2.joint.axis)), h2.sign);
    const cross1 = vecCross(a1, vecSub(P, g1.centerLdu));
    // Gear 2's lever at the contact is its pitch radius: the contact test accepts centres 0.5 LDU
    // off, and a lever measured to P would put that error into the ratio (a 28T turntable and an 8T
    // 0.28 LDU short of 45 LDU apart gave 3.6 instead of 28/8 = 3.5). The teeth set the ratio.
    const d2 = vecSub(P, g2.centerLdu);
    const radial2 = vecSub(d2, vecScale(a2, vecDot(d2, a2)));
    const cross2 = vecLen(radial2) > 1e-9 && g2.r > 0 ? vecCross(a2, vecScale(vecNormalize(radial2), g2.r)) : vecCross(a2, d2);
    const t = vecNormalize(cross1);
    if (vecLen(t) < 1e-9) return null;
    const den = vecDot(cross2, t);
    if (Math.abs(den) < 1e-12) return null;
    return vecDot(cross1, t) / den;
};

/** World point (metres) back to the LDraw model frame (LDU): the inverse of lduToWorld. */
const worldToLdu = p => [p[0] / LDU_M, -p[1] / LDU_M, -p[2] / LDU_M];

/**
 * The hinges a gear can turn on: hinge joints touching the gear's body whose
 * axis is the gear's own axis line (parallel within 1°, passing within
 * 0.5 LDU of the gear centre). (Moved from mech/gears.js unchanged.)
 * @param {object} gear gear info (islandId, centerLdu, axisLdu)
 * @param {Array} joints compiled joints
 * @returns {{joint: object, frame: string, sign: number}[]} sign +1 when the gear is on body2
 */
export const gearHinges = (gear, joints) => {
    const out = [];
    for (const j of joints) {
        if (j.type !== 'hinge') continue;
        let sign;
        let frame;
        if (j.body2 === gear.islandId) { sign = 1; frame = j.body1; }
        else if (j.body1 === gear.islandId) { sign = -1; frame = j.body2; }
        else continue;
        // dirToWorld flips y and z; it is its own inverse, so it maps the world axis back to LDU.
        const axisLdu = vecNormalize(dirToWorld(j.axis));
        if (!parallelAxes(gear.axisLdu, axisLdu)) continue;
        const d = vecSub(gear.centerLdu, worldToLdu(j.point));
        const perp = vecSub(d, vecScale(axisLdu, vecDot(d, axisLdu)));
        if (vecLen(perp) > TOL + 1e-9) continue;
        out.push({joint: j, frame, sign});
    }
    out.sort((a, b) => a.joint.id.localeCompare(b.joint.id));
    return out;
};
