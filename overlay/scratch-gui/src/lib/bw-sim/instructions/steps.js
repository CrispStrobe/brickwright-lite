// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Building instructions for a Robot Lab model, the order half (pure, no DOM):
// which parts go on in which step, like the pages of a LEGO manual. The
// pictures are view/instructions-view.js's job.
//
// A model that carries LDraw `0 STEP` lines (model.steps, from
// model/ldraw-model.js) is built in the author's steps. Otherwise the steps are
// derived from the connector graph (mech/graph.js buildGraph):
//
//   - the first part is the hub (or, without one, the heaviest part);
//   - then the parts in connection order: a breadth-first walk over the
//     "structural" parts (beams, motors, sensors, wheels, gears, connectors),
//     where two structural parts are neighbours when they touch directly or
//     through pins and axles;
//   - a fastener (a pin, an axle, a bush; one that sits in another, such as a
//     bush on an axle, counts with it as one cluster) goes in the step where
//     the second thing it joins is placed: a pin with the beam it holds on, an
//     axle with the wheel it carries; one that joins only one part goes with it;
//   - steps hold about STEP_TARGET parts; long fastener clusters are split
//     into connected pages of at most STEP_MAX parts;
//   - an editor group (`0 !BW GROUP`) whose parts hold together is a
//     sub-assembly: built in its own steps (drawn alone) right before the step
//     that attaches it to the model.
//   - mirrored pairs go on together, as LEGO prints them ("2x" in the callout):
//     two structural parts with the same part number and colour whose
//     connectors mirror onto each other across the model's symmetry plane
//     (mirrorPairs), and whose neighbours mirror onto each other as well, so the
//     second is attached to the mirror image of what holds the first (the two
//     drive motors, the two wheels). If pairing ever made a step unbuildable,
//     the steps are derived without it.
//
// Every derived step is buildable: each new part touches a part already built,
// directly or through other parts of the same step (test/bw-sim-instructions.test.mjs).
// Parts that do not connect to the rest at all start a step marked `loose`.
//
// Pins first (pinsFirst), as a LEGO manual does it: a step's pins and axles that go into the
// model built so far get a step of their own (`pins: true`) before the part that goes onto
// them, so the page shows them sticking out of their holes before anything covers them. A step
// that starts the model (the hub and the motors pinned to it) puts its first part on alone, then
// its pins, then the rest.
//
// Each step also says which way its new parts slide in (`moves`: part id → unit direction in
// the model's LDU frame, pointing AWAY from where the part goes, along the connection that seats
// it in a part already built): the view draws them flying in, or exploded with an arrow. And from
// which corner the page looks (`view`: [sx, sz], LDU frame, always from above): the one facing the
// side the new parts come from, keeping the last page's when it does as well (a manual turns the
// model only when it must; the pane then says so).

import {buildGraph} from '../mech/graph.js';
import {partHubProfile} from '../contracts.js';
import {WRAPPED_GEARS, linksJoin, pivotsOnGear} from '../kinds/chain.js';
import {placedSpur, placedTooth} from '../kinds/tooth-parts.js';

/** Parts per derived step the walk aims for, and the maximum per insertion page. */
export const STEP_TARGET = 4;
export const STEP_MAX = 6;

/** Catalog categories that fasten other parts together rather than being the structure. */
const FASTENER_CATEGORIES = new Set(['pin', 'axle']);
/** Order of the parts in a "parts needed" callout and the bill of materials (palette categories). */
const CATEGORY_ORDER = ['hub', 'motor', 'sensor', 'beam', 'connector', 'axle', 'pin', 'gear', 'wheel', 'other'];

const metaOf = (catalog, part) => (catalog instanceof Map ? catalog.get(part) : catalog?.[part]) || null;

/** True for a pin, an axle or a bush: it goes on with what it joins. */
export const isFastener = meta => Boolean(meta) && FASTENER_CATEGORIES.has(meta.category);

/**
 * The number a manual prints next to a part of a given length: an axle's length
 * in studs (LEGO's "4" in a circle), a straight beam's or liftarm's holes, a 3L pin.
 * From the catalog's English name; null when the part has no single length.
 * @param {object|null} meta PartMeta
 * @returns {number|null}
 */
export const partLength = meta => {
    if (!meta || typeof meta.name !== 'string') return null;
    if (meta.category === 'axle') {
        const m = /\baxle (\d+)\b/i.exec(meta.name);
        return m ? Number(m[1]) : null;
    }
    if (meta.category === 'pin') {
        const m = /\b(\d+)L\b/.exec(meta.name);
        return m ? Number(m[1]) : null;
    }
    if (meta.category === 'beam') {
        const m = /\b(?:beam|liftarm(?: 1 x)?) (\d+)$/i.exec(meta.name.replace(/^Technic thin /i, 'Technic '));
        return m ? Number(m[1]) : null;
    }
    return null;
};

