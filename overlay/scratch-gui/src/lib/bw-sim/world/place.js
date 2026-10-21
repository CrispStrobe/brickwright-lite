// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Putting a model where a mat wants it: on the mat's documented start pose
// (bw-sim/world/mats.js), facing along the start heading. Rotating the LDraw
// model about its vertical axis BEFORE compiling keeps bodies, joints and
// sensor origins consistent — moving compiled bodies afterwards would leave
// the joint points and the sensors' t = 0 origins behind.
//
// The anchor is the point that lands on the start pose: for a driving base,
// the midpoint of its motorised wheel axles (driveAnchor), so a line follower
// starts with its axle centred on the line.

import {LDU_M} from '../contracts.js';
import {compile} from '../mech/compile.js';

/**
 * Turn `model` about the vertical so its forward (LDraw +z) points along
 * `start.heading` (degrees from world +x toward world +z), and move it so the
 * LDraw point `anchorLdu` lands on world (start.x, ·, start.z). Proper rotation;
 * the model's height is unchanged.
 */
export const placeOnStart = (model, start, anchorLdu) => {
    const h = start.heading * Math.PI / 180;
    const fx = Math.round(Math.cos(h) * 1e12) / 1e12;
    const fz = Math.round(-Math.sin(h) * 1e12) / 1e12;
    // Columns: +x -> (fz, 0, -fx), +y -> +y, +z -> (fx, 0, fz); det = +1.
    const P = [fz, 0, fx, 0, 1, 0, -fx, 0, fz];
    const mul = v => [0, 1, 2].map(i => P[3 * i] * v[0] + P[3 * i + 1] * v[1] + P[3 * i + 2] * v[2]);
    const matMul = M => {
        const out = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            out.push(P[3 * i] * M[j] + P[3 * i + 1] * M[3 + j] + P[3 * i + 2] * M[6 + j]);
        }
        return out.map(v => v + 0); // no -0
    };
    const a = mul(anchorLdu);
    const t = [start.x / LDU_M - a[0], 0, (0 - start.z) / LDU_M - a[2]];
    const moved = {
        ...model,
        parts: model.parts.map(p => ({...p, position: mul(p.position).map((v, i) => v + t[i]), rotation: matMul(p.rotation)}))
    };
    // Decoration (a cable's segments) goes with the parts it lies along.
    if (model.decor) moved.decor = model.decor.map(d => ({...d, position: mul(d.position).map((v, i) => v + t[i]), matrix: matMul(d.matrix)}));
    return moved;
};

/**
 * The LDraw point to put on a start pose: the midpoint of the model's
 * motorised hinge points (its drive axle), or the centre of its parts when it
 * has no motor.
 */
export const driveAnchor = (model, catalog) => {
    const mech = compile(model, catalog, {ground: false});
    const motors = mech.joints.filter(j => j.type === 'hinge' && j.motor);
    const toLdu = p => [p[0] / LDU_M, (0 - p[1]) / LDU_M, (0 - p[2]) / LDU_M];
    const pts = motors.length ? motors.map(j => toLdu(j.point)) : model.parts.map(p => p.position);
    if (!pts.length) return [0, 0, 0];
    return [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
};
