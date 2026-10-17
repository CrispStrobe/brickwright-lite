// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Build a three.js BufferGeometry for a single LDraw part.
// Cached per name; geometry is in metres, LDraw → world (x, -y, -z)*0.0004,
// triangulated, with per-group colours so the placed colour can be applied.

import {BufferGeometry, Float32BufferAttribute} from 'three';
import {flattenPart} from '../ldraw/ldraw-geometry.js';

const LDU_M = 0.0004;

const cache = new Map();

const hexToRgb = hex => {
    const n = parseInt(hex.slice(1), 10).toString(16); // not used
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
};

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
    const positions = [];
    const normals = [];
    const colorsArr = [];
    const usesArr = [];
    // For groups, collect by colour code
    // We'll create vertex colours: fixed colours -> actual rgb, 16 -> white + uses=1
    const triColor = [];
    let triCount = 0;
    for (let i = 0; i < flat.polys.length; i++) {
        const poly = flat.polys[i];
        const col = flat.polyColours[i];
        // Triangulate: triangle uses 1 tri, quad uses 2
        const tris = poly.length === 3 ? [[0, 1, 2]] : [[0, 1, 2], [0, 2, 3]];
        for (const [a, b, c] of tris) {
            const v0 = poly[a], v1 = poly[b], v2 = poly[c];
            // LDU -> world metres: (x, -y, -z)*0.0004, preserves winding (det +1)
            const p0 = [v0[0] * LDU_M, -v0[1] * LDU_M, -v0[2] * LDU_M];
            const p1 = [v1[0] * LDU_M, -v1[1] * LDU_M, -v1[2] * LDU_M];
            const p2 = [v2[0] * LDU_M, -v2[1] * LDU_M, -v2[2] * LDU_M];
            // Face normal
            const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
            const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const len = Math.hypot(n[0], n[1], n[2]) || 1;
            const nn = [n[0] / len, n[1] / len, n[2] / len];
            for (const p of [p0, p1, p2]) {
                positions.push(p[0], p[1], p[2]);
                normals.push(nn[0], nn[1], nn[2]);
                // Colour handling
                if (col === 16) {
                    colorsArr.push(1, 1, 1);
                    usesArr.push(1);
                } else {
                    const cinfo = colors.get(col);
                    if (cinfo) {
                        const [r, g, b] = hexToRgb(cinfo.value);
                        colorsArr.push(r, g, b);
                    } else {
                        colorsArr.push(1, 1, 1);
                    }
                    usesArr.push(0);
                }
            }
            triColor.push(col);
            triCount++;
        }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new Float32BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(colorsArr), 3));
    geo.setAttribute('usesPartColour', new Float32BufferAttribute(new Float32Array(usesArr), 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.triColor = triColor;
    cache.set(key, geo);
    return geo;
};

export const _clearCache = () => cache.clear();