/**
 * Which parts touch which, from the connector graph: part id → Set of part ids.
 * A motor's housing and output are one part here.
 * @param {object} model PlacedModel
 * @param {Map|object} catalog
 * @returns {Map<string, Set<string>>}
 */
export const partAdjacency = (model, catalog) => {
    const {nodes, edges} = buildGraph(model, catalog, []);
    const adjacency = new Map(model.parts.map(p => [p.id, new Set()]));
    const join = (a, b) => { adjacency.get(a).add(b); adjacency.get(b).add(a); };
    for (const edge of edges) {
        const a = nodes.get(edge.a.part)?.partId;
        const b = nodes.get(edge.b.part)?.partId;
        if (a === undefined || b === undefined || a === b) continue;
        join(a, b);
    }
    // Chain and tread links make no connector edges (kinds/chain.js): a link touches the next one on
    // its pivot and the sprocket it wraps, so a chain is built link by link round its sprockets.
    const metaOf = part => (catalog instanceof Map ? catalog.get(part) : catalog[part]);
    const links = model.parts.flatMap(p => placedTooth(p, metaOf(p.part), 'chain-link', ['along']).map(l => ({id: p.id, l})));
    if (links.length) {
        const gears = model.parts.map(p => ({id: p.id, g: placedSpur(p, metaOf(p.part), WRAPPED_GEARS)})).filter(x => x.g);
        links.forEach((a, i) => {
            for (const b of links.slice(i + 1)) if (a.id !== b.id && linksJoin(a.l, b.l)) join(a.id, b.id);
            for (const g of gears) if (pivotsOnGear(a.l, g.g) > 0) join(a.id, g.id);
        });
    }
    return adjacency;
};

const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vUnit = a => { const n = Math.hypot(...a) || 1; return a.map(v => v / n); };

/**
 * Which way new parts slide onto the parts on the page: for each connection between a new part
 * and a part already built (mech/graph.js edges: a shaft in a hole), along the connection's axis,
 * from the built part's connector toward the new part's; a stud in its socket (where the two
 * connectors meet at one point) says it by the stud, which points out of its own part: a part set
 * onto a built stud comes from the stud's side, a part whose stud goes into a built one from the
 * other; any other connection centred on its partner (a wheel on the middle of its axle) says the
 * side of the page's centre the part is on (outboard).
 * A part whose connections disagree (it goes on in two directions at once) has none.
 * @returns {(fresh: string[], onPage: Set<string>) => Map<string, number[]>} unit directions (LDU frame), away from home
 */
export const insertDirections = (model, catalog) => {
    const {nodes, edges} = buildGraph(model, catalog, []);
    const joints = [];
    for (const e of edges) {
        if (e._isMotorInternal || !e.axis) continue;
        const [na, nb] = [nodes.get(e.a.part), nodes.get(e.b.part)];
        if (!na || !nb || na.partId === nb.partId) continue;
        const ca = na.connectors.find(c => c.id === e.a.connector);
        const cb = nb.connectors.find(c => c.id === e.b.connector);
        if (ca && cb) joints.push({a: na.partId, b: nb.partId, axis: vUnit(e.axis), pa: ca.position, pb: cb.position, ta: ca, tb: cb});
    }
    const at = new Map(model.parts.map(p => [p.id, p.position]));
    return (fresh, onPage) => {
        const out = new Map();
        const page = [...onPage].map(id => at.get(id)).filter(Boolean);
        const centre = page.length ? [0, 1, 2].map(i => page.reduce((sum, p) => sum + p[i], 0) / page.length) : null;
        for (const id of fresh) {
            let dir = null;
            let clash = false;
            for (const j of joints) {
                const mine = j.a === id ? [j.pa, j.pb, j.b, j.ta, j.tb] : j.b === id ? [j.pb, j.pa, j.a, j.tb, j.ta] : null;
                if (!mine || !onPage.has(mine[2])) continue;
                let s = vDot(vSub(mine[0], mine[1]), j.axis);
                // A stud in its socket: the stud's own axis points out of its part.
                if (Math.abs(s) < 1e-6 && (mine[3].type === 'stud' || mine[4].type === 'stud')) {
                    const stud = mine[3].type === 'stud' ? mine[3] : mine[4];
                    s = vDot(stud.axis, j.axis) * (stud === mine[3] ? -1 : 1);
                }
                // Centred on its partner: the side of the page's centre it is on.
                if (Math.abs(s) < 1e-6 && centre) s = vDot(vSub(at.get(id), centre), j.axis);
                if (Math.abs(s) < 1e-6) continue;
                const d = j.axis.map(v => (v * Math.sign(s)) || 0);
                if (dir && vDot(dir, d) < 0.99) { clash = true; break; }
                dir = dir || d;
            }
            if (dir && !clash) out.set(id, dir);
        }
        return out;
    };
};

