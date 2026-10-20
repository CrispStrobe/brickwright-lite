// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Chain drive (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M6): Technic chain links (3711) laid round
// two or more spur gears turn them all the same way, at the teeth's ratio.
//
// Connector kind 'chain-link': one per link, at the middle between its two pivots (the pins its
// neighbours turn on), `axis` along the pivots' pins, and `data`
//   along     the direction from one pivot to the other (part frame, unit),
//   pitchLdu  the distance between them (3711: 16 LDU, one link spans two teeth, 2 × 7.85 LDU;
//             the tread 57518: 30 LDU, one tooth of its sprocket), and for a tread
//   outward   the side that faces away from the sprockets (part frame, unit),
//   outerLdu  how far its outer face is from the pivots, and widthLdu its width.
//
// A tread is a chain round sprockets (gear type 'sprocket', with its own pitchRadiusLdu: the
// circle its pivots ride on). It runs on the ground, so its links are `drawnOnly` (no colliders
// in the core) and every sprocket it wraps becomes a WHEEL of the tread's outer radius
// (`wheels`: the compiler adds the collider to the sprocket's body, with a tyre's grip) — the
// architecture's M6 approximation of a tracked vehicle.
//
// Coupling module 'chain' (kind 'chain'):
//   - links join into a chain where a pivot of one is on a pivot of another (CHAIN_JOIN_LDU);
//   - a chain goes round a spur gear when two or more of its pivots lie on the gear's pitch
//     circle (CHAIN_ON_PITCH_LDU) in the gear's mid-plane, the links' pins along its axis;
//   - a chain round two or more gears on hinges in ONE frame F couples each to the first:
//     ω(joint2) = ratio · ω(joint1), ratio = (z₁/z₂) · (a₁·a₂), a the signed hinge axes (the
//     gear-mesh convention: + on body2). Positive for gears turning the same way about one
//     axis direction: the pitch speeds are equal and the chain does not cross over;
//   - the links are welded to F: they are drawn, not simulated (they do not run round), and
//     they never collide with the gears they wrap (a hinge's bodies do not touch).
// Topologies: a gear rigidly on F cannot turn, so the chain locks it with the others (welded,
// the 'gear-on-frame' warning); gears in different frames get the 'chain-frames-differ'
// warning and no coupling; links round fewer than two gears, 'chain-not-round-gears'.
// The physics core couples them as it does a gear mesh (the fork's GearMeshConstraint: a tooth
// contact, here outside the two sprockets on their line of centres, as an internal gear's), except
// two equal sprockets, whose contact would be at infinity: those get the GearConstraint on both
// hinges, exact at 1:1 (physics/jolt-core.js).
import {vecAdd, vecSub, vecDot, vecLen, vecScale, vecNormalize} from '../mech/vec.js';
import {dirToWorld} from '../contracts.js';
import {gearHinges, parallelAxes} from './gear-mesh.js';
import {spurGears, toothConnectors, placedSpur, placedTooth} from './tooth-parts.js';

/** The gears a chain or a tread goes round. */
export const WRAPPED_GEARS = Object.freeze(['spur', 'sprocket']);
/** A tread's grip on the floor: a tyre's (parts.json tyres have friction 1). */
export const TREAD_FRICTION = 1;

/** Two links join when a pivot of one is this close to a pivot of the other (LDU). */
export const CHAIN_JOIN_LDU = 2;
/** A pivot rides on a gear when it is this close to the gear's pitch circle (LDU). */
export const CHAIN_ON_PITCH_LDU = 2.5;
/** ... and this close to the gear's mid-plane (LDU). */
const CHAIN_PLANE_LDU = 4;

const isUnit = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < 1e-6;

/** A link's two pivots (LDU), from its connector {c: {position}, data: {along, pitchLdu}}. */
export const linkPivots = link => {
    const half = vecScale(link.data.along, (link.data.pitchLdu || 16) / 2);
    return [vecSub(link.c.position, half), vecAdd(link.c.position, half)];
};

/** How many of a link's pivots ride on a gear ({centerLdu, axisLdu, r}): 0, 1 or 2. */
export const pivotsOnGear = (link, gear) => {
    if (!parallelAxes(link.c.axis, gear.axisLdu)) return 0;
    let n = 0;
    for (const p of linkPivots(link)) {
        const d = vecSub(p, gear.centerLdu);
        const axial = vecDot(d, gear.axisLdu);
        if (Math.abs(axial) > CHAIN_PLANE_LDU) continue;
        const radial = vecLen(vecSub(d, vecScale(gear.axisLdu, axial)));
        if (Math.abs(radial - gear.r) <= CHAIN_ON_PITCH_LDU) n++;
    }
    return n;
};

