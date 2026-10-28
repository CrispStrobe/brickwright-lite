// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
//
// Colliders that are derived from the part's own mesh (docs/data/part-collider-derivations.json)
// stay exactly as derived, and each box hugs real mesh: it is no wider than the vertices in its
// stretch. Each replaced box reached at least 2 LDU past the mesh somewhere.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {deriveBoxes} from '../scripts/lib/derive-mesh-colliders.mjs';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';

const root = new URL('../', import.meta.url);
const lib = new URL('overlay/scratch-gui/static/ldraw/', root);
const read = p => { const u = new URL(p.toLowerCase(), lib); return existsSync(u) ? readFileSync(u, 'latin1') : undefined; };
const meta = JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root), 'utf8'));
const {parts} = JSON.parse(readFileSync(new URL('docs/data/part-collider-derivations.json', root), 'utf8'));

/** Largest amount (LDU) by which a box reaches past the mesh vertices lying inside its own span, across its section. */
const overhang = (part, box) => {
    const points = flattenPart(part, read).polys.flat();
    const lo = box.position.map((c, i) => c - box.halfExtents[i]);
    const hi = box.position.map((c, i) => c + box.halfExtents[i]);
    let worst = 0;
    for (let axis = 0; axis < 3; axis++) {
        const inSpan = points.filter(v => v[axis] >= lo[axis] && v[axis] <= hi[axis]);
        if (!inSpan.length) continue;
        for (const i of [0, 1, 2].filter(i => i !== axis)) {
            worst = Math.max(worst, Math.min(...inSpan.map(v => v[i])) - lo[i], hi[i] - Math.max(...inSpan.map(v => v[i])));
        }
    }
    return worst;
};

test('mesh-derived colliders in parts.json are exactly the derived boxes', () => {
    assert.ok(Object.keys(parts).length >= 3);
    for (const [part, entry] of Object.entries(parts)) {
        const p = meta.parts.find(m => m.part === part);
        assert.ok(p, part);
        const boxes = deriveBoxes(part, entry, read);
        const at = entry.replaces ?? 0;
        assert.deepEqual(p.colliders.slice(at, at + boxes.length), boxes, `${part}: derived boxes`);
        if (entry.replaces === undefined) assert.equal(p.colliders.length, boxes.length, `${part}: the whole list is derived`);
        assert.ok(!p.colliders.some(c => JSON.stringify(c) === JSON.stringify(entry.replaced)), `${part}: the old box is gone`);
    }
});

test('each derived box hugs the mesh, and each box it replaced reached past it', () => {
    for (const [part, entry] of Object.entries(parts)) {
        for (const box of deriveBoxes(part, entry, read)) assert.ok(overhang(part, box) < 0.01, `${part}: ${JSON.stringify(box)} hugs the mesh`);
        // Where the old box covered a derived box's stretch, its section reached past that box (which hugs the mesh).
        const old = entry.replaced, lo = b => b.position.map((c, i) => c - b.halfExtents[i]), hi = b => b.position.map((c, i) => c + b.halfExtents[i]);
        const span = 'xyz'.indexOf(Object.keys(entry.boxes[0].ranges)[0]);
        const past = Math.max(...deriveBoxes(part, entry, read).map(b => Math.max(...[0, 1, 2].filter(i => i !== span).map(i => Math.max(lo(b)[i] - lo(old)[i], hi(old)[i] - hi(b)[i])))));
        assert.ok(past >= 2, `${part}: the replaced box reached ${past.toFixed(2)} LDU past the mesh`);
    }
});