/**
 * Pins first: splits a step whose pins and axles go into parts on the page (or into its own first
 * part) so they go in on their own step, before the parts that cover them; the first step of the
 * model (or of a sub-assembly) puts its first part on alone. Steps stay buildable.
 */
const pinsFirst = (steps, adjacency, meta, groups) => {
    const out = [];
    const builtIn = new Map();
    const groupParts = id => groups.find(g => g.id === id)?.parts || [];
    const touches = (id, set) => [...(adjacency.get(id) || [])].some(n => set.has(n));
    for (const step of steps) {
        const scope = step.subassembly || null;
        if (!builtIn.has(scope)) builtIn.set(scope, new Set());
        const built = builtIn.get(scope);
        const attached = new Set(step.attach.flatMap(groupParts));
        let rest = step.parts.slice();
        const pieces = [];
        for (;;) {
            const fasteners = rest.filter(id => isFastener(meta(id)));
            const covers = new Set([...rest.filter(id => !isFastener(meta(id))), ...attached]);
            const fastenerSet = new Set(fasteners);
            const reachesCover = id => {
                const seen = new Set([id]); const queue = [id];
                while (queue.length) {
                    for (const n of adjacency.get(queue.shift()) || []) {
                        if (covers.has(n)) return true;
                        if (fastenerSet.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
                    }
                }
                return false;
            };
            // Pins in the model so far that a part of this step goes onto.
            // A perpendicular pin-hole connector followed by a stud half-pin is two insertion
            // stages before the plate. Walk the remaining fasteners rather than burying both with it.
            const first = [];
            const selected = new Set();
            const seeds = covers.size ? fasteners.filter(f => touches(f, built) && reachesCover(f)) : [];
            for (const seed of seeds) {
                if (selected.has(seed)) continue;
                const unit = new Set([seed]); const queue = [seed];
                while (queue.length) {
                    for (const n of adjacency.get(queue.shift()) || []) {
                        // Retaining bushes follow their axle in connected insertion order. A stud half-pin
                        // also touches the plate it will carry, so it remains a separate stage.
                        if (fastenerSet.has(n) && !unit.has(n) && !selected.has(n) &&
                            [...(adjacency.get(n) || [])].every(id => isFastener(meta(id)))) {
                            unit.add(n); queue.push(n);
                        }
                    }
                }
                if (first.length && first.length + unit.size > STEP_MAX) break;
                for (const id of unit) { first.push(id); selected.add(id); }
            }
            if (first.length) {
                // Long shafts can carry more collars than fit on one manual page.
                // Breadth-first order keeps each chunk attached to the shaft already placed.
                for (let i = 0; i < first.length; i += STEP_MAX) {
                    pieces.push({parts: first.slice(i, i + STEP_MAX), pins: true});
                }
                for (const id of first) built.add(id);
                rest = rest.filter(id => !first.includes(id));
                continue;
            }
            // The step's first part goes on alone when it starts the model (or its sub-assembly) with others
            // (the RCX, then the motors and the plate under it), or when its pins join it to another new part.
            const lead = rest.find(id => !isFastener(meta(id)));
            const joined = lead && fasteners.some(f => adjacency.get(f)?.has(lead) && [...covers].some(c => c !== lead && adjacency.get(f)?.has(c)));
            if (!lead || covers.size < 2 || (built.size > 0 && !joined)) break;
            pieces.push({parts: [lead], pins: false});
            built.add(lead);
            rest = rest.filter(id => id !== lead);
        }
        pieces.push({parts: rest, pins: false, last: true});
        const kept = pieces.filter(p => p.parts.length || (p.last && step.attach.length));
        kept.forEach((p, i) => {
            out.push({...step, parts: p.parts, attach: p.last ? step.attach : [], loose: i === 0 && step.loose, pins: p.pins});
            for (const id of p.parts) built.add(id);
        });
        for (const id of attached) built.add(id);
    }
    return out;
};

/** The four corners a page looks from (LDU frame: x right, z toward the back; the camera is above). */
export const VIEWS = Object.freeze([[1, -1], [-1, -1], [1, 1], [-1, 1]]);
/**
 * The corner that shows where a step's parts come from best: each corner scores how much the parts'
 * ways in face it; the front-right corner (a manual's usual view) and the page before's are preferred.
 */
export const stepCorner = (moves, before = VIEWS[0]) => {
    const score = ([sx, sz]) => {
        const d = vUnit([sx, 0, sz]); // the camera is always above: the side it faces
        let s = 0;
        for (const m of moves) s += Math.max(0, vDot(m, d));
        if (sx === VIEWS[0][0] && sz === VIEWS[0][1]) s += 0.2;
        if (sx === before[0] && sz === before[1]) s += 0.9;
        return s;
    };
    return VIEWS.reduce((best, v) => (score(v) > score(best) + 1e-9 ? v : best), before);
};

/**
 * Each step's `moves` (insertDirections against what is on its page) and `view`; an attaching sub-assembly moves
 * as one. A new part no connection gives a way (a chain link: no connector edges; a part held two ways at once)
 * comes from away from the built parts it touches (adjacency): a link out of its sprocket.
 */
const withMoves = (plan, directions, {adjacency, positions} = {}) => {
    const awayFrom = (id, onPage) => {
        if (!adjacency || !positions) return null;
        const near = [...(adjacency.get(id) || [])].filter(n => onPage.has(n) && positions.has(n));
        if (!near.length) return null;
        const c = [0, 1, 2].map(i => near.reduce((sum, n) => sum + positions.get(n)[i], 0) / near.length);
        const d = vSub(positions.get(id), c);
        return Math.hypot(...d) > 1e-6 ? vUnit(d).map(v => v || 0) : null;
    };
    let corner = VIEWS[0];
    plan.steps.forEach((step, n) => {
        const {built, fresh} = stepView(plan, n);
        const dirs = directions(fresh, new Set(built));
        const moves = {};
        for (const g of step.attach) {
            const parts = plan.groups.find(x => x.id === g)?.parts || [];
            const found = parts.map(id => dirs.get(id)).filter(Boolean);
            if (found.length && found.every(d => vDot(d, found[0]) > 0.99)) for (const id of parts) moves[id] = found[0];
        }
        const onPage = new Set(built);
        for (const id of step.parts) {
            if (dirs.has(id)) moves[id] = dirs.get(id);
            else if (!moves[id]) {
                const away = awayFrom(id, onPage);
                if (away) moves[id] = away;
            }
        }
        step.moves = moves;
        corner = stepCorner(Object.values(moves), corner);
        step.view = corner;
    });
    return plan;
};

/** Is every id in `ids` reachable from the first through `adjacency`, staying inside `ids`? */
const holdsTogether = (ids, adjacency) => {
    if (ids.length === 0) return false;
    const inside = new Set(ids);
    const seen = new Set([ids[0]]);
    const queue = [ids[0]];
    while (queue.length) {
        for (const n of adjacency.get(queue.shift()) || []) {
            if (inside.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
        }
    }
    return seen.size === inside.size;
};

/** LDU: how close a mirrored connector must come to its counterpart. */
const MIRROR_EPS = 0.5;

/**
 * The model's mirrored pairs: part id → its mirror partner (both directions).
 *
 * The symmetry plane is the axis-aligned plane (x, y or z = c) across which the most parts of
 * the model have a mirror image. Part P's image is Q when Q has P's part number and colour and
 * Q's connectors are exactly P's connectors mirrored across the plane (positions within
 * MIRROR_EPS) — the holes and shafts are where the parts connect, so this is the geometric test
 * that matters for building. A part that is its own image (the hub on the plane) is not a pair.
 * A pair counts only when it relates the same way to the rest: every part touching P has its
 * image (or is its own image) touching Q, and that image is itself a counted pair or self-image
 * (iterated to a fixpoint), so placing Q with P leaves Q attached to what is already built.
 * @param {object} model PlacedModel
 * @param {Map|object} catalog
 * @param {Map<string, Set<string>>} adjacency from partAdjacency
 * @returns {Map<string, string>}
 */
export const mirrorPairs = (model, catalog, adjacency) => {
    const {nodes} = buildGraph(model, catalog, []);
    const points = new Map(model.parts.map(p => [p.id, []]));
    for (const node of nodes.values()) points.get(node.partId)?.push(...node.connectors.map(c => c.position));
    const key = p => `${p.part}@${p.color ?? 16}`;
    const imageOf = (k, c, id) => points.get(id).map(v => v.map((x, i) => (i === k ? 2 * c - x : x)));
    const sameSet = (a, b) => a.length === b.length && a.length > 0 &&
        a.every(v => b.some(w => Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]) <= MIRROR_EPS)) &&
        b.every(v => a.some(w => Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]) <= MIRROR_EPS));
    // Equal connector sets have equal bounds (within MIRROR_EPS), even with
    // repeated points. Index their lower corner; the exact sameSet test below
    // still decides the match. Keep input order to preserve Array.find ties.
    const cell = 2 * MIRROR_EPS;
    const boxes = new Map(), buckets = new Map(), ordinal = new Map();
    const kindBuckets = new Map();
    model.parts.forEach((p, i) => {
        ordinal.set(p.id, i);
        const pts = points.get(p.id);
        if (!pts.length) return;
        const lo = [0,1,2].map(k => pts.reduce((v,p) => Math.min(v,p[k]), Infinity));
        const hi = [0,1,2].map(k => pts.reduce((v,p) => Math.max(v,p[k]), -Infinity));
        boxes.set(p.id, {lo, hi});
        const kind = key(p);
        if (!buckets.has(kind)) buckets.set(kind, new Map());
        const root = buckets.get(kind);
        kindBuckets.set(p.id, root);
        const [x,y,z] = lo.map(v => Math.floor(v / cell));
        if (!root.has(x)) root.set(x, new Map());
        const ys = root.get(x);
        if (!ys.has(y)) ys.set(y, new Map());
        const zs = ys.get(y);
        if (!zs.has(z)) zs.set(z, []);
        zs.get(z).push(p);
    });
    const nearby = (p, k, c) => {
        const box = boxes.get(p.id);
        if (!box) return [];
        const xyz = box.lo.map((v,i) => Math.floor((i === k ? 2*c-box.hi[i] : v) / cell));
        const found = [], root = kindBuckets.get(p.id);
        for (let x=-1; x<=1; x++) {
            const ys = root.get(xyz[0]+x);
            if (!ys) continue;
            for (let y=-1; y<=1; y++) {
                const zs = ys.get(xyz[1]+y);
                if (!zs) continue;
                for (let z=-1; z<=1; z++) {
                    const matches = zs.get(xyz[2]+z);
                    if (matches) found.push(...matches);
                }
            }
        }
        return found.sort((a,b) => ordinal.get(a.id)-ordinal.get(b.id));
    };
    /** Mirror map for plane (k, c): id → image id (self allowed). */
    const mapFor = (k, c) => {
        const m = new Map();
        for (const p of model.parts) {
            if (m.has(p.id)) continue;
            const img = imageOf(k, c, p.id);
            const q = nearby(p,k,c).find(o => (o.id === p.id || !m.has(o.id)) && sameSet(img, points.get(o.id)));
            if (q) { m.set(p.id, q.id); m.set(q.id, p.id); }
        }
        return m;
    };
    // Candidate planes: midway between two parts of the same kind, on each axis.
    const candidates = new Map();
    const parts = model.parts;
    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            if (key(parts[i]) !== key(parts[j])) continue;
            for (let k = 0; k < 3; k++) {
                const c = Math.round((parts[i].position[k] + parts[j].position[k])) / 2;
                candidates.set(`${k}|${c}`, [k, c]);
            }
        }
    }
    let best = new Map();
    let bestPairs = 0;
    for (const [k, c] of candidates.values()) {
        const m = mapFor(k, c);
        const pairs = [...m].filter(([a, b]) => a !== b).length / 2;
        if (pairs > bestPairs) { best = m; bestPairs = pairs; }
    }
    // Keep only pairs that relate the same way to their neighbours.
    const ok = new Map(best);
    for (let changed = true; changed;) {
        changed = false;
        for (const [a, b] of ok) {
            if (a === b) continue;
            const fits = [...(adjacency.get(a) || [])].every(n => ok.has(n) && (adjacency.get(b) || new Set()).has(ok.get(n)));
            if (!fits) { ok.delete(a); ok.delete(b); changed = true; }
        }
    }
    return new Map([...ok].filter(([a, b]) => a !== b));
};

