// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The v1 connector kinds as registry modules (docs/ROBOT-LAB-ARCHITECTURE.md
// §6.2): pin, axle, stud, ball going into pinhole, axlehole, antistud,
// ballsocket. The rules are MOVED here from mech/graph.js and
// editor/overlap.js unchanged (graph.js and overlap.js re-export them):
//
//   pin + pinhole        rigid (friction pin) or hinge (`friction: false`)
//   axle + axlehole      rigid
//   axle + pinhole       hinge
//   stud + antistud      rigid, centres within 0.5 LDU
//   ball + ballsocket    ball (free pivot), centres within 0.5 LDU
//
// A shaft seats in a hole by shaftEngagement: coaxial, engaged at least
// MIN_ENGAGE_LDU (the short-shaft rule), never past a blind hole's bottom
// (`closedEnd`). Collider `region`s mark the shaft part of a part that is also
// solid (solidColliders), for the editor's overlap rule.

import {COS_1_DEG, vecSub, vecDot, vecLen, vecScale, vecDist} from '../mech/vec.js';

const TOL = 0.5 + 1e-9;
/**
 * How far off its hole's line a shaft may lie and still be in it (LDU). A shaft cannot really be off its line
 * (its radius is the bore's), so a file that says so has an author's or a converter's error in it: real models
 * from the LDraw library, MLCad's rounded matrices and LDCad's, are off by up to about 2 LDU. Holes are 10 LDU
 * apart at the nearest (a half-stud offset), so this cannot find the wrong one.
 */
const SHAFT_TOL = 2.5 + 1e-9;
const COS_1 = COS_1_DEG;

const isShaftType = t => t === 'axle' || t === 'pin' || t === 'stud';
const isHoleType = t => t === 'pinhole' || t === 'axlehole' || t === 'antistud';

export const isShaftTypeExport = isShaftType;
export const isHoleTypeExport = isHoleType;

/**
 * Determine the edge kind for a shaft/hole pair. Returns 'rigid'|'hinge'|'ball'|null.
 */
export const edgeKind = (shaft, hole) => {
    if (shaft.type === 'pin' && hole.type === 'pinhole') {
        return shaft.friction === false ? 'hinge' : 'rigid';
    }
    if (shaft.type === 'axle' && hole.type === 'axlehole') return 'rigid';
    if (shaft.type === 'axle' && hole.type === 'pinhole') return 'hinge';
    if (shaft.type === 'stud' && hole.type === 'antistud') return 'rigid';
    if (shaft.type === 'ball' && hole.type === 'ballsocket') return 'ball';
    if (shaft.type === 'ballsocket' && hole.type === 'ball') return 'ball'; // symmetric, caller normalises
    return null;
};

/**
 * How far a shaft must reach into a hole to be held, in LDU (along their common axis).
 *
 * Technic lengths come on a 10 LDU lattice (a pin half and a beam's hole are 20, a thin
 * liftarm's hole, a half bush and a bevel gear's hub 10), so a real seat engages 10, 20,
 * ... LDU; a shaft that ends at a hole's face engages 0. A partly inserted axle still holds
 * in reality (the towball 2736's 17.5 LDU stub in a 20 LDU hole), so a shaft seats when it
 * engages at least 8 LDU: 2 LDU of slack under the shortest real seat (a 10 LDU hole), far
 * above the ±0.5 LDU of a face-to-face contact. A hole or shaft shorter than that seats on
 * its full length.
 */
export const MIN_ENGAGE_LDU = 8;

/**
 * Engaged length of a shaft connector in a hole connector (both in one frame, LDU), or
 * null when the shaft does not seat: axes parallel (1°) and coaxial (0.5 LDU), the two
 * segments (`length` along `axis`, centred on `position`) overlapping by at least
 * min(MIN_ENGAGE_LDU, shaft length, hole length), and — for a blind hole (`closedEnd`
 * ±1: which end of the hole's segment, along its axis, is the bottom) — the shaft not
 * reaching past the bottom (0.5 LDU tolerance). Applies to every shaft length alike
 * (pins, half pins, 3L pins, axles, axle pins, stubs).
 * @param {{position: number[], axis: number[], length?: number}} shaft
 * @param {{position: number[], axis: number[], length?: number, closedEnd?: number}} hole
 * @returns {number|null}
 */
