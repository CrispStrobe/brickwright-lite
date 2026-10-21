// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Snap to connections" (docs/ROBOT-LAB-LDD-FRAMES.md, the owner's first "later" way): the LDD frame
// of a design that has no recorded row is worked out from the model it is in. An LDD model is a
// built model: its parts are connected. The bone of every instance of a design fixes where the
// design's LDD frame is in the model; what is unknown is where that frame sits in the LDraw part
// (an origin and one of 24 axis-aligned turns, ldd-frame.js). Every candidate frame places every
// instance somewhere; the right one puts its pins in holes, its axles in axle holes and its studs in
// anti-studs of the parts already placed — tested with the connector kinds' own pair rules
// (kinds/index.js, the rules the compiler joins parts by). The candidate that engages the most
// connectors over all instances of the design wins, when no candidate with a different shape does as
// well; its parts are then placed and join the anchors, and the next round may place more.
//
// Candidate origins are where LDD puts them (ldd-frame.js): the part's origin, its connectors, and
// the ends of its connector lines. Pure; node --test runs it.

const F = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const mul = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

/** The 24 proper rotations that map axes onto axes (row-major). */
export const AXIS_TURNS = (() => {
    const out = [];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) {
        for (let s = 0; s < 8; s++) {
            const m = new Array(9).fill(0);
            for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
            if (det(m) > 0) out.push(m);
        }
    }
    return out;
})();

const LINE = new Set(['pin', 'pinhole', 'axle', 'axlehole', 'slide-bore', 'sensor-axlehole', 'clutch-axlehole']);
const round = v => Math.round(v * 2) / 2;
const key3 = v => v.map(round).join(',');

/** Where LDD may put a design's origin, in the LDraw part's frame (LDU). */
export const candidateOrigins = meta => {
    const out = new Map([['0,0,0', [0, 0, 0]]]);
    const add = v => out.set(key3(v), v.map(round));
    for (const c of meta.connectors || []) {
        add(c.position);
        if (LINE.has(c.type) && c.axis && c.length > 0) {
            for (const s of [-1, 1]) add(c.position.map((x, i) => x + s * c.axis[i] * c.length / 2));
        }
    }
    return [...out.values()];
};

/**
 * Every candidate frame {o, M, prior} (ldd-frame.js: M's columns are LDD's axes in the LDraw part). First
 * the ones LDD's habits suggest (prior 2: ldd-frame.js's rule for the part, even one not trusted on its own;
 * prior 1: LDraw's own frame), which win a tie: connections alone cannot tell an EV3 brick's screen side
 * from its back.
 */
export const candidateFrames = (meta, ruleFrame = null) => {
    const origins = candidateOrigins(meta);
    const out = [];
    if (ruleFrame) out.push({o: ruleFrame.o, M: ruleFrame.M, prior: 2});
    out.push({o: [0, 0, 0], M: F.slice(), prior: 1});
    for (const Q of AXIS_TURNS) {
        const M = mul(F, Q);
        for (const o of origins) out.push({o, M, prior: 0});
    }
    return out;
};

/** A placed part's connectors in the model frame (LDU). */
export const placedConnectors = (meta, {rotation, position}) => (meta.connectors || []).map(c => ({
    ...c,
    position: mulVec(rotation, c.position).map((x, i) => x + position[i]),
    axis: c.axis ? mulVec(rotation, c.axis) : c.axis
}));

const CELL = 20;
/** Scores this close are a tie (the depth term adds float noise). */
const TIE = 1e-4;
/** How far apart two connectors that join may be centred, per axis, beyond their lines (LDU). */
const REACH = 12;
// Cells as one number: 2^20 cells (20 km) along each axis is more than any model.
const SPAN = 1 << 20;
const cellKey = (x, y, z) => ((x + SPAN / 2) * SPAN + (y + SPAN / 2)) * SPAN + (z + SPAN / 2);
/** Points along a connector, one per half cell (a long axle sits in several cells). */
const samples = c => {
    if (!(c.axis && c.length > 0)) return [c.position];
    const n = Math.max(1, Math.ceil(c.length / (CELL / 2)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const t = -c.length / 2 + c.length * i / n;
        pts.push([c.position[0] + t * c.axis[0], c.position[1] + t * c.axis[1], c.position[2] + t * c.axis[2]]);
    }
    return pts;
};

/** The anchors: placed connectors, found by where they are. */
export class Anchors {
    constructor () {
        this.cells = new Map();
        this.count = 0;
        /** Where connectors were added, in order (a design re-scores only when some came near it). */
        this.log = [];
    }

    add (connectors) {
        for (const c of connectors) {
            this.count++;
            this.log.push(c.position);
            for (const p of samples(c)) {
                const k = cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL));
                let list = this.cells.get(k);
                if (!list) this.cells.set(k, list = []);
                if (list[list.length - 1] !== c) list.push(c);
            }
        }
    }

    /** The anchors whose samples lie in a cell within REACH of one of the connector's samples. */
    near (c) {
        const out = new Set();
        for (const p of samples(c)) {
            const x0 = Math.floor((p[0] - REACH) / CELL); const x1 = Math.floor((p[0] + REACH) / CELL);
            const y0 = Math.floor((p[1] - REACH) / CELL); const y1 = Math.floor((p[1] + REACH) / CELL);
            const z0 = Math.floor((p[2] - REACH) / CELL); const z1 = Math.floor((p[2] + REACH) / CELL);
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
                const list = this.cells.get(cellKey(x, y, z));
                if (list) for (const a of list) out.add(a);
            }
        }
        return out;
    }
}