/**
 * Whether a link lies on a gear's teeth, not in it: in its mid-plane, the pins along its axis,
 * nowhere between its pivots nearer the axis than the pitch circle (a chain's run off a sprocket
 * touches the tooth tips).
 */
export const restsOnTeeth = (link, gear) => {
    if (!parallelAxes(link.c.axis, gear.axisLdu)) return false;
    const [p, q] = linkPivots(link).map(x => {
        const d = vecSub(x, gear.centerLdu);
        return {axial: vecDot(d, gear.axisLdu), d: vecSub(d, vecScale(gear.axisLdu, vecDot(d, gear.axisLdu)))};
    });
    if (Math.abs(p.axial) > CHAIN_PLANE_LDU) return false;
    // the in-plane distance of the axis from the segment p–q
    const e = vecSub(q.d, p.d);
    const t = Math.max(0, Math.min(1, -vecDot(p.d, e) / (vecDot(e, e) || 1)));
    return vecLen(vecAdd(p.d, vecScale(e, t))) >= gear.r - CHAIN_ON_PITCH_LDU;
};

/** Whether two links join: a pivot of one on a pivot of the other. */
export const linksJoin = (a, b) => joined(a, b);
const joined = (a, b) => linkPivots(a).some(p => linkPivots(b).some(q => vecLen(vecSub(p, q)) <= CHAIN_JOIN_LDU));

/** Links grouped into chains (pivot on pivot), each a list of links, in the order given. */
export const chainsOf = links => {
    const parent = links.map((_, i) => i);
    const root = i => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < links.length; i++) {
        for (let k = i + 1; k < links.length; k++) if (joined(links[i], links[k])) parent[root(k)] = root(i);
    }
    const groups = new Map();
    links.forEach((l, i) => {
        const r = root(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(l);
    });
    return [...groups.values()];
};

/** The gears a chain goes round: two or more of its pivots on the pitch circle. */
export const gearsRound = (chain, gears) => gears.filter(g => chain.reduce((n, l) => n + pivotsOnGear(l, g), 0) >= 2);

