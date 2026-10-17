// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A small, dependency-free reader for LDraw part geometry, for the Sim Lab's
// part metadata (docs/SIM-LAB-PLAN.md §D4, task B3). It is NOT the renderer —
// three.js's LDrawLoader draws parts. This module answers geometric questions
// about a part in its own frame, headless, so hand-authored metadata can be
// checked against the mesh instead of trusted:
//
//   - flattenPart(): every triangle/quad of a part with all subfile
//     transforms applied (bounding boxes, collider coverage);
//   - every circular PRIMITIVE instance (cylinders, discs, rings, Technic
//     holes/pins — any file under p/) with its placement, from which
//     circularFeatures() derives a centre, an axis and a radius. A Technic
//     pin hole is a circular feature of radius 6 LDU (4.8 mm bore) whose axis
//     runs through the hole. An axle is a cross, not a circle: callers find
//     axle profiles by the LDraw `axl*` primitive family instead.
//
// LDraw format, as used here (https://www.ldraw.org/article/218): line type 1
// is `1 colour x y z a b c d e f g h i file` (a..i row-major, applied as
// p' = M·p + t), 3 is a triangle, 4 a quad, 2 an edge line, 5 an optional
// line. File names are case-insensitive and use `\\` as the separator. A part
// file resolves in parts/, parts/s/ (sub-parts written `s\\name.dat`), p/,
// p/48/ and p/8/ (hi/lo-res primitives written `48\\name.dat`).

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{m: number[], t: Vec3}} Xform  3×3 row-major + translation */

export const IDENTITY = Object.freeze({m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0]});

/** Compose: apply `inner` first, then `outer`. */
export const compose = (outer, inner) => {
    const a = outer.m, b = inner.m;
    const m = [
        a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
        a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
        a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
    return {m, t: apply(outer, inner.t)};
};

/** @returns {Vec3} */
export const apply = (x, p) => [
    x.m[0] * p[0] + x.m[1] * p[1] + x.m[2] * p[2] + x.t[0],
    x.m[3] * p[0] + x.m[4] * p[1] + x.m[5] * p[2] + x.t[1],
    x.m[6] * p[0] + x.m[7] * p[1] + x.m[8] * p[2] + x.t[2]
];

/** Column `i` of the 3×3 (where the primitive's local axis i lands, scaled). */
export const column = (x, i) => [x.m[i], x.m[3 + i], x.m[6 + i]];

const norm = v => Math.hypot(v[0], v[1], v[2]);

/** Normalise an LDraw file reference to a lookup key: lower case, forward slashes. */
export const refKey = name => name.trim().toLowerCase().replace(/\\/g, '/');

/**
 * Parse one LDraw file's text.
 * @returns {{header: {description: string, name?: string, author?: string, license?: string, ldrawOrg?: string},
 *            refs: {file: string, x: Xform, colour: number}[], polys: Vec3[][], polyColours: number[], edges: Vec3[][]}}
 */
export const parseLDraw = text => {
    const header = {description: ''};
    const refs = [];
    const polys = [];
    const polyColours = [];
    const edges = [];
    let first = true;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const tok = line.split(/\s+/);
        const type = tok[0];
        if (type === '0') {
            const rest = line.slice(1).trim();
            if (first) header.description = rest;
            else if (/^Name:/i.test(rest)) header.name = rest.slice(5).trim();
            else if (/^Author:/i.test(rest)) header.author = rest.slice(7).trim();
            else if (/^!LICENSE\b/.test(rest)) header.license = rest.slice(8).trim();
            else if (/^!LDRAW_ORG\b/.test(rest)) header.ldrawOrg = rest.slice(9).trim();
            first = false;
            continue;
        }
        first = false;
        const n = tok.slice(2).map(Number);
        if (type === '1' && tok.length >= 15) {
            const colour = parseInt(tok[1], 10);
            refs.push({
                file: tok.slice(14).join(' '),
                x: {m: n.slice(3, 12), t: n.slice(0, 3)},
                colour: Number.isFinite(colour) ? colour : 16
            });
        } else if (type === '3' && tok.length >= 11) {
            const colour = parseInt(tok[1], 10);
            polys.push([n.slice(0, 3), n.slice(3, 6), n.slice(6, 9)]);
            polyColours.push(Number.isFinite(colour) ? colour : 16);
        } else if (type === '4' && tok.length >= 14) {
            const colour = parseInt(tok[1], 10);
            polys.push([n.slice(0, 3), n.slice(3, 6), n.slice(6, 9), n.slice(9, 12)]);
            polyColours.push(Number.isFinite(colour) ? colour : 16);
        } else if (type === '2' && tok.length >= 8) {
            edges.push([n.slice(0, 3), n.slice(3, 6)]);
        }
    }
    return {header, refs, polys, polyColours, edges};
};

/** The directories an LDraw reference is looked up in, in order. */
export const SEARCH_DIRS = Object.freeze(['parts/', 'p/', '']);

