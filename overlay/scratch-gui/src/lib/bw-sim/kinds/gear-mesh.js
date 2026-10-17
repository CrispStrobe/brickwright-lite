// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// What every tooth mesh shares (moved from mech/gears.js unchanged): axis
// tests and the contract ratio from the contact point. A gear here is the
// compiler's gear info: {type, teeth, r (pitch radius, LDU), centerLdu, axisLdu}
// in the LDraw model frame; a hinge is {joint, frame, sign} (mech/gears.js).

import {COS_1_DEG, SIN_1_DEG, vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize} from '../mech/vec.js';
import {dirToWorld} from '../contracts.js';

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
    const cross2 = vecCross(a2, vecSub(P, g2.centerLdu));
    const t = vecNormalize(cross1);
    if (vecLen(t) < 1e-9) return null;
    const den = vecDot(cross2, t);
    if (Math.abs(den) < 1e-12) return null;
    return vecDot(cross1, t) / den;
};
