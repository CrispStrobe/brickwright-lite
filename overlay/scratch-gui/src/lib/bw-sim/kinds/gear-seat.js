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

import {COS_1_DEG, vecSub, vecDot, vecLen, vecScale, vecDist, vecAdd, vecNormalize, mat3MulVec3} from '../mech/vec.js';
import {placedTooth} from './tooth-parts.js';

const TOL = 0.5 + 1e-9;

/** The gear's axle hole sits in the cradle: coaxial, centres together along the axis. */
export const seatHolds = (seat, hole) => {
    if (Math.abs(vecDot(seat.axis, hole.axis)) < COS_1_DEG - 1e-12) return false;
    const d = vecSub(hole.position, seat.position);
    const along = vecDot(d, seat.axis);
    return Math.abs(along) <= TOL && vecLen(vecSub(d, vecScale(seat.axis, along))) <= TOL;
};

/** LDU from a differential's centre line within which its inner gears sit (the satellites: 17). */
const INNER_RADIUS_LDU = 20;

/**
 * Is a gear part placed inside the housing (a casing with seats, or its snapped-on cover)? Its
 * gear centre within INNER_RADIUS_LDU of the housing's own centre line (the line through its
 * round hole) and `reach` LDU along it, or sitting in one of the seats.
 */
const gearInside = (housing, mh, q, mq, reach) => {
    if (!mq || !mq.gear) return false;
    const c = vecAdd(mat3MulVec3(q.rotation, mq.gear.center), q.position);
    const seats = placedTooth(housing, mh, 'gear-seat');
    if (seats.some(s => vecDist(s.c.position, c) <= 0.5 + 1e-9)) return true;
    const hole = (mh.connectors || []).find(k => k.type === 'pinhole');
    if (!hole) return false;
    const p0 = vecAdd(mat3MulVec3(housing.rotation, hole.position), housing.position);
    const ax = vecNormalize(mat3MulVec3(housing.rotation, hole.axis));
    const d = vecSub(c, p0);
    const along = vecDot(d, ax);
    return vecLen(vecSub(d, vecScale(ax, along))) <= INNER_RADIUS_LDU + 1e-9 && Math.abs(along) <= reach;
};

export const GEAR_SEAT = {
    kind: 'gear-seat',
    pairs: [{with: 'axlehole', edge: () => 'hinge', match: (seat, hole) => seatHolds(seat, hole)}],
    /**
     * The editor's overlap rule: a differential's satellites and side gears turn inside its casing
     * (whose collider is the casing's solid outline), and its cover closes over it.
     */
    placedShare: (p, mp, q, mq) => {
        if (!placedTooth(p, mp, 'gear-seat').length) return false;
        if (gearInside(p, mp, q, mq, 50)) return true;
        const snaps = placedTooth(p, mp, 'snap');
        return placedTooth(q, mq, 'snap').some(a => snaps.some(b => vecDist(a.c.position, b.c.position) <= 0.5 + 1e-9));
    }
};

export const SNAP = {
    kind: 'snap',
    coincide: true,
    /** A cover (a snap and no seats) closes over the side gear and the satellites next to it. */
    placedShare: (p, mp, q, mq) => !placedTooth(p, mp, 'gear-seat').length && placedTooth(p, mp, 'snap').length > 0 &&
        !(mq && mq.gear && placedTooth(q, mq, 'snap').length) && gearInside(p, mp, q, mq, 25),
    pairs: [{with: 'snap', edge: () => 'rigid',
        match: (a, b) => vecDist(a.position, b.position) <= TOL && vecDot(a.axis, b.axis) >= COS_1_DEG - 1e-12}]
};
