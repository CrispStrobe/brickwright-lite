// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Bevel gears mesh (coupling kind 'gear'): perpendicular axes meeting at O
// (0.5 LDU) with |c1 − O| = r2 and |c2 − O| = r1 (1 LDU). The contact test is
// mech/gears.js's v1 meshContact bevel branch, moved unchanged.

import {vecAdd, vecSub, vecLen, vecScale, vecNormalize, vecDist, lineDistance, lineClosestMidpoint} from '../mech/vec.js';
import {TOL, perpendicularAxes} from './gear-mesh.js';

/** Where two bevel gears touch: {P} on gear 1's pitch circle (LDU), or null. */
export const bevelContact = (g1, g2) => {
    if (!perpendicularAxes(g1.axisLdu, g2.axisLdu)) return null;
    if (lineDistance(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu) > TOL + 1e-9) return null;
    const {mid: O} = lineClosestMidpoint(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu);
    if (Math.abs(vecDist(g1.centerLdu, O) - g2.r) > 1 + 1e-9) return null;
    if (Math.abs(vecDist(g2.centerLdu, O) - g1.r) > 1 + 1e-9) return null;
    const uVec = vecSub(g2.centerLdu, O);
    if (vecLen(uVec) < 1e-9) return null;
    return {P: vecAdd(g1.centerLdu, vecScale(vecNormalize(uVec), g1.r))};
};

export const BEVEL = {
    id: 'bevel',
    kind: 'gear',
    mesh: {accepts: (t1, t2) => t1 === 'bevel' && t2 === 'bevel', contact: bevelContact}
};
