// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Parts a learner adds from the whole LDraw catalogue (the palette's "+").
//
// A catalogue part becomes a Robot Lab part the way scripts/derive-part-meta.mjs makes
// the shipped derived ones: part-meta/derive.js reads its connection primitives,
// colliders and mass from the LDraw geometry, and selfCheck (the rules the metadata
// test enforces) decides. A part that passes is a normal part: it snaps and joins
// the mechanism. One that does not (nothing to connect to — a figure, a flag, a
// sticker — or a shape the rules cannot read) is still offered, as a DECORATION:
// no connectors, its body as colliders, its mass from its volume. Placed in a
// model it is a free rigid body: it rests on what it is put on and collides, but
// joins nothing.
//
// Added parts are kept on this device (catalog-store.js); a model naming one on another
// device derives it again from the same catalogue (sim-lab.js catalogFor).

import {flattenPart, bounds} from '../ldraw/ldraw-geometry.js';
import {derivePart, selfCheck, deriveColliders, meshVolume, nameOf, nameDeOf, ABS_DENSITY_G_PER_CM3} from './derive.js';

export const DECORATION = 'decoration';
const LDU_CM = 0.04;

/** The triangles of a flattened part (derive.js's {v: [p0, p1, p2]}). */
const trianglesOf = flat => {
    const tris = [];
    for (const poly of flat.polys) for (let i = 1; i + 1 < poly.length; i++) tris.push({v: [poly[0], poly[i], poly[i + 1]]});
    return tris;
};

/**
 * A decoration part: the body as colliders (deriveColliders' envelope, else the bounding box),
 * the mass from the mesh volume (ABS, like a derived part), no connectors.
 */
export const decorationMeta = (part, read, desc) => {
    const flat = flattenPart(part, read);
    const verts = flat.polys.flat();
    if (!verts.length) return null;
    const tris = trianglesOf(flat);
    let colliders = null;
    try {
        colliders = deriveColliders({tris, verts, connectors: [], studs: []}, {system: false}).colliders;
    } catch {
        colliders = null;
    }
    if (!colliders || !colliders.length) {
        const b = bounds([verts]);
        const half = [0, 1, 2].map(k => (b.max[k] - b.min[k]) / 2);
        colliders = [{shape: 'box', halfExtents: half, position: [0, 1, 2].map(k => (b.max[k] + b.min[k]) / 2)}];
    }
    // a sticker or a flag is flat: every box keeps a little thickness for the physics
    colliders = colliders.map(c => (c.shape === 'box' ? {...c, halfExtents: c.halfExtents.map(h => Math.max(0.5, h))} : c));
    const massGrams = Math.max(0.01, Math.round(meshVolume(tris) * LDU_CM ** 3 * ABS_DENSITY_G_PER_CM3 * 100) / 100);
    return {part, name: nameOf(desc), nameDe: nameDeOf(desc), nameDeGenerated: true, category: DECORATION,
        massGrams, connectors: [], colliders, derived: true, decoration: true};
};

/**
 * Turns a catalogue part into Robot Lab metadata. `read` serves the part's LDraw closure
 * (library-relative paths). `check` holds selfCheck's rules: {validate, kinds, minEngage}.
 * @returns {{meta: object|null, decoration: boolean, why: string[], desc: string}}
 *          meta null only when the part cannot be shown at all (not in the library, an alias, no geometry)
 */
/**
 * A part from the whole catalogue is checked a little more leniently than one admitted to parts.json (where
 * a person looks at the coverage report): 96 % of its mesh enclosed, half an LDU more on a gear's tips — an
 * old 16T (4019) is moulded 0.8 LDU short. And what a check finds is repaired where the repair is plain:
 * a hole shallower than the seat rule is that deep (a 2 × 2 round plate's axle hole is drawn 4 LDU, the
 * plate is 8), a pin bore beside another hole is no seat (3648a's four 6 LDU bores, 14 LDU from its axle hole),
 * a gear whose teeth cannot be read (a knob wheel) still holds on its axle. Without this, one check failed
 * made the part decoration: drawn, connected to nothing, and every part it held fell loose.
 */