export const shaftEngagement = (shaft, hole) => {
    const dot = vecDot(shaft.axis, hole.axis);
    if (Math.abs(dot) < COS_1 - 1e-12) return null;
    const delta = vecSub(hole.position, shaft.position);
    const axial = vecDot(delta, shaft.axis);
    const perp = vecSub(delta, vecScale(shaft.axis, axial));
    if (vecLen(perp) > SHAFT_TOL) return null;
    const Ls = shaft.length; const Lh = hole.length;
    if (Ls === undefined || Lh === undefined) return null;
    // Along the shaft's axis: shaft [-Ls/2, Ls/2], hole [axial - Lh/2, axial + Lh/2].
    const engaged = Math.min(Ls / 2, axial + Lh / 2) - Math.max(-Ls / 2, axial - Lh / 2);
    if (engaged < Math.min(MIN_ENGAGE_LDU, Ls, Lh) - 1e-9) return null;
    if (hole.closedEnd === 1 || hole.closedEnd === -1) {
        const bottomSide = hole.closedEnd * Math.sign(dot);
        const bottom = axial + bottomSide * Lh / 2;
        if (bottomSide > 0 ? Ls / 2 > bottom + 0.5 + 1e-9 : -Ls / 2 < bottom - 0.5 - 1e-9) return null;
    }
    return engaged;
};

/**
 * Check if shaft/hole geometry matches (shaft types except stud/antistud already handled,
 * ball handled separately).
 * @param {object} shaft transformed shaft connector (model LDU)
 * @param {object} hole transformed hole connector (model LDU)
 * @returns {boolean}
 */
export const geometryMatchesShaftHole = (shaft, hole) => shaftEngagement(shaft, hole) !== null;

/** Ball in socket and stud in antistud: the two centres coincide (0.5 LDU). */
const centresMeet = (s, h) => !(vecDist(s.position, h.position) > TOL);

// ---- region-tagged colliders (moved from editor/overlap.js) ------------------

/** Connector types of parts that legitimately sit inside another part's hole or socket. */
export const SHAFT_TYPES = new Set(['pin', 'axle', 'ball']);
/**
 * Collider `region`s that are a shaft: the volume of a pin, axle or ball that sits
 * inside another part's hole or socket, and a System part's stud layer, which sits
 * inside the hollow underside of the part on top of it. A collider without a region is solid.
 */
export const SHAFT_REGIONS = Object.freeze(['pin', 'axle', 'ball', 'stud']);

/**
 * Indices of a part's SOLID colliders: the volume that must not share space with
 * another part's solid volume. A part that is partly shaft and partly solid
 * (87082: two pin ends and a centre with a pin hole; 32054: a pin and its stop
 * bush) tags its shaft colliders `region: 'pin'|'axle'|'ball'`; the rest are
 * solid. A part that tags none is wholly shaft when every connector is a pin,
 * axle or ball (a plain pin or axle, the castor ball), else wholly solid.
 * @param {object} meta PartMeta
 * @returns {number[]}
 */
export const solidColliders = meta => {
    if (!meta || !Array.isArray(meta.colliders)) return [];
    const all = meta.colliders.map((_, i) => i);
    if (meta.colliders.some(c => c.region !== undefined)) return all.filter(i => !SHAFT_REGIONS.includes(meta.colliders[i].region));
    const allShaft = Array.isArray(meta.connectors) && meta.connectors.length > 0 && meta.connectors.every(c => SHAFT_TYPES.has(c.type));
    return allShaft ? [] : all;
};

// ---- the registry modules ------------------------------------------------------

const seats = (s, h) => geometryMatchesShaftHole(s, h);
const rule = (hole, match) => ({with: hole, edge: edgeKind, match});

/** @type {object[]} ConnectorKindRegistry modules */
export const PIN_AXLE_KINDS = [
    {kind: 'pin', shaft: true, pairs: [rule('pinhole', seats)]},
    {kind: 'axle', shaft: true, pairs: [rule('axlehole', seats), rule('pinhole', seats)]},
    {kind: 'stud', shaft: true, pairs: [rule('antistud', centresMeet)]},
    {kind: 'ball', shaft: true, pairs: [rule('ballsocket', centresMeet)]},
    {kind: 'pinhole'},
    {kind: 'axlehole'},
    {kind: 'antistud'},
    {kind: 'ballsocket'}
];