/** Whether two connectors join by a pair rule of the connector kinds (either way round). */
const engages = (kinds, a, b) => {
    for (const [s, h] of [[a, b], [b, a]]) {
        const rule = kinds.rule(s.type, h.type);
        if (rule) {
            try {
                if (rule.match(s, h)) return true;
            } catch (_) { /* a rule that cannot judge these two: no */ }
        }
    }
    return false;
};

const HOLES = new Set(['pinhole', 'axlehole']);
/** An axle in a pin hole or a pin in an axle hole (either way round): joined, but not as the parts are made to be. */
const CROSS = new Set(['axle/pinhole', 'pinhole/axle', 'pin/axlehole', 'axlehole/pin']);
const crossKind = (a, b) => CROSS.has(`${a.type}/${b.type}`);
const SHAFTS = new Set(['pin', 'axle']);
/** How much of one line two coaxial line connectors share (LDU), or 0. */
const sharedLength = (a, b) => {
    if (!(a.axis && b.axis && a.length > 0 && b.length > 0)) return 0;
    const d = a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2];
    if (Math.abs(d) < 0.999) return 0;
    const w = [0, 1, 2].map(i => b.position[i] - a.position[i]);
    const along = w[0] * a.axis[0] + w[1] * a.axis[1] + w[2] * a.axis[2];
    const off = Math.hypot(w[0] - along * a.axis[0], w[1] - along * a.axis[1], w[2] - along * a.axis[2]);
    if (off > 1) return 0;
    return Math.max(0, Math.min(a.length / 2, along + b.length / 2) - Math.max(-a.length / 2, along - b.length / 2));
};
/**
 * Two holes, or two shafts, sharing more than 2 LDU of one line: two parts in each other's material (a
 * beam slid half its width along the pin it is on sits in its neighbour; two pins in one hole).
 */
const interpenetrate = (a, b) => ((HOLES.has(a.type) && HOLES.has(b.type)) || (SHAFTS.has(a.type) && SHAFTS.has(b.type))) &&
    sharedLength(a, b) > 2;

/**
 * How well a placed part sits among the anchors: one for each of its connectors that engages an anchor
 * (a pin in a hole, a stud in an anti-stud), less one for each of its holes that runs into an anchor's
 * hole (the part is inside its neighbour).
 */
export const engagement = (kinds, anchors, connectors) => {
    let n = 0;
    let depth = 0;
    for (const c of connectors) {
        let hit = 0;
        let clash = false;
        for (const a of anchors.near(c)) {
            if (engages(kinds, c, a)) {
                // A shaft in its own kind of hole (a pin in a pin hole, an axle in an axle hole) counts whole; an axle
                // in a round hole or a pin in an axle hole half: an axle pin put in back to front meets as many.
                // And as far as it is seated: a pin half in its hole, half in the beam beside, counts half.
                const shared = sharedLength(c, a);
                const shorter = Math.min(c.length || 0, a.length || 0);
                const seat = shorter > 0 ? Math.min(1, shared / shorter + 0.05) : 1;
                hit = Math.max(hit, (crossKind(c, a) ? 0.5 : 1) * seat);
                // How deep: a pin seated in both its holes over its whole length beats one slid half out.
                depth += shared;
            } else if (!clash && interpenetrate(c, a)) clash = true;
        }
        n += hit - (clash ? 1 : 0);
    }
    // The depth only breaks ties: under one connection's worth for the whole part.
    return n + Math.min(depth, 999) / 1000;
};

/**
 * A tread's links join one another, nothing else: each link whose pivot is one pitch from another
 * link's pivot, on a parallel axis, counts one (their chain-link connectors, kinds/chain.js).
 */
const chainLinks = placedAll => {
    const pivots = placedAll.flatMap(cs => cs.filter(c => c.type === 'chain-link'));
    let n = 0;
    for (const a of pivots) {
        const pitch = a.data && a.data.pitchLdu;
        if (!(pitch > 0)) continue;
        if (pivots.some(b => b !== a && Math.abs(Math.abs(a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2]) - 1) < 1e-3 &&
            Math.abs(Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]) - pitch) < 1.5)) n++;
    }
    return n;
};

/** A placement's shape, to tell two candidates that place a part identically (its symmetry) from two that do not. */
const shapeKey = connectors => connectors.map(c => `${c.type}@${key3(c.position)}`).sort().join(';');

