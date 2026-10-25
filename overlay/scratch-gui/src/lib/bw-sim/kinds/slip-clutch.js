// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Slip clutch (gearbox lane): the white 24-tooth clutch gear (LDraw 76019, the
// former 60c01; 76244 the same with a dark-stone centre). Its centre is an axle
// hole on a hub that turns inside the toothed ring against built-in friction, so
// the teeth pass on torque up to a limit and slip above it — a torque limiter.
//
// Connector kind 'clutch-axlehole': the hub's axle hole, `data.slipTorqueNm` the
// limit. An axle in it makes a HINGE edge (not the rigid edge of an axle in an
// axle hole), and mech/joints.js gives that hinge the slip torque as its
// `frictionNm`: Jolt holds a hinge's two bodies together until the torque across
// them exceeds the friction limit, then lets them slide at that torque — exactly
// a slip clutch. (The model puts the slip between the axle and the whole gear;
// in the part it is between the hub and the ring. The hub is a few tenths of a
// gram, so where the slip sits does not change what the axle and the teeth do.)
//
// The rating: LEGO moulds "2.5–5 Ncm" into the gear. R. Munafo (LUGNET
// robotics, 1999, https://news.lugnet.com/robotics/?n=6863) put it as "always
// slips above 5.0 N·cm, never below 2.5 N·cm"; where in between depends on wear;
// TechnicBricks and Sariel's gear tutorial cite the same stamped range. The
// simulation takes the middle of the stamped range, 3.75 N·cm.

import {shaftEngagement} from './pin-axle.js';

/** The stamped 2.5–5 N·cm range of the 24T clutch gear, N·m. */
export const SLIP_CLUTCH_RANGE_NM = Object.freeze([0.025, 0.05]);
/** The slip torque the simulation uses: the middle of the stamped range (N·m). */
export const SLIP_CLUTCH_24T_NM = (SLIP_CLUTCH_RANGE_NM[0] + SLIP_CLUTCH_RANGE_NM[1]) / 2;

const axleInClutch = {
    with: 'axle',
    edge: () => 'hinge',
    // The axle is the shaft in the hub's hole: the v1 seat rule with the roles as they are.
    match: (hole, axle) => shaftEngagement(axle, hole) !== null
};

export const CLUTCH_AXLEHOLE = {
    kind: 'clutch-axlehole',
    pairs: [axleInClutch],
    validate: c => {
        const out = [];
        if (!(typeof c.length === 'number' && c.length > 0)) out.push('a clutch-axlehole needs its length (LDU)');
        if (!(c.data && typeof c.data.slipTorqueNm === 'number' && c.data.slipTorqueNm > 0)) out.push('data.slipTorqueNm: the torque the clutch slips at (N·m)');
        return out;
    }
};

/**
 * The slip torque of a hinge made of graph edges (mech/joints.js): the largest
 * `data.slipTorqueNm` of a clutch-axlehole among the edges' connectors, or null.
 * @param {{edge: object}[]} members the joint's edges
 * @param {Map<string, object>} nodes graph nodes (connectors in the model frame, `_orig` the part's)
 */
export const slipTorqueOf = (members, nodes) => {
    let best = null;
    for (const {edge} of members) {
        for (const end of [edge.a, edge.b]) {
            const node = nodes.get(end.part);
            const c = node ? node.connectors.find(k => k.id === end.connector) : null;
            const t = c && c.type === 'clutch-axlehole' && c._orig && c._orig.data ? c._orig.data.slipTorqueNm : null;
            if (typeof t === 'number' && (best === null || t > best)) best = t;
        }
    }
    return best;
};
