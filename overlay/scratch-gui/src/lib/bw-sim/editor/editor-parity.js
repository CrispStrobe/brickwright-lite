// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The arithmetic behind the build editor's "grown-up CAD" tools, the ones a
// child meets in BrickLink Studio, LeoCAD or Mecabricks: the LEGO colour
// palette, mirroring, align / distribute, the measuring tape, absolute
// rotations as degrees, and the LDraw text the clipboard carries. Pure: no
// DOM, no three — LDraw poses (LDU, -y up, row-major 3×3), so node --test
// checks it and editor-state.js turns each tool into ONE undoable command.
//
// MIRRORING A LEGO PART. A real part cannot be mirrored: a mirror image of a
// left wing is a right wing, which is another mould with another number, and
// validatePlacedModel refuses an improper rotation (det −1) outright. So a
// mirrored selection is built from proper rotations only, part by part:
//
//   1. the part has a mirror counterpart (`meta.mirror`, or a catalog part whose
//      name is the same with Left↔Right / Side A↔Side B swapped): the
//      counterpart goes in its place, turned R' = M·R·N, where M is the
//      world mirror and N the reflection that maps the part's own shape onto
//      the counterpart's (LDraw convention: across the part's own x, unless
//      `meta.mirror.axis` says otherwise);
//   2. the part is its own mirror image — a beam, an axle, a gear: its
//      connectors and colliders map onto themselves under a reflection S of its
//      own frame — and R' = M·R·S places exactly the mirror image;
//   3. neither (a motor, a sensor: they have one handedness only): the part
//      goes to the mirrored POSITION, turned R' = M·R·M — it faces the
//      mirrored direction, but keeps its own handedness (it is the same part,
//      not a mirrored one). The command reports these as `kept`.
//
// Each of M·R·N, M·R·S and M·R·M has det (−1)·(+1)·(−1) = +1.

import {collidersOf} from './overlap.js';
import {DEFAULT_GRID, IDENTITY, cleanRotation, det3, isProperRotation, mul3, mulVec3, worldAxisRotation} from './transform-math.js';
import {parseModel, serializeModel} from '../model/ldraw-model.js';

/** 1 LDU is 0.4 mm; a stud (and a Technic hole) is 20 LDU = 8 mm. */
export const MM_PER_LDU = 0.4;
export const LDU_PER_STUD = 20;

/**
 * The colours a child reaches for first: LEGO's current core palette, by LDraw
 * code (LDConfig.ldr). Names come from the pane's string tables (German) or
 * LDConfig (English); every other LDConfig colour is listed after these.
 */
export const COMMON_COLORS = Object.freeze([
    15, 0, 71, 72, 4, 320, 25, 191, 14, 226, 27, 2, 288, 10, 322, 321,
    73, 1, 272, 212, 22, 30, 26, 5, 13, 19, 28, 84, 70, 308, 378, 379
]);

/** An LDConfig name as words: `Light_Bluish_Grey` → `Light Bluish Grey`. */
export const colorWords = name => String(name || '').replace(/_/g, ' ');

/**
 * The colour picker's lists: the common palette first (only codes LDConfig
 * has), then every other solid colour, then the see-through ones. Code 16/24
 * (LDraw's "inherit" colours) are not colours a part can be painted with.
 * @param {Map<number, {name: string, value: string, alpha: number}>} colors parsed LDConfig
 * @returns {{common: object[], more: object[]}} `{code, name, value, alpha}` entries
 */
export const colorPalette = colors => {
    const entry = code => {
        const c = colors.get(code);
        return c ? {code, name: colorWords(c.name), value: c.value, alpha: c.alpha ?? 1} : null;
    };
    const common = COMMON_COLORS.map(entry).filter(Boolean);
    const taken = new Set(common.map(c => c.code));
    const rest = [...colors.keys()].filter(code => !taken.has(code) && code !== 16 && code !== 24).map(entry).filter(Boolean);
    const solid = rest.filter(c => c.alpha >= 1).sort((a, b) => a.code - b.code);
    const clear = rest.filter(c => c.alpha < 1).sort((a, b) => a.code - b.code);
    return {common, more: [...solid, ...clear]};
};

// ---- mirroring -----------------------------------------------------------------

