// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rack and pinion (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M4, slice R4).
//
// Connector kind 'rack-teeth': a rack's toothed strip. `position` is the middle
// of its PITCH LINE (tooth tip − one module, 2.5 LDU), `axis` runs along the
// rack, `length` is the toothed length, and `data` holds
//   normal    the direction the teeth face (part frame, unit), and
//   widthLdu  the teeth's width across the rack.
// test/bw-sim-part-meta.test.mjs measures all of it from the LDraw mesh.
//
// Coupling module 'rack' (kind 'rackAndPinion'): a spur gear meshes with a
// rack when its axis runs along the teeth (perpendicular to the rack and to its
// normal, 1°), its centre is one pitch radius out along the normal from the
// pitch line (0.5 LDU), its mid-plane is within the teeth's width, and its
// centre is over the toothed length. The pinion must turn on a hinge in a frame
// F, and the rack's body must SLIDE relative to F (a slider joint between the
// two, kinds/slide.js): then the coupling is v(slider) = ratio · ω(hinge) with
//     ratio = σ · (a × d) · s          (m per rad)
// a the pinion's signed hinge axis (the gear-mesh convention: + on body2),
// d the pinion centre → contact point (m, |d| = pitch radius), s the slider's
// axis, σ = +1 when the rack is the slider's body2, −1 when body1. Its size is
// the pitch radius (8T: 4 mm), its sign the geometry's — derived, never measured
// from a run (the core: physics/jolt-core.js, R3).
//
// The slider gets a travel limit from the teeth: the contact point stays on
// the toothed length (the pinion would run off the rack's end). It is returned
// as `limits` and the compiler narrows the slider's own (kinds/slide.js: the
// bores on their axles) to it.
//
// Topologies:
//   - the rack fixed to the pinion's frame (its island IS F): the pinion cannot
//     turn — it locks, as a gear on the frame its partner turns in does
//     (gear-on-frame): the two bodies are welded and the warning says so;
//   - the rack on a body that does not slide relative to F: no coupling, the
//     'rack-not-sliding' warning (nothing in the model lets the rack move).
// The physics core couples the pinion's and the rack's WORLD rates (Jolt's
// RackAndPinionConstraint): exact while F neither turns about the pinion axis
// nor moves along the rack — a motor fixed in the machine driving a moving
// rack (the forklift's mast). A pinion that climbs a fixed rack (its frame
// rides on the slider) is not that case (§8 D1's relative constraint).

import {vecSub, vecDot, vecCross, vecScale, vecNormalize, SIN_1_DEG} from '../mech/vec.js';
import {LDU_M, lduToWorld, dirToWorld} from '../contracts.js';
import {gearHinges, TOL} from './gear-mesh.js';
import {spurGears, toothConnectors, placedSpur, placedTooth} from './tooth-parts.js';

const isUnit = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < 1e-6;

/** Where a spur gear meshes with a rack strip: {along (LDU from the strip's middle), P (contact, LDU)} or null. */
export const rackContact = (rack, gear) => {
    const u = rack.c.axis;
    const n = rack.data.normal;
    if (Math.abs(vecDot(gear.axisLdu, u)) > SIN_1_DEG + 1e-12) return null;
    if (Math.abs(vecDot(gear.axisLdu, n)) > SIN_1_DEG + 1e-12) return null;
    const w = vecSub(gear.centerLdu, rack.c.position);
    if (Math.abs(vecDot(w, n) - gear.r) > TOL + 1e-9) return null;
    const along = vecDot(w, u);
    if (Math.abs(along) > rack.c.length / 2 + 1e-9) return null;
    if (Math.abs(vecDot(w, gear.axisLdu)) > (rack.data.widthLdu || 0) / 2 + 1e-9) return null;
    return {along, P: vecSub(gear.centerLdu, vecScale(n, gear.r))};
};

/** The slider joint between bodies a and b, or null. */
const sliderBetween = (joints, a, b) => joints.find(j => j.type === 'slider' &&
    ((j.body1 === a && j.body2 === b) || (j.body1 === b && j.body2 === a))) || null;

