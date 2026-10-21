// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Drawing robot's example (static/sim-lab/programs/drawing-robot.bw) draws a square: four times 20 cm and a
 * quarter turn. Its corners are judged on the physics, not on the hub's gyro: the hub body's heading before and after
 * each corner. A turn stopped the moment the yaw passes 88° at full turning speed went on to 95° (the program sees
 * the yaw once a frame, then the robot brakes), and the square did not close; the program turns quickly to 70° and
 * slowly to 89°.
 *
 * The judge is shown able to fail: the one-speed turn's corners are outside the tolerance.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE} = await import(path.join(SIM, 'sim-session.js'));
const ENTRY = MODELS.find(m => m.file === 'drawing-robot.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
const BUDGET_MS = 16000;
const TOL_DEG = 2;

/** The heading (degrees, about world y, unwrapped) of a quaternion [x, y, z, w]'s x axis. */
const headings = qs => {
    let prev = null;
    return qs.map(([x, y, z, w]) => {
        let a = Math.atan2(-2 * (x * z - w * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI;
        if (prev !== null) { while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; }
        prev = a;
        return a;
    });
};

/** Each turn: the heading change between two stretches where it holds within 2°/s for 150 ms. */
const cornersOf = (track, hubId) => {
    const t = track.map(p => p.t);
    const h = headings(track.map(p => p.bodies[hubId].rotation));
    const plateaus = [];
    for (let i = 5; i < h.length; i++) {
        const k = t.findIndex(x => x >= t[i] - 150);
        if (k < 0 || Math.abs(h[i] - h[k]) / ((t[i] - t[k]) / 1000 || 1) >= 2) continue;
        if (!plateaus.length || Math.abs(h[i] - plateaus.at(-1)) > 20) plateaus.push(h[i]);
        else plateaus[plateaus.length - 1] = h[i];
    }
    return plateaus.slice(1).map((a, i) => Math.abs(a - plateaus[i]));
};

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: BUDGET_MS});

    test('the Drawing robot turns four quarter turns of 90° within 2°, and its square closes', async t => {
        const result = await run(PROGRAM);
        assert.deepEqual(result.run.unsupported, []);
        const corners = cornersOf(result.track, result.hubId);
        t.diagnostic(`corners ${corners.map(c => c.toFixed(1)).join(', ')}°`);
        assert.equal(corners.length, 4, `four corners: ${corners}`);
        for (const c of corners) assert.ok(Math.abs(c - 90) <= TOL_DEG, `a corner of ${c.toFixed(1)}°`);
        const total = corners.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(total - 360) <= 2 * TOL_DEG, `the square turns ${total.toFixed(1)}° in all`);
    });

    test('the judge can fail: stopping at once from full turning speed overshoots every corner', async t => {
        const oneSpeed = PROGRAM.replace(/    wait until \(spike angle yaw\) > 70\n    start tank 5 -5\n    wait until \(spike angle yaw\) > 89\n/,
            '    wait until (spike angle yaw) > 88\n');
        assert.notEqual(oneSpeed, PROGRAM, 'the program has the two-speed turn');
        const result = await run(oneSpeed);
        const corners = cornersOf(result.track, result.hubId);
        t.diagnostic(`one-speed corners ${corners.map(c => c.toFixed(1)).join(', ')}°`);
        assert.ok(corners.some(c => Math.abs(c - 90) > TOL_DEG), `the one-speed corners ${corners}`);
    });
}
