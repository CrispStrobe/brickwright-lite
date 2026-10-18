// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A part's CANONICAL FRAME, measured from its geometry — never from its name.
// Pure and headless (node --test runs it; scripts/derive-canonical-frames.mjs
// precomputes it for the whole catalogue). Inputs are a part's PartMeta
// (connectors, colliders: contracts.js) and, for the mesh-based questions, its
// flattened LDraw polygons (ldraw/ldraw-geometry.js flattenPart). LDraw frame
// and units throughout (LDU, -y up, row-major 3×3, p' = m·p + t).
//
// WHAT IS MEASURED
//   meshStats      surface area, the area-weighted surface centroid and the
//                  surface's second moments (covariance) — exact integrals over
//                  the triangles, so a part drawn with another triangulation (a
//                  print cut into its surface, a mirrored sub-file) measures the
//                  same.
//   frameAxes      the principal axes of that covariance, snapped to the LDraw
//                  axes when within 1° (every LEGO part in the library is drawn
//                  axis-aligned); a degenerate pair (a gear's plane) is resolved
//                  by the LDraw axes / connector axes lying in it.
//   lattice        the connectors' line directions (with counts) and the pitch
//                  of their positions along each LDraw axis, overall and per
//                  connector type (20 LDU for a Technic hole row or a stud
//                  grid, 10 for a brick's studs and tubes together…).
//   symmetryGroup  every orthogonal map g (p ↦ L·p + t, L = E·P·Eᵀ for each of
//                  the 48 signed permutations P of the frame E, t fixing the
//                  connectors' centroid — the surface centroid for a part
//                  without connectors) that maps the part onto itself: connectors onto
//                  connectors exactly (type, position ±0.5 LDU, axis — directed
//                  for studs, anti-studs and tubes, a blind hole's bottom kept)
//                  and the mesh onto the mesh: at most AREA_TOL (1 %) of the
//                  surface farther than MESH_TOL (0.1 mm) from the mapped
//                  surface — a moulded numeral or a print is not a different
//                  shape. Plus the largest
//                  n ≤ 96 for which a turn of 360°/n about a frame axis is a
//                  symmetry (a gear's teeth), reported separately.
//   matchParts     the same test between two parts: B = g(A) for a proper g is a
//                  DUPLICATE (an LDraw alias, a colour-variant print), for an
//                  improper g only (A chiral) a MIRROR PAIR (a left/right
//                  wedge plate). A duplicate is judged exactly: every vertex and
//                  triangle centroid of each within MESH_TOL of the other.
//   placementRotation  the palette's default pose, from connectors and
//                  colliders only (cheap enough for the editor to call):
//                  studs up; else a Technic part's long axis along world x
//                  and its hole axis horizontal (world z) — a beam lies along
//                  x, holes facing the viewer; a shaft lies along x; a round
//                  part (gear, wheel) stands on its axle along z. Devices keep
//                  LDraw's frame (their labels are drawn upright in it).

// ---- small linear algebra ---------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => scale(a, 1 / (len(a) || 1));

/** Row-major 3×3 times vector. */
export const mulVec = (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
];
/** Row-major 3×3 product a·b. */
export const mul = (a, b) => {
    const out = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        out[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c];
    }
    return out;
};
export const transpose = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
export const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
/** A matrix whose columns are the given vectors. */
const fromColumns = (a, b, c) => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
const columnOf = (m, i) => [m[i], m[3 + i], m[6 + i]];
/** Entries within 1e-9 of an integer become that integer (and -0 becomes 0). */
const clean = m => m.map(v => {
    const r = Math.round(v);
    return Math.abs(v - r) < 1e-9 ? r + 0 : v;
});
/** Rotation about a unit axis by `angle` (radians), row-major (Rodrigues). */
export const axisAngle = (axis, angle) => {
    const [x, y, z] = unit(axis);
    const c = Math.cos(angle); const s = Math.sin(angle); const k = 1 - c;
    return [
        c + x * x * k, x * y * k - z * s, x * z * k + y * s,
        y * x * k + z * s, c + y * y * k, y * z * k - x * s,
        z * x * k - y * s, z * y * k + x * s, c + z * z * k
    ];
};

/** The 48 signed permutation matrices (the cube's symmetries), proper ones first. */
export const SIGNED_PERMUTATIONS = (() => {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const out = [];
    for (const p of perms) {
        for (let s = 0; s < 8; s++) {
            const m = new Array(9).fill(0);
            for (let r = 0; r < 3; r++) m[3 * r + p[r]] = (s >> r) & 1 ? -1 : 1;
            out.push(Object.freeze(m));
        }
    }
    return Object.freeze(out.sort((a, b) => det(b) - det(a)));
})();

/** Symmetric 3×3 eigen-decomposition (cyclic Jacobi). Values descending; vectors as columns of `vectors`. */
export const eigenSym3 = cov => {
    const a = cov.slice();
    let v = IDENTITY.slice();
    for (let sweep = 0; sweep < 50; sweep++) {
        const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5];
        if (off < 1e-30) break;
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            const apq = a[3 * p + q];
            if (Math.abs(apq) < 1e-300) continue;
            const theta = (a[3 * q + q] - a[3 * p + p]) / (2 * apq);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1); const s = t * c;
            const J = IDENTITY.slice();
            J[3 * p + p] = c; J[3 * q + q] = c; J[3 * p + q] = s; J[3 * q + p] = -s;
            const na = mul(mul(transpose(J), a), J);
            for (let i = 0; i < 9; i++) a[i] = na[i];
            v = mul(v, J);
        }
    }
    const order = [0, 1, 2].sort((i, j) => a[4 * j] - a[4 * i]);
    return {values: order.map(i => a[4 * i]), vectors: fromColumns(...order.map(i => columnOf(v, i)))};
};

