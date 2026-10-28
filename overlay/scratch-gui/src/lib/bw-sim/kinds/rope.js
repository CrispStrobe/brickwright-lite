// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Ropes (docs/ROBOT-LAB-UX.md §15, architecture M10), from the model's `ropes` (editor/rope-path.js
// lays them: a drum, sheaves, a hook). A coupling 'rope' per rope, for physics/rope.js:
//
//   {drumJoint, drumSign, radiusM, points: [{body, local}], hook: {body, local}, lengthM}
//
// points[0] is the drum's centre on the body it turns in (the drum's hinge's other body; the drum
// itself when it turns on no hinge: then the rope has a fixed length), then each sheave's centre on
// its body; `hook` where the string is tied (the top of the hook part). Turning the drum by +θ
// about its signed hinge axis (+ on the drum's side, as for gears) winds the rope in: its free
// length is lengthM − r·θ. The approximation (the architecture's recommended v1): only the last
// segment, from the last point to the hook, is a constraint (slack allowed, never longer); the
// other segments are measured from the bodies each step, so a boom that luffs pays rope in or out.
import {vecSub} from '../mech/vec.js';
import {lduToWorld, LDU_M} from '../contracts.js';
import {gearHinges} from './gear-mesh.js';
import {placedCircle} from '../editor/belt-path.js';
import {ropePoints} from '../editor/rope-path.js';

const isVec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

export const ROPE = {
    id: 'rope',
    kind: 'rope',
    detect ({nodes, islands, joints, model, catalog}) {
        const couplings = [];
        const diagnostics = [];
        const nodeOf = new Map();
        for (const [nodeId, node] of nodes.entries()) if (!nodeOf.has(node.partId)) nodeOf.set(node.partId, {nodeId, node});
        const islandOf = id => { const n = nodeOf.get(id); return n ? islands.nodeToBody.get(n.nodeId) : null; };
        const bodyById = id => islands.bodies.find(b => b.id === id);
        for (const rope of (model && model.ropes) || []) {
            const pts = ropePoints({parts: [...nodeOf.values()].map(n => n.node.placed)}, catalog, rope.around);
            const drumNode = nodeOf.get(rope.around[0]);
            const circle = drumNode && placedCircle(drumNode.node.placed, drumNode.node.meta);
            const islandIds = rope.around.map(islandOf);
            if (!pts || !circle || islandIds.some(id => !id)) {
                diagnostics.push({severity: 'warning', code: 'rope-not-tied', parts: rope.around,
                    message: `The rope ${rope.id} is not tied to a round drum, so it does nothing.`});
                continue;
            }
            // The drum turns on a hinge: its centre is fixed in the hinge's other body (the frame).
            const drum = {islandId: islandIds[0], centerLdu: circle.center, axisLdu: circle.axis};
            const [hinge] = gearHinges(drum, joints);
            const at = (bodyId, ldu) => ({body: bodyId, local: vecSub(lduToWorld(ldu), bodyById(bodyId).position)});
            const points = [at(hinge ? hinge.frame : islandIds[0], pts[0]), ...pts.slice(1, -1).map((p, i) => at(islandIds[i + 1], p))];
            couplings.push({
                drumJoint: hinge ? hinge.joint.id : null,
                drumSign: hinge ? hinge.sign : 1,
                radiusM: circle.r * LDU_M,
                points,
                hook: at(islandIds.at(-1), pts.at(-1)),
                lengthM: rope.lengthLdu * LDU_M,
                parts: rope.around.slice()
            });
        }
        return {couplings, diagnostics};
    },
    validate (c, m) {
        const out = [];
        const bodies = new Set((m.bodies || []).map(b => b.id));
        const ok = p => p && bodies.has(p.body) && isVec(p.local);
        if (!Array.isArray(c.points) || !c.points.length || !c.points.every(ok)) out.push('points: [{body, local}] on known bodies');
        if (!ok(c.hook)) out.push('hook: {body, local} on a known body');
        if (!(c.radiusM > 0) || !(c.lengthM > 0)) out.push('radiusM, lengthM: positive');
        if (c.drumJoint !== null && !(m.joints || []).some(j => j.id === c.drumJoint && j.type === 'hinge')) out.push(`drumJoint: no hinge '${c.drumJoint}'`);
        return out;
    }
};

