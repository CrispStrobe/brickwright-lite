// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Constant-velocity joint: a Technic CV joint's male end (52731, on the drive axle) seated in its female socket (the
// planetary wheel hub 46490c01's driving shaft), as the Control+ off-roaders and rally cars drive their steered
// wheels. Connector kinds 'cv-ball' and 'cv-socket': one at the joint's PIVOT (the ball's centre), `data.shaft` the
// unit direction from the pivot towards the end's own shaft (part frame), `axis` any direction square to it.
//
// Coupling module 'cv-joint' (kind 'cvJoint'): a cv-ball and a cv-socket of parts in different islands whose pivots
// meet (CV_PIVOT_LDU) are one joint, built by the physics core as a universal joint (physics/universal-joint.js: a
// cross body on two hinges, the same coupling record as kinds/universal-joint.js). A CV joint has no forks, so the
// cross's arms are chosen square to the shafts and to each other. Approximation: a Cardan joint's output ripples
// with the bend (ω2/ω1 = cos β / (1 − sin²β·cos²θ)) where a CV joint's does not; at a steering angle of 20° that is
// ±6 %. Bent past UJ_MAX_BEND_DEG: a warning and no coupling. Added, not edited into universal-joint.js
// (kinds/index.js: kinds are added, never edited).

import {vecDot, vecLen, vecSub, vecNormalize, vecCross} from '../mech/vec.js';
import {dirToWorld, lduToWorld} from '../contracts.js';
import {toothConnectors} from './tooth-parts.js';
import {UNIVERSAL_JOINT, UJ_MAX_BEND_DEG} from './universal-joint.js';

/** A seated ball's centre is within this of its socket's (LDU). */
export const CV_PIVOT_LDU = 2;

const DEG = Math.PI / 180;
const isUnit = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < 1e-6;

/** A unit vector square to unit a. */
const squareTo = a => vecNormalize(vecCross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));

export const CV_JOINT = {
    id: 'cv-joint',
    kind: 'cvJoint',
    detect ({nodes, islands}) {
        const couplings = [];
        const diagnostics = [];
        const balls = toothConnectors(nodes, islands, 'cv-ball', ['shaft']).filter(f => isUnit(f.data.shaft));
        const sockets = toothConnectors(nodes, islands, 'cv-socket', ['shaft']).filter(f => isUnit(f.data.shaft));
        const used = new Set();
        for (const a of balls) {
            const b = sockets.find(s => !used.has(s) && s.partId !== a.partId && vecLen(vecSub(a.c.position, s.c.position)) <= CV_PIVOT_LDU);
            if (!b) continue;
            used.add(b);
            const parts = [a.partId, b.partId];
            const bend = Math.acos(Math.max(-1, Math.min(1, -vecDot(a.data.shaft, b.data.shaft))));
            if (bend > UJ_MAX_BEND_DEG * DEG + 1e-9) {
                diagnostics.push({severity: 'warning', code: 'uj-too-bent', parts,
                    message: `The CV joint ${a.partId}–${b.partId} is bent ${(bend / DEG).toFixed(1)}°; it bends at most ${UJ_MAX_BEND_DEG}°.`});
                continue;
            }
            if (a.islandId === b.islandId) continue; // both ends on one rigid body: the joint cannot move
            const shaft1 = vecNormalize(dirToWorld(a.data.shaft));
            const shaft2 = vecNormalize(dirToWorld(b.data.shaft));
            const fork1 = squareTo(shaft1);
            const fork2 = vecNormalize(vecCross(shaft2, fork1));
            couplings.push({body1: a.islandId, body2: b.islandId, point: lduToWorld(a.c.position.map((v, n) => (v + b.c.position[n]) / 2)),
                fork1, fork2, shaft1, shaft2, maxBendRad: UJ_MAX_BEND_DEG * DEG, parts});
        }
        return {couplings, diagnostics};
    },
    validate: UNIVERSAL_JOINT.validate,
    bodies: UNIVERSAL_JOINT.bodies
};

const shaftData = kind => ({
    kind,
    validate (c) {
        const out = [];
        if (!c.data || !isUnit(c.data.shaft)) out.push('data.shaft: the unit direction from the pivot to the end\'s shaft');
        else if (Math.abs(vecDot(c.data.shaft, c.axis)) > 1e-6) out.push('data.shaft: must be square to axis');
        return out;
    }
});

/** The connector kinds: the male end's ball, the female end's socket. */
export const CV_BALL = shaftData('cv-ball');
export const CV_SOCKET = shaftData('cv-socket');
