// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Shock absorbers (kinds/shock.js, architecture M17): LDraw's 9L shock absorber assembled as
// 74741-f1 (extended) has its rod (2910) 120 LDU below the cylinder (2909); here it stands upside
// down, the rod on top, the cylinder clamped. The compiler makes the rod slide in the cylinder
// within the 40 LDU stroke, with a spring that pushes it out; the Jolt core holds a weight on it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const HZ = 1000 / STEP_MS;
const FLIP = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const LDU_M = 0.0004;

/** The shock upside down, `inLdu` pushed in from fully out. */
const shock = (inLdu = 0) => ({version: 1, parts: [
    {id: 'cyl', part: '2909.dat', position: [0, -50, 0], rotation: FLIP},
    {id: 'rod', part: '2910.dat', position: [0, -170 + inLdu, 0], rotation: FLIP}]});

test('the rod slides in the cylinder over the 40 LDU stroke, with a spring that rests fully out', () => {
    for (const inLdu of [0, 15]) {
        const mech = compile(shock(inLdu), CATALOG, {version: 2});
        const sliders = mech.joints.filter(j => j.type === 'slider');
        assert.equal(sliders.length, 1, JSON.stringify(mech.joints));
        const [j] = sliders;
        assert.ok(Math.abs((j.limits[1] - j.limits[0]) / LDU_M - 40) < 1e-6, `the stroke: ${j.limits.map(x => x / LDU_M)} LDU`);
        assert.ok(j.spring && j.spring.stiffness === 150, JSON.stringify(j.spring));
        // Where it rests: fully out, `inLdu` from the model's pose, at one end of the travel.
        assert.ok(Math.abs(Math.abs(j.spring.restM) / LDU_M - inLdu) < 1e-6, `rest ${j.spring.restM / LDU_M} LDU`);
        assert.ok(j.limits.some(x => Math.abs(x - j.spring.restM) < 1e-9), 'the rest is the extended end');
    }
    // The editor: the rod in its cylinder is no collision.
    const m = shock();
    for (const p of m.parts) assert.deepEqual(solidOverlaps(m, CATALOG, p), [], p.id);
});

test('a weight on the rod compresses the spring by mg/k and no further than the stroke', async () => {
    const J = await loadJolt();
    for (const [kg, expectMm] of [[0.15, 0.15 * 9.81 / 150 * 1000], [1, 40 * 0.4]]) {
        const mech = compile(shock(), CATALOG, {version: 2});
        const cyl = mech.bodies.find(b => b.parts.includes('cyl'));
        const rod = mech.bodies.find(b => b.parts.includes('rod'));
        cyl.motion = 'static';
        rod.massKg = kg;
        for (const c of rod.colliders) if (c.massKg) c.massKg = kg / rod.colliders.length;
        const j = mech.joints.find(x => x.type === 'slider');
        const core = createPhysicsCore(J, mech, {stepHz: HZ});
        const y0 = core.bodyPose(rod.id).position[1];
        for (let i = 0; i < 3 * HZ; i++) core.step(1 / HZ);
        const sank = (y0 - core.bodyPose(rod.id).position[1]) * 1000;
        core.destroy();
        assert.ok(Math.abs(sank - expectMm) <= Math.max(0.6, expectMm * 0.12),
            `${kg} kg: the rod sank ${sank.toFixed(2)} mm, expected ${expectMm.toFixed(2)} (${kg === 1 ? 'bottomed out at the stroke' : 'mg/k'}; joint ${j.id})`);
    }
});
