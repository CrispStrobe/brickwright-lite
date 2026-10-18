// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Gear inference (D4). Two gears whose pitch circles touch (spur: parallel
// axes, centre distance r1 + r2; bevel: perpendicular axes meeting at O with
// |c1 − O| = r2 and |c2 − O| = r1) mesh. A mesh only transmits motion when
// both gears turn about axes held by the SAME part: the frame F. Gear 1 sits on
// body B1 that turns in F through hinge h1, gear 2 on B2 that turns in F
// through h2. The tooth contact then fixes the two rotations RELATIVE TO F,
// which is exactly what the contract's gear constraint couples
// (ω(joint2) = ratio · ω(joint1), each ω the hinge's relative rate).
//
// Topologies the rule separates:
//   - common frame (a gearbox: both axles in holes of one beam/frame) → gear;
//   - gear-on-frame: gear 1 is rigidly part of the frame gear 2 turns in
//     (e.g. a beam pinned to the motor's turning output that also carries the
//     8T): gear 1 cannot turn relative to that frame, so its teeth hold gear 2
//     still in it. The pair LOCKS: no gear constraint, a warning, and the two
//     bodies are merged (compile.js), so the simulation shows the one rigid
//     assembly the model really is instead of a fictitious transmission;
//   - axes held by different frames → no gear, a warning — unless the frames
//     reach a common one through coaxial hinges (below).
//
// Generalised rule (gearbox lane, 2026-10-18): what a mesh fixes is the two gears'
// rotation RELATIVE TO a frame F that holds both axes (Willis):
//     (ω₂ − ω_F)·â₂ = ratio · (ω₁ − ω_F)·â₁        (â the gear axes, fixed in F)
// The common-frame case is F = the frame both hinges turn in; two more cases are
// found now and emitted as a 'relativeGear' coupling {gear1, gear2, frame, axis1,
// axis2, ratio, anchor1, anchor2, tangent, carrier, joint1, joint2, parts}:
//   - chain: a gear turns on a hinge in a body that itself turns on a COAXIAL
//     hinge in F (a clutch gear free on its axle, the axle turning in the
//     gearbox frame; a slip-clutch gear on its axle). F is reached through the
//     coaxial hinges (coaxialFrames);
//   - carrier: both hinges turn in F, but F itself turns about one of the gear
//     axes — a gear's body also turns, coaxially, in another body X that is
//     heavier than F (the differential casing, carried on the side axles that
//     turn in the chassis; an arm swinging about a gear's axle). Then F is a
//     planet carrier: the satellites' axes turn with it.
// Both are coupled by the core at the tooth contact (physics/jolt-core.js), which
// is exact however F moves. The common-frame case keeps its 'gear' coupling,
// built exactly as before (bit-identical: existing models compile to the same
// mechanism). Its anchors: spur — on the line of centres, one pitch radius from
// each centre (anchor1 = c₁ + r₁n, anchor2 = c₂ − r₂n); bevel — the point r₁ from
// axis 1 and r₂ from axis 2 in the plane of the axes (O + r₂û₁ + r₁û₂), so |ratio|
// is the tooth ratio z₁/z₂ even where LDraw's placement is off the pitch cone by a
// unit or two (the official differential 65414c01 seats its 12T satellites 17 LDU
// from the apex, pitch radius 15). Its sign comes from the geometry.
//
// Closed loops (two gear paths between the same axles, common in gearboxes): every
// coupling is an equation between two gears' rates in a frame. They are chained
// (union-find with a rate factor per gear); a coupling that closes a loop is
// redundant when its ratio agrees with the loop's (kept: the two paths share the
// load and do not fight) and INCONSISTENT when it does not: such a train cannot
// turn at all, so it locks — 'gear-loop-locked', and the gears of that coupling are
// welded to their frame (compile.js), which stalls whatever drives them.
//
// A hinge's ω is body2 relative to body1 about its axis. A gear on the hinge's
// body2 turns by +ω relative to the frame, one on its body1 by −ω, so the
// ratio uses the signed axis a = s·axis (s = ±1). With these axes the contact
// formula gives the contract ratio directly:
//     P = c1 + r1·u, t = unit(a1 × (P − c1)),
//     ratio = ((a1 × (P − c1)) · t) / ((a2 × (P − c2)) · t)
// (equal tooth speed at P). Spur: u = unit component of c2 − c1 normal to a1;
// bevel: u = unit(c2 − O).

