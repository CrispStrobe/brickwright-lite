// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Universal joint (Cardan joint): two Technic universal joint ends (62520 the 3L end, 3712 and 575
// the old 4L ends) fork in fork, the cross between them, join two axles that meet at an angle.
//
// Connector kind 'uj-fork': one per end, at the PIVOT (the centre of the cross the fork holds),
// `axis` along the fork's pin holes (the cross arm this end turns about), and `data.shaft` the unit
// direction from the pivot towards the end's own axle hole (part frame). Measured from LDraw's
// shortcuts: 61903 (Technic Universal Joint 3L, Complete) puts both 62520 at the cross centre, the
// second turned 90° about the shaft and flipped; 3712c01 / 575c01 put the 4L ends 30 LDU either side
// of it. The fork's pin holes are LDraw's 2 LDU rings on ±x through the pivot
// (test/bw-sim-part-meta.test.mjs). The cross (62519, 3326) is not a catalogue part: two ends placed
// fork in fork are a universal joint, as on the table, where they cannot be put together without it.
//
// Coupling module 'universal-joint' (kind 'universalJoint'): two uj-fork connectors of parts in
// different islands whose pivots meet (UJ_PIVOT_LDU) and whose fork axes are square to each other
// (the cross's arms, within UJ_SQUARE_DEG) are one joint:
//   {body1, body2, point (world m), fork1, fork2 (world unit: the arm each end turns about),
//    shaft1, shaft2 (world unit, from the pivot towards each end's axle), maxBendRad}
// The physics core (physics/universal-joint.js) builds it as the real thing, a cross body on two
// hinges, so the output's speed ripples as a single Cardan joint's does, ω2/ω1 = cos β / (1 − sin²β·cos²θ),
// and two in phase cancel. Bent past UJ_MAX_BEND_DEG ('uj-too-bent') or with forks not square
// ('uj-not-square'): a warning and no coupling.
import {vecSub, vecDot, vecLen, vecNormalize} from '../mech/vec.js';
import {dirToWorld, lduToWorld} from '../contracts.js';
import {toothConnectors, placedTooth} from './tooth-parts.js';

/** Two pivots this close are one cross centre (LDU). */
export const UJ_PIVOT_LDU = 1;
/** The two forks' arms must be square to each other within this (°). */
export const UJ_SQUARE_DEG = 3;
/**
 * How far a LEGO universal joint bends (°, between the two shafts and in each fork): the fork's shoulder
 * meets the other fork's arms. Builders' experience puts the working limit at about 45° ("anything over
 * 45 degrees is too much", Eurobricks forum, topic 170055 "a question regarding universal joints"); not a
 * measured number. Each of the two hinges through the cross is held to ±UJ_MAX_BEND_DEG from straight.
 */
export const UJ_MAX_BEND_DEG = 45;

const isUnit = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < 1e-6;
const DEG = Math.PI / 180;

const pivotsMeet = (a, b) => vecLen(vecSub(a.c.position, b.c.position)) <= UJ_PIVOT_LDU;

