// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab part deriver. It lived in scripts/derive-part-meta.mjs, which is now its
// command line: the app runs the same code for parts added from the LDraw catalogue.
//
// Derive a part's Robot Lab metadata (PartMeta v2, bw-sim/contracts.js) from its
// official LDraw file, instead of measuring it by hand (docs/ROBOT-LAB-PARTS-COVERAGE.md).
//
// LDraw draws connection geometry with PRIMITIVES placed by transforms, and
// ldraw/ldraw-geometry.js flattenPart reports every primitive placement composed down
// to the part frame (with the files it was reached through). The deriver reads those
// placements and the flattened mesh — never a connectivity database (plan D4):
//
//   pin holes   lines of 6 LDU-radius bore walls (4-4cyli & co. at radius 6, and the
//               Technic hole composites connhole/connhol2/connhol3/peghole/beamhol*/
//               npeghol*), merged into runs along each line. A run whose wall faces
//               INTO the line (outward winding of the mesh, BFC) is a hole; a blind
//               hole is one drawn with p/connhol3.dat (`closedEnd` = its bottom).
//   pins        the same bore-wall runs facing OUT of the line (connect*.dat, confric*
//               — friction when the run is drawn with a confric* primitive), merged
//               across a collar (≤ 6 LDU gap that stays within a pin collar's radius).
//   axle holes  lines of the axle-profile primitives (axl*.dat) facing into the line,
//   axles       and facing out of it; a gear's "Axlehole" sub-files (3648) are a hole.
//   studs       the top-stud primitives (stud.dat, stud2.dat, …): position = the stud's
//               base centre, axis = out of the stud (LDraw -y).
//   anti-studs  on a stud-grid part (System brick/plate/tile/slope, Technic brick): every
//               stud-grid cell of the part's bottom face where a stud fits (no mesh
//               inside a stud's cylinder) and is gripped (walls/tubes touch it).
//   tubes       the open underside tubes (stud4*.dat) of a 2-wide part: a stud fits in
//               their bore too (kinds/stud.js 'tube').
//   colliders   regions around shafts (pin/axle) and the stud layer (region 'stud', not
//               solid: it sits inside the part above), and solid boxes for the body,
//               fitted to its outer envelope seen along the part's hole axis (a System
//               part: from its top surface down to its bottom face, the hollow
//               underside filled), merged greedily; a round body is a cylinder.
//   mass        mesh volume (divergence theorem over the outward-wound mesh) × ABS
//               density 1.05 g/cm³ (ABS: 1.04–1.06 g/cm³; LEGO elements are ABS).
//   names       the LDraw header description; German name from a term dictionary,
//               marked `nameDeGenerated: true`; palette category from the LDraw
//               description / !CATEGORY.
//
// Usage:
//   node scripts/derive-part-meta.mjs --lib <ldraw dir> <part.dat>…          print derived metadata
//   node scripts/derive-part-meta.mjs --lib <ldraw dir> --compare            derived vs hand-measured
//   node scripts/derive-part-meta.mjs --lib <ldraw dir> --generate <list>    add derived parts to parts.json
//        (a list file of part numbers; parts already in parts.json are kept as measured)
//   then: node scripts/derive-canonical-frames.mjs   (re-adds each part's measured mirrorOf, which --generate drops)


import {flattenPart, bounds, circularFeatures, column, apply, parseLDraw} from '../ldraw/ldraw-geometry.js';
import {SLIP_CLUTCH_24T_NM} from '../kinds/slip-clutch.js';

/** ABS, g/cm³ (LEGO elements are moulded from ABS; 1.04–1.06). */
export const ABS_DENSITY_G_PER_CM3 = 1.05;
/** 1 LDU = 0.4 mm = 0.04 cm. */
const LDU_CM = 0.04;

const BORE_R = 6;
const LINE_EPS = 0.5;
const COS_1 = Math.cos(Math.PI / 180);
/** A pin is 6 LDU across its shaft, 8 at a collar (test/bw-sim-part-meta.test.mjs SHAFT_R). */
const SHAFT_R = 8.5;

// ---- vectors ------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => scale(a, 1 / len(a));
const perp = (v, a) => sub(v, scale(a, dot(v, a)));
const round = (v, q = 1e-3) => Math.round(v / q) * q + 0; // + 0: no -0
const roundVec = (v, q) => v.map(x => round(x, q));

/** The axis with a canonical sign (first non-zero component positive), so coaxial lines compare. */
const canonical = a => {
    const u = unit(a);
    const k = [0, 1, 2].find(i => Math.abs(u[i]) > 1e-6);
    return u[k] < 0 ? scale(u, -1) : u;
};
/** A coordinate axis when `a` is one (to 1e-6), else `a`. */
const snapAxis = a => a.map(v => (Math.abs(v) < 1e-6 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-6 ? Math.sign(v) : v));

// ---- primitive families -------------------------------------------------------
const base = file => file.split('/').pop();
/** Bore walls the metadata test counts (its WALL set): round walls and the Technic hole composites. */
const ROUND_WALL = /^\d+-\d+(cyli|cylo|cyls|con\d+)\.dat$/;
const COMPOSITE = /^(connhole|connhol2|connhol3|peghole\w*|beamhol\w*|confric\w*|connect\w*)\.dat$/;
/** Axle-profile primitives (holes and shafts alike; the side is measured). */
const AXLE_PROFILE = /^axl\w*\.dat$/;
/** Top studs (a stud another part's anti-stud grips). Underside tubes/rods and Duplo/Scala/Modulex are not. */
const TOP_STUD = /^(stud|studa|stud2|stud2a|stud-logo\d?|stud2-logo\d?|studp01|stud9|stud6a?|stud10|stud13|stud15|stud17a?|stud26|studel|studh[lr]?)\.dat$/;
/** Open underside tubes of 2-wide parts: a stud fits in their bore. */
const OPEN_TUBE = /^stud4(a|f\d[nsw]|h|o|od|oda|s|s2)?\.dat$/;
/** Everything stud-like: geometry inside these is never a Technic bore. */
const STUDISH = /^(stud\w*|stu2\w*|stug\w*)\.dat$/;
/** A stud drawn inside another stud primitive is part of it; inside a stud GROUP (stug-1x4.dat) it is a stud of its own. */
const IN_A_STUD = /^(stud\w*|stu2\w*)\.dat$/;
const viaStud = p => p.via.some(f => STUDISH.test(base(f)));

/**
 * A primitive's line: its local y axis through its origin, over the extent its own polygons
 * span along local y (`extent(file)`: [ymin, ymax] in the primitive's frame, null when it
 * draws only edge lines). Primitive conventions differ (axleend20.dat draws 20 LDU below
 * its origin, axle.dat one unit above it), so the drawn extent is measured, not assumed.
 */
const lineOf = (p, extent) => {
    const e = extent(p.file);
    if (!e) return null;
    const y = column(p.x, 1);
    const axis = canonical(y);
    const p0 = apply(p.x, [0, e[0], 0]);
    const p1 = apply(p.x, [0, e[1], 0]);
    return {axis, foot: perp(p.x.t, axis), lo: Math.min(dot(p0, axis), dot(p1, axis)), hi: Math.max(dot(p0, axis), dot(p1, axis)), prim: p};
};