// ---- the mesh -----------------------------------------------------------------------

/**
 * Exact surface integrals of a flattened part: area, area-weighted centroid,
 * covariance about it, and the samples/triangles the mesh tests use.
 * @param {number[][][]} polys flattenPart(...).polys
 */
export const meshStats = polys => {
    const tris = [];
    let area = 0;
    const m1 = [0, 0, 0];
    const m2 = new Array(9).fill(0);
    for (const p of polys) {
        for (let i = 1; i + 1 < p.length; i++) {
            const a = p[0]; const b = p[i]; const c = p[i + 1];
            const A = len(cross(sub(b, a), sub(c, a))) / 2;
            if (!(A > 1e-12)) continue;
            tris.push([a, b, c]);
            area += A;
            const s = add(add(a, b), c);
            for (let k = 0; k < 3; k++) m1[k] += A * s[k] / 3;
            // ∫ x xᵀ dA over a triangle = A/12 · (aaᵀ + bbᵀ + ccᵀ + s sᵀ)
            for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
                m2[3 * r + q] += A / 12 * (a[r] * a[q] + b[r] * b[q] + c[r] * c[q] + s[r] * s[q]);
            }
        }
    }
    const centroid = area ? scale(m1, 1 / area) : [0, 0, 0];
    const cov = m2.map((v, i) => (area ? v / area : 0) - centroid[Math.floor(i / 3)] * centroid[i % 3]);
    // Samples: distinct vertices (to 1e-3) and every triangle's centroid (the exact test);
    // and four area-weighted points per triangle — its centroid and the midpoints between
    // it and each corner, A/4 each — for the area-tolerant test.
    const seen = new Set();
    const samples = [];
    const points = [];
    const weights = [];
    for (const t of tris) {
        for (const v of t) {
            const key = v.map(x => Math.round(x * 1000)).join(',');
            if (!seen.has(key)) { seen.add(key); samples.push(v); }
        }
        const c = scale(add(add(t[0], t[1]), t[2]), 1 / 3);
        samples.push(c);
        const A = len(cross(sub(t[1], t[0]), sub(t[2], t[0]))) / 8;
        points.push(c, scale(add(c, t[0]), 0.5), scale(add(c, t[1]), 0.5), scale(add(c, t[2]), 0.5));
        weights.push(A, A, A, A);
    }
    return {area, centroid, cov, tris, samples, weighted: {points, weights}};
};

/** Squared distance from point p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
const pointTriangleDist2 = (p, a, b, c) => {
    const ab = sub(b, a); const ac = sub(c, a); const ap = sub(p, a);
    const d1 = dot(ab, ap); const d2 = dot(ac, ap);
    let q;
    if (d1 <= 0 && d2 <= 0) q = a;
    else {
        const bp = sub(p, b); const d3 = dot(ab, bp); const d4 = dot(ac, bp);
        const cp = sub(p, c); const d5 = dot(ab, cp); const d6 = dot(ac, cp);
        const vc = d1 * d4 - d3 * d2; const vb = d5 * d2 - d1 * d6; const va = d3 * d6 - d5 * d4;
        if (d3 >= 0 && d4 <= d3) q = b;
        else if (vc <= 0 && d1 >= 0 && d3 <= 0) q = add(a, scale(ab, d1 / (d1 - d3)));
        else if (d6 >= 0 && d5 <= d6) q = c;
        else if (vb <= 0 && d2 >= 0 && d6 <= 0) q = add(a, scale(ac, d2 / (d2 - d6)));
        else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) q = add(b, scale(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
        else {
            const den = 1 / (va + vb + vc);
            q = add(a, add(scale(ab, vb * den), scale(ac, vc * den)));
        }
    }
    const d = sub(p, q);
    return dot(d, d);
};

/** How close (LDU) a mapped sample must lie to the other surface: 0.1 mm. */
export const MESH_TOL = 0.25;
const CELL = 4;

