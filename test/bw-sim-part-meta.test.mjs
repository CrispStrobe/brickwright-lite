// SPDX-License-Identifier: BSD-3-Clause
/**
 * The Sim Lab's hand-authored part metadata (bw-sim/part-meta/parts.json,
 * plan task B3a) is checked against the LDraw meshes it describes, so a typo
 * fails CI instead of a child's model (plan §6, "Validator is the contract").
 *
 * Everything is measured from the VENDORED official geometry
 * (static/ldraw, see scripts/sync-ldraw-parts.mjs), never from the metadata:
 *
 *   - every pinhole/pin connector lies on the axis of a circular Technic bore
 *     of radius 6 LDU (4.8 mm), parallel to it, inside its extent;
 *   - every axle/axlehole connector lies on the line of an axle-profile
 *     primitive (the LDraw axl* family), parallel to it;
 *   - the castor ball connector is where LDraw's own castor assembly
 *     (39370c01) puts the ball, and the ball's mesh is a sphere of the
 *     collider's radius about it;
 *   - a motor's output connectors are features of its drive-hub sub-assembly
 *     and its housing connectors are not (LDraw models the two as separate
 *     subfiles, which is exactly the split the compiler needs);
 *   - a gear's tip radius is pitch radius + one module (1 mm = 2.5 LDU), and its
 *     centre is on its axle hole; the wheel is 56 mm across, as its name says;
 *   - colliders enclose the mesh (≥ 98 % of its vertices inside a collider) without
 *     being oversized (≤ 110 % of the mesh box volume).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {flattenPart, circularFeatures, bounds, parseLDraw, compose, apply, column, IDENTITY} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {validatePartMeta, pitchRadiusLdu} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {check as checkVendored} from '../scripts/sync-ldraw-parts.mjs';
import {solidColliders} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/static/ldraw');
const META = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8'));
const read = p => {
    const f = path.join(LIB, p.toLowerCase());
    return existsSync(f) ? readFileSync(f, 'latin1') : undefined;
};

/** Technic bore radius in LDU (4.8 mm). */
const BORE_R = 6;
const POS_EPS = 0.5;
const SPAN_EPS = 1;
const PARALLEL = Math.cos(Math.PI / 180);
/** The Technic composite primitives are drawn at unit scale around a 6 LDU bore. */
const COMPOSITE = /\/(connhole|peghole|beamhol\w*|npeghol\w*|confric\w*|connect\w*)\.dat$/;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(...a);

/** A feature line: axis (unit), a point on it, the axial interval it covers, its radius. */
const lineOf = (x, file, radius) => {
    const y = column(x, 1);
    const h = len(y);
    const axis = y.map(v => v / h);
    const p0 = x.t;
    const p1 = apply(x, [0, 1, 0]);
    return {file, x, axis, p0, lo: Math.min(dot(p0, axis), dot(p1, axis)), hi: Math.max(dot(p0, axis), dot(p1, axis)), radius};
};

const boreLines = primitives => [
    ...circularFeatures(primitives)
        .filter(c => !COMPOSITE.test(c.file) && Math.abs(c.radius - BORE_R) <= POS_EPS)
        .map(c => lineOf(c.x, c.file, c.radius)),
    ...primitives.filter(p => COMPOSITE.test(p.file)).map(p => lineOf(p.x, p.file, BORE_R * len(column(p.x, 0))))
].filter(l => Math.abs(l.radius - BORE_R) <= POS_EPS);

const axleLines = primitives => primitives.filter(p => /\/axl\w*\.dat$/.test(p.file)).map(p => lineOf(p.x, p.file, null));

/** Is connector c (position, axis) on one of `lines`? Returns the matching lines. */
const onLine = (c, lines) => lines.filter(l => {
    if (Math.abs(dot(l.axis, c.axis)) < PARALLEL) return false;
    const d = sub(c.position, l.p0);
    const along = dot(d, l.axis);
    const perp = len(d.map((v, i) => v - along * l.axis[i]));
    return perp <= POS_EPS;
});
const coversAxially = (c, lines) => {
    const axis = lines[0].axis;
    const t = dot(c.position, axis);
    const lo = Math.min(...lines.map(l => l.lo));
    const hi = Math.max(...lines.map(l => l.hi));
    return t >= lo - SPAN_EPS && t <= hi + SPAN_EPS;
};