/** extent(file) for lineOf: a primitive file's polygons' local y range, cached per file. */
export const primitiveExtents = read => {
    const cache = new Map();
    return file => {
        if (!cache.has(file)) {
            const f = flattenPart(file.replace(/^p\//, ''), q => (q.startsWith('parts/') ? undefined : read(q)));
            const ys = f.polys.flat().map(v => v[1]);
            cache.set(file, ys.length ? [Math.min(...ys), Math.max(...ys)] : null);
        }
        return cache.get(file);
    };
};

/**
 * Group lines into runs: same line (parallel within 1°, ≤ 0.5 LDU apart), intervals
 * merged where they overlap or leave a gap ≤ `gap`.
 */
const runsOf = (lines, gap, eps = LINE_EPS) => {
    const groups = [];
    for (const l of lines) {
        const g = groups.find(q => Math.abs(dot(q.axis, l.axis)) >= COS_1 && len(perp(sub(l.foot, q.foot), q.axis)) <= eps);
        if (g) g.lines.push(l);
        else groups.push({axis: l.axis, foot: l.foot, lines: [l]});
    }
    const runs = [];
    for (const g of groups) {
        // The line through the members' mean foot (4019 draws its axle hole from four pieces 0.28 LDU off centre).
        const foot = perp(scale(g.lines.reduce((acc, l) => add(acc, l.foot), [0, 0, 0]), 1 / g.lines.length), g.axis);
        const iv = g.lines.map(l => ({lo: l.lo, hi: l.hi, l})).sort((a, b) => a.lo - b.lo);
        let cur = null;
        for (const i of iv) {
            if (cur && i.lo <= cur.hi + gap) {
                cur.hi = Math.max(cur.hi, i.hi);
                cur.lines.push(i.l);
            } else {
                cur = {axis: g.axis, foot, lo: i.lo, hi: i.hi, lines: [i.l]};
                runs.push(cur);
            }
        }
    }
    return runs;
};

// ---- the mesh -----------------------------------------------------------------

/** Triangles of the flattened part (quads split), each with its outward normal (area-weighted). */
const trianglesOf = polys => {
    const tris = [];
    for (const p of polys) {
        for (let i = 1; i + 1 < p.length; i++) {
            const t = [p[0], p[i], p[i + 1]];
            const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
            tris.push({v: t, n});
        }
    }
    return tris;
};

/**
 * Which side of a line its wall faces: +1 out of the line (a shaft's surface), -1 into it
 * (a bore's wall), 0 unclear. The triangles within [rIn, rOut] of the line and inside the
 * run vote by area with the radial component of their outward normal (BFC winding).
 */
const sideOfRun = (tris, run, rIn, rOut) => {
    let s = 0;
    let a = 0;
    // Which of 16 sectors around the line the wall covers: a bore or a shaft goes all round (a
    // slot's end half round); a quarter-round fillet on a part's outline does not.
    const e1 = unit(perp(Math.abs(run.axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], run.axis));
    const e2 = cross(run.axis, e1);
    const sectors = new Set();
    for (const t of tris) {
        let ok = true;
        for (const v of t.v) {
            const along = dot(v, run.axis);
            const r = len(perp(sub(v, run.foot), run.axis));
            if (r < rIn || r > rOut || along < run.lo - 0.01 || along > run.hi + 0.01) { ok = false; break; }
        }
        if (!ok) continue;
        const c = scale(add(add(t.v[0], t.v[1]), t.v[2]), 1 / 3);
        const radial = perp(sub(c, run.foot), run.axis);
        const rl = len(radial);
        if (rl < 1e-6) continue;
        s += dot(t.n, radial) / rl;
        a += len(t.n);
        for (const v of [...t.v, c]) {
            const d = perp(sub(v, run.foot), run.axis);
            sectors.add(Math.floor(((Math.atan2(dot(d, e2), dot(d, e1)) + Math.PI) / (2 * Math.PI)) * 16) % 16);
        }
    }
    if (a === 0) return {side: 0, score: 0, round: 0};
    // flattenPart winds every polygon so that this cross product points out of the solid.
    const score = s / a;
    return {side: score > 0.3 ? 1 : score < -0.3 ? -1 : 0, score, round: sectors.size / 16};
};

/** Largest distance of any vertex in the slab [lo, hi] along the run's line from it. */
const radialReach = (verts, run, lo, hi) => {
    let r = 0;
    for (const v of verts) {
        const along = dot(v, run.axis);
        if (along < lo || along > hi) continue;
        r = Math.max(r, len(perp(sub(v, run.foot), run.axis)));
    }
    return r;
};

/** Mesh volume in LDU³: the divergence theorem over the outward-wound triangles. */
export const meshVolume = tris => {
    let v = 0;
    for (const t of tris) v += dot(t.v[0], cross(t.v[1], t.v[2])) / 6;
    // Left-handed winding (see sideOfRun): outward CCW gives a negative signed volume.
    return Math.abs(v);
};

// ---- connectors ---------------------------------------------------------------

/** Round a length to the Technic 10 LDU lattice when it is within 2 LDU of it (LDraw draws a blind hole 18 deep, a pin half 18 + collar). */
const latticeLength = L => {
    const r = Math.round(L / 10) * 10;
    return r >= 10 && Math.abs(L - r) <= 2 ? r : round(L, 0.5);
};

const point = (run, t) => add(run.foot, scale(run.axis, t));

/**
 * Where a shaft's lattice-length segment sits along its run: centred on the run, unless that
 * pokes out of the shaft's mesh (the mesh within SHAFT_R of the line) — then flush with the
 * run's end that is the shaft's end (an axle with a stop at one end: 78 drawn + the stop).
 */
const shaftCentre = (verts, run, length) => {
    const along = verts.filter(v => len(perp(sub(v, run.foot), run.axis)) <= SHAFT_R).map(v => dot(v, run.axis));
    let lo = Infinity; let hi = -Infinity;
    for (const t of along) { if (t < lo) lo = t; if (t > hi) hi = t; }
    const fits = c => c - length / 2 >= lo - 0.5 && c + length / 2 <= hi + 0.5;
    for (const c of [(run.lo + run.hi) / 2, run.lo + length / 2, run.hi - length / 2]) if (fits(c)) return c;
    return (run.lo + run.hi) / 2;
};

/**
 * The connectors of a flattened part.
 * @returns {{connectors: object[], notes: string[], studs: object[], tris: object[], verts: number[][]}}
 */
export const deriveConnectors = (flat, {header = {}, read, system = false} = {}) => {
    const extent = primitiveExtents(read);
    const lines = ps => ps.map(p => lineOf(p, extent)).filter(Boolean);
    const notes = [];
    const tris = trianglesOf(flat.polys);
    const verts = flat.polys.flat();
    const prims = flat.primitives;
    const name = header.description || '';

    // Bore walls: 6 LDU round walls and the composites, never inside a stud primitive.
    const round6 = new Set(circularFeatures(prims)
        .filter(c => ROUND_WALL.test(base(c.file)) && Math.abs(c.radius - BORE_R) <= LINE_EPS)
        .map(c => c.x));
    const boreWalls = prims.filter(p => !viaStud(p) && !STUDISH.test(base(p.file)) &&
        ((ROUND_WALL.test(base(p.file)) && round6.has(p.x)) ||
         (COMPOSITE.test(base(p.file)) && Math.abs(BORE_R * len(column(p.x, 0)) - BORE_R) <= LINE_EPS)));
    const boreRuns = runsOf(lines(boreWalls), 1);

    // Axle profiles (holes and shafts): merged across the 1.5 LDU between an axle's end caps and
    // its body, and across the 3 LDU notches of a notched axle (32062).
    // Only the outermost axle primitive of a nest: an axle primitive draws its children inside
    // its own unit height, so theirs are not extents.
    const axleRuns = runsOf(lines(prims.filter(p => AXLE_PROFILE.test(base(p.file)) && !viaStud(p) &&
        !p.via.some(f => AXLE_PROFILE.test(base(f))))), 3.5, 0.6);

    const connectors = [];
    const axleHoleRuns = [];
    const axleRunsOut = [];
    for (const run of axleRuns) {
        const L = run.hi - run.lo;
        if (L < 1) continue;
        const {side, score, round: around} = sideOfRun(tris, run, 1.2, 7);
        if (around < 0.75) {
            notes.push(`axle profile at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)} covers ${Math.round(around * 16)}/16 of the circle`);
            continue;
        }
        if (side < 0) axleHoleRuns.push(run);
        else if (side > 0) axleRunsOut.push(run);
        else notes.push(`axle profile at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)} along ${roundVec(run.axis, 1e-4)}: side unclear (${score.toFixed(2)})`);
    }
    // A gear's centre hole drawn by its own "Axlehole" sub-files (the 24T 3648: eight eighths).
    const holeSubs = flat.subparts.filter(s => /axle ?hole/i.test(s.description));
    if (holeSubs.length && !axleHoleRuns.length) {
        const vs = holeSubs.flatMap(s => s.polys.flat());
        const c = [0, 1, 2].map(i => vs.reduce((a, v) => a + v[i], 0) / vs.length);
        // The hole is a prism along its axis: along it the vertices sit on a few end planes,
        // across it on the many corners of the cross. The axis is the coordinate axis with the
        // fewest distinct vertex coordinates (the sub-files are mirrored copies, 3648).
        const distinct = [0, 1, 2].map(i => new Set(vs.map(v => round(v[i], 0.01))).size);
        const k = distinct.indexOf(Math.min(...distinct));
        const axis = [0, 0, 0]; axis[k] = 1;
        if (distinct.filter(d => d === distinct[k]).length === 1) {
            const along = vs.map(v => dot(v, axis));
            axleHoleRuns.push({axis, foot: perp(c, axis), lo: Math.min(...along), hi: Math.max(...along), lines: [], sub: true});
        } else notes.push('axle-hole sub-files without one common axis');
    }
    // Pin holes and pins from the bore runs. A bore that is also an axle hole (an axle hole
    // with round counterbores) is the axle hole.
    const onAxleHole = run => axleHoleRuns.some(a => Math.abs(dot(a.axis, run.axis)) >= COS_1 &&
        len(perp(sub(run.foot, a.foot), a.axis)) <= LINE_EPS && Math.min(run.hi, a.hi) - Math.max(run.lo, a.lo) > 1);
    const holeRuns = [];
    let shaftRuns = [];
    const outward = [];
    // The part's top surface (LDraw -y up), without its studs: a bore from there to the bottom face goes through.
    const ys = verts.map(v => v[1]);
    const yb = Math.max(...ys);
    for (const run of boreRuns) {
        if (run.hi - run.lo < 3) continue;
        if (onAxleHole(run)) continue;
        // A System part's underside tube is a 6 LDU bore too (a slope draws it from plain
        // cylinders): there a pin hole is one LDraw draws with a Technic hole primitive, or a
        // vertical bore that runs right through the part (a Technic plate's holes, in its tubes).
        if (system && !run.lines.some(l => COMPOSITE.test(base(l.prim.file)) && !/^(confric|connect)/.test(base(l.prim.file)))) {
            const vertical = Math.abs(run.axis[1]) > 0.999;
            // Through: nothing of the part within 5.5 LDU of the line, its bore wall reaching the bottom face.
            const top = Math.min(...ys);
            const through = vertical && !verts.some(v => len(perp(sub(v, run.foot), run.axis)) < 5.5) &&
                !tris.some(t => segmentHits([run.foot[0], yb - 0.2, run.foot[2]], [0, top - yb - 1, 0], t));
            if (through) {
                run.through = true;
                // From the top of its wall down to the underside of the material around it.
                for (const v of verts) {
                    const r = len(perp(sub(v, run.foot), run.axis));
                    if (r >= 5.5 && r <= 9 && v[1] > run.hi) run.hi = v[1];
                }
            } else {
                notes.push(`6 LDU bore at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)} of a System part without a Technic hole primitive: a tube, not a pin hole`);
                continue;
            }
        }
        const {side, score, round: around} = sideOfRun(tris, run, 5.4, 6.6);
        // At least half round: a slot's end (32009) is a half cylinder, a corner fillet a quarter.
        if (side !== 0 && around < 0.45) {
            notes.push(`6 LDU wall at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)} along ${roundVec(run.axis, 1e-4)} covers ${Math.round(around * 16)}/16 of the circle: a fillet, not a bore`);
            continue;
        }
        if (side < 0) holeRuns.push(run);
        else if (side > 0) outward.push(run);
        else notes.push(`bore at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)} along ${roundVec(run.axis, 1e-4)}: side unclear (${score.toFixed(2)})`);
    }
    // A pin is a shaft: nothing in its slab reaches beyond a collar (but what is nearer another
    // pin beside it: 32138's two pins), and it is not an axle's own surface.
    const radial = (r, v) => len(perp(sub(v, r.foot), r.axis));
    for (const run of outward) {
        let reach = 0;
        for (const v of verts) {
            const t = dot(v, run.axis);
            if (t < run.lo + 1 || t > run.hi - 1) continue;
            const r = radial(run, v);
            if (outward.some(o => o !== run && Math.abs(dot(o.axis, run.axis)) >= COS_1 && radial(o, v) < r)) continue;
            reach = Math.max(reach, r);
        }
        const onAxle = axleRunsOut.some(q => Math.abs(dot(q.axis, run.axis)) >= COS_1 && len(perp(sub(run.foot, q.foot), q.axis)) <= LINE_EPS &&
            Math.min(run.hi, q.hi) - Math.max(run.lo, q.lo) > 1);
        if (reach > SHAFT_R || onAxle) notes.push(`outward 6 LDU wall at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)}: ${onAxle ? 'on an axle' : `mesh reaches ${reach.toFixed(1)} LDU`}, not a pin`);
        else shaftRuns.push(run);
    }
    // A pin's two halves meet at a collar: merge shaft runs across a gap ≤ 6 LDU whose mesh stays within a collar.
    shaftRuns.sort((a, b) => a.lo - b.lo);
    const merged = [];
    for (const r of shaftRuns) {
        const m = merged.find(q => Math.abs(dot(q.axis, r.axis)) >= COS_1 && len(perp(sub(r.foot, q.foot), q.axis)) <= LINE_EPS &&
            r.lo - q.hi <= 6 && r.lo >= q.hi - 1 && radialReach(verts, q, q.hi + 0.01, r.lo - 0.01) <= SHAFT_R);
        if (m) {
            m.hi = Math.max(m.hi, r.hi);
            m.lines.push(...r.lines);
        } else merged.push({...r, lines: [...r.lines]});
    }
    shaftRuns = merged;

    let h = 0; let pn = 0; let a = 0; let ah = 0;
    /** Inward bore runs too short for a pin (a linear actuator's spindle bearing: deriveLinearActuator). */
    const shortHoles = [];
    for (const run of holeRuns) {
        const blind = run.lines.map(l => l.prim).filter(p => base(p.file) === 'connhol3.dat');
        const L = run.hi - run.lo;
        if (L < 8) {
            notes.push(`bore run of ${round(L, 0.01)} LDU at ${roundVec(point(run, (run.lo + run.hi) / 2), 0.01)}: too short for a pin`);
            shortHoles.push(run);
            continue;
        }
        // A hole through a plate is as deep as the plate (8 LDU), not a Technic lattice length.
        const length = run.through ? round(L, 0.5) : latticeLength(L);
        const c = {id: `h${h++}`, type: 'pinhole', position: null, axis: snapAxis(run.axis), length};
        if (blind.length === 1) {
            const open = dot(apply(blind[0].x, [0, -10, 0]), run.axis);
            const bottom = dot(apply(blind[0].x, [0, 8, 0]), run.axis);
            const dir = Math.sign(bottom - open);
            c.position = point(run, open + dir * length / 2);
            c.closedEnd = dir;
        } else {
            if (blind.length > 1) notes.push(`${blind.length} one-sided bores in one run`);
            // Rounded to the lattice, a hole keeps the end that is the part's outer face (64178's
            // side holes: drawn 18 deep from the face, its inner counterbore a half cylinder).
            let t = (run.lo + run.hi) / 2;
            if (length !== L) {
                let emin = Infinity; let emax = -Infinity;
                for (const v of verts) {
                    if (len(perp(sub(v, run.foot), run.axis)) > 9) continue;
                    const u = dot(v, run.axis);
                    if (u < emin) emin = u;
                    if (u > emax) emax = u;
                }
                if (Math.abs(run.lo - emin) < 0.5) t = run.lo + length / 2;
                else if (Math.abs(run.hi - emax) < 0.5) t = run.hi - length / 2;
            }
            c.position = point(run, t);
        }
        connectors.push(c);
    }
    // A shaft ends where its mesh does, up to 2.5 LDU past its drawn wall (an axle's bevelled
    // end, an axle stop's face): 87083 is drawn 78 + a 2 LDU stop = 4L.
    // Never into the next shaft on the same line (an axle pin's axle half meets its pin half).
    const extendShaft = run => {
        let lo = run.lo; let hi = run.hi;
        let floor = run.lo - 2.5; let ceil = run.hi + 2.5;
        for (const o of [...shaftRuns, ...axleRunsOut]) {
            if (o === run || Math.abs(dot(o.axis, run.axis)) < COS_1 || len(perp(sub(o.foot, run.foot), run.axis)) > LINE_EPS) continue;
            if (o.hi <= run.lo + 0.01) floor = Math.max(floor, o.hi);
            if (o.lo >= run.hi - 0.01) ceil = Math.min(ceil, o.lo);
        }
        let first = Infinity; let last = -Infinity;
        for (const v of verts) {
            const t = dot(v, run.axis);
            if (t < first) first = t;
            if (t > last) last = t;
            if (len(perp(sub(v, run.foot), run.axis)) > SHAFT_R) continue;
            if (t < lo && t >= floor) lo = t;
            if (t > hi && t <= ceil) hi = t;
        }
        // Only out to the part's own end (a towball's neck or a block beside a pin is not shaft).
        return {...run, lo: Math.abs(lo - first) < 0.01 ? lo : run.lo, hi: Math.abs(hi - last) < 0.01 ? hi : run.hi};
    };
    for (const run0 of shaftRuns) {
        const run = extendShaft(run0);
        const L = run.hi - run.lo;
        if (L < 8) continue;
        const fr = run.lines.map(l => base(l.prim.file));
        let friction;
        if (fr.some(f => /^confric/.test(f))) friction = true;
        else if (fr.some(f => /^connect/.test(f))) friction = /\bwith friction\b/i.test(name) && !/\bwithout friction\b/i.test(name);
        else friction = !/\bwithout friction\b/i.test(name);
        const length = latticeLength(L);
        connectors.push({id: `p${pn++}`, type: 'pin', position: point(run, shaftCentre(verts, run, length)), axis: snapAxis(run.axis), length, friction});
    }
    for (const run of axleHoleRuns) {
        const L = run.hi - run.lo;
        if (L < 4) continue;
        connectors.push({id: `x${ah++}`, type: 'axlehole', position: point(run, (run.lo + run.hi) / 2), axis: snapAxis(run.axis), length: latticeLength(L)});
    }
    for (const run0 of axleRunsOut) {
        const run = extendShaft(run0);
        const L = run.hi - run.lo;
        if (L < 4) continue;
        const length = latticeLength(L);
        connectors.push({id: `a${a++}`, type: 'axle', position: point(run, shaftCentre(verts, run, length)), axis: snapAxis(run.axis), length});
    }

    // Towballs: a sphere LDraw draws (n-8sphe.dat) of 8 LDU radius (6.4 mm), not inside
    // another sphere primitive; the ball points away from the rest of the part.
    const balls = [];
    for (const p of prims) {
        if (!/^\d+-\d+sphe\.dat$/.test(base(p.file)) || p.via.some(f => /sphe\.dat$/.test(f))) continue;
        const r = [0, 1, 2].map(i => len(column(p.x, i)));
        if (r.some(q => Math.abs(q - 8) > 0.5) || balls.some(b => len(sub(b, p.x.t)) < 0.5)) continue;
        balls.push(p.x.t.slice());
    }
    const centre = scale(add(bounds([verts]).min, bounds([verts]).max), 0.5);
    balls.forEach((b, i) => {
        const rest = connectors.length ? scale(connectors.reduce((acc, c) => add(acc, c.position), [0, 0, 0]), 1 / connectors.length) : centre;
        const away = sub(b, rest);
        connectors.push({id: `b${i}`, type: 'ball', position: b, axis: len(away) > 1e-6 ? snapAxis(unit(away)) : [0, -1, 0]});
    });

    // Studs.
    const studs = prims.filter(p => TOP_STUD.test(base(p.file)) && !p.via.some(f => IN_A_STUD.test(base(f))))
        .map(p => ({position: p.x.t.slice(), axis: snapAxis(unit(scale(column(p.x, 1), -1))), height: 4 * len(column(p.x, 1)), radius: 6 * len(column(p.x, 0))}));
    studs.forEach((s, i) => connectors.push({id: `s${i}`, type: 'stud', position: s.position, axis: s.axis, length: s.height}));
    const tubes = prims.filter(p => OPEN_TUBE.test(base(p.file)) && !p.via.some(f => IN_A_STUD.test(base(f))));
    return {connectors, notes, studs, tubes, tris, verts, shortHoles};
};

// ---- the underside: anti-studs ------------------------------------------------

/** Does the segment p + t·d, t ∈ [0, 1], cross triangle t? (Möller–Trumbore) */
const segmentHits = (p, d, tri) => {
    const [a, b, c] = tri.v;
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const q = cross(d, e2);
    const det = dot(e1, q);
    if (Math.abs(det) < 1e-12) return false;
    const s = sub(p, a);
    const u = dot(s, q) / det;
    if (u < -1e-9 || u > 1 + 1e-9) return false;
    const r = cross(s, e1);
    const v = dot(d, r) / det;
    if (v < -1e-9 || u + v > 1 + 1e-9) return false;
    const t = dot(e2, r) / det;
    return t >= 0 && t <= 1;
};

/**
 * Anti-stud cells of a stud-grid part, measured: on the 20 LDU stud grid (aligned with
 * the part's studs, or with its footprint when it has none), at the part's bottom face,
 * where a stud fits (no mesh within a 5.5 LDU cylinder 4 LDU up from the bottom face),
 * is gripped (the part's walls or tubes reach within 8.6 LDU of the cell's axis at the
 * bottom face) and is under the part (the part is above the cell).
 * The LDraw frame has -y up; the bottom face is the mesh's largest y.
 */
export const antiStudCells = (tris, verts, studs) => {
    const b = bounds([verts]);
    const yb = b.max[1];
    // The stud grid: aligned with the part's studs, or with its footprint (a jumper plate's
    // centre stud is half a stud off its cells): whichever finds more cells.
    const phases = [[0, 2].map(i => ((b.min[i] + 10) % 20 + 20) % 20)];
    if (studs.length) phases.push([0, 2].map(i => ((studs[0].position[i] % 20) + 20) % 20));
    // Triangles over a cell's square, and those in the 4 LDU a stud reaches in.
    const over = (x, z, r) => tris.filter(t => Math.min(t.v[0][0], t.v[1][0], t.v[2][0]) <= x + r && Math.max(t.v[0][0], t.v[1][0], t.v[2][0]) >= x - r &&
        Math.min(t.v[0][2], t.v[1][2], t.v[2][2]) <= z + r && Math.max(t.v[0][2], t.v[1][2], t.v[2][2]) >= z - r);
    let best = [];
    for (const [px, pz] of phases) {
        const cells = [];
        for (let x = Math.ceil((b.min[0] + 10 - 0.01 - px) / 20) * 20 + px; x <= b.max[0] - 10 + 0.01; x += 20) {
            for (let z = Math.ceil((b.min[2] + 10 - 0.01 - pz) / 20) * 20 + pz; z <= b.max[2] - 10 + 0.01; z += 20) {
                if (cellTakesStud(over(x, z, 10), verts, x, z, yb, b)) cells.push([round(x, 0.01), yb, round(z, 0.01)]);
            }
        }
        if (cells.length > best.length) best = cells;
    }
    return best;
};

/** Distance in the x/z plane from (x, z) to a triangle's footprint (0 inside it). */
const footprintDistance = (x, z, t) => {
    const [a, b2, c] = t.v.map(v => [v[0], v[2]]);
    const crossZ = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const pt = [x, z];
    const d1 = crossZ(a, b2, pt); const d2 = crossZ(b2, c, pt); const d3 = crossZ(c, a, pt);
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return 0;
    const seg = (p, q) => {
        const dx = q[0] - p[0]; const dz = q[1] - p[1];
        const l2 = dx * dx + dz * dz;
        const u = l2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2)) : 0;
        return Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz);
    };
    return Math.min(seg(a, b2), seg(b2, c), seg(c, a));
};