/**
 * Can every step be built? Each new part reaches a part built before (`built`, then every earlier
 * step) through the step's new parts; a loose step, or the first step with nothing built, only
 * needs its parts to hold together. Sub-assembly steps were judged when they were derived.
 */
const buildable = (steps, adjacency, built) => {
    const done = new Set(built);
    for (const step of steps) {
        if (step.subassembly) continue;
        const fresh = step.parts;
        const freshSet = new Set(fresh);
        const reached = new Set();
        const queue = (done.size && !step.loose) ? fresh.filter(id => [...(adjacency.get(id) || [])].some(x => done.has(x))) : fresh.slice(0, 1);
        if (step.attach.length) queue.length = 0; // an attaching step brings its sub-assembly: not judged here
        for (const id of queue) reached.add(id);
        while (queue.length) {
            for (const x of adjacency.get(queue.shift()) || []) {
                if (freshSet.has(x) && !reached.has(x)) { reached.add(x); queue.push(x); }
            }
        }
        if (!step.attach.length && fresh.some(id => !reached.has(id))) return false;
        for (const id of fresh) done.add(id);
    }
    return true;
};

/**
 * Orders `ids` into steps, starting from what `built` already holds (part ids).
 * @param {object} options
 * @param {string[]} options.ids the parts to place
 * @param {Map<string, Set<string>>} options.adjacency
 * @param {(id: string) => object|null} options.metaOf
 * @param {Map<string, number>} options.index part id → position in model.parts (ties go in file order)
 * @param {Set<string>} [options.built] parts already placed (they are not placed again)
 * @param {Array<{id: string, parts: string[]}>} [options.groups] sub-assemblies: each is placed as one unit
 * @param {(group: object, built: Set<string>) => object[]} [options.subSteps] the steps building a group, emitted before it is attached
 * @param {Map<string, string>} [options.pairs] mirrored pairs (mirrorPairs): each pair goes on in one step
 * @returns {object[]} steps {parts, attach, subassembly: null, loose}
 */
