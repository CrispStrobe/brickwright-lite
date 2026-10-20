// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rubber bands (docs/ROBOT-LAB-UX.md §12, architecture M11), from the model's `belts` (a band is
// not a placed part: editor/belt-path.js lays its path round the parts' circles):
//
//   - a BAND DRIVE ('band'): two or more of the parts turn on hinges in one frame F. They turn
//     the same way, ω_i = (r₀ / r_i) · ω₀ (equal speeds where the band runs), a_i the signed hinge
//     axes as for gears. A band slips under load: the core's coupling gets few velocity steps
//     (physics/jolt-core.js, BELT_VELOCITY_STEPS), so it gives where a chain would not;
//   - a SPRING ('spring'): a band round two parts on different bodies that do not both turn in
//     one frame (a return spring on an arm). Loop length round circles r₁, r₂ whose centres are d
//     apart: L ≈ 2d + π(r₁ + r₂), so beyond d₀ = (L₀ − π(r₁ + r₂)) / 2 (L₀ the band's rest
//     length) each strand pulls k·(L − L₀) and the two pull the centres together with
//     4k·(d − d₀); slack below d₀. The core makes that a distance constraint, free from 0 to d₀,
//     soft (a spring) beyond;
//   - a band round parts of one body, or round one turning and one fixed part, does nothing.
// Warnings: 'belt-not-round' (a part it goes round has no circle any more), 'belt-frames-differ'.

import {vecSub, vecDot, vecScale, vecNormalize} from '../mech/vec.js';
import {dirToWorld, lduToWorld, LDU_M} from '../contracts.js';
import {gearHinges} from './gear-mesh.js';
import {placedCircle, BANDS} from '../editor/belt-path.js';

/** A LEGO band's stiffness, per strand, for the 15 mm band (N/m); a longer band is softer in proportion. */
export const BAND_STIFFNESS_N_PER_M = 25;
/** Its damping (N·s/m): a rubber band rings a little. */
export const BAND_DAMPING = 0.02;

const isVec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/** What each band of the model is: {drive: [{g, hinge}...], frame} | {spring: [a, b]} | {} with the parts' circles. */
const analyse = ({nodes, islands, joints, model}) => {
    const out = [];
    const nodeOf = new Map();
    for (const [nodeId, node] of nodes.entries()) if (!nodeOf.has(node.partId)) nodeOf.set(node.partId, {nodeId, node});
    for (const belt of (model && model.belts) || []) {
        const band = BANDS.find(b => b.part === belt.band) || BANDS[0];
        const anchors = [];
        for (const id of belt.around) {
            const n = nodeOf.get(id);
            const c = n && placedCircle(n.node.placed, n.node.meta);
            const islandId = n && islands.nodeToBody.get(n.nodeId);
            if (!c || !islandId) { anchors.length = 0; break; }
            anchors.push({partId: id, islandId, centerLdu: c.center, axisLdu: c.axis, r: c.r});
        }
        if (anchors.length < 2) {
            out.push({belt, notRound: true});
            continue;
        }
        const hinged = anchors.map(g => ({g, hinges: gearHinges(g, joints)}));
        const frames = new Map();
        for (const x of hinged) for (const h of x.hinges) frames.set(h.frame, [...(frames.get(h.frame) || []), x]);
        const [frame, inFrame] = [...frames.entries()].sort((p, q) => q[1].length - p[1].length)[0] || [];
        if (inFrame && inFrame.length >= 2) {
            out.push({belt, band, drive: inFrame.map(x => ({g: x.g, hinge: x.hinges.find(h => h.frame === frame)})), frame,
                left: hinged.filter(x => !inFrame.includes(x) && x.hinges.length)});
        } else if (anchors.length === 2 && anchors[0].islandId !== anchors[1].islandId) {
            out.push({belt, band, spring: anchors});
        } else {
            out.push({belt, band});
        }
    }
    return out;
};

export const BAND_DRIVE = {
    id: 'band-drive',
    kind: 'band',
    detect (ctx) {
        const couplings = [];
        const diagnostics = [];
        for (const r of analyse(ctx)) {
            if (r.notRound) {
                diagnostics.push({severity: 'warning', code: 'belt-not-round', parts: r.belt.around,
                    message: `The rubber band ${r.belt.id} goes round a part it cannot hold on to, so it does nothing.`});
                continue;
            }
            if (!r.drive) continue;
            const [first, ...rest] = r.drive;
            const a0 = vecScale(vecNormalize(dirToWorld(first.hinge.joint.axis)), first.hinge.sign);
            for (const x of rest) {
                const a = vecScale(vecNormalize(dirToWorld(x.hinge.joint.axis)), x.hinge.sign);
                couplings.push({joint1: first.hinge.joint.id, joint2: x.hinge.joint.id, ratio: (first.g.r / x.g.r) * Math.sign(vecDot(a0, a)),
                    parts: [first.g.partId, x.g.partId]});
            }
            for (const x of r.left) {
                diagnostics.push({severity: 'warning', code: 'belt-frames-differ', parts: [first.g.partId, x.g.partId],
                    message: `The rubber band goes round ${first.g.partId} and ${x.g.partId}, but their axles sit in different parts, so it cannot drive one from the other.`});
            }
        }
        return {couplings, diagnostics};
    },
    validate (c, m) {
        const out = [];
        if (!(Number.isFinite(c.ratio) && c.ratio !== 0)) out.push('ratio: need a non-zero number');
        const joints = new Map((m.joints || []).map(j => [j.id, j]));
        for (const k of ['joint1', 'joint2']) if (!joints.get(c[k]) || joints.get(c[k]).type !== 'hinge') out.push(`${k}: need a hinge`);
        return out;
    },
    bodies (c, joints) {
        const j1 = joints.find(j => j.id === c.joint1);
        const j2 = joints.find(j => j.id === c.joint2);
        if (!j1 || !j2) return [];
        const shared = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
        const side = j => (j.body2 === shared ? j.body1 : j.body2);
        return [side(j1), side(j2)];
    }
};

export const BAND_SPRING = {
    id: 'band-spring',
    kind: 'spring',
    detect (ctx) {
        const couplings = [];
        for (const r of analyse(ctx)) {
            if (!r.spring) continue;
            const [p, q] = r.spring;
            const bodyOf = id => ctx.islands.bodies.find(b => b.id === id);
            const [b1, b2] = [bodyOf(p.islandId), bodyOf(q.islandId)];
            if (!b1 || !b2) continue;
            const restLdu = Math.max(0, (r.band.restLdu - Math.PI * (p.r + q.r)) / 2);
            const k = BAND_STIFFNESS_N_PER_M * (BANDS[0].restLdu / r.band.restLdu);
            couplings.push({body1: b1.id, local1: vecSub(lduToWorld(p.centerLdu), b1.position), body2: b2.id, local2: vecSub(lduToWorld(q.centerLdu), b2.position),
                restM: restLdu * LDU_M, stiffness: 4 * k, damping: BAND_DAMPING, parts: [p.partId, q.partId]});
        }
        return {couplings};
    },
    validate (c, m) {
        const out = [];
        const bodies = new Set((m.bodies || []).map(b => b.id));
        for (const k of ['body1', 'body2']) if (!bodies.has(c[k])) out.push(`${k}: unknown body '${c[k]}'`);
        for (const k of ['local1', 'local2']) if (!isVec(c[k])) out.push(`${k}: not a Vec3`);
        if (!(c.restM >= 0)) out.push('restM: a length ≥ 0 (m)');
        if (!(c.stiffness > 0) || !(c.damping >= 0)) out.push('stiffness > 0, damping ≥ 0');
        return out;
    }
};