/**
 * One anti-stud cell at (x, z) of the bottom face yb: a stud fits (vertical segments through
 * its volume cross no triangle; no vertex inside it), it is gripped (a face of the part within
 * 5.4..8.6 LDU of the cell's axis, in the 4 LDU above the bottom face: walls, tubes, rods) and
 * the cell is under the part (a ray up from it meets the part).
 */
const cellTakesStud = (local, verts, x, z, yb, b) => {
    {
        {
            const samples = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [5.4 * Math.cos(k * Math.PI / 4), 5.4 * Math.sin(k * Math.PI / 4)]),
                ...[0, 1, 2, 3].map(k => [3 * Math.cos(k * Math.PI / 2 + 0.4), 3 * Math.sin(k * Math.PI / 2 + 0.4)])];
            const free = samples.every(([dx, dz]) => !local.some(t => segmentHits([x + dx, yb - 3.6, z + dz], [0, 3.3, 0], t))) &&
                !verts.some(v => v[1] > yb - 3.6 && v[1] < yb - 0.3 && Math.hypot(v[0] - x, v[2] - z) < 5.5);
            if (!free) return false;
            const grip = local.some(t => {
                const ylo = Math.min(t.v[0][1], t.v[1][1], t.v[2][1]); const yhi = Math.max(t.v[0][1], t.v[1][1], t.v[2][1]);
                if (yhi < yb - 4.01 || ylo > yb + 0.01) return false;
                const d = footprintDistance(x, z, t);
                return d >= 5.4 && d <= 8.6;
            });
            if (!grip) return false;
            // Under the part: a ray up from the cell hits the part.
            return local.some(t => segmentHits([x, yb - 0.5, z], [0, b.min[1] - yb - 1, 0], t));
        }
    }
};

// ---- colliders ----------------------------------------------------------------

/** Unit quaternion (xyzw) rotating +y onto axis `a` (for a cylinder collider). */
const quatYTo = a => {
    const d = dot([0, 1, 0], a);
    if (d > 1 - 1e-9) return null;
    if (d < -1 + 1e-9) return [1, 0, 0, 0];
    const c = cross([0, 1, 0], a);
    const s = Math.sqrt((1 + d) * 2);
    const q = [c[0] / s, c[1] / s, c[2] / s, s / 2];
    return q.map(v => round(v, 1e-12));
};

const boxCollider = (lo, hi, extra = {}) => {
    const c = {shape: 'box', halfExtents: [0, 1, 2].map(i => round((hi[i] - lo[i]) / 2, 0.01))};
    const centre = [0, 1, 2].map(i => round((hi[i] + lo[i]) / 2, 0.01));
    if (centre.some(v => v !== 0)) c.position = centre;
    return {...c, ...extra};
};

/**
 * A region box around a shaft connector (axis-aligned shafts only): the shaft's segment,
 * as wide as the mesh along it reaches (≤ SHAFT_R).
 */
const shaftRegion = (c, verts) => {
    const k = c.axis.findIndex(v => Math.abs(v) === 1);
    if (k < 0) return null;
    const run = {axis: c.axis, foot: perp(c.position, c.axis)};
    const t = dot(c.position, c.axis);
    const r = Math.min(SHAFT_R, Math.max(6, radialReach(verts, run, t - c.length / 2, t + c.length / 2)));
    const lo = c.position.map((v, i) => (i === k ? v - c.length / 2 : v - r));
    const hi = c.position.map((v, i) => (i === k ? v + c.length / 2 : v + r));
    return boxCollider(lo, hi, {region: c.type});
};

/** Is v inside a shaft's region (its segment ±0.5, within SHAFT_R of its axis)? */
const inShaft = (v, c) => {
    const d = sub(v, c.position);
    const along = dot(d, c.axis);
    return Math.abs(along) <= c.length / 2 + 0.5 && len(perp(d, c.axis)) <= SHAFT_R;
};
/** Is v part of a stud (within its cylinder from its base up)? */
const inStud = (v, s) => {
    const d = sub(v, s.position);
    const along = dot(d, s.axis);
    return along >= -0.01 && along <= s.height + 0.6 && len(perp(d, s.axis)) <= s.radius + 0.6;
};

/**
 * Solid boxes for a body: its outer envelope seen along coordinate axis `k`, on a grid of
 * cells; a cell is occupied when a line along k through it (centre or a corner inset)
 * meets the body, and spans the extremes of what it meets (cavities filled; through holes
 * filled when `fill` says so). `floor` (System parts): every occupied cell reaches the
 * bottom face. Cells are merged greedily into boxes of nearly equal span.
 */
const envelopeBoxes = (tris, verts, k, {cell = 2, fill = () => null, floor = null, maxBoxes = 16, tol = 2.5} = {}) => {
    const [i, j] = [0, 1, 2].filter(q => q !== k);
    const b = bounds([verts]);
    const ni = Math.max(1, Math.ceil((b.max[i] - b.min[i]) / cell - 1e-9));
    const nj = Math.max(1, Math.ceil((b.max[j] - b.min[j]) / cell - 1e-9));
    const ci = (b.max[i] - b.min[i]) / ni;
    const cj = (b.max[j] - b.min[j]) / nj;
    // Bucket triangles by their (i, j) footprint.
    const buckets = new Map();
    const key = (a, c) => a * 100003 + c;
    for (const t of tris) {
        const lo = [Math.min(...t.v.map(v => v[i])), Math.min(...t.v.map(v => v[j]))];
        const hi = [Math.max(...t.v.map(v => v[i])), Math.max(...t.v.map(v => v[j]))];
        for (let a = Math.max(0, Math.floor((lo[0] - b.min[i]) / ci)); a <= Math.min(ni - 1, Math.floor((hi[0] - b.min[i]) / ci)); a++) {
            for (let c = Math.max(0, Math.floor((lo[1] - b.min[j]) / cj)); c <= Math.min(nj - 1, Math.floor((hi[1] - b.min[j]) / cj)); c++) {
                const kk = key(a, c);
                if (!buckets.has(kk)) buckets.set(kk, []);
                buckets.get(kk).push(t);
            }
        }
    }
    const span = new Array(ni * nj).fill(null);
    const inset = 0.25;
    for (let a = 0; a < ni; a++) {
        for (let c = 0; c < nj; c++) {
            const ts = buckets.get(key(a, c)) || [];
            let lo = Infinity; let hi = -Infinity;
            const pts = [[0.5, 0.5], [inset, inset], [1 - inset, inset], [inset, 1 - inset], [1 - inset, 1 - inset], [0.02, 0.5], [0.98, 0.5], [0.5, 0.02], [0.5, 0.98]];
            for (const [fa, fc] of pts) {
                const p = [0, 0, 0];
                p[i] = b.min[i] + (a + fa) * ci;
                p[j] = b.min[j] + (c + fc) * cj;
                for (const t of ts) {
                    // Line along k through p against the triangle, in 2D barycentrics.
                    const [A, B, C] = t.v;
                    const d = (B[j] - C[j]) * (A[i] - C[i]) + (C[i] - B[i]) * (A[j] - C[j]);
                    if (Math.abs(d) < 1e-12) continue;
                    const w1 = ((B[j] - C[j]) * (p[i] - C[i]) + (C[i] - B[i]) * (p[j] - C[j])) / d;
                    const w2 = ((C[j] - A[j]) * (p[i] - C[i]) + (A[i] - C[i]) * (p[j] - C[j])) / d;
                    const w3 = 1 - w1 - w2;
                    if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
                    const h = w1 * A[k] + w2 * B[k] + w3 * C[k];
                    lo = Math.min(lo, h); hi = Math.max(hi, h);
                }
                const f = fill(p);
                if (f) { lo = Math.min(lo, f[0]); hi = Math.max(hi, f[1]); }
            }
            if (lo <= hi) span[a * nj + c] = [lo, floor === null ? hi : Math.max(hi, floor)];
        }
    }
    // Greedy: the largest rectangle of occupied cells whose spans agree within 2.5 LDU, repeatedly.
    const covered = new Array(ni * nj).fill(false);
    const boxes = [];
    const remaining = () => span.some((s, q) => s && !covered[q]);
    while (remaining() && boxes.length < maxBoxes) {
        let best = null;
        for (let a0 = 0; a0 < ni; a0++) {
            for (let c0 = 0; c0 < nj; c0++) {
                const s0 = span[a0 * nj + c0];
                if (!s0 || covered[a0 * nj + c0]) continue;
                // Grow along j first, then along i, keeping the span envelope tight.
                let lo = s0[0]; let hi = s0[1];
                let c1 = c0;
                while (c1 + 1 < nj) {
                    const s = span[a0 * nj + c1 + 1];
                    if (!s || Math.abs(s[0] - lo) > tol || Math.abs(s[1] - hi) > tol) break;
                    lo = Math.min(lo, s[0]); hi = Math.max(hi, s[1]); c1++;
                }
                let a1 = a0;
                while (a1 + 1 < ni) {
                    let ok = true; let l2 = lo; let h2 = hi;
                    for (let c = c0; c <= c1; c++) {
                        const s = span[(a1 + 1) * nj + c];
                        if (!s || Math.abs(s[0] - lo) > tol || Math.abs(s[1] - hi) > tol) { ok = false; break; }
                        l2 = Math.min(l2, s[0]); h2 = Math.max(h2, s[1]);
                    }
                    if (!ok) break;
                    lo = l2; hi = h2; a1++;
                }
                let gain = 0;
                for (let a = a0; a <= a1; a++) for (let c = c0; c <= c1; c++) if (!covered[a * nj + c]) gain++;
                if (!best || gain > best.gain) best = {a0, a1, c0, c1, lo, hi, gain};
            }
        }
        for (let a = best.a0; a <= best.a1; a++) for (let c = best.c0; c <= best.c1; c++) covered[a * nj + c] = true;
        const lo = [0, 0, 0]; const hi = [0, 0, 0];
        lo[i] = b.min[i] + best.a0 * ci; hi[i] = b.min[i] + (best.a1 + 1) * ci;
        lo[j] = b.min[j] + best.c0 * cj; hi[j] = b.min[j] + (best.c1 + 1) * cj;
        lo[k] = best.lo; hi[k] = best.hi;
        boxes.push({lo, hi});
    }
    return {boxes, complete: !remaining(), cells: span.filter(Boolean).length, total: ni * nj};
};