const deriveSteps = options => {
    const {pairs = new Map(), adjacency, built = new Set()} = options;
    if (pairs.size) {
        const paired = deriveUnits({...options, withPairs: pairs});
        if (buildable(paired, adjacency, built)) return paired;
    }
    return deriveUnits({...options, withPairs: new Map()});
};

/** deriveSteps' walk; `withPairs` (part id → mirror partner) puts mirrored structural parts in one unit. */
const deriveUnits = ({ids, adjacency, metaOf: meta, index, built = new Set(), groups = [], subSteps = () => [], withPairs = new Map()}) => {
    const groupOfPart = new Map();
    for (const g of groups) for (const id of g.parts) groupOfPart.set(id, g);
    const loosePart = ids.filter(id => !groupOfPart.has(id));
    // Units: a group, a structural part, or a cluster of fasteners that sit in each other.
    const units = [];
    const unitOf = new Map();
    const addUnit = unit => {
        unit.order = Math.min(...unit.parts.map(id => index.get(id)));
        units.push(unit);
        for (const id of unit.parts) unitOf.set(id, unit);
    };
    for (const g of groups) addUnit({kind: 'group', group: g, parts: g.parts.slice(), fastener: false});
    const fastenerIds = loosePart.filter(id => isFastener(meta(id)));
    const fastenerSet = new Set(fastenerIds);
    const everyFastener = fastenerIds.length === loosePart.length && groups.length === 0;
    const loosePartSet = new Set(loosePart);
    const structuralPart = id => loosePartSet.has(id) && (!fastenerSet.has(id) || everyFastener);
    for (const id of loosePart) {
        if (unitOf.has(id)) continue;
        if (structuralPart(id)) {
            const mate = withPairs.get(id);
            addUnit({kind: 'part', parts: mate && structuralPart(mate) && !unitOf.has(mate) ? [id, mate] : [id], fastener: false});
            continue;
        }
        const cluster = [id];
        const seen = new Set(cluster);
        for (let i = 0; i < cluster.length; i++) {
            for (const n of adjacency.get(cluster[i]) || []) {
                if (fastenerSet.has(n) && !seen.has(n)) { seen.add(n); cluster.push(n); }
            }
        }
        cluster.sort((a, b) => index.get(a) - index.get(b));
        addUnit({kind: 'part', parts: cluster, fastener: true});
    }
    units.sort((a, b) => a.order - b.order);
    // What each unit touches: other units, and parts placed before this derivation started.
    for (const unit of units) {
        unit.touches = new Set();
        unit.touchesBuilt = false;
        for (const id of unit.parts) {
            for (const n of adjacency.get(id) || []) {
                if (built.has(n)) unit.touchesBuilt = true;
                const other = unitOf.get(n);
                if (other && other !== unit) unit.touches.add(other);
            }
        }
    }
    // Structural neighbours: touching directly, or through fastener units only.
    const structural = units.filter(u => !u.fastener);
    for (const unit of structural) {
        unit.next = new Set();
        unit.viaBuilt = unit.touchesBuilt;
        const seen = new Set([unit]);
        const queue = [unit];
        while (queue.length) {
            const at = queue.shift();
            for (const other of at.touches) {
                if (seen.has(other)) continue;
                seen.add(other);
                if (other.fastener) {
                    if (other.touchesBuilt) unit.viaBuilt = true;
                    queue.push(other);
                } else {
                    unit.next.add(other);
                }
            }
        }
    }
    const byOrder = (a, b) => a.order - b.order;
    const mass = unit => unit.parts.reduce((sum, id) => sum + (meta(id)?.massGrams || 0), 0);
    const pickRoot = remaining => {
        const hub = remaining.find(u => u.parts.some(id => partHubProfile(meta(id))));
        if (hub) return hub;
        return remaining.slice().sort((a, b) => mass(b) - mass(a) || byOrder(a, b))[0];
    };

    const steps = [];
    let current = null;
    const placed = new Set();
    const placedParts = new Set(built);
    const close = () => {
        if (current && (current.parts.length || current.attach.length)) steps.push(current);
        current = null;
    };
    const open = loose => {
        current = {parts: [], attach: [], subassembly: null, loose: Boolean(loose), size: 0};
    };
    /** Fastener units ready to go on: they join two placed things now, or the one thing they touch. */
    const readyFasteners = () => units.filter(u => u.fastener && !placed.has(u) && (() => {
        let ends = u.touchesBuilt ? 1 : 0;
        for (const other of u.touches) if (placed.has(other)) ends++;
        const degree = u.touches.size + (u.touchesBuilt ? 1 : 0);
        return ends >= Math.min(2, degree) && ends > 0;
    })());
    const placeFasteners = () => {
        for (let ready = readyFasteners(); ready.length; ready = readyFasteners()) {
            for (const u of ready) {
                placed.add(u);
                current.parts.push(...u.parts);
                current.size += u.parts.length;
                for (const id of u.parts) placedParts.add(id);
            }
        }
    };
    /** How many fastener parts placing `unit` would bring along. */
    const bringsAlong = unit => {
        let n = 0;
        for (const f of unit.touches) {
            if (!f.fastener || placed.has(f)) continue;
            let ends = (f.touchesBuilt ? 1 : 0) + 1;
            for (const other of f.touches) if (other !== unit && placed.has(other)) ends++;
            if (ends >= Math.min(2, f.touches.size + (f.touchesBuilt ? 1 : 0))) n += f.parts.length;
        }
        return n;
    };
    const place = (unit, loose) => {
        if (unit.kind === 'group') {
            close();
            steps.push(...subSteps(unit.group, new Set(placedParts)));
            open(loose);
            current.attach.push(unit.group.id);
            current.size += STEP_TARGET; // an attaching step shows the sub-assembly and what holds it, nothing more
        } else {
            const size = unit.parts.length + bringsAlong(unit);
            if (current && current.size > 0 && current.size + size > STEP_MAX) close();
            if (loose) close();
            if (!current) open(loose);
            current.parts.push(...unit.parts);
            current.size += unit.parts.length;
        }
        placed.add(unit);
        for (const id of unit.parts) placedParts.add(id);
        placeFasteners();
        if (current.size >= STEP_TARGET) close();
    };

    // Fasteners that join only what is already built go on first.
    open(false);
    placeFasteners();
    let queue = structural.filter(u => u.viaBuilt).sort(byOrder);
    const queued = new Set(queue);
    for (;;) {
        if (!queue.length) {
            const remaining = structural.filter(u => !placed.has(u));
            if (!remaining.length) break;
            const root = pickRoot(remaining);
            // A model's first part starts it; any later fresh start is a part that is not attached.
            queue = [root];
            queued.add(root);
            root.startsLoose = placedParts.size > 0;
        }
        const unit = queue.shift();
        place(unit, unit.startsLoose);
        for (const n of [...unit.next].sort(byOrder)) {
            if (!queued.has(n) && !placed.has(n)) { queued.add(n); queue.push(n); }
        }
    }
    // Fastener clusters that touch nothing structural (a lone pin): each on its own.
    for (const u of units.filter(x => x.fastener && !placed.has(x))) {
        close();
        open(placedParts.size > 0);
        placed.add(u);
        current.parts.push(...u.parts);
        current.size += u.parts.length;
        for (const id of u.parts) placedParts.add(id);
        placeFasteners();
    }
    close();
    // A one-part step (the castor's ball after the castor) joins the step before when that stays small:
    // the merged step is still buildable, as both halves were.
    for (let i = steps.length - 1; i > 0; i--) {
        const [before, step] = [steps[i - 1], steps[i]];
        if (step.parts.length === 1 && !step.attach.length && !step.loose && !before.attach.length &&
            before.size + 1 <= STEP_MAX) {
            before.parts.push(...step.parts);
            before.size += 1;
            steps.splice(i, 1);
        }
    }
    return steps.map(({size, ...step}) => step);
};