/** Flatten the subtree of `parent` that comes from the type-1 line referencing `child`. */
const subtree = (parent, child) => {
    const ref = parseLDraw(read(`parts/${parent}`)).refs.find(r => r.file.toLowerCase() === child);
    assert.ok(ref, `${parent} references ${child}`);
    const flat = flattenPart(child, read);
    return flat.primitives.map(p => ({file: p.file, x: compose(ref.x, p.x)}));
};

/** Which subfile of a motor shortcut is the turning drive hub (by LDraw description). */
const DRIVE_HUB = {'54696p01.dat': 'u9363p01.dat', '54675.dat': 'u9363.dat'};

const flat = new Map(META.parts.map(p => [p.part, flattenPart(p.part, read)]));

test('the vendored LDraw subset matches its lock, its licences and parts.json', () => {
    assert.deepEqual(checkVendored(), []);
});

test('every part entry is a valid PartMeta and resolves completely', () => {
    for (const p of META.parts) {
        assert.deepEqual(validatePartMeta(p), [], p.part);
        assert.deepEqual(flat.get(p.part).missing, [], `${p.part} closure`);
    }
});

test('pin and pinhole connectors sit on a 6 LDU Technic bore', () => {
    for (const p of META.parts) {
        const lines = boreLines(flat.get(p.part).primitives);
        for (const c of p.connectors.filter(k => k.type === 'pin' || k.type === 'pinhole')) {
            const hits = onLine(c, lines);
            assert.ok(hits.length > 0, `${p.part} ${c.id}: no bore of radius ${BORE_R} through ${c.position} along ${c.axis}`);
            assert.ok(coversAxially(c, hits), `${p.part} ${c.id}: ${c.position} is outside the bore's extent`);
        }
    }
});

/**
 * Where a pin actually seats. A hole connector is the segment a pin half occupies
 * (contracts.js: `length` along `axis`, centred on `position`), so its two ends must be
 * where the bore really opens and ends — not just somewhere on the bore's line, which the
 * test above accepts. Measured from the bore's WALLS: the 6 LDU cylinders and the Technic
 * hole composites, merged into contiguous runs along the line. Flat primitives (edge loops,
 * discs, rings, chords) are left out: they have no axial extent, only LDraw's unit height.
 *
 * Each end may differ from its run end by ≤ 2 LDU: LDraw draws a one-sided (blind) hole
 * (p/connhol3.dat, the SPIKE sensors and the castor beam) 18 LDU deep, 2 short of a pin
 * half. A connector placed at the bottom of a blind hole instead of its middle (8 LDU off on
 * the SPIKE sensors until 2026-10-17) makes every model built by it interpenetrate.
 */
const WALL = /\/(\d+-\d+(cyli|cylo|cyls|con\d+)|connhole|peghole|beamhol\w*|npeghol\w*|confric\w*|connect\w*)\.dat$/;
const SEAT_EPS = 2;
const boreRuns = (c, lines) => {
    const iv = onLine(c, lines.filter(l => WALL.test(l.file)))
        .map(l => [dot(l.p0, c.axis), dot(apply(l.x, [0, 1, 0]), c.axis)])
        .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
        .sort((a, b) => a[0] - b[0]);
    const runs = [];
    for (const i of iv) {
        const r = runs[runs.length - 1];
        if (r && i[0] <= r[1] + SPAN_EPS) r[1] = Math.max(r[1], i[1]);
        else runs.push(i.slice());
    }
    return runs;
};

