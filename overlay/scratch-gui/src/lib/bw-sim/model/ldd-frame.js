// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A part's LEGO Digital Designer (LDD) frame, worked out from its LDraw geometry
// (its derived connectors, PartMeta v2) — for the .lxf import of parts that
// model/ldd-parts.js has no recorded row for. Pure; node --test runs it.
//
// THE FRAME. LDD stores each part's pose relative to its own origin and axes,
// which are not LDraw's. As LDraw directions (LDraw units, LDU), an LDD frame is
// an origin `o` in the LDraw part and a rotation `M` whose columns are LDD's
// x, y, z axes; rowOfFrame turns it into the row form lxf-model.js applies
// (ldd-parts.js documents that formula, which LeoCAD's lc_lxf.cpp applies too).
//
// THE RULE, written while looking at a training half of the parts that the LDD↔LDraw
// mapping file `ldraw.xml` and the LDraw library share and checked on the other half,
// locally (scripts/eval-ldd-frames.mjs; the method in docs/ROBOT-LAB-LDD-FRAMES.md; no
// figure from that file is kept here):
//
//   grid      a part with studs or an underside on the stud grid (stud, anti-stud,
//             tube connectors pointing up): LDD y is up. A System part (brick,
//             plate, tile, slope) keeps LDraw's yaw (LDD x = LDraw x, LDD z =
//             LDraw −z); any other studded part turns so that its longer run of
//             cells lies along LDD x. The origin is a cell centre at the bottom:
//             of the top studs (else the underside cells) the least along LDD x,
//             of those the most along LDD z; its height is the underside, counted
//             in plates (8 LDU) down from the stud base.
//   technic   a part with Technic lines (pin, pin hole, axle, axle hole) and no stud
//             grid: LDD z runs along the direction most lines share, in the sense
//             LDD mostly uses (LDraw −x, +y, −z), and the origin is at the end of
//             one line, the line running from it along −z. A beam (a straight row
//             of parallel holes, or a Technic beam) starts at its end hole and LDD x
//             points to the next hole; any other part starts at the line nearest
//             the middle of its connectors, LDD y up where it can be.
//   ldraw-origin  a part with no connectors at all: LDD's frame is LDraw's (o = 0).
//
// Trusted for import (importFrame): `grid`, and the Technic rules on the simple shapes
// (technicShape) where LDD's choice of end and sense cannot change the placement. Other
// parts are placed by their connections (model/ldd-snap.js), with these rules only as a
// tie-break.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = v => scale(v, 1 / (len(v) || 1));
const fromColumns = (a, b, c) => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
const clean = v => v.map(x => (Math.abs(x) < 1e-9 ? 0 : x));

/** LDraw ↔ LDD axes: LDD is y up, LDraw −y up; both right-handed (F = diag(1, −1, −1)). */
export const F = Object.freeze([1, 0, 0, 0, -1, 0, 0, 0, -1]);
/** 1 LDD unit in LDU. */
const LDD_UNIT = 25;
const UP = [0, -1, 0];
const SYSTEM = new Set(['brick', 'plate', 'tile', 'slope']);
const GRID = new Set(['stud', 'antistud', 'tube']);
const LINE = new Set(['pin', 'pinhole', 'axle', 'axlehole']);
/**
 * The simple Technic shapes (from the part's connectors alone): 'line' — every connector a pin, axle,
 * pin hole or axle hole on one line (a pin, an axle, a bush, a gear's hub); 'row' — every connector a
 * pin or axle hole, all parallel, their centres a straight row at the 20 LDU pitch (a straight beam).
 * Null for anything else.
 */