/** Is vertex v inside collider c (part frame), with tolerance? Mirrors the metadata test. */
const quatRotate = (q, v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
export const insideCollider = (c, v, tol = 1.5) => {
    const q = c.rotation || [0, 0, 0, 1];
    const l = quatRotate([-q[0], -q[1], -q[2], q[3]], sub(v, c.position || [0, 0, 0]));
    if (c.shape === 'box') return l.every((a, i) => Math.abs(a) <= c.halfExtents[i] + tol);
    if (c.shape === 'cylinder') return Math.abs(l[1]) <= c.halfHeight + tol && Math.hypot(l[0], l[2]) <= c.radius + tol;
    return len(l) <= c.radius + tol;
};
export const colliderVolume = c => (c.shape === 'box' ? 8 * c.halfExtents[0] * c.halfExtents[1] * c.halfExtents[2]
    : c.shape === 'cylinder' ? Math.PI * c.radius ** 2 * 2 * c.halfHeight : 4 / 3 * Math.PI * c.radius ** 3);

/** The share of vertices inside some collider, and the colliders' volume over the mesh box's. */
export const colliderFit = (colliders, verts) => {
    const enclosed = verts.filter(v => colliders.some(c => insideCollider(c, v))).length / verts.length;
    const b = bounds([verts]);
    const boxVol = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
    return {enclosed, ratio: colliders.reduce((s, c) => s + colliderVolume(c), 0) / boxVol};
};

/**
 * Colliders for a part from its mesh and connectors.
 * @param {{system: boolean}} kind  a stud-grid part: its body reaches its bottom face
 */
export const deriveColliders = ({tris, verts, connectors, studs}, {system = false} = {}) => {
    const notes = [];
    const shafts = connectors.filter(c => c.type === 'pin' || c.type === 'axle');
    const allShaftConnectors = connectors.length > 0 && connectors.every(c => c.type === 'pin' || c.type === 'axle' || c.type === 'ball');
    const b = bounds([verts]);
    const aabb = () => boxCollider(b.min, b.max);
    if (allShaftConnectors) return {colliders: [aabb()], notes};

    const colliders = [];
    const regionOf = v => shafts.find(c => inShaft(v, c)) || null;
    for (const c of shafts) {
        const r = shaftRegion(c, verts);
        if (!r) return {colliders: null, notes: [...notes, `shaft ${c.id} is not along a coordinate axis`]};
        colliders.push(r);
    }
    // The stud layer, one region box per level (studs of one height and direction).
    const levels = new Map();
    for (const s of studs) {
        const k = `${s.axis.join(',')}|${round(dot(s.position, s.axis), 0.01)}`;
        if (!levels.has(k)) levels.set(k, []);
        levels.get(k).push(s);
    }
    for (const group of levels.values()) {
        const vs = verts.filter(v => group.some(s => inStud(v, s)));
        if (!vs.length) continue;
        const sb = bounds([vs]);
        colliders.push(boxCollider(sb.min, sb.max, {region: 'stud'}));
    }
    const isBody = v => !regionOf(v) && !studs.some(s => inStud(v, s));
    const bodyTris = tris.filter(t => t.v.some(isBody));
    const bodyVerts = bodyTris.flatMap(t => t.v).filter(isBody);
    if (!bodyVerts.length) return {colliders: colliders.length ? colliders : [aabb()], notes};
    const bb = bounds([bodyVerts]);
    const ext = [0, 1, 2].map(q => bb.max[q] - bb.min[q]);
    if (ext.some(e => e < 0.5)) return {colliders: colliders.length ? colliders : [aabb()], notes: [...notes, 'flat body: the regions enclose it']};

    // Round body: every vertex within the circle inscribed in the box across a hole axis.
    const holes = connectors.filter(c => c.type === 'axlehole' || c.type === 'pinhole');
    const roundAxis = [...new Set(holes.map(c => c.axis.findIndex(v => Math.abs(v) === 1)).filter(q => q >= 0))];
    for (const k of roundAxis) {
        const [i, j] = [0, 1, 2].filter(q => q !== k);
        const centre = holes.find(c => Math.abs(c.axis[k]) === 1).position;
        const R = Math.max(...bodyVerts.map(v => Math.hypot(v[i] - centre[i], v[j] - centre[j])));
        const square = Math.abs((bb.max[i] - bb.min[i]) - (bb.max[j] - bb.min[j])) <= 1 &&
            Math.abs((bb.max[i] + bb.min[i]) / 2 - centre[i]) <= 0.5 && Math.abs((bb.max[j] + bb.min[j]) / 2 - centre[j]) <= 0.5;
        if (square && R <= Math.max(ext[i], ext[j]) / 2 + 0.5 && R > 7) {
            const axis = [0, 0, 0]; axis[k] = 1;
            const c = {shape: 'cylinder', radius: round(R, 0.01), halfHeight: round(ext[k] / 2, 0.01)};
            const pos = centre.slice(); pos[k] = (bb.max[k] + bb.min[k]) / 2;
            if (pos.some(v => Math.abs(v) > 1e-9)) c.position = roundVec(pos, 0.01);
            const q = quatYTo(axis);
            if (q) c.rotation = q;
            colliders.push(c);
            return {colliders, notes};
        }
    }

    // Envelope along the hole axis most holes share (System parts: along y, floor at the bottom face).
    const counts = [0, 0, 0];
    for (const c of holes) { const q = c.axis.findIndex(v => Math.abs(v) === 1); if (q >= 0) counts[q]++; }
    let k = system ? 1 : counts.indexOf(Math.max(...counts));
    if (!system && Math.max(...counts) === 0) k = ext.indexOf(Math.min(...ext));
    // Through-holes along k are part of the body (a ray into a hole hits the part).
    const along = holes.filter(c => Math.abs(c.axis[k]) === 1);
    const fill = p => {
        for (const c of along) {
            const d = sub(p, c.position);
            if (len(perp(d, c.axis)) <= 6.5) return [c.position[k] - c.length / 2, c.position[k] + c.length / 2];
        }
        return null;
    };
    // A liftarm, frame or block is its hole chains: one box along each straight run of holes
    // (a bent liftarm's arms, a frame's sides), when those boxes enclose the body.
    const enclosesBody = cs => bodyVerts.filter(v => cs.some(c => insideCollider(c, v))).length / bodyVerts.length;
    // Every hole is a point of the chains (a frame's side holes run across its plane), once per
    // place; the chains lie in the plane (across x, y or z) whose boxes enclose the body tightest.
    if (!system && holes.length >= 2) {
        let best = null;
        for (let kk = 0; kk < 3; kk++) {
            const kAxis = [0, 0, 0]; kAxis[kk] = 1;
            const points = [];
            for (const c of holes) if (!points.some(q => len(perp(sub(q.position, c.position), kAxis)) < 0.5)) points.push(c);
            const chain = chainBoxes(points, bodyVerts, kk);
            if (!chain || !chain.length || enclosesBody(chain) < 0.995) continue;
            const vol = chain.reduce((acc, c) => acc + colliderVolume(c), 0);
            // Boxes that overlap more than they save (a quarter-circle liftarm's chords) are no fit.
            if (vol > ext[0] * ext[1] * ext[2]) continue;
            if (!best || vol < best.vol) best = {chain, vol};
        }
        if (best) {
            colliders.push(...best.chain);
            return {colliders, notes};
        }
    }
    const cell = Math.max(2, Math.max(...ext) / 120);
    // A System part is its outline from its top surface down to its bottom face; a slope's
    // top steps down in 4 LDU stairs.
    const env = envelopeBoxes(bodyTris, bodyVerts, k, {cell, fill, floor: system ? b.max[1] : null, maxBoxes: 24, tol: system ? 4 : 2.5});
    const cellVol = env.boxes.reduce((s, q) => s + (q.hi[0] - q.lo[0]) * (q.hi[1] - q.lo[1]) * (q.hi[2] - q.lo[2]), 0);
    const bodyBoxVol = ext[0] * ext[1] * ext[2];
    // A body that fills its box (≥ 85 %) is one box, as a beam is.
    if (!env.complete || cellVol >= 0.85 * bodyBoxVol) colliders.push(boxCollider(bb.min, bb.max));
    else for (const q of env.boxes) if ([0, 1, 2].every(i => q.hi[i] - q.lo[i] >= 0.5)) colliders.push(boxCollider(q.lo, q.hi));
    if (!env.complete) notes.push('body envelope needed more than 24 boxes: one box');
    return {colliders, notes};
};

/** Unit quaternion (xyzw) of a rotation matrix given by its columns. */
const quatOfColumns = (x, y, z) => {
    const m = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
    const tr = m[0][0] + m[1][1] + m[2][2];
    let q;
    if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
        const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
        q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
    } else if (m[1][1] > m[2][2]) {
        const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
        q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
    } else {
        const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
        q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
    }
    const n = Math.hypot(...q);
    return q.map(v => round(v / n, 1e-12));
};

/**
 * Boxes along the straight runs of a part's holes (all along coordinate axis k): holes 15.5–20.5
 * LDU apart are neighbours (a liftarm's pitch is 20, a bent liftarm's slot 16.6); collinear
 * neighbour pairs merge into runs; each run is a box from its first hole to its last ± 10, as
 * wide as the body is around it (≤ 12), as thick as the body along k. A lone hole is a 20 LDU square.
 */
const chainBoxes = (holes, verts, k) => {
    if (holes.length < 2) return null;
    const kAxis = [0, 0, 0]; kAxis[k] = 1;
    const P = holes.map(c => perp(c.position, kAxis));
    const klo = Math.min(...verts.map(v => v[k])); const khi = Math.max(...verts.map(v => v[k]));
    const segs = [];
    const used = new Set();
    for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
            const d = len(sub(P[j], P[i]));
            if (d < 15.5 || d > 20.5) continue;
            const dir = canonical(sub(P[j], P[i]));
            const foot = perp(P[i], dir);
            let s = segs.find(q => Math.abs(dot(q.dir, dir)) >= COS_1 && len(perp(sub(foot, q.foot), q.dir)) <= LINE_EPS &&
                Math.min(dot(P[i], q.dir), dot(P[j], q.dir)) <= q.hi + 0.5 && Math.max(dot(P[i], q.dir), dot(P[j], q.dir)) >= q.lo - 0.5);
            if (!s) { s = {dir, foot, lo: Infinity, hi: -Infinity}; segs.push(s); }
            s.lo = Math.min(s.lo, dot(P[i], s.dir), dot(P[j], s.dir));
            s.hi = Math.max(s.hi, dot(P[i], s.dir), dot(P[j], s.dir));
            used.add(i); used.add(j);
        }
    }
    // Runs found from different pairs that meet or overlap are one run.
    for (let merged = true; merged;) {
        merged = false;
        for (let a = 0; a < segs.length && !merged; a++) {
            for (let b = a + 1; b < segs.length && !merged; b++) {
                const p = segs[a]; const q = segs[b];
                if (Math.abs(dot(p.dir, q.dir)) < COS_1 || len(perp(sub(q.foot, p.foot), p.dir)) > LINE_EPS) continue;
                const qlo = Math.min(dot(add(q.foot, scale(q.dir, q.lo)), p.dir), dot(add(q.foot, scale(q.dir, q.hi)), p.dir));
                const qhi = Math.max(dot(add(q.foot, scale(q.dir, q.lo)), p.dir), dot(add(q.foot, scale(q.dir, q.hi)), p.dir));
                if (qlo > p.hi + 0.5 || qhi < p.lo - 0.5) continue;
                p.lo = Math.min(p.lo, qlo); p.hi = Math.max(p.hi, qhi);
                segs.splice(b, 1);
                merged = true;
            }
        }
    }
    for (let i = 0; i < P.length; i++) {
        if (used.has(i)) continue;
        const dir = k === 0 ? [0, 1, 0] : [1, 0, 0];
        segs.push({dir, foot: perp(P[i], dir), lo: dot(P[i], dir), hi: dot(P[i], dir)});
    }
    return segs.map(q => {
        // As wide as the body is beside the run (≤ 12 from its line), and as long as the body
        // reaches past its end holes (≤ 10.5: a liftarm's round end).
        const across = canonical(cross(kAxis, q.dir));
        let w = 0;
        let tlo = q.lo; let thi = q.hi;
        for (const v of verts) {
            const t = dot(v, q.dir);
            const a = Math.abs(dot(sub(perp(v, kAxis), q.foot), across));
            if (t >= q.lo - 10.5 && t <= q.hi + 10.5 && a <= 12) {
                w = Math.max(w, a);
                tlo = Math.min(tlo, t); thi = Math.max(thi, t);
            }
        }
        tlo = Math.max(tlo, q.lo - 10); thi = Math.min(thi, q.hi + 10);
        const centre = add(add(q.foot, scale(q.dir, (tlo + thi) / 2)), scale(kAxis, (klo + khi) / 2));
        // Local axes: x along the run, y along k, z across.
        const he = [round((thi - tlo) / 2, 0.01), round((khi - klo) / 2, 0.01), round(Math.max(w, 6), 0.01)];
        const c = {shape: 'box', halfExtents: he};
        if (centre.some(v => Math.abs(v) > 1e-9)) c.position = roundVec(centre, 0.001);
        const z = cross(q.dir, kAxis);
        const axisAligned = [q.dir, z].every(v => v.filter(x => Math.abs(x) > 1e-6).length === 1);
        if (axisAligned) {
            // Express as an axis-aligned box: half extents in x/y/z order.
            const h = [0, 0, 0];
            h[q.dir.findIndex(x => Math.abs(x) > 1e-6)] = he[0];
            h[k] = he[1];
            h[z.findIndex(x => Math.abs(x) > 1e-6)] = he[2];
            c.halfExtents = h;
        } else c.rotation = quatOfColumns(q.dir, kAxis, z);
        return c;
    });
};


// ---- racks and worms (kinds/rack.js, kinds/worm.js) -------------------------------

const MODULE_LDU = 2.5;
const TOOTH_PITCH = Math.PI * MODULE_LDU;

/**
 * A rack's toothed strip, measured: along the part's longest axis, the teeth face the
 * perpendicular direction whose outermost vertices (the tips) repeat at the tooth pitch
 * (π · 2.5 LDU) most often. The pitch line is one module below the tips; the strip runs
 * from the first tip to the last (± half a pitch), as wide as the tips are.
 */
export const rackTeeth = verts => {
    const b = bounds([verts]);
    const ext = [0, 1, 2].map(i => b.max[i] - b.min[i]);
    const k = ext.indexOf(Math.max(...ext));
    const axis = [0, 0, 0]; axis[k] = 1;
    let best = null;
    for (const i of [0, 1, 2].filter(q => q !== k)) {
        for (const sgn of [1, -1]) {
            const n = [0, 0, 0]; n[i] = sgn;
            const tip = Math.max(...verts.map(v => dot(v, n)));
            const tips = verts.filter(v => Math.abs(dot(v, n) - tip) <= 0.05);
            const along = [...new Set(tips.map(v => round(dot(v, axis), 0.1)))].sort((x, y) => x - y);
            // Distinct tooth crests: tip positions grouped within a third of a pitch.
            const crests = [];
            for (const t of along) if (!crests.length || t - crests[crests.length - 1].hi > TOOTH_PITCH / 3) crests.push({lo: t, hi: t}); else crests[crests.length - 1].hi = t;
            if (crests.length < 3) continue;
            const mids = crests.map(c => (c.lo + c.hi) / 2);
            const gaps = mids.slice(1).map((m, q) => m - mids[q]);
            if (!gaps.every(g => Math.abs(g - TOOTH_PITCH) <= 0.6)) continue;
            if (!best || crests.length > best.crests) best = {n, tip, tips, crests: crests.length, lo: along[0], hi: along[along.length - 1]};
        }
    }
    if (!best) return null;
    const w = [0, 1, 2].find(q => q !== k && best.n[q] === 0);
    const across = best.tips.map(v => v[w]);
    const position = [0, 0, 0];
    position[k] = round((best.lo + best.hi) / 2, 0.01);
    position[best.n.findIndex(x => x !== 0)] = round(best.tip * best.n.find(x => x !== 0) - MODULE_LDU * best.n.find(x => x !== 0), 0.01);
    position[w] = round((Math.min(...across) + Math.max(...across)) / 2, 0.01);
    return {position, axis, length: round(best.hi - best.lo, 0.5), data: {normal: best.n, widthLdu: round(Math.max(...across) - Math.min(...across), 0.5)}};
};

/**
 * A worm's thread about its axle hole: tip radius − one module is its pitch radius; the
 * crest (vertices at the tip radius) runs the thread's length; the hand is the helix the
 * crest follows (phase 2π·z/lead − hand·θ constant along it, lead = π · 2.5 LDU, one start).
 */
export const wormThread = (verts, hole) => {
    const a = hole.axis;
    const vs = verts.map(v => sub(v, hole.position));
    const tip = Math.max(...vs.map(v => len(perp(v, a))));
    const crest = vs.filter(v => len(perp(v, a)) > tip - 0.6);
    const along = crest.map(v => dot(v, a));
    const lo = Math.min(...along); const hi = Math.max(...along);
    const x0 = perp(Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], a);
    const e1 = unit(x0); const e2 = cross(a, e1);
    const coherence = h => {
        let cx = 0; let cy = 0;
        for (const v of crest) {
            const ph = 2 * Math.PI * dot(v, a) / TOOTH_PITCH - h * Math.atan2(dot(v, e2), dot(v, e1));
            cx += Math.cos(ph); cy += Math.sin(ph);
        }
        return Math.hypot(cx, cy) / crest.length;
    };
    const right = coherence(1); const left = coherence(-1);
    if (Math.max(right, left) < 0.5 || Math.min(right, left) > 0.2) return null;
    const centre = add(hole.position, scale(a, (lo + hi) / 2));
    return {position: roundVec(centre, 0.01), axis: a, length: round(hi - lo, 0.5),
        data: {pitchRadiusLdu: round(tip - MODULE_LDU, 0.01), hand: right > left ? 1 : -1, starts: 1}};
};

// ---- turntables, linear actuators, buckets (kinds/turntable.js, kinds/screw.js) ----------

/** An axis-aligned box collider around the vertices `pick` selects (null when it selects none). */
const fitBox = (verts, pick, extra = {}) => {
    const vs = verts.filter(pick);
    if (!vs.length) return null;
    const b = bounds([vs]);
    return boxCollider(b.min, b.max, extra);
};

/**
 * A Technic turntable half: "Technic Turntable <n> Tooth Top|Bottom" (18938/18939). LDraw draws
 * the two halves ASSEMBLED, about the y axis through the origin (their meshes nest there without
 * interpenetrating: test/bw-sim-turntable.test.mjs), so each half's joint connector is at the
 * origin on that axis — 'turntable-ring' on the top, 'turntable-race' on the bottom; the pair is
 * a hinge (kinds/turntable.js). The top carries the teeth: a spur `gear` of <n> teeth (the
 * description's number, which the test counts on the mesh) centred on the axis at the middle of
 * the tooth crests' height. Colliders: the mounting blocks (the mesh beyond the disc's height,
 * one box per side) and the disc as a cylinder of the mesh's radius over the height where the
 * mesh reaches 80 % of it.
 */
