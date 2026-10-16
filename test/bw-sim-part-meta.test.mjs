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
 *   - colliders cover 50–110 % of the mesh bounding box (50 %, not the plan's
 *     60 %: a perfect sphere fills π/6 ≈ 52 % of its box).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {flattenPart, circularFeatures, bounds, parseLDraw, compose, apply, column, IDENTITY} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {validatePartMeta} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {check as checkVendored} from '../scripts/sync-ldraw-parts.mjs';

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
    return {file, axis, p0, lo: Math.min(dot(p0, axis), dot(p1, axis)), hi: Math.max(dot(p0, axis), dot(p1, axis)), radius};
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
const DRIVE_HUB = {'54696p01.dat': 'u9363p01.dat'};

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
        const hubPrims = subtree(motor, hub);
        const hubLines = [...boreLines(hubPrims), ...axleLines(hubPrims)];
        for (const c of meta.connectors) {
            const onHub = onLine(c, hubLines).some(l => {
                const t = dot(c.position, l.axis);
                return t >= l.lo - SPAN_EPS && t <= l.hi + SPAN_EPS;
            });
            if (meta.motor.output.includes(c.id)) assert.ok(onHub, `${motor} ${c.id} is an output but not on the drive hub`);
            else assert.ok(!onHub, `${motor} ${c.id} is housing but lies on the drive hub`);
        }
        // The output collider is the drive hub's: inside the hub sub-assembly's extent.
        const hubBox = bounds(flattenPart(hub, read).polys);
        const ref = parseLDraw(read(`parts/${motor}`)).refs.find(r => r.file.toLowerCase() === hub);
        for (const i of meta.motor.outputColliders) {
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
        assert.ok(Math.abs(tip - (teeth * 1.25 + 2.5)) <= 0.5, `${p.part}: tip radius ${tip.toFixed(2)} ≠ ${teeth}·1.25 + 2.5`);
        const hole = p.connectors.find(c => c.type === 'axlehole');
        assert.ok(len(sub(hole.position, center)) <= POS_EPS, `${p.part}: gear centre is not on its axle hole`);
    }
});

test('the SPIKE wheel is 56 mm across', () => {
    const b = bounds(flat.get('39367p01.dat').polys);
    assert.equal((b.max[0] - b.min[0]) * 0.4, 56);
    assert.equal((b.max[1] - b.min[1]) * 0.4, 56);
});

test('colliders cover 50–110 % of the mesh box', () => {
    const vol = c => (c.shape === 'box' ? 8 * c.halfExtents[0] * c.halfExtents[1] * c.halfExtents[2]
        : c.shape === 'cylinder' ? Math.PI * c.radius ** 2 * 2 * c.halfHeight : 4 / 3 * Math.PI * c.radius ** 3);
    for (const p of META.parts) {
        const b = bounds(flat.get(p.part).polys);
        const boxVol = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
        const ratio = p.colliders.reduce((s, c) => s + vol(c), 0) / boxVol;
        assert.ok(ratio >= 0.5 && ratio <= 1.1, `${p.part}: colliders cover ${(ratio * 100).toFixed(0)} % of the mesh box`);
    }
});
