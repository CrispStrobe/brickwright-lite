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
//   - steps hold about STEP_TARGET parts, at most STEP_MAX unless one part
//     brings more fasteners with it;
//   - an editor group (`0 !BW GROUP`) whose parts hold together is a
//     sub-assembly: built in its own steps (drawn alone) right before the step
//     that attaches it to the model.
//
// Every derived step is buildable: each new part touches a part already built,
// directly or through other parts of the same step (test/bw-sim-instructions.test.mjs).
// Parts that do not connect to the rest at all start a step marked `loose`.

import {buildGraph} from '../mech/graph.js';

/** Parts per derived step the walk aims for, and the most it puts in one (unless one part brings more fasteners). */
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
    for (const edge of edges) {
        const a = nodes.get(edge.a.part)?.partId;
        const b = nodes.get(edge.b.part)?.partId;
        if (a === undefined || b === undefined || a === b) continue;
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
    }
    return adjacency;
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
 * @returns {object[]} steps {parts, attach, subassembly: null, loose}
 */
const deriveSteps = ({ids, adjacency, metaOf: meta, index, built = new Set(), groups = [], subSteps = () => []}) => {
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
    for (const id of loosePart) {
        if (unitOf.has(id)) continue;
        if (!fastenerSet.has(id) || everyFastener) {
            addUnit({kind: 'part', parts: [id], fastener: false});
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
        const hub = remaining.find(u => u.parts.some(id => meta(id)?.hub));
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
 * @returns {{source: 'meta'|'auto', steps: Array<{parts: string[], attach: string[], subassembly: string|null, loose: boolean}>,
 *            groups: Array<{id: string, name: string, parts: string[]}>}}
 *          `parts` are the parts new in a step; `attach` names sub-assemblies (groups) joined to the
 *          model in it; a step with `subassembly` builds that group on its own
 */
export const buildSteps = (model, catalog) => {
    const adjacency = partAdjacency(model, catalog);
    const index = new Map(model.parts.map((p, i) => [p.id, i]));
    const partOf = new Map(model.parts.map(p => [p.id, p]));
    const meta = id => metaOf(catalog, partOf.get(id)?.part);
    const allIds = model.parts.map(p => p.id);

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
        if (rest.length) steps.push(...deriveSteps({ids: rest, adjacency, metaOf: meta, index, built: seen}));
        return {source: 'meta', steps, groups: []};
    }

    // Sub-assemblies: groups of two or more parts that hold together on their own.
    const groups = (model.groups || [])
        .map(g => ({id: g.id, name: g.name, parts: g.parts.filter(id => index.has(id))}))
        .filter(g => g.parts.length >= 2 && holdsTogether(g.parts, adjacency));
    const subSteps = group => deriveSteps({ids: group.parts, adjacency, metaOf: meta, index})
        .map(step => ({...step, attach: [], subassembly: group.id, loose: false}));
    const steps = deriveSteps({ids: allIds, adjacency, metaOf: meta, index, groups, subSteps});
    return {source: 'auto', steps, groups};
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