export const technicShape = meta => {
    const cs = meta.connectors || [];
    if (!cs.length || !cs.every(c => LINE.has(c.type) && c.axis)) return null;
    const a = cs[0].axis;
    if (!cs.every(c => Math.abs(Math.abs(dot(c.axis, a)) - 1) < 1e-6)) return null;
    const foot = c => sub(c.position, scale(a, dot(c.position, a)));
    const feet = cs.map(foot);
    if (feet.every(f => len(sub(f, feet[0])) < 0.5)) {
        // Only a line that is the same from either end (a pin, an axle, a bush): which end LDD starts at
        // then does not matter. An axle pin (a pin one side, an axle the other) is not.
        const ts = cs.map(c => dot(c.position, a));
        const mid = (Math.min(...ts.map((t, i) => t - cs[i].length / 2)) + Math.max(...ts.map((t, i) => t + cs[i].length / 2))) / 2;
        const mirrored = cs.every((c, i) => cs.some((d, k) => d.type === c.type && Math.abs(d.length - c.length) < 0.5 &&
            Math.abs((ts[k] - mid) + (ts[i] - mid)) < 0.5));
        // ... and so is its body: each collider has a twin mirrored across the middle (a bevel gear's teeth,
        // a stop bush on one end, are not).
        const cols = meta.colliders || [];
        const cz = c => dot(c.position || [0, 0, 0], a) - mid;
        const body = cols.every(c => cols.some(d => d.shape === c.shape && Math.abs(cz(d) + cz(c)) < 0.5));
        return mirrored && body ? 'line' : null;
    }
    if (!cs.every(c => c.type === 'pinhole' || c.type === 'axlehole')) return null;
    const far = feet.reduce((b, f) => (len(sub(f, feet[0])) > len(sub(b, feet[0])) ? f : b), feet[0]);
    const dir = norm(sub(far, feet[0]));
    const along = feet.map(f => dot(sub(f, feet[0]), dir)).sort((x, y) => x - y);
    const straight = feet.every(f => len(cross(sub(f, feet[0]), dir)) < 0.5);
    const pitched = along.every((t, i) => i === 0 || Math.abs(t - along[i - 1] - 20) < 0.5 || Math.abs(t - along[i - 1]) < 0.5);
    // A row that is the same from either end (a beam of round holes, or axle holes at both ends alike).
    const mid = (along[0] + along[along.length - 1]) / 2;
    const at = c => dot(sub(foot(c), feet[0]), dir) - mid;
    const mirrored = cs.every(c => cs.some(d => d.type === c.type && Math.abs(at(d) + at(c)) < 0.5));
    return straight && pitched && mirrored ? 'row' : null;
};

/** The rules whose frames the .lxf import uses for a design outside ldd-parts.js. */
export const DERIVED_RULES = Object.freeze(new Set(['grid']));

/**
 * The LDD frame the .lxf import places a part with outright: the grid rule's, or the Technic rules'
 * on a simple shape (technicShape: 'line', 'row'). Null: the part waits for its connections.
 */
export const importFrame = meta => {
    const frame = lddFrameOf(meta);
    if (!frame) return null;
    if (DERIVED_RULES.has(frame.rule)) return frame;
    if ((frame.rule === 'technic-beam' || frame.rule === 'technic-hub') && technicShape(meta)) return frame;
    return null;
};

/** Quaternion [x, y, z, w] → row-major 3×3. */
const quatMatrix = ([x, y, z, w]) => [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
];

/** The lowest point (greatest LDraw y) of a PartMeta's colliders' bounding corners, or null without any. */
export const collidersBottom = meta => {
    let bottom = null;
    for (const c of meta.colliders || []) {
        const at = c.position || [0, 0, 0];
        const R = c.rotation ? quatMatrix(c.rotation) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const h = c.shape === 'box' ? c.halfExtents : c.shape === 'cylinder' ? [c.radius, c.halfHeight, c.radius] : [c.radius, c.radius, c.radius];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const y = at[1] + R[3] * sx * h[0] + R[4] * sy * h[1] + R[5] * sz * h[2];
            if (bottom === null || y > bottom) bottom = y;
        }
    }
    return bottom;
};

const gridFrame = (cells, category, bottom) => {
    const xs = cells.map(c => c.position[0]);
    const zs = cells.map(c => c.position[2]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    const turn = !SYSTEM.has(category) && spanZ > spanX + 1e-6;
    const ex = turn ? [0, 0, 1] : [1, 0, 0];
    const ez = cross(ex, UP);
    const studs = cells.filter(c => c.type === 'stud');
    const under = cells.filter(c => c.type !== 'stud');
    // Height: the underside, a whole number of plates below the stud base.
    const low = under.length ? Math.max(...under.map(c => c.position[1])) : bottom;
    let y;
    if (studs.length && low !== null && low !== undefined) {
        const top = Math.min(...studs.map(c => c.position[1]));
        y = top + 8 * Math.max(0, Math.floor((low - top) / 8 + 0.3));
    } else y = studs.length ? Math.min(...studs.map(c => c.position[1])) : low;
    // The first cell: least along LDD x, then most along LDD z — of the studs, else the underside.
    const pool = studs.length ? studs : under;
    const minX = Math.min(...pool.map(c => dot(c.position, ex)));
    const maxZ = Math.max(...pool.filter(c => Math.abs(dot(c.position, ex) - minX) < 0.5).map(c => dot(c.position, ez)));
    const o = clean(add(add(scale(ex, minX), scale(ez, maxZ)), [0, y, 0]));
    return {o, M: clean(fromColumns(ex, UP, ez)), rule: 'grid'};
};

/** The sense LDD most often gives a line along each LDraw axis (training split): −x, +y, −z. */
const PREFERRED = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]];
const preferredSense = v => {
    const k = [0, 1, 2].reduce((b, i) => (Math.abs(v[i]) > Math.abs(v[b]) ? i : b), 0);
    return dot(v, PREFERRED[k]) >= 0 ? v.slice() : scale(v, -1);
};