/**
 * The steps to build a model.
 * @param {object} model PlacedModel (model.steps: part ids per `0 STEP`, when the file had them)
 * @param {Map|object} catalog part catalog
 * @returns {{source: 'meta'|'auto', steps: Array<{parts: string[], attach: string[], subassembly: string|null, loose: boolean,
 *            pins: boolean, moves: object, view: number[]}>, groups: Array<{id: string, name: string, parts: string[]}>}}
 *          `parts` are the parts new in a step; `attach` names sub-assemblies (groups) joined to the
 *          model in it; a step with `subassembly` builds that group on its own; `pins`: a step that
 *          only puts pins and axles in (pinsFirst); `moves`: which way each new part slides in;
 *          `view`: the corner the page looks from (stepCorner)
 */
export const buildSteps = (model, catalog) => {
    const adjacency = partAdjacency(model, catalog);
    const index = new Map(model.parts.map((p, i) => [p.id, i]));
    const partOf = new Map(model.parts.map(p => [p.id, p]));
    const meta = id => metaOf(catalog, partOf.get(id)?.part);
    const allIds = model.parts.map(p => p.id);
    const pairs = mirrorPairs(model, catalog, adjacency);

    if (Array.isArray(model.steps) && model.steps.length) {
        // The author's steps, as written: each part once, in its first step.
        const seen = new Set();
        const steps = [];
        for (const list of model.steps) {
            const parts = (list || []).filter(id => index.has(id) && !seen.has(id));
            for (const id of parts) seen.add(id);
            if (parts.length) steps.push({parts, attach: [], subassembly: null, loose: false});
        }
        // Parts added since (in the editor) follow in derived steps.
        const rest = allIds.filter(id => !seen.has(id));
        if (rest.length) steps.push(...pinsFirst(deriveSteps({ids: rest, adjacency, metaOf: meta, index, built: seen, pairs}), adjacency, meta, []));
        return withMoves({source: 'meta', steps: steps.map(s => ({pins: false, ...s})), groups: []}, insertDirections(model, catalog),
            {adjacency, positions: new Map(model.parts.map(p => [p.id, p.position]))});
    }

    // Sub-assemblies: groups of two or more parts that hold together on their own.
    const groups = (model.groups || [])
        .map(g => ({id: g.id, name: g.name, parts: g.parts.filter(id => index.has(id))}))
        .filter(g => g.parts.length >= 2 && holdsTogether(g.parts, adjacency));
    const subSteps = group => deriveSteps({ids: group.parts, adjacency, metaOf: meta, index, pairs})
        .map(step => ({...step, attach: [], subassembly: group.id, loose: false}));
    const steps = pinsFirst(deriveSteps({ids: allIds, adjacency, metaOf: meta, index, groups, subSteps, pairs}), adjacency, meta, groups);
    return withMoves({source: 'auto', steps, groups}, insertDirections(model, catalog),
        {adjacency, positions: new Map(model.parts.map(p => [p.id, p.position]))});
};