/** A uniform grid over a mesh's triangles for "is p within tol of the surface" queries. */
export const surfaceIndex = (tris, tol = MESH_TOL) => {
    const grid = new Map();
    for (const t of tris) {
        const lo = [0, 1, 2].map(k => Math.floor((Math.min(t[0][k], t[1][k], t[2][k]) - tol) / CELL));
        const hi = [0, 1, 2].map(k => Math.floor((Math.max(t[0][k], t[1][k], t[2][k]) + tol) / CELL));
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
            const key = `${x},${y},${z}`;
            let list = grid.get(key);
            if (!list) grid.set(key, list = []);
            list.push(t);
        }
    }
    const tol2 = tol * tol;
    return {
        near: p => {
            const list = grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)},${Math.floor(p[2] / CELL)}`);
            if (!list) return false;
            for (const t of list) if (pointTriangleDist2(p, t[0], t[1], t[2]) <= tol2) return true;
            return false;
        }
    };
};

/**
 * Whether g(samples) all lie on the indexed surface. `allowMiss` samples may miss
 * (0 by default: the test is exact to MESH_TOL). Stops at the first excess miss.
 * @returns {{ok: boolean, missed: number, checked: number}}
 */
export const samplesOnSurface = (samples, g, index, allowMiss = 0) => {
    let missed = 0;
    let i = 0;
    for (; i < samples.length; i++) {
        if (!index.near(add(mulVec(g.m, samples[i]), g.t)) && ++missed > allowMiss) return {ok: false, missed, checked: i + 1};
    }
    return {ok: true, missed, checked: i};
};

/**
 * The share of the surface (by area) that g does NOT map onto the indexed surface,
 * stopping early once it exceeds `maxFraction` (then the returned share is a lower bound).
 * @returns {{ok: boolean, missed: number}} missed: a fraction of the area
 */
export const areaOffSurface = (stats, g, index, maxFraction) => {
    const {points, weights} = stats.weighted;
    const limit = maxFraction * stats.area;
    let missed = 0;
    // Visit the points in a strided order, so a wrong map meets its misses early wherever they are.
    const n = points.length;
    const stride = [7919, 7907, 7901].find(q => n % q !== 0);
    for (let k = 0, i = 0; k < n; k++, i = (i + stride) % n) {
        if (index.near(add(mulVec(g.m, points[i]), g.t))) continue;
        missed += weights[i];
        if (missed > limit) return {ok: false, missed: missed / stats.area};
    }
    return {ok: true, missed: missed / (stats.area || 1)};
};

// ---- connectors ---------------------------------------------------------------------

/** Connector types whose axis has a sense (a stud points out of its part). */
export const DIRECTED = new Set(['stud', 'antistud', 'tube']);
const POS_TOL = 0.5;
const COS_1 = Math.cos(Math.PI / 180);

const bottomOf = c => (c.closedEnd ? scale(unit(c.axis), c.closedEnd) : null);

/** Does g map connector c onto connector o? */
const connectorMaps = (c, o, g) => {
    if (c.type !== o.type) return false;
    if (len(sub(add(mulVec(g.m, c.position), g.t), o.position)) > POS_TOL) return false;
    if ((c.length ?? 0) !== (o.length ?? 0) && Math.abs((c.length ?? 0) - (o.length ?? 0)) > POS_TOL) return false;
    if (c.axis && o.axis && c.type !== 'ball' && c.type !== 'ballsocket') {
        const d = dot(unit(mulVec(g.m, c.axis)), unit(o.axis));
        if (DIRECTED.has(c.type) ? d < COS_1 : Math.abs(d) < COS_1) return false;
    }
    const cb = bottomOf(c); const ob = bottomOf(o);
    if (Boolean(cb) !== Boolean(ob)) return false;
    if (cb && dot(mulVec(g.m, cb), ob) < COS_1) return false;
    return true;
};

/**
 * g maps the connector list `a` one-to-one onto `b` — a perfect bipartite matching
 * (Kuhn's augmenting paths: two connectors closer than the tolerance must not
 * steal each other's partner, as a greedy pass would).
 */
export const connectorsMap = (a, b, g) => Boolean(connectorMatching(a, b, g));

/** The one-to-one matching behind connectorsMap: partner[i] is b's index for a[i], or null. */
export const connectorMatching = (a, b, g) => {
    if (a.length !== b.length) return null;
    const options = a.map(c => {
        const list = [];
        for (let j = 0; j < b.length; j++) if (connectorMaps(c, b[j], g)) list.push(j);
        return list;
    });
    if (options.some(o => !o.length)) return null;
    const owner = new Int32Array(b.length).fill(-1);
    const augment = (i, seen) => {
        for (const j of options[i]) {
            if (seen[j]) continue;
            seen[j] = 1;
            if (owner[j] < 0 || augment(owner[j], seen)) { owner[j] = i; return true; }
        }
        return false;
    };
    for (let i = 0; i < a.length; i++) if (!augment(i, new Uint8Array(b.length))) return null;
    const partner = new Array(a.length);
    owner.forEach((i, j) => { partner[i] = j; });
    return partner;
};

/**
 * The orthogonal map (det = `sign`) that best takes points `src` onto `dst` in least squares
 * (Kabsch / orthogonal Procrustes, via the eigen-decomposition of HᵀH). Null when the points
 * do not pin it down (fewer than three independent directions after centring).
 */
export const orthoFit = (src, dst, sign) => {
    const n = src.length;
    const cs = scale(src.reduce(add, [0, 0, 0]), 1 / n);
    const cd = scale(dst.reduce(add, [0, 0, 0]), 1 / n);
    const H = new Array(9).fill(0); // Σ (d − cd)(s − cs)ᵀ
    for (let i = 0; i < n; i++) {
        const a = sub(src[i], cs); const b = sub(dst[i], cd);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) H[3 * r + c] += b[r] * a[c];
    }
    const {values, vectors: V} = eigenSym3(mul(transpose(H), H));
    if (!(values[1] > 1e-9 * Math.max(values[0], 1e-12))) return null;
    const v = [0, 1, 2].map(i => columnOf(V, i));
    const u0 = unit(mulVec(H, v[0])); const u1 = unit(mulVec(H, v[1]));
    // The third direction from the other two, with the sense that gives det = sign.
    const vz = cross(v[0], v[1]);
    const uz = scale(cross(u0, u1), sign * Math.sign(dot(vz, v[2]) || 1) * Math.sign(det(fromColumns(...v)) || 1));
    const U = fromColumns(u0, u1, uz);
    const m = mul(U, transpose(fromColumns(v[0], v[1], vz)));
    return {m: clean(m), t: sub(cd, mulVec(clean(m), cs))};
};

/**
 * A map found in a numerically measured (unaligned) frame, re-fitted exactly to the
 * connector pairs it matched: positions and positions + 10·axis (axis sense taken from
 * the partner), so a bent liftarm's 53° mirror plane comes out as 0.6 / 0.8, not 0.59996.
 */
const refine = (g, a, b) => {
    if (SIGNED_PERMUTATIONS.some(q => q.every((v, i) => v === g.m[i]))) return g;
    const partner = connectorMatching(a, b, g);
    if (!partner || a.length < 2) return g;
    const src = []; const dst = [];
    a.forEach((c, i) => {
        const o = b[partner[i]];
        src.push(c.position); dst.push(o.position);
        if (c.axis && o.axis) {
            const s = Math.sign(dot(mulVec(g.m, c.axis), o.axis)) || 1;
            src.push(add(c.position, scale(unit(c.axis), 10))); dst.push(add(o.position, scale(unit(o.axis), 10 * s)));
        }
    });
    const f = orthoFit(src, dst, Math.sign(det(g.m)));
    if (!f) return g;
    const err = Math.max(...src.map((p, i) => len(sub(add(mulVec(f.m, p), f.t), dst[i]))));
    return err < 1e-6 && connectorsMap(a, b, f) ? f : g;
};

const typeCounts = connectors => {
    const out = {};
    for (const c of connectors) out[c.type] = (out[c.type] || 0) + 1;
    return out;
};

// ---- the frame ------------------------------------------------------------------------

const LDRAW_AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** A direction with its first non-zero component positive, coordinate axes made exact. */
const canonicalDir = v => {
    let u = unit(v).map(x => (Math.abs(x) < 1e-9 ? 0 : x));
    const k = [0, 1, 2].find(i => Math.abs(u[i]) > 1e-6);
    if (u[k] < 0) u = scale(u, -1);
    for (const a of LDRAW_AXES) if (dot(u, a) >= COS_1) return a.slice();
    return u;
};

/**
 * The principal axes (columns of a proper rotation E), largest variance first,
 * snapped to LDraw axes within 1°; `aligned` when all three are LDraw axes.
 * Eigenvalues within 0.1 % are one degenerate subspace: there the LDraw
 * axes (or connector axes) inside it are taken, as any basis of it is principal.
 */
export const frameAxes = (cov, connectors = []) => {
    const {values, vectors} = eigenSym3(cov);
    const ev = [0, 1, 2].map(i => columnOf(vectors, i));
    const scaleRef = Math.max(Math.abs(values[0]), 1e-12);
    const groups = [];
    for (let i = 0; i < 3; i++) {
        const g = groups.find(q => Math.abs(values[q[0]] - values[i]) <= 1e-3 * scaleRef);
        if (g) g.push(i); else groups.push([i]);
    }
    const axes = new Array(3);
    const prefer = [...LDRAW_AXES, ...connectors.filter(c => c.axis).map(c => canonicalDir(c.axis))];
    for (const g of groups) {
        if (g.length === 1) { axes[g[0]] = canonicalDir(ev[g[0]]); continue; }
        // A basis of the degenerate subspace from preferred directions lying in it.
        const span = g.map(i => ev[i]);
        const inSpan = v => len(span.reduce((acc, e) => add(acc, scale(e, dot(v, e))), [0, 0, 0])) >= 1 - 1e-6;
        const picked = [];
        for (const d of prefer) {
            if (picked.length === g.length) break;
            if (inSpan(d) && picked.every(p => Math.abs(dot(p, d)) < 1e-6)) picked.push(d);
        }
        // Complete the basis from the subspace's eigenvectors, orthogonal to what was picked (Gram–Schmidt).
        for (const e of span) {
            if (picked.length === g.length) break;
            const r = picked.reduce((acc, p) => sub(acc, scale(p, dot(acc, p))), e);
            if (len(r) > 1e-6) picked.push(canonicalDir(r));
        }
        g.forEach((i, k) => { axes[i] = picked[k]; });
    }
    // Snapping one axis to LDraw within 1° leaves the others up to 1° off orthogonal:
    // keep the LDraw-snapped axes and re-orthogonalise the rest against them.
    const isLDraw = a => LDRAW_AXES.some(l => Math.abs(dot(a, l)) === 1);
    const fixed = [];
    for (const i of [0, 1, 2].sort((p, q) => Number(isLDraw(axes[q])) - Number(isLDraw(axes[p])))) {
        const r = fixed.reduce((acc, f) => sub(acc, scale(f, dot(acc, f))), axes[i]);
        axes[i] = isLDraw(axes[i]) && fixed.every(f => Math.abs(dot(f, axes[i])) < 1e-12) ? axes[i] : canonicalDir(r);
        fixed.push(axes[i]);
    }
    if (det(fromColumns(...axes)) < 0) axes[2] = scale(axes[2], -1);
    const aligned = axes.every(a => LDRAW_AXES.some(l => Math.abs(dot(a, l)) >= 1 - 1e-12));
    return {E: clean(fromColumns(...axes)), moments: values, aligned, degenerate: groups.filter(g => g.length > 1)};
};

/**
 * The connector lattice: the connectors' line directions (most used first, with the
 * connector types on each) and the pitch of their positions along each LDraw axis —
 * the smallest gap > 1 LDU between distinct coordinates (20 for a hole row or a stud
 * grid, 10 for half-offset holes, 8 for a plate's height), null when all connectors
 * share that coordinate. LDraw axes, not principal ones: every part in the library is
 * drawn on LDraw's lattice even where its mass is not (a wedge plate, a slope).
 */
export const latticeOf = connectors => {
    const dirs = [];
    for (const c of connectors) {
        if (!c.axis) continue;
        const d = canonicalDir(c.axis);
        const hit = dirs.find(q => Math.abs(dot(q.axis, d)) >= COS_1);
        if (hit) { hit.count++; hit.types[c.type] = (hit.types[c.type] || 0) + 1; } else dirs.push({axis: d, count: 1, types: {[c.type]: 1}});
    }
    dirs.sort((a, b) => b.count - a.count);
    const pitchOf = list => [0, 1, 2].map(i => {
        const xs = [...new Set(list.map(c => Math.round(c.position[i] * 100) / 100))].sort((a, b) => a - b);
        let best = null;
        for (let k = 1; k < xs.length; k++) {
            const gap = Math.round((xs[k] - xs[k - 1]) * 100) / 100;
            if (gap > 1 && (best === null || gap < best)) best = gap;
        }
        return best;
    });
    // Per type too: a brick's studs are 20 apart, its studs and underside tubes together 10.
    const pitchByType = {};
    for (const type of [...new Set(connectors.map(c => c.type))].sort()) pitchByType[type] = pitchOf(connectors.filter(c => c.type === type));
    return {directions: dirs, pitch: pitchOf(connectors), pitchByType};
};

// ---- symmetry -----------------------------------------------------------------------

/** What an orthogonal map is: identity, rotation (axis, degrees), reflection (plane normal), inversion, rotoreflection. */
export const describe = m => {
    const d = det(m);
    const tr = m[0] + m[4] + m[8];
    if (d > 0) {
        if (tr > 3 - 1e-9) return {kind: 'identity'};
        const angle = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
        let axis;
        if (Math.abs(angle - Math.PI) < 1e-6) {
            // R = 2aaᵀ − I: take the largest diagonal entry's column.
            const k = [0, 1, 2].reduce((b, i) => (m[4 * i] > m[4 * b] ? i : b), 0);
            axis = unit(add(columnOf(m, k), LDRAW_AXES[k]));
        } else axis = unit([m[7] - m[5], m[2] - m[6], m[3] - m[1]]);
        return {kind: 'rotation', axis: canonicalDir(axis), degrees: Math.round(angle * 180 / Math.PI * 1e6) / 1e6};
    }
    if (tr < -3 + 1e-9) return {kind: 'inversion'};
    // −m is a rotation; a reflection when that rotation is a half turn (its axis is the plane normal).
    const r = describe(m.map(v => -v));
    if (r.kind === 'rotation' && Math.abs(r.degrees - 180) < 1e-6) return {kind: 'reflection', normal: r.axis};
    return {kind: 'rotoreflection', axis: r.axis, degrees: Math.round((180 - r.degrees) * 1e6) / 1e6};
};

/**
 * The map p ↦ L·p + t with L = E·P·Eᵀ that keeps the centroid c fixed (t = c − L·c),
 * or, between two parts, sends cA to cB.
 */
const candidate = (EA, EB, P, cA, cB) => {
    let m = clean(mul(mul(EB, P), transpose(EA)));
    // Two frames measured on unaligned parts differ from each other by float noise (1e-6):
    // a map within 1e-3 of a signed permutation is that permutation.
    const snapped = m.map(v => Math.round(v));
    if (m.every((v, i) => Math.abs(v - snapped[i]) < 1e-3) && SIGNED_PERMUTATIONS.some(q => q.every((v, i) => v === snapped[i]))) {
        m = snapped.map(v => v + 0);
    }
    const t = sub(cB, mulVec(m, cA)).map(v => (Math.abs(v) < 1e-9 ? 0 : v));
    return {m, t};
};

const roundT = t => t.map(v => Math.round(v * 1e4) / 1e4 + 0);

/**
 * The point every symmetry must fix: the connectors' centroid (exact lattice
 * positions), else the surface centroid. A mesh centroid carries the 1 % a
 * moulded mark may break symmetry by; the connectors carry none.
 */
export const anchorOf = (meta, stats, meshOnly = false) => {
    const cs = meshOnly ? [] : (meta.connectors || []);
    if (!cs.length) return stats.centroid;
    return scale(cs.reduce((acc, c) => add(acc, c.position), [0, 0, 0]), 1 / cs.length);
};
const roundFrac = f => Math.round(f * 1e5) / 1e5;

/**
 * The share of a part's surface a symmetry (or a mirror match) may leave off the
 * other surface: 1 %. Measured over the catalogue (scripts/derive-canonical-frames.mjs
 * --misses): moulded marks, prints and friction ridges miss 0.02–1.0 % (an angle
 * connector's embossed numeral 0.3–0.9 %, a SPIKE motor's sides 0.4–0.6 %, friction
 * pins 0.7–1.0 %); a real difference in shape starts at 1.6 % (a 40-tooth gear turned
 * 90°) and is mostly several %. There is no clean gap, so the value each element misses
 * is reported with it (`missedArea`). Duplicates are judged exactly (no area allowance).
 */
export const AREA_TOL = 0.01;

/**
 * The symmetry group of a part, tested on connectors and mesh.
 * @param {{connectors: object[]}} meta
 * @param {ReturnType<typeof meshStats>} stats
 * @param {{index?: object, frame?: object}} [cache]
 * @returns {{elements: {m: number[], t: number[], proper: boolean, what: object}[], order: number, properOrder: number,
 *            chiral: boolean, axial: {axis: number[], order: number}[]}}
 */
export const symmetryGroup = (meta, stats, {index, frame} = {}) => {
    const connectors = meta.connectors || [];
    const f = frame || frameAxes(stats.cov, connectors);
    const idx = index || surfaceIndex(stats.tris);
    const c = anchorOf(meta, stats);
    const elements = [];
    for (const P of SIGNED_PERMUTATIONS) {
        const g = candidate(f.E, f.E, P, c, c);
        if (!connectorsMap(connectors, connectors, g)) continue;
        const off = areaOffSurface(stats, g, idx, AREA_TOL);
        if (!off.ok) continue;
        const r = refine(g, connectors, connectors);
        elements.push({m: r.m, t: roundT(r.t), proper: det(g.m) > 0, what: describe(g.m), missedArea: roundFrac(off.missed)});
    }
    // n-fold turns about a frame axis whose perpendicular moments are equal (a necessary condition for n ≥ 3).
    const axial = [];
    for (let i = 0; i < 3; i++) {
        const others = [0, 1, 2].filter(k => k !== i);
        if (Math.abs(f.moments[others[0]] - f.moments[others[1]]) > 1e-3 * Math.max(Math.abs(f.moments[0]), 1e-12)) continue;
        const axis = columnOf(f.E, i);
        for (let n = 96; n >= 3; n--) {
            const m = axisAngle(axis, 2 * Math.PI / n);
            const g = {m, t: sub(c, mulVec(m, c))};
            const off = connectorsMap(connectors, connectors, g) && areaOffSurface(stats, g, idx, AREA_TOL);
            if (off && off.ok) {
                axial.push({axis: canonicalDir(axis), order: n, missedArea: roundFrac(off.missed)});
                break;
            }
        }
    }
    const properOrder = elements.filter(e => e.proper).length;
    return {elements, order: elements.length, properOrder, chiral: properOrder === elements.length, axial};
};

/**
 * One improper symmetry to mirror a part in place: the most exact plane reflection, else
 * the inversion (both are involutions, so mirroring twice gives back the same pose), else a
 * rotoreflection.
 */
export const mirrorSymmetry = group => {
    const improper = group.elements.filter(e => !e.proper);
    const rank = e => (e.what.kind === 'reflection' ? 0 : e.what.kind === 'inversion' ? 1 : 2);
    // Among exact plane reflections, the LDraw x plane first, then y, then z (as the editor's
    // name-based fallback does): a part at the identity mirrored across world x then keeps its pose.
    const plane = e => (e.what.kind === 'reflection' ? [0, 1, 2].findIndex(k => Math.abs(e.what.normal[k]) === 1) : -1);
    const order = e => (plane(e) < 0 ? 3 : plane(e));
    return improper.sort((a, b) => rank(a) - rank(b) || a.missedArea - b.missedArea || order(a) - order(b) || len(a.t) - len(b.t))[0] || null;
};

// ---- two parts ------------------------------------------------------------------------

/** A cheap fingerprint two congruent (or mirror-congruent) parts share. */
export const signature = (meta, stats, frame) => ({
    area: stats.area,
    moments: frame.moments,
    types: typeCounts(meta.connectors || [])
});

const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-9);
export const signaturesMatch = (a, b, {types = true} = {}) => near(a.area, b.area, 5e-3) &&
    a.moments.every((v, i) => near(v, b.moments[i], 1e-2) || Math.abs(v - b.moments[i]) < 0.5) &&
    (!types || JSON.stringify(Object.entries(a.types).sort()) === JSON.stringify(Object.entries(b.types).sort()));

/**
 * The maps g with B = g(A), proper or improper, tested both ways on the mesh and on connectors.
 * `A`/`B`: {meta, stats, frame, index, meshOnly?} — a part analysed `meshOnly` (an LDraw
 * file with no PartMeta) is compared by its mesh alone.
 * @param {{proper?: boolean, exact?: boolean}} [want] only proper (true) or only improper (false)
 *        maps; `exact`: every vertex and triangle centroid within MESH_TOL (a duplicate), else
 *        at most AREA_TOL of either surface off the other (a mirror image, as for symmetry)
 * @returns {{m: number[], t: number[], proper: boolean, missedArea: number}[]}
 */
export const matchParts = (A, B, {proper, exact = false} = {}) => {
    const withConnectors = !A.meshOnly && !B.meshOnly;
    if (!signaturesMatch(signature(A.meta, A.stats, A.frame), signature(B.meta, B.stats, B.frame), {types: withConnectors})) return [];
    const out = [];
    for (const P of SIGNED_PERMUTATIONS) {
        const g = candidate(A.frame.E, B.frame.E, P, anchorOf(A.meta, A.stats, !withConnectors), anchorOf(B.meta, B.stats, !withConnectors));
        const isProper = det(g.m) > 0;
        if (proper !== undefined && isProper !== proper) continue;
        if (withConnectors && !connectorsMap(A.meta.connectors || [], B.meta.connectors || [], g)) continue;
        const inv = {m: transpose(g.m), t: scale(mulVec(transpose(g.m), g.t), -1)};
        let missedArea = 0;
        if (exact) {
            if (!samplesOnSurface(A.stats.samples, g, B.index).ok || !samplesOnSurface(B.stats.samples, inv, A.index).ok) continue;
        } else {
            const ab = areaOffSurface(A.stats, g, B.index, AREA_TOL);
            const ba = ab.ok && areaOffSurface(B.stats, inv, A.index, AREA_TOL);
            if (!ba || !ba.ok) continue;
            missedArea = roundFrac(Math.max(ab.missed, ba.missed));
        }
        const r = withConnectors ? refine(g, A.meta.connectors || [], B.meta.connectors || []) : g;
        out.push({m: r.m, t: roundT(r.t), proper: isProper, missedArea});
    }
    return out;
};

/**
 * Everything the library needs per part, from its meta and flattened polygons.
 * `meshOnly`: an LDraw file without PartMeta (meta = {part}); compared by its mesh alone.
 */
export const analysePart = (meta, polys, {meshOnly = false} = {}) => {
    const stats = meshStats(polys);
    const frame = frameAxes(stats.cov, meta.connectors || []);
    const index = surfaceIndex(stats.tris);
    const group = symmetryGroup(meta, stats, {index, frame});
    return {meta, stats, frame, index, group, meshOnly, lattice: latticeOf(meta.connectors || [])};
};

/**
 * Mirror pairs and duplicates across a set of analysed parts. Duplicates are found
 * first and grouped (an alias of an alias is one group, first member as listed);
 * mirror pairs are then sought between the groups' first members only, so a
 * left part and its alias do not both pair with the right part.
 * @param {ReturnType<typeof analysePart>[]} parts
 * @returns {{mirrors: {a: string, b: string, transform: {m: number[], t: number[]}}[],
 *            duplicates: {a: string, b: string, transform: {m: number[], t: number[]}}[],
 *            groups: string[][]}}
 *          a pair is listed once (a before b); transform maps a's geometry onto b's
 *          (det −1 for a mirror pair, +1 for a duplicate: b's first group member is a)
 */
export const findPairs = parts => {
    const mirrors = []; const duplicates = [];
    const sigs = parts.map(p => signature(p.meta, p.stats, p.frame));
    const same = (i, j) => signaturesMatch(sigs[i], sigs[j], {types: !parts[i].meshOnly && !parts[j].meshOnly});
    const head = parts.map((_, i) => i);
    for (let i = 0; i < parts.length; i++) {
        if (head[i] !== i) continue;
        for (let j = i + 1; j < parts.length; j++) {
            if (head[j] !== j || !same(i, j)) continue;
            const g = matchParts(parts[i], parts[j], {proper: true, exact: true});
            if (g.length) {
                head[j] = i;
                duplicates.push({a: parts[i].meta.part, b: parts[j].meta.part, transform: pick(g)});
            }
        }
    }
    for (let i = 0; i < parts.length; i++) {
        // Only a chiral part has a mirror counterpart that is not also a copy of it.
        if (head[i] !== i || !parts[i].group.chiral) continue;
        for (let j = i + 1; j < parts.length; j++) {
            if (head[j] !== j || !same(i, j)) continue;
            const g = matchParts(parts[i], parts[j], {proper: false});
            if (g.length) mirrors.push({a: parts[i].meta.part, b: parts[j].meta.part, transform: pick(g)});
        }
    }
    const groups = [];
    parts.forEach((p, i) => {
        if (head[i] === i) return;
        let grp = groups.find(gr => gr[0] === parts[head[i]].meta.part);
        if (!grp) groups.push(grp = [parts[head[i]].meta.part]);
        grp.push(p.meta.part);
    });
    return {mirrors, duplicates, groups};
};

/** Of several equally valid maps: a plane reflection / the identity-nearest one, then the shortest shift. */
const pick = gs => gs.slice().sort((x, y) => {
    const rank = g => { const w = describe(g.m); return w.kind === 'identity' || w.kind === 'reflection' ? 0 : 1; };
    const trace = g => g.m[0] + g.m[4] + g.m[8];
    return rank(x) - rank(y) || (x.missedArea || 0) - (y.missedArea || 0) || trace(y) - trace(x) || len(x.t) - len(y.t);
})[0];

/** The inverse of p ↦ m·p + t (m orthogonal). */
export const invert = g => {
    const mt = transpose(g.m);
    return {m: mt, t: roundT(scale(mulVec(mt, g.t), -1))};
};

// ---- palette placement ------------------------------------------------------------------

/** Quaternion [x, y, z, w] → row-major 3×3. */
const quatMatrix = q => {
    const [x, y, z, w] = q;
    return [
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
    ];
};

/** A part's extent along each LDraw axis: its colliders' corners and its connectors' positions. */
export const extentsOf = meta => {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    const put = p => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } };
    for (const c of meta.colliders || []) {
        const at = c.position || [0, 0, 0];
        const R = c.rotation ? quatMatrix(c.rotation) : IDENTITY;
        const h = c.shape === 'box' ? c.halfExtents : c.shape === 'cylinder' ? [c.radius, c.halfHeight, c.radius] : [c.radius, c.radius, c.radius];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) put(add(at, mulVec(R, [sx * h[0], sy * h[1], sz * h[2]])));
    }
    for (const c of meta.connectors || []) put(c.position);
    return lo[0] === Infinity ? [0, 0, 0] : hi.map((v, k) => v - lo[k]);
};

const TECHNIC = new Set(['pinhole', 'axlehole', 'pin', 'axle', 'slide-bore']);
const STUDDY = new Set(['stud', 'antistud', 'tube']);
const PROPER_PERMS = SIGNED_PERMUTATIONS.filter(m => det(m) > 0);
const axisIndex = v => [0, 1, 2].find(k => Math.abs(Math.abs(v[k]) - 1) < 1e-6);

/**
 * The palette's default rotation for a part (row-major, proper, a signed
 * permutation), from its connectors and colliders. See the header.
 * @param {object} meta PartMeta
 * @returns {{rotation: number[], rule: string}}
 */
export const placementRotation = meta => {
    if (!meta) return {rotation: IDENTITY.slice(), rule: 'none'};
    if (meta.device || meta.hubProfile || ['motor', 'sensor', 'hub'].includes(meta.category)) {
        return {rotation: IDENTITY.slice(), rule: 'device'};
    }
    const connectors = meta.connectors || [];
    const ext = extentsOf(meta);
    /** Of the proper signed permutations meeting `ok`, the one nearest the identity (largest trace). */
    const best = ok => PROPER_PERMS.filter(ok).sort((a, b) => (b[0] + b[4] + b[8]) - (a[0] + a[4] + a[8]))[0];
    // Where part axis i lands: column i of R. R maps part axis i onto world axis j when |R[j][i]| = 1.
    const lands = (R, i, j) => Math.abs(R[3 * j + i]) === 1;

    // System connectivity: the studs' sense goes up (world -y), the longest horizontal extent along x.
    const studs = connectors.filter(c => STUDDY.has(c.type) && c.axis);
    if (studs.length) {
        const votes = new Map();
        for (const c of studs) {
            const k = axisIndex(c.axis);
            if (k === undefined) continue;
            const key = `${k}${Math.sign(c.axis[k])}`;
            votes.set(key, (votes.get(key) || 0) + (c.type === 'stud' ? 2 : 1));
        }
        const [top] = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] === '1-1' ? -1 : b[0] === '1-1' ? 1 : 0));
        if (top) {
            const k = Number(top[0][0]); const sense = Number(top[0].slice(1));
            const up = R => R[3 + k] * sense === -1; // world y of the stud axis is -1
            const horiz = [0, 1, 2].filter(i => i !== k);
            const long = ext[horiz[0]] >= ext[horiz[1]] ? horiz[0] : horiz[1];
            const R = best(m => up(m) && lands(m, long, 0)) || best(up);
            return {rotation: R.slice(), rule: 'studs-up'};
        }
    }
    // Technic: count the line directions of holes and shafts.
    const lines = connectors.filter(c => TECHNIC.has(c.type) && c.axis);
    if (lines.length) {
        const count = [0, 0, 0];
        for (const c of lines) { const k = axisIndex(c.axis); if (k !== undefined) count[k]++; }
        const a = [0, 1, 2].reduce((b, i) => (count[i] > count[b] ? i : b), 0);
        if (!count[a]) return {rotation: IDENTITY.slice(), rule: 'none'};
        const order = [0, 1, 2].sort((i, j) => ext[j] - ext[i]);
        const long = ext[order[0]] > 1.2 * ext[order[1]] ? order[0] : null;
        let R;
        let rule;
        if (long !== null && long !== a) { R = best(m => lands(m, long, 0) && lands(m, a, 2)); rule = 'long-x-holes-z'; }
        else if (long === a) { R = best(m => lands(m, a, 0)); rule = 'shaft-x'; }
        else { R = best(m => lands(m, a, 2)); rule = 'round-axis-z'; }
        return {rotation: R.slice(), rule};
    }
    return {rotation: IDENTITY.slice(), rule: 'none'};
};

const placementCache = new WeakMap();
/** placementRotation(meta).rotation, memoised per meta object (the editor asks on every ghost move). */
export const defaultRotation = meta => {
    if (!meta) return IDENTITY.slice();
    let r = placementCache.get(meta);
    if (!r) placementCache.set(meta, r = placementRotation(meta).rotation);
    return r.slice();
};