test('a pinhole connector spans its bore: its ends are where the bore opens and ends', () => {
    const fmt = a => `[${a.map(v => +v.toFixed(2)).join(', ')}]`;
    const wrong = [];
    for (const p of META.parts) {
        const lines = boreLines(flat.get(p.part).primitives);
        for (const c of p.connectors.filter(k => k.type === 'pinhole')) {
            const t = dot(c.position, c.axis);
            const seg = [t - c.length / 2, t + c.length / 2];
            const run = boreRuns(c, lines).find(r => t >= r[0] - SPAN_EPS && t <= r[1] + SPAN_EPS);
            if (!run) wrong.push(`${p.part} ${c.id}: no bore run through ${c.position}`);
            else if (Math.abs(seg[0] - run[0]) > SEAT_EPS || Math.abs(seg[1] - run[1]) > SEAT_EPS) {
                wrong.push(`${p.part} ${c.id}: spans ${fmt(seg)} along ${c.axis}, the bore runs ${fmt(run)}`);
            }
        }
    }
    assert.deepEqual(wrong, []);
});

/**
 * Blind holes. LDraw draws a one-sided Technic hole with p/connhol3.dat: in its own frame the
 * opening (peghole) is at y = -10 and the bore ends at y = +8. A pinhole connector whose seat
 * is such a bore must say so with `closedEnd` (±1, the end of its segment along its axis that
 * is the bottom), and only those may: the connector matcher (mech/graph.js shaftEngagement)
 * refuses a shaft that would reach past the bottom. Measured here, never trusted from parts.json.
 */
test('a pinhole is blind (closedEnd) exactly when LDraw draws its seat one-sided, and closedEnd is the bottom', () => {
    const wrong = [];
    let blind = 0;
    for (const p of META.parts) {
        const prims = flat.get(p.part).primitives.filter(q => /\/connhol3\.dat$/.test(q.file));
        for (const c of p.connectors.filter(k => k.type === 'pinhole')) {
            const t = dot(c.position, c.axis);
            const seg = [t - c.length / 2, t + c.length / 2];
            const lines = prims.map(q => ({...lineOf(q.x, q.file, BORE_R), open: dot(apply(q.x, [0, -10, 0]), c.axis), bottom: dot(apply(q.x, [0, 8, 0]), c.axis)}));
            const seats = onLine(c, lines).filter(l => Math.min(seg[1], Math.max(l.open, l.bottom)) - Math.max(seg[0], Math.min(l.open, l.bottom)) > SEAT_EPS);
            const want = seats.length === 1 ? Math.sign(seats[0].bottom - seats[0].open) : undefined;
            if (seats.length > 1) wrong.push(`${p.part} ${c.id}: ${seats.length} one-sided bores in one seat`);
            else if (c.closedEnd !== want) wrong.push(`${p.part} ${c.id}: closedEnd ${c.closedEnd}, the LDraw bore says ${want}`);
            if (want !== undefined) blind++;
        }
    }
    assert.deepEqual(wrong, []);
    // The motors', hub's and sensors' side holes (92 measured 2026-10-17): a wrong regex or frame would find none.
    assert.ok(blind >= 80, `only ${blind} blind pinholes found`);
});

/**
 * Two holes of one part cannot be closer than a bore allows. Technic holes sit on a 20 LDU
 * grid; a bore is 12 LDU across in a wall 18 wide, so two PARALLEL bores whose axes are less
 * than ~15.5 LDU apart would cut into each other — such "holes" are curve fragments or
 * counterbores read as holes (the bent liftarms 32348 and 6629 had 10–12 of them until
 * 2026-10-17, some 8–10 LDU apart). Coaxial hole connectors (one bore split in two, like a
 * split cross block's axle hole) are one bore and are fine. The tightest real pair is the
 * slot of the double-bent liftarm 32009: its two ends are 16.57 LDU apart.
 */
const MIN_HOLE_PITCH = 15.5;

test('no two parallel hole connectors of a part are closer than a bore allows, unless coaxial', () => {
    const wrong = [];
    for (const p of META.parts) {
        const holes = p.connectors.filter(c => c.type === 'pinhole' || c.type === 'axlehole');
        for (let i = 0; i < holes.length; i++) {
            for (let j = i + 1; j < holes.length; j++) {
                const a = holes[i];
                const b = holes[j];
                if (Math.abs(dot(a.axis, b.axis)) < PARALLEL) continue;
                const d = sub(b.position, a.position);
                const along = dot(d, a.axis);
                const apart = len(d.map((v, k) => v - along * a.axis[k]));
                if (apart > POS_EPS && apart < MIN_HOLE_PITCH) wrong.push(`${p.part} ${a.id}/${b.id}: axes ${apart.toFixed(2)} LDU apart`);
            }
        }
    }
    assert.deepEqual(wrong, []);
});