const LENIENT = {minEnclosed: 0.96, gearSlack: 0.5};
const repair = (meta, why, minEngage) => {
    const drop = new Set();
    for (const w of why) {
        // A shaft with no mesh round it at all (reach 0.00: nothing in its slab) is a profile the part draws, not a
        // shaft to hold (a 6L steering link's axle-shaped middle, 2739a): dropped when the part keeps other connectors.
        const ghost = /^(\S+): the mesh reaches 0\.00 LDU from the (?:pin|axle)'s axis$/.exec(w);
        if (ghost && meta.connectors.length > 1) { drop.add(ghost[1]); continue; }
        const m = /^holes (\S+)\/(\S+) /.exec(w);
        if (!m) continue;
        const [a, b] = [m[1], m[2]].map(id => meta.connectors.find(c => c.id === id));
        const bore = [a, b].find(c => c && c.type === 'pinhole');
        if (bore) drop.add(bore.id);
    }
    return {...meta, connectors: meta.connectors.filter(c => !drop.has(c.id)).map(c =>
        ((c.type === 'pinhole' || c.type === 'axlehole') && c.length < minEngage ? {...c, length: minEngage} : c))};
};

/**
 * The part an alias file stands for: a '~Moved to …' or '=…' file whose whole body is one part placed at the
 * origin unturned (3023.dat is 3023b.dat; 74695.dat is a 2-hole liftarm). Null when it is anything else.
 */
const aliasTarget = text => {
    const refs = text.split(/\r?\n/).filter(l => /^\s*1\s/.test(l));
    if (refs.length !== 1) return null;
    const t = refs[0].trim().split(/\s+/);
    if (t.length < 15) return null;
    const n = t.slice(2, 14).map(Number);
    const identity = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (!n.every((v, i) => Math.abs(v - identity[i]) < 1e-6)) return null;
    const file = t.slice(14).join(' ').replace(/\\/g, '/');
    return /\.dat$/i.test(file) && !file.includes('/') ? file.toLowerCase() : null;
};

/**
 * What derivation cannot read off a compound part's mesh: a CV joint's male end, and the planetary wheel hub whose
 * flange turns in its knuckle (kinds/cv-joint.js). Each entry adds connectors and internal joints to the derived meta,
 * by the derived connectors' ids; a part whose derivation does not give those ids is left as derived. Geometry from
 * the LDraw files: 52731's ball, 52730's socket and 46490c01's driving shaft (u9477, the CV socket 52730s01) are at the part origin,
 * the hub's flange (46434) along -z with its three wheel pins (p0-p2, colliders 0-2). The hub's planetary reduction
 * is not modelled: no source gives its ratio (docs/ROBOT-LAB-REAL-MODELS.md), so the flange turns with the CV 1:1.
 */
const COMPOUND = {
    '52731.dat': {needs: ['x0'], connectors: [{id: 'cv', type: 'cv-ball', position: [0, 0, 0], axis: [1, 0, 0], data: {shaft: [0, 0, 1]}}]},
    // The female end with its own 3L axle (a0 along -z): its socket (52730s01) at the origin.
    '52730.dat': {needs: ['a0'], connectors: [{id: 'cv', type: 'cv-socket', position: [0, 0, 0], axis: [1, 0, 0], data: {shaft: [0, 0, -1]}}]},
    '46490c01.dat': {needs: ['p0', 'p1', 'p2'], colliders: 3,
        connectors: [{id: 'cv', type: 'cv-socket', position: [0, 0, 0], axis: [1, 0, 0], data: {shaft: [0, 0, -1]}}],
        internalJoints: [{id: 'hub', type: 'hinge', point: [0, 0, 0], axis: [0, 0, 1], movingConnectors: ['p0', 'p1', 'p2', 'cv'],
            movingColliders: [0, 1, 2], massFraction: 0.3, actuatedBy: 'none'}]},
    // The older differential (62821, "with One Gear 28 Tooth Bevel"; architecture doc M7: not done before), LOCKED: its
    // bores hold the half axles rigidly, so both wheels turn with the casing (a solid axle; exact going straight, only
    // a corner differs). Open, it needs its casing hinged in the chassis, and in real files it turns on its half axles:
    // the spider meshes then relate the ring to an output shaft instead of the chassis, and the drive locked (42099).
    // Its ring is 28 tootb28 teeth round z at z 26; its pitch radius is where LDraw models put the 20T double bevel
    // that drives it: 40 LDU from its centre (2 studs; the 28 teeth would say 35, and the bevel mesh rule allows 2). The
    // mesh's ratio then follows the radii, 1.6 for the teeth's 1.4 (docs/ROBOT-LAB-REAL-MODELS.md).
    '62821.dat': {needs: ['h0', 'h1'], category: 'gear', gear: {type: 'bevel', teeth: 28, pitchRadiusLdu: 40, axis: [0, 0, 1], center: [0, 0, 26]},
        retype: {h0: 'axlehole', h1: 'axlehole'}, connectors: []}
};
const compound = (part, meta) => {
    const add = COMPOUND[part.toLowerCase()];
    if (!add || !meta || !add.needs.every(id => meta.connectors.some(c => c.id === id)) || (add.colliders && meta.colliders.length < add.colliders)) return meta;
    const retyped = meta.connectors.map(c => (add.retype && add.retype[c.id] ? {...c, type: add.retype[c.id]} : c));
    return {...meta, connectors: [...retyped, ...add.connectors.map(c => structuredClone(c))],
        ...(add.internalJoints ? {internalJoints: add.internalJoints.map(j => structuredClone(j))} : {}),
        ...(add.gear ? {gear: structuredClone(add.gear), category: add.category || meta.category} : {})};
};