const REFLECTIONS = {x: [-1, 1, 1], y: [1, -1, 1], z: [1, 1, -1]};
const asMap = catalog => (catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {})));
const reflect = (d, v) => v.map((x, i) => x * d[i]);
/** A row-major rotation with its rows (left) or columns (right) negated by a diagonal reflection. */
const reflectRows = (d, m) => m.map((v, i) => v * d[Math.floor(i / 3)]);
const reflectCols = (m, d) => m.map((v, i) => v * d[i % 3]);
const close = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const parallel = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 0.999;

const NAME_SWAPS = [['left', 'right'], ['side a', 'side b']];
const swapName = name => {
    let out = String(name || '').toLowerCase();
    let changed = false;
    for (const [a, b] of NAME_SWAPS) {
        const re = new RegExp(`\\b(${a}|${b})\\b`, 'g');
        out = out.replace(re, m => { changed = true; return m === a ? b : a; });
    }
    return changed ? out : null;
};

const counterparts = new WeakMap();
/**
 * A part's mirror counterpart in the catalog: `meta.mirror` (a part number, or
 * `{part, axis}`), else the part whose name is this one's with Left↔Right or
 * Side A↔Side B swapped. Null when the part has none.
 * @returns {{part: string, axis: 'x'|'y'|'z'}|null}
 */
export const mirrorCounterpart = (part, catalog) => {
    const map = asMap(catalog);
    const meta = map.get(part);
    if (!meta) return null;
    if (meta.mirror) {
        const m = typeof meta.mirror === 'string' ? {part: meta.mirror} : meta.mirror;
        if (m.part && map.has(m.part)) return {part: m.part, axis: REFLECTIONS[m.axis] ? m.axis : 'x'};
    }
    // Names → part, once per catalog (the catalog is the same object for a whole session).
    let byName = counterparts.get(catalog);
    if (!byName) {
        byName = new Map();
        for (const [k, v] of map) if (v && v.name) byName.set(v.name.toLowerCase(), k);
        counterparts.set(catalog, byName);
    }
    const swapped = swapName(meta.name);
    const other = swapped && byName.get(swapped);
    return other && other !== part ? {part: other, axis: 'x'} : null;
};

/** The colliders of a part at the identity pose, with their axes (for the symmetry test). */
const localPrims = meta => (meta.colliders && meta.colliders.length ? collidersOf({position: [0, 0, 0], rotation: IDENTITY}, meta) : []);

const primMatches = (a, b, d) => {
    if (a.shape !== b.shape || !close(reflect(d, a.centre), b.centre, 0.5)) return false;
    if (a.shape === 'sphere') return Math.abs(a.radius - b.radius) <= 0.5;
    if (a.shape === 'cylinder') {
        return Math.abs(a.radius - b.radius) <= 0.5 && Math.abs(a.halfHeight - b.halfHeight) <= 0.5 && parallel(reflect(d, a.axis), b.axis);
    }
    // Box: every axis of the reflected box is an axis of the other with the same half extent.
    return a.axes.every((axis, i) => {
        const r = reflect(d, axis);
        return b.axes.some((other, j) => parallel(r, other) && Math.abs(a.halfExtents[i] - b.halfExtents[j]) <= 0.5);
    });
};

/**
 * The reflection of a part's own frame ('x', 'y' or 'z': across that axis'
 * plane through its origin) that maps the part onto itself — its connectors
 * (type, position, axis) and its colliders — or null when none does or the
 * part has no shape data to tell.
 */
export const partSymmetry = meta => {
    if (!meta) return null;
    const connectors = meta.connectors || [];
    const prims = localPrims(meta);
    if (!connectors.length && !prims.length) return null;
    for (const key of ['x', 'y', 'z']) {
        const d = REFLECTIONS[key];
        const connectorsOk = connectors.every(c => connectors.some(o => o.type === c.type &&
            close(reflect(d, c.position), o.position, 0.5) && (!c.axis || !o.axis || parallel(reflect(d, c.axis), o.axis))));
        if (!connectorsOk) continue;
        if (prims.every(p => prims.some(o => primMatches(p, o, d)))) return key;
    }
    return null;
};

/**
 * Where a mirror goes for a selection: the middle of the parts' extent along
 * the mirrored axis (so the mirrored parts stay where they were), rounded to
 * half a hole pitch so a selection on the Technic lattice lands on it again.
 */