import {vecAdd, vecSub, vecDot, vecLen, vecScale, vecNormalize, vecCross, mat3MulVec3, lineClosestMidpoint} from './vec.js';
import {pitchRadiusLdu, dirToWorld, lduToWorld, LDU_M} from '../contracts.js';
import {BUILTIN_KINDS} from '../kinds/index.js';
import {TOL, parallelAxes, meshRatio, gearHinges} from '../kinds/gear-mesh.js';

// The hinges a gear turns on (gearHinges) moved to kinds/gear-mesh.js unchanged, so the coupling
// kinds that are connectors (kinds/worm.js, kinds/rack.js) share the frame rules without importing
// the compiler; re-exported here under its old name.
export {gearHinges};

/** A readable name for a gear: "the 8-tooth gear (g8)". */
const gearName = g => `the ${g.teeth}-tooth gear (${g.partId})`;

/**
 * The part of the frame that holds a gear's hinge (the beam its axle turns
 * in), for messages. Falls back to the frame body id.
 */
const holderName = (hinge, gear, jointEntries, nodes) => {
    const entry = jointEntries ? jointEntries.find(e => e.joint === hinge.joint) : null;
    const edge = entry && entry.members && entry.members[0] ? entry.members[0].edge : null;
    if (edge) {
        // Edge a = hole side = body1, b = shaft side = body2; the holder is the frame's side.
        const nodeId = hinge.sign === 1 ? edge.a.part : edge.b.part;
        const node = nodes.get(nodeId);
        if (node) return `${node.meta.name || node.placed.part} (${node.partId})`;
    }
    return `body ${hinge.frame}`;
};

/**
 * Build gear constraints.
 * @param {Map<string,object>} nodes Map id->node
 * @param {{bodies:Array, nodeToBody:Map, bodyMap:Map}} islands final islands after locked merging
 * @param {Array} joints joints produced by joints.js (deterministic ids)
 * @param {Map<string,object>} catalogMap unused, kept for the call signature
 * @param {Array} diagnostics warnings are pushed here
 * @param {Array} [jointEntries] joints.js jointEntries (for naming the holding part in messages)
 * @returns {{gears: Array, lockedPairs: Array<[string, string]>}} lockedPairs: [frame body, gear body]
 *   pairs a gear-on-frame mesh locks together; compile.js merges them and runs again
 */
/**
 * Whether two placed gear parts mesh where they stand (same rule as the
 * compiler: tooth types match, pitch circles touch). The build editor uses it
 * to let meshing gears share volume, since their teeth interleave.
 * @param {{part: string, position: number[], rotation: number[]}} a placed part
 * @param {object} metaA its PartMeta
 * @param {{part: string, position: number[], rotation: number[]}} b placed part
 * @param {object} metaB its PartMeta
 * @returns {boolean}
 */
export const placedGearsMesh = (a, metaA, b, metaB, kinds = BUILTIN_KINDS) => {
    // Teeth that are connectors, not a `gear` (a rack's, a worm's thread: kinds/rack.js, kinds/worm.js):
    // their coupling module says whether the two parts mesh where they stand.
    for (const m of kinds.couplings.list()) {
        if (typeof m.placedMesh === 'function' && m.placedMesh(a, metaA, b, metaB)) return true;
    }
    // Parts that sit inside each other by design and whose connector kind says so (gearbox lane:
    // a driving ring on its joiner, a catch's bar in the ring's groove, the gears in a differential).
    for (const m of kinds.connectors.list()) {
        if (typeof m.placedShare === 'function' && (m.placedShare(a, metaA, b, metaB) || m.placedShare(b, metaB, a, metaA))) return true;
    }
    if (!metaA?.gear || !metaB?.gear || metaA.gear.type !== metaB.gear.type) return false;
    const module = kinds.couplings.meshFor(metaA.gear.type, metaB.gear.type);
    if (!module) return false;
    const info = (p, meta) => ({
        type: meta.gear.type, teeth: meta.gear.teeth, r: pitchRadiusLdu(meta.gear.teeth),
        centerLdu: vecAdd(mat3MulVec3(p.rotation, meta.gear.center), p.position),
        axisLdu: vecNormalize(mat3MulVec3(p.rotation, meta.gear.axis))
    });
    return Boolean(module.mesh.contact(info(a, metaA), info(b, metaB)));
};