export const UNIVERSAL_JOINT = {
    id: 'universal-joint',
    kind: 'universalJoint',
    detect ({nodes, islands}) {
        const couplings = [];
        const diagnostics = [];
        const forks = toothConnectors(nodes, islands, 'uj-fork', ['shaft']).filter(f => isUnit(f.data.shaft));
        const used = new Set();
        for (let i = 0; i < forks.length; i++) {
            if (used.has(i)) continue;
            for (let k = i + 1; k < forks.length; k++) {
                if (used.has(k)) continue;
                const [a, b] = [forks[i], forks[k]];
                if (a.partId === b.partId || !pivotsMeet(a, b)) continue;
                used.add(i);
                used.add(k);
                const parts = [a.partId, b.partId];
                const square = Math.abs(vecDot(a.c.axis, b.c.axis));
                if (square > Math.sin(UJ_SQUARE_DEG * DEG)) {
                    diagnostics.push({severity: 'warning', code: 'uj-not-square', parts,
                        message: `The universal joint ends ${a.partId} and ${b.partId} meet, but their forks are not at right angles, so no cross fits between them.`});
                    break;
                }
                // Straight: each shaft points away from the pivot, opposite the other's.
                const bend = Math.acos(Math.max(-1, Math.min(1, -vecDot(a.data.shaft, b.data.shaft))));
                if (bend > UJ_MAX_BEND_DEG * DEG + 1e-9) {
                    diagnostics.push({severity: 'warning', code: 'uj-too-bent', parts,
                        message: `The universal joint ${a.partId}–${b.partId} is bent ${(bend / DEG).toFixed(1)}°; it bends at most ${UJ_MAX_BEND_DEG}°.`});
                    break;
                }
                if (a.islandId === b.islandId) break; // both ends on one rigid body: the joint cannot move
                const point = lduToWorld(a.c.position.map((v, n) => (v + b.c.position[n]) / 2));
                couplings.push({body1: a.islandId, body2: b.islandId, point,
                    fork1: vecNormalize(dirToWorld(a.c.axis)), fork2: vecNormalize(dirToWorld(b.c.axis)),
                    shaft1: vecNormalize(dirToWorld(a.data.shaft)), shaft2: vecNormalize(dirToWorld(b.data.shaft)),
                    maxBendRad: UJ_MAX_BEND_DEG * DEG, parts});
                break;
            }
        }
        return {couplings, diagnostics};
    },
    validate (c, m) {
        const out = [];
        const bodies = new Set((m.bodies || []).map(b => b.id));
        for (const k of ['body1', 'body2']) if (!bodies.has(c[k])) out.push(`${k}: unknown body '${c[k]}'`);
        if (c.body1 === c.body2) out.push('joins a body to itself');
        if (!(Array.isArray(c.point) && c.point.length === 3 && c.point.every(Number.isFinite))) out.push('point: not a Vec3');
        for (const k of ['fork1', 'fork2', 'shaft1', 'shaft2']) if (!isUnit(c[k])) out.push(`${k}: need a unit vector`);
        if (isUnit(c.fork1) && isUnit(c.fork2) && Math.abs(vecDot(c.fork1, c.fork2)) > Math.sin(UJ_SQUARE_DEG * DEG)) out.push('fork1, fork2: the cross\'s arms are square to each other');
        for (const n of [1, 2]) {
            if (isUnit(c[`fork${n}`]) && isUnit(c[`shaft${n}`]) && Math.abs(vecDot(c[`fork${n}`], c[`shaft${n}`])) > 1e-3) out.push(`shaft${n}: square to fork${n}`);
        }
        if (!(c.maxBendRad > 0 && c.maxBendRad < Math.PI / 2)) out.push('maxBendRad: in (0, π/2)');
        return out;
    },
    /** The two ends' bodies (no-collide: their forks interleave round the cross). */
    bodies (c) {
        return [c.body1, c.body2];
    },
    /** The editor's overlap rule: two ends fork in fork share the cross's volume. */
    placedMesh (a, metaA, b, metaB) {
        const fa = placedTooth(a, metaA, 'uj-fork');
        const fb = placedTooth(b, metaB, 'uj-fork');
        return fa.some(p => fb.some(q => pivotsMeet(p, q)));
    }
};

/** The connector kind: its data checked here (validatePartMeta with the registry). */
export const UJ_FORK = {
    kind: 'uj-fork',
    validate (c) {
        const out = [];
        if (!c.data || !isUnit(c.data.shaft)) out.push('data.shaft: the unit direction from the pivot to the end\'s axle hole');
        else if (Math.abs(vecDot(c.data.shaft, c.axis)) > 1e-6) out.push('data.shaft: must be square to the fork\'s pin axis (axis)');
        return out;
    }
};
