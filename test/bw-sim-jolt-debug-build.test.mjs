// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The physics core on Jolt's DEBUG build (jolt-physics/debug-wasm-compat), which asserts where the release
// build goes on silently. Two misuses of the bindings were found this way (2026-10-20): J.destroy on the
// static temporary a by-value return hands back — StaticCompoundShapeSettings.Create()'s ShapeResult (every
// body of several colliders) and GetSurfaceNormal's Vec3 (every sensor ray that hit). The release build freed
// memory never allocated and went on with a damaged heap; the debug build aborts. Bundled models with
// compound bodies, motors and sensor rays are built, stepped, cast against and destroyed here.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS_BASE, prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {createPhysicsCore} = await import(path.join(SIM, 'physics/jolt-core.js'));
const require = createRequire(path.join(REPO, 'packages/scratch-gui/package.json'));
const debugBuild = await import(require.resolve('jolt-physics/debug-wasm-compat'));
const J = await (debugBuild.default || debugBuild)();
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));

for (const file of ['forklift.ldr', 'colour-explorer.ldr', 'excavator.ldr']) {
    test(`${file} builds, runs, casts rays and is destroyed on the debug Jolt build without an abort`, () => {
        const {mechanism} = prepareModel(readFileSync(path.join(GUI, MODELS_BASE, file), 'utf8'), CATALOG);
        assert.ok(mechanism, `${file} compiles`);
        assert.ok(mechanism.bodies.some(b => b.colliders.length > 1), 'a compound body is built (its shape result is released)');
        const core = createPhysicsCore(J, mechanism, {stepHz: 200});
        for (const j of mechanism.joints.filter(x => x.motor)) core.setMotor(j.id, {mode: 'velocity', radPerSec: 3});
        for (let i = 0; i < 100; i++) core.step(1 / 200);
        // A ray straight down onto the model hits something and has a unit normal (GetSurfaceNormal's result).
        const hit = core.castRay([0, 1, 0], [0, -1, 0], 2);
        assert.ok(hit, 'the ray hits the model or the floor');
        assert.ok(Math.abs(Math.hypot(...hit.normal) - 1) < 1e-6, `unit normal ${hit.normal}`);
        for (const b of mechanism.bodies.filter(x => x.motion === 'dynamic')) {
            assert.ok(core.bodyPose(b.id).position.every(Number.isFinite), `${b.id} has a finite pose`);
        }
        core.destroy();
    });
}