export const TURNTABLE_DESC = /^Technic Turntable (\d+) Tooth (Top|Bottom)$/;
export const deriveTurntable = (desc, verts, holes) => {
    const m = TURNTABLE_DESC.exec(desc);
    if (!m) return null;
    const problems = [];
    const teeth = Number(m[1]);
    const top = m[2] === 'Top';
    const b = bounds([verts]);
    if (Math.abs(b.max[0] + b.min[0]) > 1 || Math.abs(b.max[2] + b.min[2]) > 1) problems.push('the turntable is not drawn about the y axis');
    const radius = v => Math.hypot(v[0], v[2]);
    const rMax = Math.max(...verts.map(radius));
    // The mounting blocks: the mesh around each side's row of pin holes (one hole radius and a
    // wall beyond the holes' extent).
    const sides = [1, -1].map(sg => holes.filter(h => Math.sign(h.position[0]) === sg)).filter(hs => hs.length);
    const blockOf = hs => {
        const lo = [0, 1, 2].map(i => Math.min(...hs.map(h => h.position[i] - (h.axis[i] ? h.length / 2 : 10))) - 0.5);
        const hi = [0, 1, 2].map(i => Math.max(...hs.map(h => h.position[i] + (h.axis[i] ? h.length / 2 : 10))) + 0.5);
        return v => v.every((x, i) => x >= lo[i] && x <= hi[i]);
    };
    const inBlock = sides.map(blockOf);
    const rest = verts.filter(v => !inBlock.some(f => f(v)));
    // The rest: a hub (the mesh within half the radius) and the toothed disc around it.
    const hub = rest.filter(v => radius(v) < 0.5 * rMax);
    const disc = rest.filter(v => radius(v) >= 0.5 * rMax);
    const cylinder = vs => {
        const ys = vs.map(v => v[1]);
        const y0 = Math.min(...ys); const y1 = Math.max(...ys);
        return {shape: 'cylinder', radius: round(Math.max(...vs.map(radius)), 0.01), halfHeight: round((y1 - y0) / 2, 0.01), position: [0, round((y0 + y1) / 2, 0.01), 0]};
    };
    const dy = disc.map(v => v[1]);
    const connectors = [...holes, {id: 't', type: top ? 'turntable-ring' : 'turntable-race', position: [0, 0, 0], axis: [0, -1, 0],
        length: round(Math.max(...dy) - Math.min(...dy), 0.5)}];
    const colliders = [cylinder(disc), ...(hub.length ? [cylinder(hub)] : []), ...inBlock.map(f => fitBox(verts, f)).filter(Boolean)];
    let gear = null;
    if (top) {
        const crest = verts.filter(v => radius(v) > rMax - 0.3).map(v => v[1]);
        const centre = round((Math.min(...crest) + Math.max(...crest)) / 2, 0.01);
        if (Math.abs(rMax - (teeth * 1.25 + MODULE_LDU)) > 1) problems.push(`tip radius ${rMax.toFixed(2)} is not module 1 for ${teeth} teeth`);
        gear = {type: 'spur', teeth, axis: [0, -1, 0], center: [0, centre, 0]};
    }
    return {connectors, colliders, gear, problems};
};

/**
 * Linear actuators (kinds/screw.js). A family is the body assembly, the spindle part (LDraw's
 * "Axle Actuator") and the piston, with LDraw's two reference assemblies (Contracted, Extended),
 * and how many turns of the input the full stroke takes. That number is measured, not drawn:
 * for the small LA (92693, "7–9 studs") 7112°, 7226°, 7144°, 7187°, 7169° and 7151° over the full
 * stroke, mean 7165° = 19.90 turns (glowytheglowbug, Eurobricks "linear actuator degrees to full
 * length", 2023-09-21/22, measured with a SPIKE/Powered Up motor's encoder; Davidz90 there:
 * 19.75 turns for 23.4 mm, 0.84 turns/mm). LDraw's assemblies give the stroke: 60 LDU = 24 mm
 * (3 studs), so the lead is 24 mm / 19.90 = 1.206 mm per turn. The hand is not drawn (LDraw draws
 * the spindle as a smooth rod): right-hand, the common thread, is assumed.
 */
export const LINEAR_ACTUATORS = Object.freeze([{
    body: '92693c01.dat', spindle: '92695.dat', piston: '92696.dat',
    contracted: '92693c01-f1.dat', extended: '92693c01-f2.dat', turnsFullStroke: 7165 / 360, hand: 1
}]);

/** Placement of `part` in an LDraw assembly file: {R (row-major 3×3), t}. */
const placementIn = (read, assembly, part) => {
    const text = read(`parts/${assembly.toLowerCase()}`);
    if (text === undefined) return null;
    const ref = parseLDraw(text).refs.find(r => r.file.toLowerCase() === part.toLowerCase());
    return ref ? ref.x : null;
};
/** Point p of a placed part, in the assembly frame. */
const placePoint = (x, p) => apply(x, p);
/** Point q of the assembly frame in a placed part's frame (rotation orthonormal). */
const unplace = (x, q) => {
    const d = sub(q, x.t);
    return [0, 1, 2].map(i => dot(column(x, i), d));
};

/**
 * A linear actuator part's connectors and colliders, or null for other parts. The LA's axis
 * is the line of the body's coaxial bores (the piston's guide at the front, the spindle's
 * bearing at the back: a bore run too short for a pin), measured; the piston's rear end is its
 * nut (where the spindle's thread drives it); the spindle's thread is where that nut runs
 * between the contracted and the extended assembly.
 */
export const deriveLinearActuator = (part, found, read) => {
    const fam = LINEAR_ACTUATORS.find(f => [f.body, f.spindle, f.piston].includes(part.toLowerCase()));
    if (!fam) return null;
    const problems = [];
    const {verts} = found;
    const along = (v, a) => dot(v, a);
    const fromAxis = (v, foot, a) => len(perp(sub(v, foot), a));
    // The piston's nut and eye, in its own frame: the axis runs from its eye (the cross pin hole)
    // to its far end; the nut is that far end.
    const pistonFlat = flattenPart(fam.piston, read);
    const pistonVerts = pistonFlat.polys.flat();
    const pistonFound = deriveConnectors(pistonFlat, {read});
    const eye = pistonFound.connectors.find(c => c.type === 'pinhole');
    if (!eye) return {problems: ['the piston has no eye (pin hole)'], connectors: [], colliders: []};
    // The rod's axis: perpendicular to the eye's hole, through its centre, along the longest extent.
    const pb = bounds([pistonVerts]);
    const k = [0, 1, 2].reduce((m, i) => (pb.max[i] - pb.min[i] > pb.max[m] - pb.min[m] ? i : m), 0);
    const rodAxis = [0, 0, 0]; rodAxis[k] = Math.abs(pb.min[k] - eye.position[k]) > Math.abs(pb.max[k] - eye.position[k]) ? -1 : 1;
    const nutAt = eye.position.map((v, i) => (i === k ? (rodAxis[k] < 0 ? pb.min[k] : pb.max[k]) : v));
    const f1 = {piston: placementIn(read, fam.contracted, fam.piston), spindle: placementIn(read, fam.contracted, fam.spindle), body: placementIn(read, fam.contracted, fam.body)};
    const f2 = {piston: placementIn(read, fam.extended, fam.piston), spindle: placementIn(read, fam.extended, fam.spindle)};
    if (!f1.piston || !f1.spindle || !f1.body || !f2.piston || !f2.spindle) return {problems: ['the reference assemblies do not place the body, spindle and piston'], connectors: [], colliders: []};
    const nut1 = placePoint(f1.piston, nutAt);
    const nut2 = placePoint(f2.piston, nutAt);
    const strokeLdu = len(sub(nut2, nut1));
    const leadLdu = strokeLdu / fam.turnsFullStroke;
    const out = {problems, connectors: [], colliders: [], strokeLdu, leadLdu};
    if (part.toLowerCase() === fam.piston) {
        // The rod: from the nut to where the eye begins (the mesh grows beyond a pin's collar), the
        // shaft that runs in the body's front bore.
        const t = v => along(v, rodAxis);
        const eyeEdge = Math.max(...pistonVerts.filter(v => fromAxis(v, eye.position, rodAxis) > SHAFT_R).map(t));
        const lo = eyeEdge; const hi = t(nutAt);
        const mid = add(perp(eye.position, rodAxis), scale(rodAxis, (lo + hi) / 2));
        out.connectors = [
            {...eye, id: 'h0'},
            {id: 'r', type: 'la-rod', position: roundVec(mid, 0.01), axis: rodAxis, length: round(hi - lo, 0.5)},
            {id: 'n', type: 'screw-nut', position: roundVec(nutAt, 0.01), axis: rodAxis}
        ];
        out.colliders = [fitBox(pistonVerts, v => t(v) > lo), fitBox(pistonVerts, v => t(v) <= lo)].filter(Boolean);
        return out;
    }
    if (part.toLowerCase() === fam.spindle) {
        // The input stub is the derived axle; the spindle runs from the stub's collar on along the
        // LA's axis. Its thread is where the piston's nut runs: from the contracted to the extended
        // assembly, in the spindle's frame.
        const stub = found.connectors.find(c => c.type === 'axle');
        if (!stub) return {...out, problems: ['the spindle has no input axle']};
        const a = stub.axis;
        const n1 = along(unplace(f1.spindle, nut1), a);
        const n2 = along(unplace(f2.spindle, nut2), a);
        const ts = verts.map(v => along(v, a));
        const sLo = Math.min(...ts); const sHi = Math.max(...ts);
        const stubFar = along(stub.position, a) + stub.length / 2;
        const spindle = verts.filter(v => along(v, a) > stubFar + 0.01);
        const rSpindle = Math.max(...spindle.filter(v => along(v, a) > stubFar + 3).map(v => fromAxis(v, stub.position, a)));
        const t0 = stubFar; const t1 = Math.max(sLo, sHi);
        out.connectors = [
            {...stub, id: 'a0'},
            {id: 's', type: 'screw-spindle', position: roundVec(add(perp(stub.position, a), scale(a, (t0 + t1) / 2)), 0.01), axis: a, length: round(t1 - t0, 0.5),
                data: {threadFrom: round(Math.min(n1, n2) - (t0 + t1) / 2, 0.01), threadTo: round(Math.max(n1, n2) - (t0 + t1) / 2, 0.01), leadLdu: round(leadLdu, 1e-4), hand: fam.hand, radiusLdu: round(rSpindle, 0.01)}}
        ];
        out.colliders = [shaftRegion(stub, verts), fitBox(verts, v => along(v, a) >= stubFar - 0.01)].filter(Boolean);
        return out;
    }
    // The body: the bores on its axis — the longest (the piston's guide, at the front) and the
    // short bearing behind it (the spindle's).
    // The axis in the body's frame: the way the nut travels from the contracted to the extended assembly.
    const laAxis = snapAxis(unit(sub(unplace(f1.body, nut2), unplace(f1.body, nut1))));
    const kb = laAxis.findIndex(x => Math.abs(x) === 1);
    if (kb < 0) return {...out, problems: ['the actuator\'s axis is not a coordinate axis of the body']};
    const axisBore = found.connectors.filter(c => c.type === 'pinhole' && Math.abs(dot(c.axis, laAxis)) > COS_1);
    if (axisBore.length !== 1) return {...out, problems: [`${axisBore.length} bores on the actuator's axis`]};
    const guide = axisBore[0];
    const bearing = found.shortHoles.find(r => Math.abs(dot(r.axis, laAxis)) > COS_1 && len(perp(sub(r.foot, perp(guide.position, laAxis)), laAxis)) <= LINE_EPS);
    if (!bearing) return {...out, problems: ['no spindle bearing on the actuator\'s axis']};
    out.connectors = [
        ...found.connectors.filter(c => c !== guide),
        {...guide, type: 'la-bore'},
        {id: 'b', type: 'screw-bearing', position: roundVec(point(bearing, (bearing.lo + bearing.hi) / 2), 0.01), axis: snapAxis(bearing.axis), length: round(bearing.hi - bearing.lo, 0.5)}
    ];
    // Colliders: the fork's two lugs (either side of the axis, along the lug holes' axis), then
    // the body along its axis in bands — the web around the bearing, the neck, the tube — each
    // the box of its vertices.
    const lug = found.connectors.find(c => c.type === 'pinhole' && c !== guide);
    if (!lug) return {...out, problems: ['the body has no lug holes']};
    const kl = lug.axis.findIndex(x => Math.abs(x) === 1);
    const ax = v => v[kb] * laAxis[kb];
    const tB = Math.min(ax(point(bearing, bearing.lo)), ax(point(bearing, bearing.hi)));
    const lateral = v => Math.max(...[0, 1, 2].filter(i => i !== kb).map(i => Math.abs(v[i])));
    out.colliders = [
        fitBox(verts, v => ax(v) < tB - 5 && v[kl] > 0),
        fitBox(verts, v => ax(v) < tB - 5 && v[kl] < 0),
        fitBox(verts, v => ax(v) >= tB - 5 && ax(v) < tB + 5),
        fitBox(verts, v => ax(v) >= tB + 5 && lateral(v) > 10.5),
        fitBox(verts, v => ax(v) >= tB + 5 && lateral(v) <= 10.5)
    ].filter(Boolean);
    return out;
};

/**
 * A bucket ("Technic Excavator Bucket", 24120): a scoop on a 1 × 3 lug. Its envelope is not
 * box-like, so its colliders are slabs across its depth (20 LDU along its longest extent), each
 * the box of its vertices — the lug's slab is the lug alone.
 */
export const deriveBucketColliders = (desc, verts) => {
    if (!/^Technic Excavator Bucket\b/.test(desc)) return null;
    const b = bounds([verts]);
    const k = [0, 1, 2].reduce((m, i) => (b.max[i] - b.min[i] > b.max[m] - b.min[m] ? i : m), 0);
    const out = [];
    for (let t = b.max[k]; t > b.min[k] + 1e-6; t -= 20) {
        const box = fitBox(verts, v => v[k] <= t + 1e-6 && v[k] > t - 20 + 1e-6);
        if (box) out.push(box);
    }
    return out;
};

// ---- names, categories --------------------------------------------------------

/** Palette categories (editor/palette.js PALETTE_CATEGORIES) by the LDraw description. */
export const categoryOf = (desc, ldrawCategory = '') => {
    const d = desc.replace(/\s+/g, ' ');
    const c = ldrawCategory || '';
    if (/^Technic (Gear|Worm Gear|Turntable)/.test(d) || /^Technic Gear Rack/.test(d)) return 'gear';
    if (/^Technic (Beam|Liftarm)\b/.test(d)) return 'beam';
    if (/^Technic Axle Pin\b/.test(d)) return 'pin';
    if (/^Technic (Axle Joiner|Axle Connector|Axle and Pin Connector|Axle with Perpendicular|Axle .*Perpendicular Pin Hole)/.test(d)) return 'connector';
    if (/^Technic Axle\b/.test(d) || /^Technic Bush\b/.test(d)) return 'axle';
    if (/^Technic Pin (Connector|Joiner)/.test(d)) return 'connector';
    if (/^Technic Pin\b/.test(d)) return 'pin';
    if (/^Technic (Connector|Cross Block|Angle Connector|Universal Joint|Steering)/.test(d)) return 'connector';
    if (/^Technic Brick\b/.test(d)) return 'brick';
    if (/^Technic Plate\b/.test(d)) return 'plate';
    if (/^Brick\b/.test(d) || c === 'Brick') return 'brick';
    if (/^Plate\b/.test(d) || c === 'Plate') return 'plate';
    if (/^Tile\b/.test(d) || c === 'Tile') return 'tile';
    if (/^Slope\b/.test(d) || c === 'Slope') return 'slope';
    return 'other';
};

/** Stud-grid (System) parts: their underside takes studs. */
export const isStudGrid = category => ['brick', 'plate', 'tile', 'slope'].includes(category);

