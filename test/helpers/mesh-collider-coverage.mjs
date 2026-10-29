// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independent test-side polygon subtraction. Does not import the derivation or generator.
export const surfaceArea = p => {
    const n = [0, 0, 0];
    for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return Math.hypot(...n) / 2;
};
export const halfspace = (poly, axis, value, sign) => {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ia = sign * (a[axis] - value) >= 0;
        const ib = sign * (b[axis] - value) >= 0;
        if (ia) result.push(a);
        if (ia !== ib) {
            const u = (value - a[axis]) / (b[axis] - a[axis]);
            const point = a.map((x, k) => (1 - u) * x + u * b[k]);
            point[axis] = value;
            result.push(point);
        }
    }
    return result;
};
export const section = (poly, region) => {
    for (const [i, [name, bounds]] of Object.entries(region.ranges).entries()) {
        const [lo, hi] = i === 0 && region.span ? region.span : bounds;
        const axis = 'xyz'.indexOf(name);
        poly = halfspace(halfspace(poly, axis, lo, 1), axis, hi, -1);
    }
    return poly;
};
export const uncovered = (poly, colliders) => {
    let fragments = [poly];
    for (const box of colliders) {
        if (box.shape !== 'box' || box.rotation) throw new Error('coverage reader requires unrotated boxes');
        fragments = fragments.flatMap(fragment => {
            let inside = fragment;
            const outside = [];
            for (let axis = 0; axis < 3; axis++) {
                for (const sign of [1, -1]) {
                    // Numerical predicate allowance, not a construction or collision tolerance.
                    const edge = box.position[axis] - sign * (box.halfExtents[axis] + 1e-9);
                    const piece = halfspace(inside, axis, edge, -sign);
                    if (surfaceArea(piece) > 1e-12) outside.push(piece);
                    inside = halfspace(inside, axis, edge, sign);
                }
            }
            return outside;
        });
    }
    return fragments;
};
