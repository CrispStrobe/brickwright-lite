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
        // aliasOf: the part this file stands for (64290, LDD's number for the 11L beam, is LDraw's alias of 32525).
        return {...r, meta: r.meta ? {...r.meta, part, aliasOf: r.meta.aliasOf || target} : null, desc};
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
        meta.catalogue = true;
        return {meta, decoration: false, why: [], desc};
    }
    let deco = decorationMeta(part, read, desc);
    // A tyre has no pin or axle: it grips its rim. It is a wheel's rubber (kinds/tyre.js welds it to the part it is round).
    if (deco && /^Tyre\b/i.test(desc)) deco = {...deco, category: 'wheel', tyre: true};
    if (deco) {
        const invalid = check.validate(deco, {connectorKinds: check.kinds});
        if (!invalid.length) return {meta: {...deco, catalogue: true}, decoration: true, why, desc};
        why.push(...invalid.map(q => `decoration: ${q}`));
    }
    return {meta: null, decoration: false, why: why.length ? why : ['no geometry'], desc};
};