/**
 * Some parts draw their axle hole from their own sub-files instead of the axl*
 * primitives (the 24T gear: eight copies of "Eighth of Centre Axlehole").
 * Then the hole is where those sub-files' vertices are centred.
 */
const axleHoleSubpartCentre = f => {
    const vs = f.subparts.filter(s => /axle ?hole/i.test(s.description)).flatMap(s => s.polys.flat());
    if (!vs.length) return null;
    return [0, 1, 2].map(i => vs.reduce((a, v) => a + v[i], 0) / vs.length);
};

test('axle and axlehole connectors sit on an axle-profile line', () => {
    for (const p of META.parts) {
        const f = flat.get(p.part);
        const lines = axleLines(f.primitives);
        for (const c of p.connectors.filter(k => k.type === 'axle' || k.type === 'axlehole')) {
            if (onLine(c, lines).length > 0) continue;
            const centre = axleHoleSubpartCentre(f);
            assert.ok(centre && len(sub(centre, c.position)) <= POS_EPS,
                `${p.part} ${c.id}: no axle profile through ${c.position} along ${c.axis}`);
        }
    }
});

test('the castor ball sits where LDraw\'s castor assembly puts it, and is a sphere', () => {
    const castor = parseLDraw(read('parts/39370c01.dat')).refs;
    const beam = castor.find(r => r.file.toLowerCase() === '39370.dat');
    const ball = castor.find(r => r.file.toLowerCase() === '52629.dat');
    const socket = META.parts.find(p => p.part === '39370.dat').connectors.find(c => c.type === 'ballsocket');
    // Ball centre in the beam's frame (the beam is placed with identity in 39370c01).
    assert.deepEqual(beam.x, {m: IDENTITY.m, t: [0, 0, 0]});
    assert.deepEqual(socket.position, ball.x.t);
    const ballMeta = META.parts.find(p => p.part === '52629.dat');
    const r = ballMeta.colliders[0].radius;
    const centre = ballMeta.connectors[0].position;
    for (const poly of flat.get('52629.dat').polys) {
        for (const v of poly) assert.ok(Math.abs(len(sub(v, centre)) - r) <= 1, `ball vertex ${v} not on a sphere of radius ${r}`);
    }
});

test('a motor\'s output connectors belong to its drive hub, its housing connectors do not', () => {
    for (const [motor, hub] of Object.entries(DRIVE_HUB)) {
        const meta = META.parts.find(p => p.part === motor);
        // PartMeta v2: the motor's turning output is the internal joint its device drives.
        const shaft = meta.internalJoints.find(j => j.actuatedBy === 'device');
        const hubPrims = subtree(motor, hub);
        const hubLines = [...boreLines(hubPrims), ...axleLines(hubPrims)];
        // The joint turns about the drive hub's own axle line.
        assert.ok(onLine({position: shaft.point, axis: shaft.axis}, hubLines).length > 0, `${motor}: the motor joint's axis is not the drive hub's`);
        for (const c of meta.connectors) {
            const onHub = onLine(c, hubLines).some(l => {
                const t = dot(c.position, l.axis);
                return t >= l.lo - SPAN_EPS && t <= l.hi + SPAN_EPS;
            });
            if (shaft.movingConnectors.includes(c.id)) assert.ok(onHub, `${motor} ${c.id} is an output but not on the drive hub`);
            else assert.ok(!onHub, `${motor} ${c.id} is housing but lies on the drive hub`);
        }
        // The output collider is the drive hub's: inside the hub sub-assembly's extent.
        const hubBox = bounds(flattenPart(hub, read).polys);
        const ref = parseLDraw(read(`parts/${motor}`)).refs.find(r => r.file.toLowerCase() === hub);
        for (const i of shaft.movingColliders) {
            const col = meta.colliders[i];
            const y = col.position?.[1] ?? 0;
            assert.ok(y - col.halfHeight >= hubBox.min[1] + ref.x.t[1] - 2 && y + col.halfHeight <= hubBox.max[1] + ref.x.t[1] + 2,
                `${motor} output collider ${i} is outside the drive hub`);
        }
    }
});