export const CHAIN = {
    id: 'chain',
    kind: 'chain',
    detect ({nodes, islands, joints}) {
        const couplings = [];
        const welds = [];
        const diagnostics = [];
        const wheels = [];
        const links = toothConnectors(nodes, islands, 'chain-link', ['along']).filter(l => l.data.along);
        if (!links.length) return {couplings, welds, diagnostics, wheels};
        const gears = spurGears(nodes, islands, WRAPPED_GEARS);
        for (const chain of chainsOf(links)) {
            const linkParts = [...new Set(chain.map(l => l.partId))];
            const round = gearsRound(chain, gears).filter(g => !chain.some(l => l.islandId === g.islandId))
                .sort((a, b) => a.partId.localeCompare(b.partId));
            if (round.length < 2) {
                diagnostics.push({severity: 'warning', code: 'chain-not-round-gears', parts: linkParts,
                    message: `The chain of ${linkParts.length} links does not go round two gears, so it drives nothing.`});
                continue;
            }
            // A tread: every sprocket it wraps meets the floor at the tread's outer face.
            const tread = chain[0].data.outerLdu > 0 ? chain[0].data : null;
            if (tread) {
                for (const g of round) {
                    wheels.push({islandId: g.islandId, centerLdu: g.centerLdu, axisLdu: g.axisLdu, radiusLdu: g.r + tread.outerLdu,
                        halfWidthLdu: (tread.widthLdu || 0) / 2, friction: TREAD_FRICTION, part: g.partId});
                }
            }
            const hinged = round.map(g => ({g, hinges: gearHinges(g, joints)}));
            const g0 = hinged.find(x => x.hinges.length);
            if (!g0) continue; // the gear pass says gear-not-on-hinge
            // F: the frame the first gear turns in that the most other gears also turn in.
            const frames = g0.hinges.map(h => h.frame);
            const frame = frames.sort((p, q) => hinged.filter(x => x.hinges.some(h => h.frame === q)).length -
                hinged.filter(x => x.hinges.some(h => h.frame === p)).length)[0];
            const h0 = g0.hinges.find(h => h.frame === frame);
            const a0 = vecScale(vecNormalize(dirToWorld(h0.joint.axis)), h0.sign);
            for (const l of chain) if (l.islandId !== frame) welds.push([l.islandId, frame]);
            for (const x of hinged) {
                if (x === g0) continue;
                const parts = [g0.g.partId, x.g.partId];
                if (x.g.islandId === frame) {
                    diagnostics.push({severity: 'warning', code: 'gear-on-frame', parts,
                        message: `The gear ${x.g.partId} is fixed to the part that holds the gear ${g0.g.partId}, so the chain round them cannot move: they lock together.`});
                    welds.push([g0.g.islandId, frame]);
                    continue;
                }
                const h = x.hinges.find(k => k.frame === frame);
                if (!h) {
                    diagnostics.push({severity: 'warning', code: 'chain-frames-differ', parts,
                        message: `The chain goes round ${g0.g.partId} and ${x.g.partId}, but their axles are held by different parts, so it cannot drive one from the other.`});
                    continue;
                }
                const a = vecScale(vecNormalize(dirToWorld(h.joint.axis)), h.sign);
                const ratio = (g0.g.teeth / x.g.teeth) * Math.sign(vecDot(a0, a));
                couplings.push({joint1: h0.joint.id, joint2: h.joint.id, ratio, parts: [...parts, ...linkParts]});
            }
        }
        return {couplings, welds, diagnostics, wheels};
    },
    validate (c, m) {
        const out = [];
        if (!(typeof c.ratio === 'number' && Number.isFinite(c.ratio) && c.ratio !== 0)) out.push('ratio: need a non-zero number');
        const joints = new Map((m.joints || []).map(j => [j.id, j]));
        for (const k of ['joint1', 'joint2']) {
            const j = joints.get(c[k]);
            if (!j) out.push(`${k}: unknown joint '${c[k]}'`);
            else if (j.type !== 'hinge') out.push(`${k}: joint '${c[k]}' is a ${j.type}, need a hinge`);
        }
        if (c.joint1 === c.joint2) out.push('chains a joint to itself');
        return out;
    },
    /** The two gear bodies a chain ties (no-collide): each hinge's side not shared with the other. */
    bodies (c, joints) {
        const j1 = joints.find(j => j.id === c.joint1);
        const j2 = joints.find(j => j.id === c.joint2);
        if (!j1 || !j2) return [];
        const shared = [j1.body1, j1.body2].find(b => b === j2.body1 || b === j2.body2);
        const side = j => (j.body2 === shared ? j.body1 : j.body2);
        return [side(j1), side(j2)];
    },
    /**
     * The editor's overlap rule: a link shares volume with a gear it is seated on (both pivots on the
     * pitch circle: on a small sprocket the link bridges a tooth gap) or whose teeth it lies on, and
     * with the next link on its pivot.
     */
    placedMesh (a, metaA, b, metaB) {
        const linksA = placedTooth(a, metaA, 'chain-link', ['along']);
        const linksB = placedTooth(b, metaB, 'chain-link', ['along']);
        if (linksA.length && linksB.length) return linksA.some(p => linksB.some(q => joined(p, q)));
        for (const [links, pl, meta] of [[linksA, b, metaB], [linksB, a, metaA]]) {
            const gear = links.length ? placedSpur(pl, meta, WRAPPED_GEARS) : null;
            if (gear && links.some(l => pivotsOnGear(l, gear) === 2 || restsOnTeeth(l, gear))) return true;
        }
        return false;
    }
};

/** The connector kind: its data checked here (validatePartMeta with the registry). */
export const CHAIN_LINK = {
    kind: 'chain-link',
    validate (c) {
        const out = [];
        if (!c.data || !isUnit(c.data.along)) out.push('data.along: the unit direction from one pivot to the other');
        else if (Math.abs(vecDot(c.data.along, c.axis)) > 1e-6) out.push('data.along: must be perpendicular to the pivots\' pins (axis)');
        if (!c.data || !(c.data.pitchLdu > 0)) out.push('data.pitchLdu: the distance between the pivots (LDU)');
        if (c.data && c.data.outward !== undefined && (!isUnit(c.data.outward) || Math.abs(vecDot(c.data.outward, c.axis)) > 1e-6 ||
            Math.abs(vecDot(c.data.outward, c.data.along || [0, 0, 0])) > 1e-6)) out.push('data.outward: a unit direction across the pins and the link');
        if (c.data && c.data.outerLdu !== undefined && !(c.data.outerLdu > 0 && c.data.widthLdu > 0)) out.push('data.outerLdu, widthLdu: a tread\'s outer face and width (LDU)');
        return out;
    }
};