/**
 * Works out, round by round, the LDD frames of the designs in `pending` from their connections.
 * @param {object} options
 * @param {Map<string, {meta: object, bones: number[][]}>} options.pending design → the catalogue part's
 *        PartMeta and the bones of its instances
 * @param {Anchors} options.anchors the connectors of the parts already placed (grows as designs are placed)
 * @param {(bone: number[], row: object) => {rotation: number[], position: number[]}} options.place
 *        lxf-model.js lddToLdraw
 * @param {(frame: {o: number[], M: number[]}) => object} options.rowOf ldd-frame.js rowOfFrame
 * @param {object} options.kinds the connector kind registry (kinds/index.js BUILTIN_KINDS.connectors)
 * @param {number} [options.maxRounds]
 * @returns {Map<string, {row: object, score: number, instances: number, ambiguous: boolean}>} the designs placed
 */
export const snapFrames = ({pending, anchors, place, rowOf, kinds, frameOf = () => null, maxRounds = 20}) => {
    const solved = new Map();
    const frames = new Map();
    for (const [design, d] of pending) {
        let rule = null;
        try { rule = frameOf(d.meta); } catch (_) { rule = null; }
        frames.set(design, candidateFrames(d.meta, rule).map(f => ({frame: f, row: rowOf(f), prior: f.prior})));
    }
    // Where each design's instances are (their LDD origins, 25·F·b) and how far its connectors reach.
    const where = new Map();
    for (const [design, d] of pending) {
        const reach = 60 + Math.max(0, ...(d.meta.connectors || []).map(c => Math.hypot(...c.position) + (c.length || 0) / 2));
        where.set(design, {centres: d.bones.map(b => [25 * b[9], -25 * b[10], -25 * b[11]]), reach, seen: -1, memo: null});
    }
    /** Whether a connector added since `since` lies near one of the design's instances. */
    const touched = (w, since) => {
        for (let k = Math.max(0, since); k < anchors.log.length; k++) {
            const p = anchors.log[k];
            if (w.centres.some(c => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) <= w.reach)) return true;
        }
        return false;
    };
    const PROBE_KEEP = 48;
    const evaluate = (design, d) => {
        const all = frames.get(design);
        // Probe: every candidate on the instance with the most anchors around it; then the most promising
        // candidates (and the prior ones) on every instance.
        let probe = 0;
        if (d.bones.length > 1) {
            const w = where.get(design);
            const around = w.centres.map(c => anchors.near({position: c}).size);
            probe = around.indexOf(Math.max(...around));
        }
        let cands = all;
        if (d.bones.length > 1 && all.length > PROBE_KEEP) {
            const scored = all.map(cand => ({cand, s: engagement(kinds, anchors, placedConnectors(d.meta, place(d.bones[probe], cand.row)))}));
            const top = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s);
            const floor = top.length ? top[Math.min(top.length, PROBE_KEEP) - 1].s - 1 : 0;
            cands = scored.filter(x => x.cand.prior > 0 || (x.s > 0 && x.s >= floor)).map(x => x.cand);
        }
        let best = null;
        const byShape = new Map();
        const chain = d.bones.length >= 3 && (d.meta.connectors || []).some(c => c.type === 'chain-link');
        for (const cand of cands) {
            let score = 0;
            let first = null;
            const placedAll = [];
            for (const bone of d.bones) {
                const conns = placedConnectors(d.meta, place(bone, cand.row));
                if (!first) first = conns;
                if (chain) placedAll.push(conns);
                score += engagement(kinds, anchors, conns);
            }
            if (chain) score += chainLinks(placedAll);
            if (score <= 0) continue;
            const shape = shapeKey(first);
            byShape.set(shape, Math.max(byShape.get(shape) || 0, score));
            // A better score wins; an equal one (within float noise) keeps the earlier: the prior ones come first.
            if (!best || score > best.score + TIE) best = {cand, score, shape};
        }
        return {best, byShape};
    };
    let allowAmbiguous = false;
    for (let round = 0; round < maxRounds && pending.size; round++) {
        const placedNow = [];
        for (const [design, d] of pending) {
            const w = where.get(design);
            if (!w.memo || touched(w, w.seen)) {
                w.memo = evaluate(design, d);
                w.seen = anchors.log.length;
            }
            const {best, byShape} = w.memo;
            const need = Math.max(2, Math.ceil(d.bones.length / 2));
            if (!best || best.score < need) continue;
            // Ties are on the whole connections; the depth (fractions) decides between them.
            // Another shape (not the same placement turned by a symmetry) engaging as much: ambiguous. It waits
            // for more anchors, and is taken only when nothing else can be placed.
            const ambiguous = best.cand.prior === 0 && [...byShape].some(([shape, score]) => shape !== best.shape && Math.abs(score - best.score) <= TIE);
            if (ambiguous && !allowAmbiguous) continue;
            placedNow.push({design, d, best, ambiguous});
        }
        if (!placedNow.length) {
            if (allowAmbiguous) break;
            allowAmbiguous = true;
            continue;
        }
        allowAmbiguous = false;
        for (const {design, d, best, ambiguous} of placedNow) {
            for (const bone of d.bones) anchors.add(placedConnectors(d.meta, place(bone, best.cand.row)));
            solved.set(design, {row: best.cand.row, score: best.score, instances: d.bones.length, ambiguous});
            pending.delete(design);
        }
    }
    return solved;
};