/** The y → x, none, y → z turns (quaternions [x, y, z, w]) a cylinder (its axis y) takes to lie along axis k. */
const CYLINDER_ALONG = [[0, 0, -Math.SQRT1_2, Math.SQRT1_2], null, [Math.SQRT1_2, 0, 0, Math.SQRT1_2]];

/**
 * A tyre's box as the round thing it is: a cylinder along the box's odd side (two equal half extents are its
 * radius). As a box, a tyre does not roll: no car from elsewhere drove (the 4x4 Off-Roader's front wheels held its
 * front motor). A box with no odd side, or already turned, stays a box.
 */
export const tyreCylinder = c => {
    if (c.shape !== 'box' || c.rotation) return c;
    const h = c.halfExtents;
    const k = [0, 1, 2].find(i => Math.abs(h[(i + 1) % 3] - h[(i + 2) % 3]) < 1e-6 && Math.abs(h[i] - h[(i + 1) % 3]) > 1e-6);
    if (k === undefined) return c;
    const {halfExtents, ...rest} = c;
    const out = {...rest, shape: 'cylinder', radius: h[(k + 1) % 3], halfHeight: h[k]};
    if (CYLINDER_ALONG[k]) out.rotation = [...CYLINDER_ALONG[k]];
    return out;
};

export const catalogPartMeta = (part, read, check, depth = 0) => {
    const text = read(`parts/${part.toLowerCase()}`);
    if (text === undefined) return {meta: null, decoration: false, why: [`${part}: not in the library`], desc: ''};
    const desc = (text.split(/\r?\n/, 1)[0] || '').replace(/^0\s*/, '').replace(/\s+/g, ' ').trim();
    // '~… (Obsolete)' is a real piece with all its geometry, marked only because a newer one replaced it (minifig hips
    // 3815, the 4.5 V motor 6216m): it derives like any part. Other '~' files are pieces of a part (a cable's segment,
    // a shock absorber's rod) and stay drawings.
    if (/^~|^=|^_/.test(desc) && !/^~.*\(Obsolete\)$/.test(desc)) {
        const target = depth < 3 && /^~Moved to |^=/.test(desc) ? aliasTarget(text) : null;
        if (!target) return {meta: null, decoration: false, why: [`${part}: '${desc}' is an alias or obsolete file`], desc};
        const r = catalogPartMeta(target, read, check, depth + 1);
        return {...r, meta: r.meta ? {...r.meta, part} : null, desc};
    }
    let why;
    let meta = null;
    try {
        const r = derivePart(part, read);
        why = [...r.problems];
        meta = r.meta;
        // A gear whose teeth cannot be read (a knob wheel, a crown): it still sits on its axle, as a connector.
        if (meta && why.length && why.every(w => /without derivable gear data/.test(w))) {
            const {gear, ...rest} = meta;
            meta = {...rest, category: 'connector'};
            why = [];
        }
        if (meta && !why.length) {
            const flat = flattenPart(part, read);
            const lenient = {...check, ...LENIENT};
            why.push(...selfCheck(meta, flat, lenient));
            if (why.length) {
                const fixed = repair(meta, why, check.minEngage || 8);
                const again = selfCheck(fixed, flat, lenient);
                if (!again.length) { meta = fixed; why = []; }
            }
        }
    } catch (error) {
        why = [`the deriver failed: ${error.message}`];
    }
    if (meta && !why.length) {
        meta = compound(part, meta);
        meta.catalogue = true;
        return {meta, decoration: false, why: [], desc};
    }
    let deco = decorationMeta(part, read, desc);
    // A tyre has no pin or axle: it grips its rim. It is a wheel's rubber (kinds/tyre.js welds it to the part it is round).
    if (deco && /^Tyre\b/i.test(desc)) deco = {...deco, category: 'wheel', tyre: true, colliders: deco.colliders.map(tyreCylinder)};
    if (deco) {
        const invalid = check.validate(deco, {connectorKinds: check.kinds});
        if (!invalid.length) return {meta: {...deco, catalogue: true}, decoration: true, why, desc};
        why.push(...invalid.map(q => `decoration: ${q}`));
    }
    return {meta: null, decoration: false, why: why.length ? why : ['no geometry'], desc};
};