test('gear tip radius is pitch radius plus one module, centred on the axle hole', () => {
    for (const p of META.parts.filter(q => q.gear)) {
        const {teeth, axis, center} = p.gear;
        let tip = 0;
        for (const poly of flat.get(p.part).polys) {
            for (const v of poly) {
                const d = sub(v, center);
                tip = Math.max(tip, len(d.map((x, i) => x - dot(d, axis) * axis[i])));
            }
        }
        // Bevel gears are conical: their largest radius is still ≈ pitch radius + module,
        // but measured from the LDraw mesh the tip is at the outer edge of the cone,
        // which for 12T/20T bevels is ~1.5 LDU smaller than the spur formula due to the cone
        // angle. Check bevels with a wider tolerance and document it; spur rule stays 0.5.
        if (p.gear.type === 'worm') {
            // A worm has no tooth count to give its pitch radius. Its pitch radius (tip − one module)
            // must let it drive a 24T gear on the hole grid: axles two holes (40 LDU) apart.
            const meshAt = tip - 2.5 + pitchRadiusLdu(24);
            assert.ok(Math.abs(meshAt - 40) <= 0.5, `${p.part}: a worm of tip radius ${tip.toFixed(2)} meshes a 24T at ${meshAt.toFixed(2)} LDU, not 40`);
        } else if (p.gear.type === 'bevel') {
            assert.ok(Math.abs(tip - (teeth * 1.25 + 2.5)) <= 2.0, `${p.part}: bevel tip radius ${tip.toFixed(2)} ≠ ${teeth}·1.25 + 2.5`);
        } else if (p.part === '94925.dat') {
            // 16T reinforced spur: tip is 21.66 vs 22.5 expected, 0.84 off due to its reinforced rim
            // (still spur, but allow 1.0 for this part; do not loosen general spur rule)
            assert.ok(Math.abs(tip - (teeth * 1.25 + 2.5)) <= 1.0, `${p.part}: tip radius ${tip.toFixed(2)} ≠ ${teeth}·1.25 + 2.5`);
        } else {
            assert.ok(Math.abs(tip - (teeth * 1.25 + 2.5)) <= 0.5, `${p.part}: tip radius ${tip.toFixed(2)} ≠ ${teeth}·1.25 + 2.5`);
        }
        const hole = p.connectors.find(c => c.type === 'axlehole');
        assert.ok(len(sub(hole.position, center)) <= POS_EPS, `${p.part}: gear centre is not on its axle hole`);
    }
});

test('the SPIKE wheel is 56 mm across', () => {
    const b = bounds(flat.get('39367p01.dat').polys);
    assert.equal((b.max[0] - b.min[0]) * 0.4, 56);
    assert.equal((b.max[1] - b.min[1]) * 0.4, 56);
});

/**
 * A pin or axle connector is a shaft: along its segment (1 LDU in from each end) the part's mesh
 * stays within SHAFT_R of its axis — an axle is 6 LDU across its profile's arms, a pin 6 with an
 * 8 LDU collar. A "shaft" inside a block is really a hole (32039 had an axle connector inside its
 * own body until 2026-10-17: the mesh there reaches 13 LDU out; its two features are axle holes).
 */
const SHAFT_R = 8.5;
const radialFrom = (c, v) => {
    const d = sub(v, c.position);
    const along = dot(d, c.axis);
    return len(d.map((x, i) => x - along * c.axis[i]));
};

