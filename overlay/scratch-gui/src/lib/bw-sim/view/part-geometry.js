// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Build a three.js BufferGeometry for a single LDraw part.
// Cached per name; geometry is in metres, LDraw → world (x, -y, -z)*0.0004,
// triangulated, with per-group colours so the placed colour can be applied.

import {BufferGeometry, Color, Float32BufferAttribute} from 'three';
import {flattenPart} from '../ldraw/ldraw-geometry.js';

const LDU_M = 0.0004;

const cache = new Map();

/** LDraw colours are sRGB hex; vertex colours must be in three's linear working space. */
const linearRgb = hex => new Color(hex).toArray();

/**
 * @param {string} name  e.g. '32524.dat'
 * @param {(path: string) => string|undefined} read
 * @param {Map<number, {value: string, edge: string, alpha: number}>} colors
 * @returns {BufferGeometry}
 */
export const partGeometry = (name, read, colors) => {
    const key = name.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const flat = flattenPart(name, read);
    if (!flat.polys.length) {
        const g = new BufferGeometry();
        cache.set(key, g);
        return g;
    }
    // Two draw groups: triangles in the part's own colour (LDraw 16) first, then
    // triangles whose colour is fixed by the part (a printed face, a yellow base).
    // The scene gives each group its own material, so a fixed colour is never
    // tinted by the placed colour.
    const out = [0, 1].map(() => ({positions: [], normals: [], colors: [], uses: [], triColor: []}));
    for (let i = 0; i < flat.polys.length; i++) {
        const poly = flat.polys[i];
        const col = flat.polyColours[i];
        const tris = poly.length === 3 ? [[0, 1, 2]] : [[0, 1, 2], [0, 2, 3]];
        const fixed = col !== 16 && colors.has(col);
        const o = out[fixed ? 1 : 0];
        const rgb = fixed ? linearRgb(colors.get(col).value) : [1, 1, 1];
        for (const [a, b, c] of tris) {
            // LDU -> world metres: (x, -y, -z) * 0.0004, a proper rotation, so winding is kept
            const [p0, p1, p2] = [poly[a], poly[b], poly[c]].map(v => [v[0] * LDU_M, -v[1] * LDU_M, -v[2] * LDU_M]);
            const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
            const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const len = Math.hypot(n[0], n[1], n[2]) || 1;
            for (const p of [p0, p1, p2]) {
                o.positions.push(p[0], p[1], p[2]);
                o.normals.push(n[0] / len, n[1] / len, n[2] / len);
                o.colors.push(rgb[0], rgb[1], rgb[2]);
                o.uses.push(fixed ? 0 : 1);
            }
            o.triColor.push(col);
        }
    }
    const cat = k => [...out[0][k], ...out[1][k]];
    const triColor = cat('triColor');
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(cat('positions')), 3));
    geo.setAttribute('normal', new Float32BufferAttribute(new Float32Array(cat('normals')), 3));
    geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(cat('colors')), 3));
    geo.setAttribute('usesPartColour', new Float32BufferAttribute(new Float32Array(cat('uses')), 1));
    const ownVertices = out[0].positions.length / 3;
    const fixedVertices = out[1].positions.length / 3;
    if (ownVertices) geo.addGroup(0, ownVertices, 0);
    if (fixedVertices) geo.addGroup(ownVertices, fixedVertices, 1);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.triColor = triColor;
    cache.set(key, geo);
    return geo;
};

export const _clearCache = () => cache.clear();
