// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Differential casing seats (gearbox lane). The current Technic differential
// (LDraw 65414, "Casing for 5 Internal Gears") holds its three satellite bevel
// gears in half-round cradles, not on axles, and is closed by a 28-tooth double
// bevel gear (65413) that clips onto it. Neither joint is drawn with an LDraw
// connection primitive. Where they are comes from LDraw's own assembly of the
// part, the official shortcut 65414c01 ("Differential with Red 28 Tooth Drive
// Gear and Tan Satellites"): scripts/derive-part-meta.mjs reads the satellites'
// and the drive gear's placements in it (transmissionFromAssembly).
//
//   gear-seat  a cradle: position = where the satellite's axle hole centre sits,
//              axis = the satellite's axis. A gear's axle hole in it makes a HINGE
//              edge (the satellite turns in its cradle): coaxial (1°, 0.5 LDU) and
//              at the same place along the axis (0.5 LDU).
//   snap       a clip between two parts: position and axis the same in both. Two
//              snaps that coincide (0.5 LDU, axes the same way within 1°) make a
//              RIGID edge (the drive gear on its casing).

import {COS_1_DEG, vecSub, vecDot, vecLen, vecScale, vecDist} from '../mech/vec.js';

const TOL = 0.5 + 1e-9;

/** The gear's axle hole sits in the cradle: coaxial, centres together along the axis. */
export const seatHolds = (seat, hole) => {
    if (Math.abs(vecDot(seat.axis, hole.axis)) < COS_1_DEG - 1e-12) return false;
    const d = vecSub(hole.position, seat.position);
    const along = vecDot(d, seat.axis);
    return Math.abs(along) <= TOL && vecLen(vecSub(d, vecScale(seat.axis, along))) <= TOL;
};

export const GEAR_SEAT = {
    kind: 'gear-seat',
    pairs: [{with: 'axlehole', edge: () => 'hinge', match: (seat, hole) => seatHolds(seat, hole)}]
};

export const SNAP = {
    kind: 'snap',
    coincide: true,
    pairs: [{with: 'snap', edge: () => 'rigid',
        match: (a, b) => vecDist(a.position, b.position) <= TOL && vecDot(a.axis, b.axis) >= COS_1_DEG - 1e-12}]
};