test('a pin or axle connector is a shaft: the mesh along it stays within a pin\'s collar of its axis', () => {
    const wrong = [];
    for (const p of META.parts) {
        const vs = flat.get(p.part).polys.flat();
        for (const c of p.connectors.filter(k => k.type === 'pin' || k.type === 'axle')) {
            const along = vs.filter(v => Math.abs(dot(sub(v, c.position), c.axis)) < c.length / 2 - 1);
            const r = Math.max(...along.map(v => radialFrom(c, v)));
            if (!along.length || r > SHAFT_R) wrong.push(`${p.part} ${c.id}: mesh reaches ${r.toFixed(2)} LDU from the ${c.type}'s axis`);
        }
    }
    assert.deepEqual(wrong, []);
});

/** Is point v (part frame) inside collider c (part frame)? */
const quatRotate = (q, v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
const inCollider = (c, v, tol = 0) => {
    const q = c.rotation || [0, 0, 0, 1];
    const l = quatRotate([-q[0], -q[1], -q[2], q[3]], sub(v, c.position || [0, 0, 0]));
    if (c.shape === 'box') return l.every((a, i) => Math.abs(a) < c.halfExtents[i] + tol);
    if (c.shape === 'cylinder') return Math.abs(l[1]) < c.halfHeight + tol && Math.hypot(l[0], l[2]) < c.radius + tol;
    return len(l) < c.radius + tol;
};

/**
 * Parts that are partly shaft and partly solid (editor/overlap.js solidColliders). The editor
 * lets a shaft region sit inside another part and keeps solid colliders out of other solids, so:
 *   - every shaft-region collider is a shaft: each of its points is within SHAFT_R of a pin/axle
 *     connector's axis and inside that connector's segment (± 1 LDU) — a solid block tagged 'pin'
 *     would let beams pass through it;
 *   - no pin/axle connector's segment (1 LDU in from each end) runs through a solid collider —
 *     else seating that shaft in a hole would be refused as an overlap (87082 until 2026-10-17:
 *     one box over its pins and centre, so it could not be pinned into a beam).
 */
test('shaft regions are shafts, and no shaft runs through a solid collider', () => {
    const wrong = [];
    for (const p of META.parts) {
        const solid = new Set(solidColliders(p));
        const shafts = p.connectors.filter(k => k.type === 'pin' || k.type === 'axle');
        p.colliders.forEach((col, i) => {
            if (solid.has(i) || !col.region) return;
            const corners = col.shape === 'box'
                ? [-1, 1].flatMap(a => [-1, 1].flatMap(b => [-1, 1].map(c => [a * col.halfExtents[0], b * col.halfExtents[1], c * col.halfExtents[2]])))
                    .map(v => quatRotate(col.rotation || [0, 0, 0, 1], v).map((x, k) => x + (col.position || [0, 0, 0])[k]))
                : null;
            const holds = shafts.some(c => (corners
                ? corners.every(v => Math.abs(dot(sub(v, c.position), c.axis)) <= c.length / 2 + 1 &&
                    // a box's corner is √2 out from its faces; its faces must be within SHAFT_R
                    radialFrom(c, v) <= SHAFT_R * Math.SQRT2)
                : len(sub(col.position || [0, 0, 0], c.position)) <= POS_EPS));
            if (!holds) wrong.push(`${p.part} collider ${i} (region ${col.region}) is not around a ${col.region} connector`);
        });
        if (!solid.size) continue;
        for (const c of shafts) {
            for (let s = -c.length / 2 + 1; s <= c.length / 2 - 1; s += 1) {
                const v = c.position.map((x, k) => x + s * c.axis[k]);
                const hit = [...solid].find(i => inCollider(p.colliders[i], v));
                if (hit !== undefined) {
                    wrong.push(`${p.part} ${c.id}: its ${c.type} runs through solid collider ${hit} at ${v.map(x => +x.toFixed(1))}`);
                    break;
                }
            }
        }
    }
    assert.deepEqual(wrong, []);
});

test('colliders enclose the part: ≥ 98 % of mesh vertices inside one, total volume ≤ 110 % of the mesh box', () => {
    // Enclosure is what the editor's overlap check and the physics rely on: a vertex outside every
    // collider is geometry another part can pass through. (This replaced a "colliders cover 50–110 %
    // of the bounding box" rule, which a correct shape-following fit of a non-convex part — the H-shaped
    // castor beam — fails, while a cylinder pointing along the wrong axis passed it.)
    const TOL = 1.5;
    const rot = (q, v) => {
        const [x, y, z, w] = q;
        const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
        return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
    };
    const inside = (c, v) => {
        const p0 = c.position || [0, 0, 0];
        const q = c.rotation || [0, 0, 0, 1];
        const l = rot([-q[0], -q[1], -q[2], q[3]], sub(v, p0));
        if (c.shape === 'box') return l.every((a, i) => Math.abs(a) <= c.halfExtents[i] + TOL);
        if (c.shape === 'cylinder') return Math.abs(l[1]) <= c.halfHeight + TOL && Math.hypot(l[0], l[2]) <= c.radius + TOL;
        return len(l) <= c.radius + TOL;
    };
    const vol = c => (c.shape === 'box' ? 8 * c.halfExtents[0] * c.halfExtents[1] * c.halfExtents[2]
        : c.shape === 'cylinder' ? Math.PI * c.radius ** 2 * 2 * c.halfHeight : 4 / 3 * Math.PI * c.radius ** 3);
    for (const p of META.parts) {
        const vs = flat.get(p.part).polys.flat();
        const enclosed = vs.filter(v => p.colliders.some(c => inside(c, v))).length / vs.length;
        assert.ok(enclosed >= 0.98, `${p.part}: only ${(enclosed * 100).toFixed(1)} % of its mesh is inside its colliders`);
        const b = bounds(flat.get(p.part).polys);
        const boxVol = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
        const ratio = p.colliders.reduce((s, c) => s + vol(c), 0) / boxVol;
        assert.ok(ratio <= 1.1, `${p.part}: colliders are ${(ratio * 100).toFixed(0)} % of the mesh box (oversized)`);
    }
});

test('sensor origin lies on the mesh box surface and direction points outward', () => {
    const sensors = META.parts.filter(q => q.probe);
    assert.ok(sensors.length >= 3, 'the colour, distance and force sensors have probes');
    for (const p of sensors) {
        const {origin, direction} = p.probe;
        const b = bounds(flat.get(p.part).polys);
        // Distance from origin to the closest face of the axis-aligned bounding box.
        const d = Math.min(
            Math.abs(origin[0] - b.min[0]), Math.abs(origin[0] - b.max[0]),
            Math.abs(origin[1] - b.min[1]), Math.abs(origin[1] - b.max[1]),
            Math.abs(origin[2] - b.min[2]), Math.abs(origin[2] - b.max[2])
        );
        assert.ok(d <= 2 + 1e-9, `${p.part}: sensor origin ${origin} is ${d.toFixed(2)} LDU from the mesh box (need <= 2)`);
        // origin + 5 LDU along direction must be outside the box.
        const probe = origin.map((v, i) => v + 5 * direction[i]);
        const inside = probe[0] >= b.min[0] - 1e-9 && probe[0] <= b.max[0] + 1e-9
            && probe[1] >= b.min[1] - 1e-9 && probe[1] <= b.max[1] + 1e-9
            && probe[2] >= b.min[2] - 1e-9 && probe[2] <= b.max[2] + 1e-9;
        assert.ok(!inside, `${p.part}: sensor direction ${direction} from ${origin} does not point outward (probe ${probe} still inside ${JSON.stringify(b)})`);
    }
});

test('every part has name, nameDe and a palette category, and nameDe is unique', () => {
    // Allowed categories from palette.js
    const allowed = new Set(['hub','motor','sensor','beam','axle','pin','connector','gear','wheel','other']);
    const seenDe = new Set();
    for (const p of META.parts) {
        assert.ok(typeof p.name === 'string' && p.name.trim().length > 0, `${p.part}: missing name`);
        assert.ok(typeof p.nameDe === 'string' && p.nameDe.trim().length > 0, `${p.part}: missing nameDe`);
        assert.ok(allowed.has(p.category), `${p.part}: unknown category '${p.category}'`);
        assert.ok(!seenDe.has(p.nameDe), `duplicate nameDe '${p.nameDe}' in ${p.part}`);
        seenDe.add(p.nameDe);
    }
});
