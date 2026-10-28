// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deriveBoxes, conservativeInterval} from '../scripts/lib/derive-mesh-colliders.mjs';
import {applyMeshColliders} from '../scripts/lib/apply-mesh-colliders.mjs';
import {surfaceArea, uncovered} from './helpers/mesh-collider-coverage.mjs';

const triangle = '3 16 -1 -2 0 1 -2 0 0 2 0\n';
const island = '3 16 -0.01 -0.01 0 0.01 -0.01 0 0 0.01 0\n';
const read = name => name.endsWith('fixture.dat') ? triangle + island : undefined;
const entry = {boxes: [{what: 'crossing', ranges: {y: [-0.5, 0.5]}}]};
const contains = (b, p) => p.every((x, i) => x >= b.position[i] - b.halfExtents[i] && x <= b.position[i] + b.halfExtents[i]);

test('cross-slab triangle has hand-derived rational bounds even with an interior island', () => {
    const [b] = deriveBoxes('fixture.dat', entry, read);
    // From x = ±(2-y)/4: at y=-1/2, x=±5/8; at y=1/2, x=±3/8.
    for (const p of [[-5 / 8, -1 / 2, 0], [5 / 8, -1 / 2, 0], [-3 / 8, 1 / 2, 0], [3 / 8, 1 / 2, 0]]) assert.ok(contains(b, p));
    assert.ok(b.halfExtents[0] < 0.626);
    assert.ok(b.halfExtents[1] < 0.501);
});

test('open boundaries exclude coplanar flange faces but retain crossing limits', () => {
    const flange = '3 16 -20 -0.5 0 20 -0.5 0 0 -0.5 20\n';
    const [b] = deriveBoxes('fixture.dat', {boxes: [{...entry.boxes[0], open: true}]}, () => triangle + flange);
    assert.ok(contains(b, [5 / 8, -1 / 2, 0]));
    assert.ok(b.halfExtents[0] < 0.626, 'coplanar flange belongs to the neighboring feature');
});

test('clipping honors every axis and recursive nonidentity LDraw transforms', () => {
    const files = {'fixture.dat': '1 16 3 4 5 0 -2 0 2 0 0 0 0 1 child.dat\n', 'child.dat': triangle};
    const region = {boxes: [{what: 'rotated triangle', ranges: {x: [2, 4], y: [3, 5]}}]};
    const [b] = deriveBoxes('fixture.dat', region, name => files[name.replace(/^(parts|p)\//, '')]);
    // x'=3-2y, y'=4+2x, z'=5. The section contains these exact transformed edge points.
    for (const p of [[2, 3.25, 5], [2, 4.75, 5], [4, 3, 5], [4, 5, 5]]) assert.ok(contains(b, p));
    assert.ok(b.halfExtents[0] <= 1.0002 && b.halfExtents[1] <= 1.0002);
});

test('missing subfiles and invalid ranges refuse rather than invent bounds', () => {
    assert.throws(() => deriveBoxes('fixture.dat', entry, name => name.endsWith('fixture.dat') ? '1 16 0 0 0 1 0 0 0 1 0 0 0 1 absent.dat\n' : undefined), /missing/);
    assert.throws(() => deriveBoxes('fixture.dat', {boxes: [{what: 'invalid', ranges: {q: [0, 1]}}]}, read), /invalid ranges/);
});

test('quantization covers both rational endpoints, including the nearest-rounding counterexample', () => {
    for (const [lo, hi] of [[-4 / 1000, 16 / 1000], [-1 / 3, 2 / 3], [1e-8, 2e-8], [-27.5, -25]]) {
        const [c, h] = conservativeInterval(lo, hi);
        assert.ok(c - h <= lo && c + h >= hi);
        assert.ok(lo - (c - h) < 0.001 && c + h - hi < 0.001);
        assert.ok(Number.isFinite(h) && h > 0);
    }
    // The old independently rounded centre/half-width misses the negative endpoint.
    assert.ok(Math.round(0.006 * 100) / 100 - Math.round(0.01 * 100) / 100 > -0.004);
    assert.throws(() => conservativeInterval(0, Infinity), /invalid/);
    assert.throws(() => conservativeInterval(1e308, 1.1e308), /unrepresentable/);
});

test('guarded generation accepts only whole original, published or generated lists and repeats identically', () => {
    const old = {shape: 'box', halfExtents: [3, 3, 3], position: [0, 0, 0]};
    const published = {shape: 'box', halfExtents: [2, 2, 2], position: [0, 0, 0]};
    const unchanged = {shape: 'box', halfExtents: [1, 1, 1], position: [10, 10, 10]};
    const defs = {'fixture.dat': {...entry, replaces: 1, previousDerivedCount: 1, replaced: old, previousColliders: [unchanged, published]}};
    for (const colliders of [[unchanged, old], [unchanged, published]]) {
        const doc = {parts: [{part: 'other.dat', colliders: [old]}, {part: 'fixture.dat', colliders}]};
        applyMeshColliders(doc, defs, read);
        const once = JSON.stringify(doc);
        applyMeshColliders(doc, defs, read);
        assert.equal(JSON.stringify(doc), once);
        assert.deepEqual(doc.parts[0].colliders, [old]);
        assert.deepEqual(doc.parts[1].colliders[0], unchanged);
    }
    const corrupt = {parts: [{part: 'fixture.dat', colliders: [old, published]}]};
    const before = JSON.stringify(corrupt);
    assert.throws(() => applyMeshColliders(corrupt, defs, read), /neither exact/);
    assert.equal(JSON.stringify(corrupt), before);
});

test('the real tapered-shoulder witness is outside the old union, inside the declared corrected shoulder', () => {
    // Hand-derived midpoint of the source shoulder edge at y=-26.25, radius=11.25.
    const p = [-11.25, -26.25, 0];
    const old = [
        {shape: 'box', position: [0, -72, 0], halfExtents: [7, 35, 10]},
        {shape: 'box', position: [0, -33.5, 0], halfExtents: [10, 3.5, 10]},
        {shape: 'box', position: [0, -28.75, 0], halfExtents: [12.5, 1.25, 12.5]},
        {shape: 'box', position: [0, -8.75, 0], halfExtents: [10, 18.75, 10]}
    ];
    assert.ok(!old.some(b => contains(b, p)));
    // Literal source shoulder quad; no producer flattening as the expected-bound oracle.
    const source = '4 16 -10 -25 0 -9.239 -25 -3.827 -11.54875 -27.5 -4.78375 -12.5 -27.5 0\n';
    const face = [[-10, -25, 0], [-9.239, -25, -3.827], [-11.54875, -27.5, -4.78375], [-12.5, -27.5, 0]];
    assert.ok(uncovered(face, old).reduce((a, f) => a + surfaceArea(f), 0) > 1, 'independent reader detects positive-area old omission');
    const [b] = deriveBoxes('fixture.dat', {boxes: [{what: 'shoulder', ranges: {y: [-27.5, -25]}, open: true}]}, () => source);
    assert.ok(contains(b, p));
    assert.ok(uncovered(face, [b]).reduce((a, f) => a + surfaceArea(f), 0) < 1e-8);
});