export const RACK = {
    id: 'rack',
    kind: 'rackAndPinion',
    detect ({nodes, islands, joints}) {
        const couplings = [];
        const welds = [];
        const diagnostics = [];
        const limits = [];
        const gears = spurGears(nodes, islands, ['spur', 'bevel']).filter(g => g.type === 'spur' || g.meshesAs.includes('spur'));
        for (const rack of toothConnectors(nodes, islands, 'rack-teeth', ['normal'])) {
            for (const gear of gears) {
                if (gear.islandId === rack.islandId) continue;
                const contact = rackContact(rack, gear);
                if (!contact) continue;
                const hinges = gearHinges(gear, joints);
                if (hinges.length === 0) continue; // the gear pass says gear-not-on-hinge
                const parts = [gear.partId, rack.partId];
                const fixed = hinges.find(h => h.frame === rack.islandId);
                if (fixed) {
                    diagnostics.push({severity: 'warning', code: 'gear-on-frame', parts,
                        message: `The rack ${rack.partId} is fixed to the part that holds the gear ${gear.partId}, so neither can move: they lock together.`});
                    welds.push([rack.islandId, gear.islandId]);
                    continue;
                }
                let found = null;
                for (const h of hinges) {
                    const s = sliderBetween(joints, h.frame, rack.islandId);
                    if (s) { found = {h, s}; break; }
                }
                if (!found) {
                    diagnostics.push({severity: 'warning', code: 'rack-not-sliding', parts,
                        message: `The gear ${gear.partId} meshes with the rack ${rack.partId}, but the rack cannot slide past it, so the rack is not driven.`});
                    continue;
                }
                const {h, s} = found;
                const sigma = s.body2 === rack.islandId ? 1 : -1;
                const a = vecScale(vecNormalize(h.joint.axis), h.sign);
                const d = vecSub(lduToWorld(contact.P), lduToWorld(gear.centerLdu));
                const ratio = sigma * vecDot(vecCross(a, d), s.axis);
                couplings.push({hingeJoint: h.joint.id, sliderJoint: s.id, ratio, parts});
                // The contact stays on the toothed length: c(x) = along − σ·x·(s·u) for a slider travel x (LDU).
                const su = vecDot(vecNormalize(dirToWorld(s.axis)), rack.c.axis) * sigma;
                const half = rack.c.length / 2;
                const ends = [(contact.along - half) / su, (contact.along + half) / su].sort((p, q) => p - q);
                limits.push({joint: s.id, limits: [Math.min(0, ends[0] * LDU_M), Math.max(0, ends[1] * LDU_M)]});
            }
        }
        couplings.sort((p, q) => p.hingeJoint.localeCompare(q.hingeJoint) || p.sliderJoint.localeCompare(q.sliderJoint));
        return {couplings, welds, diagnostics, limits};
    },
    /** The editor's overlap rule: a rack and a spur gear meshing where they stand share volume (their teeth interleave). */
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            const gear = (mq.gear?.type === 'spur' || mq.gear?.meshesAs?.includes('spur')) ? placedSpur(q, mq, ['spur', 'bevel']) : null;
            if (!gear) continue;
            if (placedTooth(p, mp, 'rack-teeth', ['normal']).some(r => rackContact(r, gear))) return true;
        }
        return false;
    }
};

/** The connector kind: data checked here (validatePartMeta with the registry). */
export const RACK_TEETH = {
    kind: 'rack-teeth',
    validate (c) {
        const out = [];
        if (!(typeof c.length === 'number' && c.length > 0)) out.push('a rack-teeth connector needs its toothed length (LDU)');
        if (!c.data || !isUnit(c.data.normal)) out.push('data.normal: the unit direction the teeth face');
        else if (Math.abs(vecDot(c.data.normal, c.axis)) > 1e-6) out.push('data.normal: must be perpendicular to the rack (axis)');
        if (!c.data || !(c.data.widthLdu > 0)) out.push('data.widthLdu: the teeth\'s width across the rack (LDU)');
        return out;
    }
};