const KEEP_CASE = new Set(['Technic', 'LEGO', 'SPIKE']);
/** The LDraw description as a palette name, in the catalogue's sentence case ("Technic beam 3"). */
export const nameOf = desc => desc.replace(/\s+/g, ' ').trim().split(' ').map((w, i) =>
    (i === 0 || KEEP_CASE.has(w) || /\d/.test(w) || /^[A-Z]{2,}$/.test(w) || /^#/.test(w) || /^[A-Z](-|$)/.test(w) ? w : w.toLowerCase())).join(' ');

/** Phrases first (longest first), then words; anything else stays as it is. */
const DE_PHRASES = [
    ['Technic Beam', 'Technic-Lochbalken'], ['Technic Liftarm', 'Technic-Liftarm'], ['Technic Axle Pin', 'Technic-Achspin'],
    ['Technic Axle Joiner', 'Technic-Achsverbinder'], ['Technic Axle', 'Technic-Achse'], ['Technic Pin', 'Technic-Pin'],
    ['Technic Linear Actuator', 'Technic-Linearantrieb'], ['Body Assembly', 'Gehäuse'], ['Axle Actuator', 'Spindel'],
    ['Technic Excavator Bucket', 'Technic-Baggerschaufel'],
    ['Technic Bush', 'Technic-Buchse'], ['Technic Worm Gear', 'Technic-Schnecke'], ['Technic Gear Rack', 'Technic-Zahnstange'],
    ['Technic Gear', 'Technic-Zahnrad'], ['Technic Angle Connector', 'Technic-Winkelverbinder'], ['Technic Cross Block', 'Technic-Kreuzblock'],
    ['Technic Connector', 'Technic-Verbinder'], ['Technic Turntable', 'Technic-Drehkranz'], ['Technic Universal Joint', 'Technic-Kardangelenk'],
    ['Technic Brick', 'Technic-Stein'], ['Technic Plate', 'Technic-Platte'], ['Technic Steering', 'Technic-Lenkung'],
    ['Slope Brick', 'Schräge'], ['Open Centre', 'offener Mitte'], ['Open Center', 'offener Mitte'], ['Pin Hole', 'Pinloch'],
    ['Pin Holes', 'Pinlöchern'], ['Axle Hole', 'Achsloch'], ['Double Bevel', 'Doppelkegel'], ['with Friction', 'mit Reibung'],
    ['without Friction', 'ohne Reibung'], ['with Stop', 'mit Anschlag'], ['Stop Bush', 'Stoppbuchse'], ['Liftarm Bent', 'Liftarm gebogen'],
    ['Quarter Ellipse', 'Viertelellipse'], ['Quarter Circle', 'Viertelkreis'], ['Single Axle Hole', 'einem Achsloch'],
    ['Click Rotation', 'Klick-Drehgelenk'], ['Large Tooth', 'große Zähne']
];
const DE_WORDS = {
    Brick: 'Stein', Plate: 'Platte', Tile: 'Fliese', Slope: 'Schräge', Beam: 'Lochbalken', Axle: 'Achse', Pin: 'Pin', Gear: 'Zahnrad',
    Tooth: 'Zähne', Teeth: 'Zähne', Bevel: 'Kegel', Double: 'doppelt', with: 'mit', without: 'ohne', and: 'und', Holes: 'Löchern',
    Hole: 'Loch', Axlehole: 'Achsloch', Axleholes: 'Achslöchern', Pegholes: 'Pinlöchern', Peghole: 'Pinloch', Round: 'rund',
    Smooth: 'glatt', Reinforced: 'verstärkt', Clutch: 'Kupplung', Knob: 'Knauf', Worm: 'Schnecke', Rack: 'Zahnstange',
    Turntable: 'Drehkranz', Piston: 'Kolben', Top: 'Oberteil', Bottom: 'Unterteil', Base: 'Basis', Notched: 'mit Kerbe', Long: 'lang', Thin: 'dünn',
    Bent: 'gebogen', Triangle: 'Dreieck', 'H-shaped': 'H-förmig', 'T-shaped': 'T-förmig', 'C-shaped': 'C-förmig', Groove: 'Rille',
    Inverted: 'umgekehrt', Convex: 'konvex', Connector: 'Verbinder', Joiner: 'Verbinder', Perpendicular: 'senkrecht', Liftarm: 'Liftarm',
    Friction: 'Reibung', Stop: 'Anschlag', Bush: 'Buchse', Centre: 'Mitte', Center: 'Mitte', Middle: 'mittig', Crown: 'Krone',
    Type: 'Typ', Studs: 'Noppen', Stud: 'Noppe', Hollow: 'hohl', Offset: 'versetzt', Inline: 'gerade', Flange: 'Flansch',
    Flanges: 'Flanschen', One: 'einem', Two: 'zwei', Three: 'drei', Four: 'vier', Slots: 'Schlitzen', Slot: 'Schlitz', Single: 'einfach',
    Dual: 'doppelt', Half: 'halb', Sides: 'Seiten', Side: 'Seite', Both: 'beiden', on: 'auf', End: 'Ende', Ends: 'Enden',
    Universal: 'Kardan', Joint: 'Gelenk', Frame: 'Rahmen', Ridges: 'Rippen', Flat: 'flach', Extension: 'Verlängerung',
    Split: 'geteilt', Twin: 'Doppel', Cylindrical: 'zylindrisch', Corner: 'Ecke', Ball: 'Kugel', Socket: 'Pfanne', Towball: 'Kugelkopf',
    Rounded: 'abgerundet', Ellipse: 'Ellipse', Circle: 'Kreis', Quarter: 'Viertel', Rotation: 'Dreh', Sliding: 'verschiebbar',
    Reduced: 'reduziert', 'Semi-Reduced': 'halbreduziert', Square: 'quadratisch', Cross: 'Kreuz', Block: 'Block', Angle: 'Winkel',
    Wedge: 'Keil', Area: 'Bereich', Areas: 'Bereichen', Open: 'offen', degree: 'Grad'
};
/** A generated German name for an LDraw description. */
export const nameDeOf = desc => {
    let s = ` ${desc.replace(/\s+/g, ' ').trim()} `;
    for (const [en, de] of [...DE_PHRASES].sort((p, q) => q[0].length - p[0].length)) {
        s = s.replace(new RegExp(`(?<=[\\s(])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s),])`, 'g'), de);
    }
    s = s.trim().split(' ').map(w => DE_WORDS[w] ?? w).join(' ');
    // "Tooth" counts read "N Zähne"; decimals take a comma.
    return s.replace(/(\d)\.(\d)/g, '$1,$2');
};

// ---- the whole part -----------------------------------------------------------

/**
 * Derive PartMeta v2 for one part.
 * @param {string} part e.g. '3001.dat'
 * @param {(p: string) => string|undefined} read library-relative reader
 * @returns {{meta: object|null, problems: string[], notes: string[]}}
 */
export const derivePart = (part, read) => {
    const problems = [];
    const text = read(`parts/${part.toLowerCase()}`);
    if (text === undefined) return {meta: null, problems: [`${part}: not in the library`], notes: []};
    const parsed = parseLDraw(text);
    const desc = parsed.header.description.replace(/\s+/g, ' ').trim();
    const ldrawCategory = (/^0 !CATEGORY (.+)$/m.exec(text) || [])[1]?.trim() || '';
    // '~… (Obsolete)': a real piece a newer one replaced (catalog-parts.js says more); other '~' files are pieces of a part.
    if (/^~|^=|^_/.test(desc) && !/^~.*\(Obsolete\)$/.test(desc)) return {meta: null, problems: [`${part}: '${desc}' is an alias or obsolete file`], notes: []};
    const flat = flattenPart(part, read);
    if (flat.missing.length) problems.push(`missing subfiles ${flat.missing.join(', ')}`);
    const category = categoryOf(desc, ldrawCategory);
    const system = isStudGrid(category);
    const found = deriveConnectors(flat, {header: {description: desc}, read, system});
    const notes = [...found.notes];
    const connectors = found.connectors;
    if (system || found.studs.length) {
        antiStudCells(found.tris, found.verts, found.studs)
            .forEach((p, i) => connectors.push({id: `u${i}`, type: 'antistud', position: p, axis: [0, -1, 0]}));
    }
    // Open underside tubes take a stud in their bore: at the tube's bottom face.
    if (system) {
        const yb = bounds([found.verts]).max[1];
        found.tubes.forEach((t, i) => {
            // stud4.dat is drawn from y = 0 (its top) to y = -4, scaled to the tube's height.
            const bottom = apply(t.x, [0, -4, 0]);
            const axis = unit(sub(bottom, t.x.t));
            const cell = connectors.some(c => c.type === 'antistud' && Math.hypot(c.position[0] - bottom[0], c.position[2] - bottom[2]) <= 0.5);
            if (Math.abs(bottom[1] - yb) <= 0.5 && Math.abs(axis[1] - 1) < 1e-6 && !cell) {
                connectors.push({id: `t${i}`, type: 'tube', position: [round(bottom[0], 0.01), yb, round(bottom[2], 0.01)], axis: [0, -1, 0]});
            }
        });
    }
    for (const c of connectors) {
        c.position = roundVec(c.position, 0.001);
        c.axis = roundVec(c.axis, 1e-9);
    }

    let {colliders, notes: cn} = deriveColliders({...found, connectors}, {system});
    notes.push(...cn);
    // Parts whose connectors and colliders the generic rules cannot see (kinds/turntable.js, kinds/screw.js).
    let special = null;
    const turntable = deriveTurntable(desc, found.verts, connectors.filter(c => c.type === 'pinhole'));
    if (turntable) special = turntable;
    const actuator = deriveLinearActuator(part, found, read);
    if (actuator) special = actuator;
    if (special) {
        problems.push(...special.problems);
        connectors.splice(0, connectors.length, ...special.connectors);
        colliders = special.colliders;
    }
    const bucket = deriveBucketColliders(desc, found.verts);
    if (bucket) colliders = bucket;
    if (!colliders) problems.push('no colliders');
    const volumeLdu = meshVolume(found.tris);
    const massGrams = round(volumeLdu * LDU_CM ** 3 * ABS_DENSITY_G_PER_CM3, 0.01);
    const meta = {
        part, name: nameOf(desc), nameDe: nameDeOf(desc), nameDeGenerated: true, category,
        massGrams: Math.max(0.01, massGrams), connectors, colliders: colliders || [], derived: true
    };
    // Gears: the tooth count from the description, centred on the one axle hole.
    const g = /^Technic Gear (\d+) Tooth\b(.*)$/.exec(desc);
    if (g && category === 'gear' && !/Crown|Large Tooth|Rack|Ring|Stepper/.test(desc)) {
        const holes = connectors.filter(c => c.type === 'axlehole');
        const centre = holes.find(c => len(c.position) < 0.5) || (holes.length === 1 ? holes[0] : null);
        const free = centre ? null : freeGearCentre(connectors);
        if (centre) meta.gear = {type: /Bevel/.test(desc) ? 'bevel' : 'spur', teeth: Number(g[1]), axis: centre.axis, center: centre.position};
        else if (free) meta.gear = {type: /Bevel/.test(desc) ? 'bevel' : 'spur', teeth: Number(g[1]), axis: free.axis, center: free.center};
        else problems.push('gear without one centre axle hole');
    }
    if (category === 'gear' && /^Technic Gear Rack\b/.test(desc)) {
        const t = rackTeeth(found.verts);
        if (t) connectors.push({id: 't', type: 'rack-teeth', ...t});
    }
    if (category === 'gear' && /^Technic Worm Gear\b/.test(desc)) {
        const hole = connectors.find(c => c.type === 'axlehole');
        const w = hole && wormThread(found.verts, hole);
        if (w) connectors.push({id: 'w', type: 'worm', ...w});
    }
    deriveTransmission({part, desc, meta, connectors, found, flat, read, problems, notes});
    if (turntable && turntable.gear) meta.gear = turntable.gear;
    if (!connectors.length) problems.push('no connector found');
    if (meta.category === 'gear' && !meta.gear && !connectors.some(c => c.type === 'rack-teeth' || c.type === 'worm' || c.type === 'turntable-race' || TRANSMISSION_TYPES.has(c.type))) {
        problems.push('a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob)');
    }
    return {meta, problems, notes, desc, ldrawCategory};
};


// ---- transmission parts (gearbox lane, 2026-10-18) -----------------------------------
//
// Kept in this one section so that it merges cleanly with other lanes' derivation work.
// The connector kinds are bw-sim/kinds/transmission.js, slip-clutch.js and gear-seat.js.
//
//   clutch gears      (6542a/b, 18946, 81346, 2471, 35185) and peghole bevels (87407, 65413):
//                     no centre axle hole but a centre PIN hole — on an axle they spin
//                     freely (an axle in a pin hole is a hinge). The gear's centre is the
//                     point of that hole's line nearest the part origin (freeGearCentre).
//                     A "with Clutch" gear's socket is measured: rays parallel to the axis,
//                     11.5 LDU out (between the 9 LDU hub and the 14.7 LDU socket wall),
//                     from each face inwards; where they run ≥ 4 LDU into the gear before
//                     meeting it, that face has a socket ('clutch', length = its depth).
//   slip clutch       "Technic Gear 24 Tooth Clutch" (76019, 76244): its axle hole is a
//                     'clutch-axlehole' with the stamped rating (kinds/slip-clutch.js).
//   driving ring      "Technic Transmission Driving Ring" (6539): its radial profile along
//                     its axis gives the colliders (a stack of cylinders), the ridged bore
//                     ('spline-bore', the ring's length), a 'clutch-teeth' end at each end,
//                     and the groove between its flanges ('fork-groove').
//   ridged joiners    an axle joiner that draws the ridge sub-part ("Axle Joiner Ridge
//                     Segment", s/6538s02.dat: 6538a, 6538b) carries a 'spline' over the
//                     ridges' extent.
//   changeover catch  "Technic Transmission Changeover Catch" (6641): its bar, the thin
//                     cylinder (radius 2–3 LDU) it ends in, is a 'fork'.
//   differential      65414 holds its satellites in cradles and is closed by 65413; where,
//                     LDraw's own assembly 65414c01 says (TRANSMISSION_ASSEMBLIES): each
//                     satellite turning across the casing's axis is a 'gear-seat' of the
//                     casing (its axle hole centre, the 12T bevel's origin), and the cover's
//                     placement is a 'snap' on both parts.

/**
 * Module-1 gears LDraw draws with their tips a little short (as test/bw-sim-part-meta.test.mjs
 * allows for 94925): the 16T clutch gear 18946 measures 21.79 LDU for 22.5, the 24T slip clutch
 * 76019 31.70 for 32.5. Their tooth counts and the gearboxes they are sold for are module 1;
 * a gear of another module would be off by several LDU. Allowed 1 LDU instead of 0.5.
 */
export const SHORT_TEETH = new Set(['18946.dat', '76019.dat']);

export const TRANSMISSION_TYPES = new Set(['spline', 'spline-bore', 'clutch', 'clutch-teeth', 'fork', 'fork-groove', 'clutch-axlehole', 'gear-seat', 'snap']);

/** Official LDraw assemblies that place a part's inner parts: part → {assembly, satellite, cover}. */
export const TRANSMISSION_ASSEMBLIES = Object.freeze({
    '65414.dat': {assembly: '65414c01.dat', satellite: '6589.dat', cover: '65413.dat'}
});

/** A gear's centre pin hole: {axis, center} (the hole line's point nearest the origin), or null. */
export const freeGearCentre = connectors => {
    const holes = connectors.filter(c => c.type === 'pinhole' && len(perp(c.position, c.axis)) < 0.5);
    if (holes.length !== 1) return null;
    const h = holes[0];
    return {axis: h.axis, center: roundVec(sub(h.position, scale(h.axis, dot(h.position, h.axis))), 0.001)};
};

/** Distance along d (unit) from p to the first triangle hit within maxT, or null. */
const rayHit = (tris, p, d, maxT) => {
    let best = null;
    for (const tri of tris) {
        const [a, b, c] = tri.v;
        const e1 = sub(b, a); const e2 = sub(c, a);
        const q = cross(d, e2);
        const det = dot(e1, q);
        if (Math.abs(det) < 1e-12) continue;
        const sv = sub(p, a);
        const u = dot(sv, q) / det;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const r = cross(sv, e1);
        const v = dot(d, r) / det;
        if (v < -1e-9 || u + v > 1 + 1e-9) continue;
        const t = dot(e2, r) / det;
        if (t >= 0 && t <= maxT && (best === null || t < best)) best = t;
    }
    return best;
};

/** Two unit vectors across axis a. */
const across = a => {
    const e1 = unit(perp(Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], a));
    return [e1, cross(a, e1)];
};

/** A clutch gear's sockets, measured (see the section's comment). */
export const clutchSockets = (tris, verts, centre, axis) => {
    const out = [];
    const [e1, e2] = across(axis);
    for (const side of [1, -1]) {
        const a = scale(axis, side);
        let face = -Infinity;
        for (const v of verts) {
            const d = sub(v, centre);
            if (len(perp(d, axis)) <= 17.5) face = Math.max(face, dot(d, a));
        }
        let depth = Infinity;
        for (let k = 0; k < 8; k++) {
            const th = k * Math.PI / 4 + Math.PI / 8;
            const p = add(add(centre, scale(a, face + 1)), add(scale(e1, 11.5 * Math.cos(th)), scale(e2, 11.5 * Math.sin(th))));
            const t = rayHit(tris, p, scale(a, -1), face + 1);
            depth = Math.min(depth, t === null ? face + 1 : t - 1);
        }
        if (depth >= 4) out.push({type: 'clutch', position: roundVec(add(centre, scale(a, face)), 0.01), axis: snapAxis(a), length: round(depth, 0.5)});
    }
    return out;
};

/**
 * A round part's radial profile along axis a (through the origin): intervals [lo, hi] along a
 * with the radius of the triangles that span them (a cylinder wall spans its whole length; the
 * annular faces span nothing), adjacent equal radii merged.
 */
export const radialProfile = (tris, a) => {
    const cuts = [...new Set(tris.flatMap(t => t.v.map(v => round(dot(v, a), 0.01))))].sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const [lo, hi] = [cuts[i], cuts[i + 1]];
        if (hi - lo < 0.05) continue;
        let r = 0;
        for (const t of tris) {
            const zs = t.v.map(v => dot(v, a));
            if (Math.min(...zs) > lo + 0.01 || Math.max(...zs) < hi - 0.01) continue;
            for (const v of t.v) r = Math.max(r, len(perp(v, a)));
        }
        if (r === 0) continue;
        r = round(r, 0.1);
        const last = out[out.length - 1];
        if (last && Math.abs(last.hi - lo) < 0.06 && last.r === r) last.hi = hi;
        else out.push({lo, hi, r});
    }
    return out;
};

