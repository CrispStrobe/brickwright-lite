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
export const catalogPartMeta = (part, read, check) => {
    const text = read(`parts/${part.toLowerCase()}`);
    if (text === undefined) return {meta: null, decoration: false, why: [`${part}: not in the library`], desc: ''};
    const desc = (text.split(/\r?\n/, 1)[0] || '').replace(/^0\s*/, '').replace(/\s+/g, ' ').trim();
    if (/^~|^=|^_/.test(desc)) return {meta: null, decoration: false, why: [`${part}: '${desc}' is an alias or obsolete file`], desc};
    let why;
    let meta = null;
    try {
        const r = derivePart(part, read);
        why = [...r.problems];
        meta = r.meta;
        if (meta && !why.length) why.push(...selfCheck(meta, flattenPart(part, read), check));
    } catch (error) {
        why = [`the deriver failed: ${error.message}`];
    }
    if (meta && !why.length) {
        meta.catalogue = true;
        return {meta, decoration: false, why: [], desc};
    }
    const deco = decorationMeta(part, read, desc);
    if (deco) {
        const invalid = check.validate(deco, {connectorKinds: check.kinds});
        if (!invalid.length) return {meta: {...deco, catalogue: true}, decoration: true, why, desc};
        why.push(...invalid.map(q => `decoration: ${q}`));
    }
    return {meta: null, decoration: false, why: why.length ? why : ['no geometry'], desc};
};