export const buildGears = (nodes, islands, joints, catalogMap, diagnostics = [], jointEntries = null, kinds = BUILTIN_KINDS) => {
    const {nodeToBody} = islands;

    // Every placed gear part with its centre/axis in the model frame (LDU).
    const gearInfos = [];
    const seenPartIds = new Set();
    for (const [nodeId, node] of nodes.entries()) {
        const pid = node.partId;
        if (seenPartIds.has(pid)) continue; // a motor's two nodes share a part id; motors are not gears
        seenPartIds.add(pid);
        const meta = node.meta;
        if (!meta.gear) continue;
        const islandId = nodeToBody.get(nodeId);
        if (!islandId) continue;
        const rot = node.placed.rotation;
        gearInfos.push({
            partId: pid,
            nodeId,
            islandId,
            type: meta.gear.type,
            teeth: meta.gear.teeth,
            r: pitchRadiusLdu(meta.gear.teeth),
            centerLdu: vecAdd(mat3MulVec3(rot, meta.gear.center), node.placed.position),
            axisLdu: vecNormalize(mat3MulVec3(rot, meta.gear.axis)),
        });
    }

    for (const g of gearInfos) {
        g.hinges = gearHinges(g, joints);
        if (g.hinges.length === 0) {
            diagnostics.push({severity: 'warning', code: 'gear-not-on-hinge', message: `Gear ${g.partId} not on hinge`, parts: [g.partId]});
        }
    }

    // Deterministic pair order: by centre, then part id.
    gearInfos.sort((a, b) => {
        for (let i = 0; i < 3; i++) if (a.centerLdu[i] !== b.centerLdu[i]) return a.centerLdu[i] - b.centerLdu[i];
        return a.partId.localeCompare(b.partId);
    });

    const gears = [];
    const relative = [];
    const lockedPairs = [];
    const massOf = id => (islands.bodyMap && islands.bodyMap.get(id) ? islands.bodyMap.get(id).massKg : 0);
    for (const g of gearInfos) g.frames = coaxialFrames(g, joints);
    for (let i = 0; i < gearInfos.length; i++) {
        const g1 = gearInfos[i];
        for (let k = i + 1; k < gearInfos.length; k++) {
            const g2 = gearInfos[k];
            if (g1.islandId === g2.islandId) continue; // one rigid body: nothing to couple

            const t1 = g1.type; const t2 = g2.type;
            // The coupling registry's tooth meshes (kinds/spur.js, kinds/bevel.js, …) say which pairs mesh.
            const module = kinds.couplings.meshFor(t1, t2);
            if (!module) {
                // Only gears near enough to touch (centres within the two tip radii) are a pair to warn about.
                if (vecLen(vecSub(g1.centerLdu, g2.centerLdu)) > g1.r + g2.r + 5 + 1e-9) continue;
                let message = `Gear pair ${g1.partId}(${t1})–${g2.partId}(${t2}) unsupported`;
                if (t1 === 'worm' || t2 === 'worm' || t1 === 'rack' || t2 === 'rack') message = `Worm/rack gear pair ${g1.partId}–${g2.partId} unsupported`;
                else if (t1 !== t2) message = `Mismatched gear types ${g1.partId}(${t1})–${g2.partId}(${t2})`;
                diagnostics.push({severity: 'warning', code: 'unsupported-gear', message, parts: [g1.partId, g2.partId]});
                continue;
            }
            const contact = module.mesh.contact(g1, g2);
            if (!contact) continue;

            // Gear-on-frame: one gear is rigidly part of the frame the other turns in.
            const lockOn = (fixed, turning) => turning.hinges.find(h => h.frame === fixed.islandId);
            const lock12 = lockOn(g1, g2);
            const lock21 = lock12 ? null : lockOn(g2, g1);
            if (lock12 || lock21) {
                const [fixed, turning, hinge] = lock12 ? [g1, g2, lock12] : [g2, g1, lock21];
                diagnostics.push({
                    severity: 'warning',
                    code: 'gear-on-frame',
                    message: `${gearName(fixed)} is rigidly joined to ${holderName(hinge, turning, jointEntries, nodes)}, which holds ${gearName(turning)}, so it cannot turn it: the two gears lock together.`.replace(/^t/, 'T'),
                    parts: [fixed.partId, turning.partId],
                });
                lockedPairs.push([fixed.islandId, turning.islandId]);
                continue;
            }

            if (g1.hinges.length === 0 || g2.hinges.length === 0) continue; // already diagnosed

            // Common frame: the first (by joint id) hinge pair turning in the same body.
            let pair = null;
            for (const h1 of g1.hinges) {
                const h2 = g2.hinges.find(h => h.frame === h1.frame);
                if (h2) { pair = [h1, h2]; break; }
            }
            if (pair && isCarrier(pair[0].frame, g1, g2, massOf)) {
                const rg = relativeGear(g1, g2, pair[0].frame, contact, module, pair, true);
                if (rg) relative.push(rg);
                continue;
            }
            if (!pair) {
                const chain = chainFrame(g1, g2);
                if (chain) {
                    const rg = relativeGear(g1, g2, chain.frame, contact, module, [chain.h1, chain.h2], false);
                    if (rg) relative.push(rg);
                    continue;
                }
                diagnostics.push({
                    severity: 'warning',
                    code: 'gear-frames-differ',
                    message: `${gearName(g1)} and ${gearName(g2)} mesh, but their axles turn in different parts, so the gearing is not modelled.`.replace(/^t/, 'T'),
                    parts: [g1.partId, g2.partId],
                });
                continue;
            }
            const ratio = (module.mesh.ratio || meshRatio)(g1, pair[0], g2, pair[1], contact.P);
            if (ratio === null) continue;
            // `parts`: the two meshing gears (g1 on joint1), so a view can show which gears couple.
            gears.push({id: '', type: module.kind, joint1: pair[0].joint.id, joint2: pair[1].joint.id, ratio, parts: [g1.partId, g2.partId]});
        }
    }

    gears.sort((a, b) => a.joint1.localeCompare(b.joint1) || a.joint2.localeCompare(b.joint2));
    gears.forEach((g, idx) => { g.id = `g${idx}`; });
    relative.sort((a, b) => a.gear1.localeCompare(b.gear1) || a.gear2.localeCompare(b.gear2) || a.frame.localeCompare(b.frame));

    // Closed loops: an inconsistent one locks (its closing coupling's gears are welded to the frame).
    for (const lock of inconsistentLoops(gears, relative, joints)) {
        // Every gear on the two locked bodies (they are welded to the frame together).
        const parts = gearInfos.filter(g => lock.bodies.includes(g.islandId)).map(g => g.partId).sort();
        diagnostics.push({severity: 'warning', code: 'gear-loop-locked', parts,
            message: `The gears ${parts.join(', ')} close a loop of gears whose ratios disagree, so none of them can turn: the gear train locks.`});
        for (const b of lock.bodies) lockedPairs.push([lock.frame, b]);
    }

    return {gears, relative, lockedPairs};
};