const technicFrame = (connectors, category) => {
    const lines = connectors.filter(c => LINE.has(c.type) && c.length > 0 && c.axis);
    if (!lines.length) return null;
    // The main line direction: the one most line connectors run along (first found on a tie).
    const dirs = [];
    for (const c of lines) {
        const d = preferredSense(c.axis);
        const hit = dirs.find(q => Math.abs(dot(q.d, d)) > 1 - 1e-6);
        if (hit) hit.list.push(c); else dirs.push({d, list: [c]});
    }
    dirs.sort((a, b) => b.list.length - a.list.length);
    const {d: ez, list} = dirs[0];
    const foot = c => sub(c.position, scale(ez, dot(c.position, ez)));
    const feet = list.map(foot);
    const far = feet.reduce((b, f) => (len(sub(f, feet[0])) > len(sub(b, feet[0])) ? f : b), feet[0]);
    const span = sub(far, feet[0]);
    const straight = len(span) > 1 && feet.every(f => len(cross(sub(f, feet[0]), norm(span))) < 0.5);
    const beam = straight || (category === 'beam' && len(span) > 1);
    let ex;
    let chosen;
    if (beam) {
        // From the end connector (farthest from the middle of the row) towards its nearest neighbour;
        // of tied ends (a straight or symmetric beam), the least along the preferred row direction.
        const mid = scale(feet.reduce(add, [0, 0, 0]), 1 / feet.length);
        const most = Math.max(...feet.map(f => len(sub(f, mid))));
        const ends = list.filter((c, i) => Math.abs(len(sub(feet[i], mid)) - most) < 0.5);
        const along = straight ? preferredSense(norm(span)) : null;
        const end = along ? ends.reduce((b, c) => (dot(foot(c), along) < dot(foot(b), along) - 1e-6 ? c : b), ends[0]) : ends[0];
        const f0 = foot(end);
        const next = feet.filter(f => len(sub(f, f0)) > 1).reduce((b, f) => (len(sub(f, f0)) < len(sub(b, f0)) ? f : b));
        ex = norm(sub(next, f0));
        chosen = list.filter(c => len(sub(foot(c), f0)) < 0.5);
    } else {
        // The line nearest the middle of all connectors (a gear's axle hole), LDD y up where it can be.
        const mid = scale(connectors.reduce((a, c) => add(a, c.position), [0, 0, 0]), 1 / connectors.length);
        const midFoot = sub(mid, scale(ez, dot(mid, ez)));
        const dist = c => len(sub(foot(c), midFoot));
        const least = Math.min(...list.map(dist));
        chosen = list.filter(c => Math.abs(dist(c) - least) < 0.5);
        ex = Math.abs(dot(ez, UP)) > 1 - 1e-6 ? [1, 0, 0] : cross(UP, ez);
    }
    const ey = cross(ez, ex);
    // The origin: the chosen line's end on the +z side, the line running from it along −z.
    const top = Math.max(...chosen.map(c => dot(c.position, ez) + c.length / 2));
    const c0 = chosen.find(c => Math.abs(dot(c.position, ez) + c.length / 2 - top) < 1e-6);
    return {o: clean(add(foot(c0), scale(ez, top))), M: clean(fromColumns(ex, ey, ez)), rule: beam ? 'technic-beam' : 'technic-hub'};
};

/**
 * The LDD frame of a part, from its connectors.
 * @param {{connectors?: object[], category?: string, colliders?: object[]}} meta PartMeta (derived or measured)
 * @param {{bottom?: number}} [options] bottom: the part's lowest LDraw y (else its colliders') — the
 *        height of a studded part whose underside has no anti-stud cells
 * @returns {{o: number[], M: number[], rule: string}|null} null: connectors, but no stud grid or Technic line
 */
export const lddFrameOf = (meta, {bottom} = {}) => {
    const connectors = meta.connectors || [];
    const cells = connectors.filter(c => GRID.has(c.type) && c.axis && Math.abs(c.axis[1] + 1) < 1e-6);
    if (cells.length) return gridFrame(cells, meta.category || '', bottom ?? collidersBottom(meta));
    const technic = technicFrame(connectors, meta.category || '');
    if (technic) return technic;
    return connectors.length ? null : {o: [0, 0, 0], M: F.slice(), rule: 'ldraw-origin'};
};

/**
 * A frame as the row lxf-model.js applies: translation t (LDD units) and Rn (row-major), with
 * LDraw position = 25·F·(b − B·Rn·t) and rotation F·B·Rn·F for an LXFML bone (B, b).
 * From o = 25·F·t and M = F·Rnᵀ: t = F·o/25, Rn = Mᵀ·F.
 */
export const rowOfFrame = ({o, M}) => ({
    translation: clean([o[0] / LDD_UNIT, -o[1] / LDD_UNIT, -o[2] / LDD_UNIT]),
    rotation: clean([M[0], -M[3], -M[6], M[1], -M[4], -M[7], M[2], -M[5], -M[8]])
});