const cylinderAlong = (a, lo, hi, r) => {
    const c = {shape: 'cylinder', radius: r, halfHeight: round((hi - lo) / 2, 0.01)};
    const q = quatYTo(a);
    if (q) c.rotation = q;
    const centre = roundVec(scale(a, (lo + hi) / 2), 0.01);
    if (centre.some(v => v !== 0)) c.position = centre;
    return c;
};

/**
 * Boxes along coordinate axis k: the part cut into slabs where its outline along k changes, each
 * slab the bounding box of the triangles that span it, equal neighbours merged. For a part whose
 * envelope along its hole axis is one box but which narrows along its length (the changeover
 * catch's neck and bar end).
 */
export const slabBoxes = (tris, k) => {
    const cuts = [...new Set(tris.flatMap(t => t.v.map(v => round(v[k], 0.5))))].sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const [lo, hi] = [cuts[i], cuts[i + 1]];
        const mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
        for (const t of tris) {
            const ks = t.v.map(v => v[k]);
            if (Math.min(...ks) > lo + 0.3 || Math.max(...ks) < hi - 0.3) continue;
            for (const v of t.v) for (let j = 0; j < 3; j++) if (j !== k) { mn[j] = Math.min(mn[j], v[j]); mx[j] = Math.max(mx[j], v[j]); }
        }
        if (!Number.isFinite(mn[(k + 1) % 3])) continue;
        mn[k] = lo; mx[k] = hi;
        const box = [mn.map(v => round(v, 0.5)), mx.map(v => round(v, 0.5))];
        const last = out[out.length - 1];
        if (last && last[1][k] === lo && [0, 1, 2].every(j => j === k || (last[0][j] === box[0][j] && last[1][j] === box[1][j]))) last[1][k] = hi;
        else out.push(box);
    }
    return out.map(([a, b]) => boxCollider(a, b));
};

/** The parts a transmission needs: connectors (and colliders, category) added to `meta` in place. */
export const deriveTransmission = ({part, desc, meta, connectors, found, flat, read, problems, notes}) => {
    const add1 = c => connectors.push(c);
    // Clutch gears: the sockets.
    if (meta.gear && /\bwith Clutch\b/.test(desc)) {
        const sockets = clutchSockets(found.tris, found.verts, meta.gear.center, meta.gear.axis);
        const bothSides = /\bon Both Sides\b/.test(desc);
        if (!sockets.length) problems.push('a clutch gear without a measurable clutch socket');
        else if (!bothSides && sockets.length > 1) problems.push('a clutch gear with its clutch on one side, but both faces measure as sockets: which face has the clutch teeth is not measurable');
        else sockets.forEach((c, i) => add1({id: `k${i}`, ...c}));
    }
    if (meta.gear && meta.gear.type === 'spur' && /^Technic Gear 24 Tooth Clutch\b/.test(desc)) {
        const hole = connectors.find(c => c.type === 'axlehole' && len(sub(c.position, meta.gear.center)) < 0.5);
        if (hole) {
            hole.type = 'clutch-axlehole';
            hole.data = {slipTorqueNm: SLIP_CLUTCH_24T_NM};
        } else problems.push('a slip clutch gear without its centre axle hole');
    }
    if (/^Technic Transmission Driving Ring$/.test(desc)) {
        // The ring is drawn along z: its cylinder walls' axes.
        const a = [0, 0, 1];
        const prof = radialProfile(found.tris, a);
        if (!prof.length) { problems.push('driving ring: no radial profile'); return; }
        const lo = prof[0].lo; const hi = prof[prof.length - 1].hi;
        const outer = Math.max(...prof.map(q => q.r));
        // The groove: the middle interval (holding 0) narrower than the flanges, between two flange intervals.
        const mid = prof.findIndex(q => q.lo <= 0 && q.hi >= 0);
        let g0 = mid; let g1 = mid;
        while (g0 > 0 && prof[g0 - 1].r < outer) g0--;
        while (g1 < prof.length - 1 && prof[g1 + 1].r < outer) g1++;
        const grooveR = Math.min(...prof.slice(g0, g1 + 1).map(q => q.r));
        meta.colliders = prof.filter(q => q.hi - q.lo >= 0.5).map(q => cylinderAlong(a, q.lo, q.hi, q.r));
        meta.category = 'gear';
        add1({id: 'b', type: 'spline-bore', position: [0, 0, round((lo + hi) / 2, 0.01)], axis: a, length: round(hi - lo, 0.5)});
        add1({id: 'e0', type: 'clutch-teeth', position: [0, 0, round(hi, 0.01)], axis: [0, 0, 1]});
        add1({id: 'e1', type: 'clutch-teeth', position: [0, 0, round(lo, 0.01)], axis: [0, 0, -1]});
        add1({id: 'g', type: 'fork-groove', position: [0, 0, round((prof[g0].lo + prof[g1].hi) / 2, 0.01)], axis: a,
            data: {radiusLdu: grooveR, outerLdu: outer, widthLdu: round(prof[g1].hi - prof[g0].lo, 0.1)}});
        notes.push(`driving ring profile: ${prof.map(q => `${q.lo}..${q.hi} r${q.r}`).join(', ')}`);
    }
    const ridges = flat.subparts.filter(sp => /Ridge Segment/.test(sp.description));
    const joinerHole = connectors.find(c => c.type === 'axlehole');
    if (ridges.length && joinerHole && /^Technic Axle Joiner\b/.test(desc)) {
        const along = ridges.flatMap(sp => sp.polys.flat()).map(v => dot(v, joinerHole.axis));
        const [l0, l1] = [Math.min(...along), Math.max(...along)];
        const c = add(perp(joinerHole.position, joinerHole.axis), scale(joinerHole.axis, (l0 + l1) / 2));
        add1({id: 'r', type: 'spline', position: roundVec(c, 0.01), axis: joinerHole.axis, length: latticeLength(l1 - l0)});
        // A ridged joiner turns inside the driving ring: round, so a cylinder (the ridges' reach), not
        // the box of its envelope, whose corners would rub what passes close by.
        const extent = found.verts.map(v => dot(v, joinerHole.axis));
        const rMax = Math.max(...found.verts.map(v => len(perp(sub(v, joinerHole.position), joinerHole.axis))));
        meta.colliders = [cylinderAlong(joinerHole.axis, Math.min(...extent), Math.max(...extent), round(rMax, 0.01))];
    }
    if (/^Technic Transmission Changeover Catch\b/.test(desc)) {
        const bars = flat.primitives.filter(q => /^p\/(4-4cyl[io])\.dat$/.test(q.file) && !q.via.length)
            .map(q => ({r: len(column(q.x, 0)), h: column(q.x, 1), t: q.x.t}))
            .filter(b => b.r >= 1.5 && b.r <= 3 && len(b.h) >= 10);
        if (bars.length === 1) {
            const b = bars[0];
            add1({id: 'f', type: 'fork', position: roundVec(add(b.t, scale(b.h, 0.5)), 0.01), axis: snapAxis(unit(b.h)), length: round(len(b.h), 0.5),
                data: {radiusLdu: round(b.r, 0.01)}});
            // Its outline narrows from the block to the neck and the bar: boxes along the lever (z).
            meta.colliders = slabBoxes(found.tris, 2);
            meta.category = 'gear';
        } else problems.push(`changeover catch: ${bars.length} bar cylinders, need one`);
    }
    // Differential casing and cover, from LDraw's assembly.
    for (const [casing, spec] of Object.entries(TRANSMISSION_ASSEMBLIES)) {
        if (part !== casing && part !== spec.cover) continue;
        const text = read(`parts/${spec.assembly}`);
        if (!text) { problems.push(`${spec.assembly}: not in the library`); continue; }
        const refs = parseLDraw(text).refs.map(r => ({...r, file: r.file.toLowerCase().replace(/\\/g, '/')}));
        const home = refs.find(r => r.file === casing);
        if (!home) { problems.push(`${spec.assembly} does not place ${casing}`); continue; }
        // Placement relative to the casing: x ↦ Mcᵀ(x − tc) (Mc a rotation).
        const Mc = home.x.m;
        const toCasing = v => { const d = sub(v, home.x.t); return [0, 1, 2].map(i => Mc[i] * d[0] + Mc[3 + i] * d[1] + Mc[6 + i] * d[2]); };
        const dirToCasing = v => [0, 1, 2].map(i => Mc[i] * v[0] + Mc[3 + i] * v[1] + Mc[6 + i] * v[2]);
        const casingAxis = [0, 0, 1];
        if (part === casing) {
            meta.category = 'gear';
            let n = 0;
            for (const r of refs.filter(q => q.file === spec.satellite)) {
                const ax = unit(dirToCasing(column(r.x, 2)));
                if (Math.abs(dot(ax, casingAxis)) > 0.5) continue; // a side gear: it rides its axle
                add1({id: `q${n++}`, type: 'gear-seat', position: roundVec(toCasing(r.x.t), 0.001), axis: roundVec(snapAxis(ax), 1e-6), length: 10});
            }
            const cover = refs.find(q => q.file === spec.cover);
            if (cover) add1({id: 'c', type: 'snap', position: roundVec(toCasing(cover.x.t), 0.001), axis: roundVec(snapAxis(unit(dirToCasing(column(cover.x, 2)))), 1e-6)});
        } else {
            add1({id: 'c', type: 'snap', position: [0, 0, 0], axis: [0, 0, 1]});
        }
    }
};

// ---- self-check: the contract (test/bw-sim-part-meta.test.mjs), before a part is admitted ----

/**
 * The geometry contract's rules a derived part must meet, re-measured from the mesh: a
 * part that fails one goes into the coverage report, not into parts.json. (The tests
 * check the shipped file again, independently.)
 * @returns {string[]} reasons
 */
export const selfCheck = (meta, flat, {validate, kinds, minEngage = 8, minEnclosed = 0.98, gearSlack = 0}) => {
    const out = [];
    // The seat rule (kinds/pin-axle.js MIN_ENGAGE_LDU) is made for holes at least that deep.
    for (const c of meta.connectors) {
        if ((c.type === 'pinhole' || c.type === 'axlehole') && c.length < minEngage) out.push(`${c.id}: a ${c.length} LDU ${c.type} is shallower than the seat rule's ${minEngage} LDU`);
    }
    for (const q of validate(meta, {connectorKinds: kinds})) out.push(`invalid: ${q}`);
    const verts = flat.polys.flat();
    const fit = colliderFit(meta.colliders, verts);
    if (fit.enclosed < minEnclosed) out.push(`colliders enclose ${(fit.enclosed * 100).toFixed(1)} % of the mesh (< ${minEnclosed * 100} %)`);
    if (fit.ratio > 1.1) out.push(`colliders are ${(fit.ratio * 100).toFixed(0)} % of the mesh box (> 110 %)`);
    const holes = meta.connectors.filter(c => c.type === 'pinhole' || c.type === 'axlehole');
    for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
            if (Math.abs(dot(holes[i].axis, holes[j].axis)) < COS_1) continue;
            const apart = len(perp(sub(holes[j].position, holes[i].position), holes[i].axis));
            if (apart > LINE_EPS && apart < 15.5) out.push(`holes ${holes[i].id}/${holes[j].id} ${apart.toFixed(2)} LDU apart`);
        }
    }
    const shafts = meta.connectors.filter(c => c.type === 'pin' || c.type === 'axle');
    const radial = (c, v) => len(perp(sub(v, c.position), c.axis));
    const inSlab = (c, v) => Math.abs(dot(sub(v, c.position), c.axis)) < c.length / 2 - 1;
    for (const c of shafts) {
        let r = 0; let n = 0;
        for (const v of verts) {
            if (!inSlab(c, v) || shafts.some(o => o !== c && inSlab(o, v) && radial(o, v) < radial(c, v))) continue;
            n++; r = Math.max(r, radial(c, v));
        }
        if (!n || r > SHAFT_R) out.push(`${c.id}: the mesh reaches ${r.toFixed(2)} LDU from the ${c.type}'s axis`);
    }
    // No shaft runs through a solid collider.
    const solid = meta.colliders.map((c, i) => i).filter(i => !meta.colliders[i].region);
    if (meta.colliders.some(c => c.region)) {
        for (const c of shafts) {
            for (let t = -c.length / 2 + 1; t <= c.length / 2 - 1; t += 1) {
                const v = add(c.position, scale(c.axis, t));
                if (solid.some(i => insideCollider(meta.colliders[i], v, -1e-9))) { out.push(`${c.id} runs through a solid collider`); break; }
            }
        }
    }
    for (const c of meta.connectors.filter(q => q.type === 'worm')) {
        // It drives a 24T on the hole grid (axles 40 LDU apart), as the test demands.
        if (Math.abs(c.data.pitchRadiusLdu + (24 * 1.25) - 40) > 0.5) out.push(`worm pitch radius ${c.data.pitchRadiusLdu}: does not mesh a 24T 40 LDU away`);
    }
    for (const c of meta.connectors.filter(q => q.type === 'rack-teeth')) {
        const n = c.data.normal;
        const over = verts.map(v => sub(v, c.position)).filter(v => Math.abs(dot(v, c.axis)) <= c.length / 2 - 1);
        const tip = Math.max(...over.map(v => dot(v, n)));
        if (Math.abs(tip - 2.5) > 0.3) out.push(`rack tips ${tip.toFixed(2)} beyond the pitch line`);
    }
    if (meta.gear) {
        const {teeth, axis, center} = meta.gear;
        let tip = 0;
        for (const v of verts) tip = Math.max(tip, len(perp(sub(v, center), axis)));
        const want = teeth * 1.25 + 2.5;
        // A turntable's ring is moulded with its teeth a little short of the full addendum (the
        // 60T's tip is 0.75 LDU in): 1 LDU, as the metadata test allows for it.
        const tol = meta.gear.type === 'bevel' ? 2 : SHORT_TEETH.has(meta.part) || meta.connectors.some(c => c.type === 'turntable-ring') ? 1 : 0.5;
        if (Math.abs(tip - want) > tol + gearSlack) out.push(`gear tip radius ${tip.toFixed(2)} ≠ ${teeth}·1.25 + 2.5 (not module 1)`);
    }
    return out;
};