// ---- generalised meshes (gearbox lane) ---------------------------------------------

/**
 * The frames a gear turns in about its own axis line: every body reached from the gear's body
 * through hinges coaxial with the gear (gearHinges with the gear's line), with the path's first
 * hinge (the gear's own). Map frame body → {first: hinge of the gear, depth}.
 */
export const coaxialFrames = (g, joints) => {
    const out = new Map();
    const seen = new Set([g.islandId]);
    let level = gearHinges(g, joints).map(h => ({body: h.frame, first: h}));
    for (let depth = 1; level.length; depth++) {
        const next = [];
        for (const {body, first} of level) {
            if (seen.has(body) || body === 'world') continue;
            seen.add(body);
            out.set(body, {first, depth});
            for (const h of gearHinges({...g, islandId: body}, joints)) next.push({body: h.frame, first});
        }
        level = next;
    }
    return out;
};

/** Both gears' axes held by F, but F turns about one of them inside a heavier body: a planet carrier. */
const isCarrier = (frame, g1, g2, massOf) => {
    const others = new Set([frame, g1.islandId, g2.islandId]);
    for (const g of [g1, g2]) {
        for (const h of g.hinges) if (!others.has(h.frame) && massOf(h.frame) > massOf(frame)) return true;
    }
    return false;
};

/** The nearest frame both gears reach through coaxial hinges, or null: {frame, h1, h2}. */
const chainFrame = (g1, g2) => {
    let best = null;
    for (const [body, f1] of g1.frames) {
        if (body === g2.islandId) continue;
        const f2 = g2.frames.get(body);
        if (!f2) continue;
        const cost = f1.depth + f2.depth;
        if (!best || cost < best.cost || (cost === best.cost && body.localeCompare(best.frame) < 0)) best = {frame: body, h1: f1.first, h2: f2.first, cost};
    }
    return best;
};

/** A world direction (unit) of a model-frame (LDU) one. */
const toWorldDir = a => vecNormalize(dirToWorld(a));

/**
 * The relativeGear coupling of two meshing gears in frame F (the header's rule and anchors).
 * @returns {object|null}
 */