/**
 * What a step shows: the parts already built (drawn normally), the parts new in it
 * (highlighted), and which assembly it is in (a sub-assembly is drawn alone).
 * @param {{steps: object[], groups: object[]}} plan from buildSteps
 * @param {number} n step index (0-based)
 * @returns {{built: string[], fresh: string[], scope: string|null}} scope: the sub-assembly's group id, or null
 */
export const stepView = (plan, n) => {
    const step = plan.steps[n];
    const groupParts = id => plan.groups.find(g => g.id === id)?.parts || [];
    const built = [];
    for (let i = 0; i < n; i++) {
        const s = plan.steps[i];
        if (s.subassembly !== step.subassembly) continue;
        built.push(...s.parts);
        for (const g of s.attach) built.push(...groupParts(g));
    }
    const fresh = [...step.attach.flatMap(groupParts), ...step.parts];
    return {built, fresh, scope: step.subassembly};
};

/**
 * The "parts needed" callout of a step, or the bill of materials of a whole model:
 * one row per part number and colour, with its count.
 * @param {object} model PlacedModel
 * @param {Map|object} catalog
 * @param {string[]} [ids] the parts counted (default: all)
 * @returns {Array<{part: string, color: number, count: number, length: number|null, category: string, name: {en: string, de: string}}>}
 */
export const partsList = (model, catalog, ids = model.parts.map(p => p.id)) => {
    const want = new Set(ids);
    const rows = new Map();
    for (const placed of model.parts) {
        if (!want.has(placed.id)) continue;
        const color = placed.color ?? 16;
        const key = `${placed.part}@${color}`;
        if (!rows.has(key)) {
            const meta = metaOf(catalog, placed.part);
            rows.set(key, {part: placed.part, color, count: 0, length: partLength(meta), category: meta?.category || 'other',
                name: {en: meta?.name || placed.part, de: meta?.nameDe || meta?.name || placed.part}});
        }
        rows.get(key).count++;
    }
    const rank = row => {
        const i = CATEGORY_ORDER.indexOf(row.category);
        return i < 0 ? CATEGORY_ORDER.length : i;
    };
    return [...rows.values()].sort((a, b) => rank(a) - rank(b) || (a.length ?? 0) - (b.length ?? 0) ||
        a.part.localeCompare(b.part) || a.color - b.color);
};
