// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Bevel gears mesh (coupling kind 'gear'): perpendicular axes meeting at O
// (0.5 LDU) with |c1 − O| = r2 and |c2 − O| = r1 (SEAT_TOL_LDU). The contact test is
// mech/gears.js's v1 meshContact bevel branch, moved unchanged.

import {vecAdd, vecSub, vecLen, vecScale, vecNormalize, vecDist, lineDistance, lineClosestMidpoint} from '../mech/vec.js';
import {TOL, perpendicularAxes} from './gear-mesh.js';

/**
 * LDU a bevel gear's centre may sit off the other gear's pitch radius from the apex. 1 LDU
 * until 2026-10-18; 2 since: LDraw's official differential assembly 65414c01 seats its 12T
 * satellites (pitch radius 15) 17 LDU from the apex. Within 1 LDU the contact point is the
 * v1 one (unchanged); beyond, the pitch point r1 from axis 1 and r2 from axis 2.
 */
export const SEAT_TOL_LDU = 2;

/** Where two bevel gears touch: {P} on gear 1's pitch circle (LDU), or null. */
export const bevelContact = (g1, g2) => {
    if (!perpendicularAxes(g1.axisLdu, g2.axisLdu)) return null;
    if (lineDistance(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu) > TOL + 1e-9) return null;
    const {mid: O} = lineClosestMidpoint(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu);
    const off1 = Math.abs(vecDist(g1.centerLdu, O) - g2.r);
    const off2 = Math.abs(vecDist(g2.centerLdu, O) - g1.r);
    if (off1 > SEAT_TOL_LDU + 1e-9 || off2 > SEAT_TOL_LDU + 1e-9) return null;
    const uVec = vecSub(g2.centerLdu, O);
    if (vecLen(uVec) < 1e-9) return null;
    if (off1 <= 1 + 1e-9 && off2 <= 1 + 1e-9) return {P: vecAdd(g1.centerLdu, vecScale(vecNormalize(uVec), g1.r))};
    // Further off the pitch cone (LDraw's differential): the point r1 from axis 1 and r2 from axis 2.
    const u1 = vecSub(g1.centerLdu, O);
    if (vecLen(u1) < 1e-9) return null;
    return {P: vecAdd(O, vecAdd(vecScale(vecNormalize(u1), g2.r), vecScale(vecNormalize(uVec), g1.r)))};
};

export const BEVEL = {
    id: 'bevel',
    kind: 'gear',
    mesh: {accepts: (t1, t2) => t1 === 'bevel' && t2 === 'bevel', contact: bevelContact}
};