export const mirrorPivot = (model, catalog, ids, axis) => {
    const k = axis === 'x' ? 0 : 2;
    const b = selectionBounds(model, catalog, ids);
    if (!b) return 0;
    const half = DEFAULT_GRID;
    const mid = (b.min[k] + b.max[k]) / 2;
    const r = Math.round(mid / half) * half;
    return r === 0 ? 0 : r;
};

const tidy = v => {
    const r = Math.round(v * 1e6) / 1e6;
    return r === 0 ? 0 : r;
};

/**
 * The selection mirrored across the plane x = pivot (axis 'x') or z = pivot
 * (axis 'z'), as new poses — always proper rotations (see the header).
 * @param {{id: string, part: string, position: number[], rotation: number[]}[]} parts
 * @param {Map|object} catalog
 * @param {'x'|'z'} axis
 * @param {number} pivot LDU, on that axis
 * @returns {{id: string, part: string, position: number[], rotation: number[], how: 'swapped'|'mirrored'|'kept'}[]}
 */
export const mirrorPoses = (parts, catalog, axis, pivot = 0) => {
    if (axis !== 'x' && axis !== 'z') throw new Error(`mirror: bad axis '${axis}'`);
    const map = asMap(catalog);
    const M = REFLECTIONS[axis];
    const k = axis === 'x' ? 0 : 2;
    return parts.map(p => {
        const position = p.position.map((v, i) => tidy(i === k ? 2 * pivot - v : v));
        const mr = reflectRows(M, p.rotation);
        const pair = mirrorCounterpart(p.part, map);
        let part = p.part;
        let how;
        let rotation;
        if (pair) {
            part = pair.part;
            rotation = reflectCols(mr, REFLECTIONS[pair.axis]);
            how = 'swapped';
        } else {
            const s = partSymmetry(map.get(p.part));
            rotation = reflectCols(mr, s ? REFLECTIONS[s] : M);
            how = s ? 'mirrored' : 'kept';
        }
        rotation = cleanRotation(rotation);
        if (!isProperRotation(rotation, 1e-6)) throw new Error(`mirror: ${p.id} would get an improper rotation (det ${det3(rotation)})`);
        return {id: p.id, part, position, rotation, how};
    });
};

// ---- bounds, align, distribute ---------------------------------------------------

const extentAlong = (prim, k) => {
    if (prim.shape === 'sphere') return prim.radius;
    if (prim.shape === 'cylinder') {
        const a = Math.abs(prim.axis[k]);
        return a * prim.halfHeight + prim.radius * Math.sqrt(Math.max(0, 1 - a * a));
    }
    return prim.axes.reduce((sum, axis, i) => sum + Math.abs(axis[k]) * prim.halfExtents[i], 0);
};

/**
 * A placed part's axis-aligned box in the model (LDU): its colliders' extent,
 * else its connectors', else its origin.
 * @returns {{min: number[], max: number[]}}
 */
export const partBounds = (placed, meta) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const prims = meta && meta.colliders && meta.colliders.length ? collidersOf(placed, meta) : [];
    for (const prim of prims) {
        for (let k = 0; k < 3; k++) {
            const e = extentAlong(prim, k);
            min[k] = Math.min(min[k], prim.centre[k] - e);
            max[k] = Math.max(max[k], prim.centre[k] + e);
        }
    }
    if (!prims.length) {
        const points = meta && meta.connectors && meta.connectors.length ?
            meta.connectors.map(c => mulVec3(placed.rotation, c.position).map((v, i) => v + placed.position[i])) : [placed.position];
        for (const p of points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    }
    return {min: min.map(tidy), max: max.map(tidy)};
};

const unionBounds = boxes => ({
    min: [0, 1, 2].map(k => Math.min(...boxes.map(b => b.min[k]))),
    max: [0, 1, 2].map(k => Math.max(...boxes.map(b => b.max[k])))
});

/** The box around some parts of a model, or null when none of the ids is there. */
export const selectionBounds = (model, catalog, ids) => {
    const map = asMap(catalog);
    const want = new Set(ids);
    const boxes = model.parts.filter(p => want.has(p.id)).map(p => partBounds(p, map.get(p.part)));
    return boxes.length ? unionBounds(boxes) : null;
};