/**
 * Flatten a part: all polygons and edges in the part frame, plus every
 * primitive (a file found under p/) with its accumulated placement.
 *
 * Colours: type-3/4 lines carry a colour; 16 inherits from the referencing
 * type-1 line, recursively. The returned `polyColours` parallels `polys`.
 *
 * @param {string} name   e.g. '32523.dat'
 * @param {(path: string) => string|undefined} read  returns file text for a
 *        library-relative path such as 'parts/32523.dat' or 'p/48/4-4cyli.dat', or undefined
 * @returns {{polys: Vec3[][], polyColours: number[], edges: Vec3[][], primitives: {file: string, x: Xform}[],
 *            subparts: {file: string, x: Xform, description: string, polys: Vec3[][]}[],
 *            files: string[], missing: string[]}}
 *          subparts: every instance of a parts/s/ file with its placement and its
 *          own polygons in the part frame (LDraw splits e.g. a gear's axle hole
 *          into such sub-files)
 *          files: every library path the part needed (its closure); missing: references not found
 */
export const flattenPart = (name, read) => {
    const out = {polys: [], polyColours: [], edges: [], primitives: [], subparts: [], files: [], missing: []};
    const cache = new Map();
    const seen = new Set();
    const load = ref => {
        const key = refKey(ref);
        if (cache.has(key)) return cache.get(key);
        let found;
        for (const dir of SEARCH_DIRS) {
            const path = dir + key;
            const text = read(path);
            if (text !== undefined) {
                found = {path, parsed: parseLDraw(text)};
                break;
            }
        }
        cache.set(key, found);
        if (found && !seen.has(found.path)) {
            seen.add(found.path);
            out.files.push(found.path);
        }
        return found;
    };
    const resolveColour = (colour, parentColour) => {
        if (colour === 16) return parentColour;
        return colour;
    };
    const walk = (ref, x, colour, depth) => {
        if (depth > 32) throw new Error(`LDraw reference depth > 32 at ${ref} (a cycle?)`);
        const f = load(ref);
        if (!f) {
            out.missing.push(ref);
            return;
        }
        if (f.path.startsWith('p/')) out.primitives.push({file: f.path, x});
        const first = out.polys.length;
        for (let i = 0; i < f.parsed.polys.length; i++) {
            const poly = f.parsed.polys[i];
            const polyColour = f.parsed.polyColours[i];
            const effective = resolveColour(polyColour, colour);
            out.polys.push(poly.map(v => apply(x, v)));
            out.polyColours.push(effective);
        }
        for (const e of f.parsed.edges) out.edges.push(e.map(v => apply(x, v)));
        for (const r of f.parsed.refs) {
            const childColour = resolveColour(r.colour, colour);
            walk(r.file, compose(x, r.x), childColour, depth + 1);
        }
        if (f.path.startsWith('parts/s/')) {
            out.subparts.push({file: f.path, x, description: f.parsed.header.description, polys: out.polys.slice(first)});
        }
    };
    walk(name, IDENTITY, 16, 0);
    return out;
};

/** Axis-aligned bounds of a flattened part's polygons. */
export const bounds = polys => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of polys) for (const v of p) for (let i = 0; i < 3; i++) {
        if (v[i] < lo[i]) lo[i] = v[i];
        if (v[i] > hi[i]) hi[i] = v[i];
    }
    return {min: lo, max: hi};
};

/**
 * LDraw circular primitives are drawn around the local y axis with unit
 * radius in x/z (4-4cyli, 4-4edge, 4-4disc, 4-4ring*, n-8cyli, …; also the
 * Technic composites connhole, peghole, beamhole, confric*, connect*).
 * Placed with matrix M, the primitive's axis is M's y column and its radius
 * the length of M's x column (equal to the z column for a true circle).
 * Ring primitives `4-4ringN` span radii N..N+1, so their outer radius is
 * scaled by N+1; they are reported with that factor in `radii`.
 *
 * @returns {{file: string, x: Xform, center: Vec3, axis: Vec3, radius: number, height: number}[]}
 *          axis is a unit vector; `height` is the length of the y column
 *          (the primitive's extent along its axis, for unit-height primitives)
 */
export const circularFeatures = primitives => {
    const out = [];
    for (const {file, x} of primitives) {
        const base = file.split('/').pop();
        if (!/^(\d+-\d+(cyli|edge|disc|ndis|ring\d+|cylo|cyls|con\d+)|connhole|peghole|beamhol\w*|npeghol\w*|confric\w*|connect\w*|bush\w*)\.dat$/.test(base)) continue;
        const cx = column(x, 0), cy = column(x, 1), cz = column(x, 2);
        const rx = norm(cx), rz = norm(cz), h = norm(cy);
        if (rx === 0 || h === 0 || Math.abs(rx - rz) > 1e-6 * Math.max(1, rx)) continue;
        let radius = rx;
        const ring = /ring(\d+)\.dat$/.exec(base);
        if (ring) radius = rx * (Number(ring[1]) + 1);
        out.push({file, x, center: x.t.slice(), axis: cy.map(v => v / h), radius, height: h});
    }
    return out;
};