const relativeGear = (g1, g2, frame, contact, module, hinges, carrier) => {
    let P1;
    let P2;
    let t;
    if (module.id === 'bevel') {
        const {mid: O} = lineClosestMidpoint(g1.centerLdu, g1.axisLdu, g2.centerLdu, g2.axisLdu);
        const u1 = vecNormalize(vecSub(g1.centerLdu, O));
        const u2 = vecNormalize(vecSub(g2.centerLdu, O));
        P1 = vecAdd(O, vecAdd(vecScale(u1, g2.r), vecScale(u2, g1.r)));
        P2 = P1;
        t = vecNormalize(vecCross(u1, u2));
    } else {
        const d = vecSub(g2.centerLdu, g1.centerLdu);
        const n = vecNormalize(vecSub(d, vecScale(g1.axisLdu, vecDot(d, g1.axisLdu))));
        P1 = vecAdd(g1.centerLdu, vecScale(n, g1.r));
        P2 = vecSub(g2.centerLdu, vecScale(n, g2.r));
        t = vecNormalize(vecCross(g1.axisLdu, n));
    }
    if (vecLen(t) < 1e-9 || !contact) return null;
    const a1 = g1.axisLdu;
    const a2 = g2.axisLdu;
    const k1 = vecDot(vecCross(a1, vecSub(P1, g1.centerLdu)), t);
    const k2 = vecDot(vecCross(a2, vecSub(P2, g2.centerLdu)), t);
    if (Math.abs(k2) < 1e-9 || Math.abs(k1) < 1e-9) return null;
    return {
        type: 'relativeGear', gear1: g1.islandId, gear2: g2.islandId, frame,
        axis1: toWorldDir(a1), axis2: toWorldDir(a2), ratio: k1 / k2,
        anchor1: lduToWorld(P1), anchor2: lduToWorld(P2), tangent: toWorldDir(t), carrier,
        joint1: hinges[0].joint.id, joint2: hinges[1].joint.id, parts: [g1.partId, g2.partId]
    };
};

/** +1/−1: the sign that takes a direction to its canonical one (first non-zero component positive). */
const canonSign = a => {
    const k = [0, 1, 2].find(i => Math.abs(a[i]) > 1e-6);
    return a[k] < 0 ? -1 : 1;
};

/**
 * Couplings that close an inconsistent loop. A variable is a gear body's rate in a frame about
 * its canonical axis; every coupling says var2 = q · var1. Union-find with rate factors.
 * @returns {{frame: string, bodies: string[], parts: string[]}[]}
 */
const inconsistentLoops = (gears, relative, joints) => {
    const byId = new Map(joints.map(j => [j.id, j]));
    const eqs = [];
    for (const g of gears) {
        const j1 = byId.get(g.joint1);
        const j2 = byId.get(g.joint2);
        if (!j1 || !j2) continue;
        const frame = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
        if (frame === undefined) continue;
        const side = j => (j.body2 === frame ? {body: j.body1, s: -1} : {body: j.body2, s: 1});
        const s1 = side(j1); const s2 = side(j2);
        const e1 = s1.s * canonSign(j1.axis); const e2 = s2.s * canonSign(j2.axis);
        eqs.push({frame, b1: s1.body, b2: s2.body, q: g.ratio * e1 / e2, parts: g.parts});
    }
    for (const r of relative) {
        eqs.push({frame: r.frame, b1: r.gear1, b2: r.gear2, q: r.ratio * canonSign(r.axis1) / canonSign(r.axis2), parts: r.parts});
    }
    const parent = new Map();
    const factor = new Map(); // var = factor · root
    const find = v => {
        if (!parent.has(v)) { parent.set(v, v); factor.set(v, 1); }
        const p = parent.get(v);
        if (p === v) return v;
        const root = find(p);
        factor.set(v, factor.get(v) * factor.get(p));
        parent.set(v, root);
        return root;
    };
    const out = [];
    for (const e of eqs) {
        const v1 = `${e.b1}@${e.frame}`;
        const v2 = `${e.b2}@${e.frame}`;
        const r1 = find(v1); const r2 = find(v2);
        const f1 = factor.get(v1); const f2 = factor.get(v2);
        if (r1 !== r2) {
            // var2 = q·var1: f2·root2 = q·f1·root1 → root2 = (q·f1/f2)·root1
            parent.set(r2, r1);
            factor.set(r2, e.q * f1 / f2);
            continue;
        }
        if (Math.abs(f2 - e.q * f1) > 1e-6 * Math.max(Math.abs(f2), Math.abs(e.q * f1))) {
            out.push({frame: e.frame, bodies: [e.b1, e.b2], parts: e.parts});
        }
    }
    return out;
};