/**
 * The selection split into the things that move as one: a group (all of its
 * selected members) or a lone part. Aligning moves units, so a grouped
 * assembly keeps its shape.
 * @returns {{ids: string[], bounds: {min: number[], max: number[]}}[]}
 */
export const selectionUnits = (model, catalog, ids) => {
    const map = asMap(catalog);
    const want = new Set(ids);
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const seen = new Set();
    const units = [];
    for (const id of ids) {
        if (seen.has(id) || !byId.has(id)) continue;
        const g = (model.groups || []).find(x => x.parts.includes(id));
        const members = g ? g.parts.filter(m => want.has(m) && byId.has(m)) : [id];
        for (const m of members) seen.add(m);
        units.push({ids: members, bounds: unionBounds(members.map(m => partBounds(byId.get(m), map.get(byId.get(m).part))))});
    }
    return units;
};

const AXES = {x: 0, y: 1, z: 2};
const axisIndex = axis => {
    const k = typeof axis === 'number' ? axis : AXES[axis];
    if (![0, 1, 2].includes(k)) throw new Error(`bad axis '${axis}'`);
    return k;
};

const unitMoves = (model, units, deltas) => {
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const moves = [];
    units.forEach((u, n) => {
        const d = deltas[n];
        if (!d.some(v => Math.abs(v) > 1e-9)) return;
        for (const id of u.ids) {
            const p = byId.get(id);
            moves.push({id, position: p.position.map((v, i) => tidy(v + d[i])), rotation: p.rotation.slice()});
        }
    });
    return moves;
};

/**
 * Lines the selection's units up on one model axis (LDU, -y up): their
 * minimum edges on the selection's minimum ('min'), their centres on the
 * selection's centre ('centre'), or their maximum edges on its maximum ('max').
 * @returns {{id: string, position: number[], rotation: number[]}[]} moves of the parts that change
 */
export const alignMoves = ({model, catalog, ids, axis, mode}) => {
    const k = axisIndex(axis);
    if (!['min', 'centre', 'max'].includes(mode)) throw new Error(`align: bad mode '${mode}'`);
    const units = selectionUnits(model, catalog, ids);
    if (units.length < 2) return [];
    const all = unionBounds(units.map(u => u.bounds));
    const target = mode === 'min' ? all.min[k] : mode === 'max' ? all.max[k] : (all.min[k] + all.max[k]) / 2;
    const deltas = units.map(u => {
        const at = mode === 'min' ? u.bounds.min[k] : mode === 'max' ? u.bounds.max[k] : (u.bounds.min[k] + u.bounds.max[k]) / 2;
        const d = [0, 0, 0];
        d[k] = target - at;
        return d;
    });
    return unitMoves(model, units, deltas);
};

/**
 * Spaces the selection's units evenly along one axis: the outermost two stay,
 * the centres of the others are spread equally between theirs (three or more units).
 */
export const distributeMoves = ({model, catalog, ids, axis}) => {
    const k = axisIndex(axis);
    const units = selectionUnits(model, catalog, ids);
    if (units.length < 3) return [];
    const centre = u => (u.bounds.min[k] + u.bounds.max[k]) / 2;
    const order = units.map((u, i) => i).sort((a, b) => centre(units[a]) - centre(units[b]));
    const first = centre(units[order[0]]);
    const step = (centre(units[order[order.length - 1]]) - first) / (order.length - 1);
    const deltas = units.map(() => [0, 0, 0]);
    order.forEach((ui, rank) => { deltas[ui][k] = first + rank * step - centre(units[ui]); });
    return unitMoves(model, units, deltas);
};

/**
 * Puts each unit on the floor grid: its first part's origin moved to the
 * nearest grid point in x and z (the height is left alone: LEGO heights are
 * plates and bricks, not grid steps).
 */
export const gridMoves = ({model, catalog, ids, grid = DEFAULT_GRID}) => {
    if (!(grid > 0)) throw new Error('grid: bad step');
    const units = selectionUnits(model, catalog, ids);
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const deltas = units.map(u => {
        const ref = byId.get(u.ids[0]).position;
        return [ref[0], 0, ref[2]].map((v, i) => (i === 1 ? 0 : Math.round(v / grid) * grid - v));
    });
    return unitMoves(model, units, deltas);
};

