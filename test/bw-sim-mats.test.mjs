// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Mats for the Sim Lab (E1, data half) — floor mats the colour sensor can read.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MATS, createMat, ovalCentreAt, distanceToOvalCentre} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';

test('1. each mat colorAt at chosen points', () => {
    const plain = createMat('plain');
    assert.equal(plain.colorAt(0, 0).color, 10);
    assert.equal(plain.colorAt(10, 10).color, 10); // outside

    const lineOval = createMat('line-oval');
    assert.equal(lineOval.colorAt(0, 0.25).color, 0, 'centre line at start');
    assert.equal(lineOval.colorAt(0.2, -0.25).color, 0, 'on the bottom straight');
    assert.equal(lineOval.colorAt(0.55, 0).color, 0, 'on the right semicircle');
    assert.equal(lineOval.colorAt(0, 0).color, 10, 'inside the oval is white');
    assert.equal(lineOval.colorAt(0, 0.27).color, 10, '20 mm across the line is white');
    assert.equal(lineOval.colorAt(0, 0.25).reflection, 5, 'black reflects ~5 %');

    const colourZones = createMat('colour-zones');
    assert.equal(colourZones.colorAt(-0.35, -0.35).color, 9, 'red square');
    assert.equal(colourZones.colorAt(0.35, -0.35).color, 7, 'yellow');
    assert.equal(colourZones.colorAt(-0.35, 0.35).color, 6, 'green');
    assert.equal(colourZones.colorAt(0.35, 0.35).color, 3, 'blue');
    assert.equal(colourZones.colorAt(0, 0).color, 10, 'centre white');
    assert.equal(colourZones.colorAt(0.49, 0).color, 0, 'border');
    assert.equal(colourZones.colorAt(10, 10).color, 10, 'outside');
});

test('2. line-oval centre line in 100 steps black, ±20mm white', () => {
    const mat = createMat('line-oval');
    // The stadium's length from its own shape: two straights of 2·0.3 m, two semicircles of radius 0.25 m.
    const L = 4 * 0.3 + 2 * Math.PI * 0.25;
    assert.ok(Math.abs(mat.centreLineLengthM - L) < 1e-12);
    for (let i = 0; i < 100; i++) {
        const [x, z] = ovalCentreAt(L * i / 100);
        assert.equal(mat.colorAt(x, z).color, 0, `centre line at step ${i} (${x.toFixed(3)}, ${z.toFixed(3)}) is black`);
        assert.ok(distanceToOvalCentre(x, z) < 1e-9, `step ${i} lies on the centre line`);
        // 20 mm across the line, either side: white. The normal is radial on the arcs, z on the straights.
        const onArc = Math.abs(x) > 0.3;
        const cx = onArc ? Math.sign(x) * 0.3 : x;
        const n = onArc ? [x - cx, z].map(v => v / Math.hypot(x - cx, z)) : [0, Math.sign(z)];
        for (const sgn of [1, -1]) {
            assert.equal(mat.colorAt(x + sgn * 0.02 * n[0], z + sgn * 0.02 * n[1]).color, 10, `20 mm off the line at step ${i}`);
        }
    }
    assert.ok(Math.hypot(...ovalCentreAt(L).map((v, k) => v - ovalCentreAt(0)[k])) < 1e-9, 'the path closes');
});

test('3. paint agrees with colorAt at 200 random points', () => {
    const pxPerM = 100;
    for (const matId of ['plain', 'line-oval', 'colour-zones', 'wall']) {
        const mat = createMat(matId);
        const [w, d] = mat.sizeM;
        const width = Math.round(w * pxPerM) + 40; // extra for outside
        const height = Math.round(d * pxPerM) + 40;
        const imageData = {width, height, data: new Uint8ClampedArray(width * height * 4)};
        mat.paint(imageData, pxPerM);
        // Seeded PRNG
        let seed = 12345;
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        for (let i = 0; i < 200; i++) {
            const x = (rand() - 0.5) * (w + 0.4);
            const z = (rand() - 0.5) * (d + 0.4);
            const c1 = mat.colorAt(x, z);
            const px = Math.round(x * pxPerM + width / 2 - 0.5);
            const py = Math.round(z * pxPerM + height / 2 - 0.5);
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const idx = (py * width + px) * 4;
            const r = imageData.data[idx] * 4;
            const g = imageData.data[idx + 1] * 4;
            const b = imageData.data[idx + 2] * 4;
            // Allow one pixel edge allowance: if the point is within 1px of an edge, the colours may differ due to rasterisation
            // For now, just check that the colours match when not near an edge
            const isNearEdge = (x, z) => {
                // For line-oval, check distance to centre line within 10mm + 1px
                // For colour-zones, check distance to square/border edges
                return false; // simplified, we will just check exact match and allow 1px error by checking neighbouring pixels
            };
            if (Math.abs(r - c1.rgb[0]) > 10 || Math.abs(g - c1.rgb[1]) > 10 || Math.abs(b - c1.rgb[2]) > 10) {
                // Check neighbouring pixels for edge allowance
                let found = false;
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                    const nx = px + dx, ny = py + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const nIdx = (ny * width + nx) * 4;
                    const nr = imageData.data[nIdx] * 4, ng = imageData.data[nIdx + 1] * 4, nb = imageData.data[nIdx + 2] * 4;
                    if (Math.abs(nr - c1.rgb[0]) <= 10 && Math.abs(ng - c1.rgb[1]) <= 10 && Math.abs(nb - c1.rgb[2]) <= 10) found = true;
                }
                assert.ok(found, `paint vs colorAt mismatch at ${x.toFixed(3)},${z.toFixed(3)} for ${matId}: paint ${r},${g},${b} vs colorAt ${c1.rgb}`);
            }
        }
    }
});

test('4. start pose on line and heading follows line', () => {
    const mat = createMat('line-oval');
    const {x, z, heading} = mat.startPose;
    assert.equal(mat.colorAt(x, z).color, 0, 'the start pose is on the line');
    const h = heading * Math.PI / 180;
    // 5 cm ahead along the heading (degrees from +x toward +z) is still on the line.
    assert.equal(mat.colorAt(x + 0.05 * Math.cos(h), z + 0.05 * Math.sin(h)).color, 0);
    assert.deepEqual(ovalCentreAt(0), [x, z], 'arc length 0 is the start pose');
});
