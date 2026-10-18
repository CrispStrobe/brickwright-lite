// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Spur gears mesh (coupling kind 'gear'): parallel axes, centre distance
// r1 + r2 (0.5 LDU), tooth faces within 4 LDU along the axis. The contact
// test is mech/gears.js's v1 meshContact spur branch, moved unchanged.

import {vecAdd, vecSub, vecDot, vecLen, vecScale, vecNormalize} from '../mech/vec.js';
import {TOL, parallelAxes} from './gear-mesh.js';

/** Where two spur gears touch: {P} on gear 1's pitch circle (LDU), or null. */
export const spurContact = (g1, g2) => {
    if (!parallelAxes(g1.axisLdu, g2.axisLdu)) return null;
    const delta = vecSub(g2.centerLdu, g1.centerLdu);
    const axial = vecDot(delta, g1.axisLdu);
    const perpVec = vecSub(delta, vecScale(g1.axisLdu, axial));
    if (Math.abs(vecLen(perpVec) - (g1.r + g2.r)) > TOL + 1e-9) return null;
    if (Math.abs(axial) > 4 + 1e-9) return null;
    const u = vecNormalize(perpVec);
    if (vecLen(u) < 1e-9) return null;
    return {P: vecAdd(g1.centerLdu, vecScale(u, g1.r))};
};

export const SPUR = {
    id: 'spur',
    kind: 'gear',
    mesh: {accepts: (t1, t2) => t1 === 'spur' && t2 === 'spur', contact: spurContact}
};