// ---- measuring ---------------------------------------------------------------------

/**
 * The distance between two points of the model (LDU): in LDU, studs (= Technic
 * holes, 20 LDU) and millimetres (0.4 mm per LDU), with the per-axis difference.
 */
export const measureBetween = (a, b) => {
    const delta = [0, 1, 2].map(i => tidy(b[i] - a[i]));
    const ldu = tidy(Math.hypot(...delta));
    return {delta, ldu, studs: tidy(ldu / LDU_PER_STUD), mm: tidy(ldu * MM_PER_LDU)};
};

/**
 * The point a measurement takes on a part: the nearest connector (hole, pin,
 * axle end) within `radius` LDU of the picked point, else the point itself.
 * @returns {{point: number[], connector: string|null}}
 */
export const measurePoint = (placed, meta, picked, radius = 12) => {
    let best = null;
    for (const c of (meta && meta.connectors) || []) {
        const w = mulVec3(placed.rotation, c.position).map((v, i) => v + placed.position[i]);
        const d = Math.hypot(w[0] - picked[0], w[1] - picked[1], w[2] - picked[2]);
        if (d <= radius && (!best || d < best.d)) best = {d, point: w.map(tidy), connector: c.id};
    }
    return best ? {point: best.point, connector: best.connector} : {point: picked.map(v => Math.round(v * 10) / 10), connector: null};
};

// ---- rotations as degrees --------------------------------------------------------------

const F = [1, -1, -1];
const toWorld = r => r.map((v, i) => v * F[Math.floor(i / 3)] * F[i % 3]);
const deg = r => tidy(Math.round(r * 180 / Math.PI * 1e4) / 1e4);

/**
 * A part's rotation as the three angles a person types (degrees, about the
 * WORLD axes as the view shows them, +y up): the turn is X first, then Y, then Z.
 * @param {number[]} rotation LDraw rotation
 * @returns {number[]} [x, y, z] degrees
 */
export const rotationToDegrees = rotation => {
    const w = toWorld(rotation);
    if (Math.abs(w[6]) < 1 - 1e-9) {
        return [deg(Math.atan2(w[7], w[8])), deg(Math.asin(-w[6])), deg(Math.atan2(w[3], w[0]))];
    }
    // Gimbal lock (Y = ±90°): Z is folded into X.
    return w[6] < 0 ? [deg(Math.atan2(w[1], w[2])), 90, 0] : [deg(Math.atan2(-w[1], -w[2])), -90, 0];
};

/** The LDraw rotation for angles typed in degrees (rotationToDegrees' inverse). */
export const degreesToRotation = ([x, y, z]) => {
    const rad = v => (Number(v) || 0) * Math.PI / 180;
    return cleanRotation(mul3(mul3(worldAxisRotation('z', rad(z)), worldAxisRotation('y', rad(y))), worldAxisRotation('x', rad(x))));
};

// ---- the clipboard as LDraw text ---------------------------------------------------------

/**
 * Some parts of a model as LDraw text: plain type-1 lines BrickLink Studio and
 * LeoCAD paste, with Brickwright's `0 !BW` meta lines (ids, ports, the groups
 * wholly inside the selection) that other programs ignore as comments.
 */
export const clipboardText = (model, ids) => {
    const want = new Set(ids);
    const parts = model.parts.filter(p => want.has(p.id));
    const groups = (model.groups || []).filter(g => g.parts.every(m => want.has(m)));
    return serializeModel({version: 1, parts, ...(groups.length ? {groups} : {})}, {name: 'clipboard.ldr', title: 'Brickwright parts'});
};

/**
 * The parts in LDraw text from a clipboard (ours, Studio's, LeoCAD's): the
 * type-1 lines whose part is in the catalog, with colour and port; `refused`
 * counts the lines that could not be used. Null for text with no part at all.
 */
export const partsFromClipboard = (text, catalog) => {
    if (typeof text !== 'string' || !/^\s*1\s/m.test(text)) return null;
    let parsed;
    try {
        parsed = parseModel(text, {catalog});
    } catch {
        return null;
    }
    const parts = parsed.model.parts.filter(p => isProperRotation(p.rotation, 1e-3));
    return {parts, refused: parsed.refusals.length + parsed.model.parts.length - parts.length};
};