// ---- the coverage report (docs/ROBOT-LAB-PARTS-COVERAGE.md) -----------------------

/**
 * Why a derived part disagrees with its hand measurement, part by part: read off the
 * --compare rows and the LDraw files (2026-10-18). Facts, measured; never a fudge.
 */
export const EXPLAINED = {
    '3648.dat': 'LDraw draws four 6 LDU bores at (±10, ±10) beside the axle hole. They are 14.1 LDU from it, under the contract\'s 15.5 LDU hole pitch, so they are no pin seats; the hand entry is right to leave them out (and the deriver rejects 3648a for them).',
    '39367p01.dat': 'The hub\'s 8 pin holes are real LDraw bores the hand entry left out. The axle hole is drawn 20 long at z −11..9 (axl* primitives), 1 LDU off the hand entry\'s 18 centred at 0.',
    '49295p01.dat': '28 hub pin holes the hand entry left out; the axle hole is drawn 20 long (z −10..10), the hand entry has 18.',
    '39370.dat': 'The ball socket is not an LDraw connection primitive (the hand entry takes it from the castor assembly 39370c01). The deriver also finds a 10 LDU vertical bore over the socket (y 12..22).',
    '52629.dat': 'The castor ball is a plain 24 LDU sphere, no towball primitive: measured by hand from the castor assembly.',
    '54696p01.dat': 'LDraw draws an axle profile on the housing\'s far side (y 10..30) that the hand entry does not list.',
    '54675.dat': '21 further blind side holes (connhol3) the hand entry does not list; four of its blind holes are written with the opposite axis and closedEnd — the same bottom.',
    '37308.dat': 'Two further blind holes (connhol3) on the sensor\'s sides the hand entry does not list.',
    '37316.dat': 'Two further blind holes (connhol3) the hand entry does not list.',
    '37312.dat': '10 further blind holes (connhol3) and an axle hole the hand entry does not list.',
    '3649.dat': 'The 40T gear\'s web has 12 pin holes and 4 axle holes, 15.5 LDU deep; the hand entry lists only the centre hole.',
    '6589.dat': 'Hand-measurement error: the axle hole is drawn 7 deep (z 0..7; the gear spans z −3..7); the hand entry centres a 10 LDU hole at z 0, so its segment runs z −5..5, 2 LDU out of the gear\'s back and 2 short of its hub face (the axle-line test checks only the line, not the ends). 7 LDU is under the seat rule\'s 8, which is why the deriver rejects such bevel gears.',
    '32198.dat': 'Hand-measurement error: as 6589, mirrored — the hole is drawn z −7..0 (the gear spans z −7..3); the hand entry has 10 centred at 0.',
    '64179.dat': 'The frame\'s 12 perpendicular side holes are real LDraw bores the hand entry left out.',
    '39794.dat': 'The frame\'s 16 perpendicular side holes are real LDraw bores the hand entry left out.',
    '32054.dat': 'The stop bush has an axle hole (axl* primitives, x −30..−10) the hand entry left out.',
    '32009.dat': 'The slot ends are drawn 16 deep (half cylinders, no counterbore); the hand entry rounds them to 20.',
    '2736.dat': 'The towball stub is drawn 17 long to its end cap; the hand entry has 17.5 (within 0.5).',
    '64781.dat': 'Rack teeth: the deriver\'s tooth-crest detection finds no even π·2.5 LDU pitch on this rack (its teeth meet the hole ends); kept as measured by hand.',
    '3743.dat': 'Rack teeth: the deriver measures the toothed length from the first tooth crest to the last (74); the hand entry has the whole rack (80). Both pass the rack test\'s 8 LDU end tolerance.',
    '48496.dat': 'The eyes are the same bores; the hand entry types them slide-bore (an axle slides in them, kinds/slide.js), a modelling choice the geometry cannot make. The pins are drawn 20 long at y 0..20; the hand entry has 19 at 10.5. LDraw also draws a vertical bore at the toggle\'s middle (y −10..0).',
    '2823.dat': 'The fork\'s two studs and two anti-stud cells (System connectivity did not exist when it was measured); its cross hole is drawn 20 long, the hand entry has 16.'
};

const fmtConn = c => `${c.type} ${JSON.stringify(c.position)}${c.length !== undefined ? ` L${c.length}` : ''}`;

/** The coverage report: what was derived, what was not and why, and the agreement with the hand-measured parts. */
export const coverageMarkdown = ({added, rejected, measured, compare, partsBytes}) => {
    const byCat = {};
    for (const a of added) (byCat[a.category] ||= []).push(a);
    const lines = [];
    const handTotal = compare.reduce((n, r) => n + r.matched.length + r.handOnly.length, 0);
    const matched = compare.reduce((n, r) => n + r.matched.length, 0);
    const agree = compare.filter(r => !r.handOnly.length && !r.derivedOnly.length && r.matched.every(m => !m.lengthDiff && m.closedEndSame));
    lines.push('# Robot Lab part library: coverage of the derived parts', '',
        'Written by `node scripts/derive-part-meta.mjs --lib <LDraw library> --generate scripts/derive-part-meta.parts.txt --report-md <this file>` — do not edit by hand.', '',
        'Parts in `overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` marked `"derived": true` were derived from their official LDraw',
        'files by `scripts/derive-part-meta.mjs`; the others are measured by hand. A derived part is admitted only when the deriver\'s',
        '`selfCheck` passes (the rules of `test/bw-sim-part-meta.test.mjs`), and the tests then check the shipped file independently.', '',
        '## How a part is derived', '',
        '- **Connectors** come from LDraw\'s connection primitives with their placements composed down to the part frame',
        '  (`ldraw/ldraw-geometry.js` `flattenPart`, which reports each primitive\'s ancestry): bore walls of radius 6 LDU and the Technic',
        '  hole composites (connhole, connhol2, connhol3 — blind, `closedEnd` —, peghole\\*, beamhol\\*) are pin holes when the wall faces',
        '  into its line (the mesh\'s outward BFC winding) and goes at least half round it; facing out of the line they are pins',
        '  (`friction` from confric\\*), merged across a collar; the axl\\* profiles are axle holes or axles the same way; a gear\'s',
        '  axle-hole sub-files are its hole; top-stud primitives are studs; towballs are 8 LDU sphere primitives; rack teeth and worm',
        '  threads are measured as their tests measure them. Lengths round to the 10 LDU Technic lattice within 2 LDU (LDraw draws a',
        '  blind hole 18 deep and a counterbore-less slot 16); a hole through a plate keeps the plate\'s 8 LDU.',
        '- **Anti-studs** are measured, not assumed: every stud-grid cell of a System part\'s bottom face where a stud fits (no mesh within',
        '  5.5 LDU of its axis over the 4 LDU it reaches in) and is gripped (walls or tubes within 8.6 LDU). **Tubes** are the bottoms of the',
        '  open underside tubes (stud4\\*): a stud seats there too (kinds/stud.js `tube`).',
        '- **Colliders**: a region box around every pin and axle, the stud layer as region `stud` (it sits in the hollow underside of the',
        '  part on top), and solid boxes for the body — along the part\'s straight hole chains (bent liftarms, frames, T/H beams), else its',
        '  outer envelope seen along its hole axis (System parts: from the top surface down to the bottom face, the hollow underside',
        '  filled; slopes in 4 LDU stairs); a round body is a cylinder.',
        '- **Mass** = mesh volume (divergence theorem over the outward-wound mesh) × ABS density **1.05 g/cm³** (ABS 1.04–1.06; LEGO',
        '  elements are ABS). LDraw\'s walls are drawn at nominal thickness, so a 2 × 4 brick comes out 2.67 g (a real one weighs about 2.3 g).',
        '- **Names**: the LDraw header description in the catalogue\'s sentence case; `nameDe` from a small term dictionary',
        '  (Brick → Stein, Plate → Platte, Tile → Fliese, Slope Brick → Schräge, Beam → Lochbalken, Axle → Achse, Gear → Zahnrad, …), marked',
        '  `nameDeGenerated: true`; the palette category from the description (Brick, Plate, Tile, Slope are new palette categories).', '');
    lines.push('## Agreement with the hand-measured parts', '',
        `${compare.length} hand-measured parts, ${handTotal} hand connectors: ${matched} matched by a derived connector of the same type on`,
        `the same line within 0.5 LDU; ${agree.length} parts agree exactly (same connectors, lengths and blind ends). Hand entries are`,
        'kept as they are; every difference is explained below (a derived connector the hand entry lacks is listed as "derived only").', '',
        '| Part | Name | Matched | Hand only | Derived only | Length / blind end differs | Why |', '|---|---|---|---|---|---|---|');
    for (const r of compare) {
        const ld = r.matched.filter(m => m.lengthDiff || !m.closedEndSame);
        const exact = !r.handOnly.length && !r.derivedOnly.length && !ld.length;
        const why = EXPLAINED[r.part] || (exact ? 'agrees' : (r.problems || []).join('; ') || '');
        lines.push(`| ${r.part} | ${r.name} | ${r.matched.length} | ${r.handOnly.map(fmtConn).join('<br>') || '—'} | ${r.derivedOnly.length > 4 ? `${r.derivedOnly.length} (${r.derivedOnly.slice(0, 2).map(fmtConn).join(', ')}, …)` : r.derivedOnly.map(fmtConn).join('<br>') || '—'} | ${ld.map(m => `${m.hand.type} L${m.hand.length} → L${m.derived.length}`).join('<br>') || '—'} | ${why} |`);
    }
    lines.push('', '## Derived parts by palette category', '', '| Category | Parts |', '|---|---|');
    for (const [cat, list] of Object.entries(byCat)) lines.push(`| ${cat} | ${list.length} |`);
    lines.push(`| **total** | **${added.length}** (and ${measured.length} listed parts already measured by hand) |`, '');
    lines.push('<details><summary>Every derived part</summary>', '', '| Part | Name | Category | Mass (g) | Connectors | Colliders |', '|---|---|---|---|---|---|');
    for (const a of added) lines.push(`| ${a.part} | ${a.name} | ${a.category} | ${a.massGrams} | ${a.connectors} | ${a.colliders} |`);
    lines.push('', '</details>', '');
    lines.push('## Not derived (coverage gaps)', '', 'Listed parts the deriver could not admit, with the reason. They are not in parts.json.', '',
        '| Part | LDraw description | Why |', '|---|---|---|');
    for (const r of rejected) lines.push(`| ${r.part} | ${r.name} | ${r.why.join('; ').replace(/\|/g, '/')} |`);
    lines.push('', 'Not attempted: ball sockets, steering arms and links, click hinges, rubber/flex parts, panels, Bionicle/Hero Factory, Duplo.',
        'Clutch gears, crown and knob gears need a coupling model of their own (a clutch gear slips); racks and worms are derived when',
        'their teeth measure cleanly. Turntables (kinds/turntable.js: a ring and a race at the origin LDraw assembles them on, the top',
        'half\'s teeth a spur gear) and the small linear actuator (kinds/screw.js: bearing, spindle thread, guide bore, rod and nut, the',
        'stroke from LDraw\'s contracted and extended assemblies, the lead from the measured turns of a full stroke) have derivations of',
        'their own (deriveTurntable, deriveLinearActuator); the excavator bucket\'s colliders are slabs across its depth.', '');
    lines.push('## Size', '', `parts.json is ${partsBytes.pretty} bytes as written (one-space JSON) and ${partsBytes.min} bytes minified (${partsBytes.gz} gzipped) in`,
        'the lazy Sim Lab chunk. If the library grows by another few hundred parts, split it: keep the hand-measured parts (motors, hub,',
        'sensors, the examples\' parts) in parts.json and move the derived ones to a second file the palette fetches on first open.', '');
    return `${lines.join('\n')}\n`;
};


/** The file an LDraw alias ('~Moved to 3648b') stands for, or the part itself. */
export const resolveAlias = (part, read) => {
    const text = read(`parts/${part.toLowerCase()}`);
    const m = text && /^0 ~Moved to (\S+)/.exec(text.split(/\r?\n/)[0]);
    return m ? resolveAlias(`${m[1].replace(/\.dat$/i, '')}.dat`, read) : part;
};

/**
 * Derived vs hand-measured connectors of one part: each hand connector is matched by a
 * derived one of the same type, on the same line (parallel axes) within 0.5 LDU.
 * @returns {{matched: object[], handOnly: object[], derivedOnly: object[]}}
 */
export const compareConnectors = (hand, derived) => {
    const used = new Set();
    const matched = [];
    const handOnly = [];
    for (const h of hand) {
        const d = derived.find(c => !used.has(c) && c.type === h.type && len(sub(c.position, h.position)) <= 0.5 &&
            (!h.axis || !c.axis || Math.abs(dot(unit(h.axis), unit(c.axis))) >= COS_1));
        if (d) {
            used.add(d);
            // A blind hole's bottom is closedEnd along its axis: [1,0,0] with -1 is [-1,0,0] with 1.
            const bottom = c => (c.closedEnd ? scale(unit(c.axis), c.closedEnd) : null);
            const bh = bottom(h); const bd = bottom(d);
            matched.push({hand: h, derived: d, lengthDiff: (d.length ?? 0) - (h.length ?? 0),
                closedEndSame: (!bh && !bd) || (bh && bd && dot(bh, bd) > 0.99)});
        } else handOnly.push(h);
    }
    return {matched, handOnly, derivedOnly: derived.filter(c => !used.has(c))};
};

/** The compare rows for every hand-measured part (derived from the same library). */
export const compareAll = (parts, read) => parts.filter(p => !p.derived).map(hand => {
    const real = resolveAlias(hand.part, read);
    const {meta: d, problems} = derivePart(real, read);
    if (!d) return {part: hand.part, name: hand.name, matched: [], handOnly: hand.connectors, derivedOnly: [], problems};
    return {part: hand.part, name: hand.name, ...compareConnectors(hand.connectors, d.connectors), problems};
});
