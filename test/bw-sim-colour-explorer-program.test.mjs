// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's Colour explorer example, run for real: the DEVICE SPIKE text
 * the pane's "Load example program" puts into the Code tab
 * (static/sim-lab/programs/colour-explorer.bw) runs through the real Scratch
 * VM, the spikeprime extension and the virtual hub (test/helpers/sim-lab-vm.mjs)
 * on the shipped Colour explorer model, placed on the Colour Zones mat as the
 * pane places it. Nothing here commands a motor: the program turns until the
 * hub's yaw says it faces the red corner, then drives until the colour
 * sensor's ray sees red on the mat.
 *
 * The model first: the S1 driving base plus a colour sensor looking down,
 * centred ahead of the drive axle, held by real connections (a beam pinned
 * across the hub's front holes, the sensor on two 3L pins through it). No two
 * solid parts overlap (editor/overlap.js's solidOverlaps), and the compiler
 * puts the sensor in the hub's body.
 *
 * The outcome is judged on geometry alone: the red square is where the mat's
 * documentation puts it (centre (-0.35, -0.35), 0.30 m wide, written out here,
 * not read from the mat code), and at rest both the drive-axle midpoint and
 * the colour sensor's spot must be inside it.
 *
 * The judge is shown able to fail: the same program waiting for blue (which
 * is not on its way) drives through the red square and on.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, hubBodyOf, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {parseModel} = await import(path.join(SIM, 'model/ldraw-model.js'));
const {solidOverlaps} = await import(path.join(SIM, 'editor/overlap.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'colour-explorer.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
const BUDGET_MS = 20000;
/** docs/SIM-LAB.md: the red square, 0.3 m, centred at (-0.35, -0.35). */
const RED = {x: -0.35, z: -0.35, half: 0.15};
const inRed = ([x, , z]) => Math.abs(x - RED.x) <= RED.half && Math.abs(z - RED.z) <= RED.half;

const judge = ({track}) => {
    const last = track.at(-1);
    const before = track.find(p => p.t >= last.t - 1000);
    return {
        axle: last.axle,
        spot: last.sensor,
        inside: inRed(last.axle) && inRed(last.sensor),
        settled: Math.hypot(last.axle[0] - before.axle[0], last.axle[2] - before.axle[2]) < 0.002,
        sawRed: track.some(p => p.color === 9),
        firstRedMs: track.find(p => p.color === 9)?.t ?? null
    };
};
const where = p => `(${p[0].toFixed(3)}, ${p[2].toFixed(3)})`;

test('the Colour explorer is built from real connections: no solid overlaps, the sensor rides in the hub body', () => {
    const {model, refusals} = parseModel(MODEL_TEXT, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    for (const part of model.parts) {
        assert.deepEqual(solidOverlaps(model, CATALOG, part), [], `${part.id} overlaps no solid part`);
    }
    const {model: placed, mechanism, issues} = prepareModel(MODEL_TEXT, CATALOG, {mat: ENTRY.mat});
    assert.deepEqual(issues, [], 'no notes about this model');
    const [sensor, ...others] = mechanism.sensors;
    assert.deepEqual(others, []);
    assert.equal(sensor.kind, 'color');
    assert.equal(sensor.port, 'C');
    assert.equal(sensor.body, hubBodyOf(placed, mechanism, CATALOG), 'the colour sensor is welded to the hub body');
    assert.ok(sensor.direction[1] < -0.999, 'it looks straight down');
    // Its spot on the floor is in reach of its 32 mm ray (the ground top is the ground body's top face).
    const ground = mechanism.bodies.find(b => b.id === 'ground');
    const height = sensor.origin[1] - (ground.position[1] + ground.colliders[0].halfExtents[1]);
    assert.ok(height > 0 && height < 0.032, `the sensor is ${height} m above the floor`);
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: BUDGET_MS});

    test('the example program is the one the pane offers for the Colour explorer on the Colour Zones mat', () => {
        assert.equal(ENTRY.example, 'colour-explorer.bw');
        assert.equal(ENTRY.mat, 'colour-zones');
        assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
        assert.match(PROGRAM, /wait until spike color C is red/);
    });

    test('the example program brings the Colour explorer to rest inside the red square', async t => {
        const result = await run(PROGRAM);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command the program sent was understood by the hub');
        assert.ok(result.run.calls.get('isColor') > 10 && result.run.calls.get('getAngle') > 10,
            `the program read the yaw and the colour sensor: ${JSON.stringify([...result.run.calls])}`);
        const r = judge(result);
        t.diagnostic(`at rest: axle ${where(r.axle)}, sensor spot ${where(r.spot)}; first saw red at ${(r.firstRedMs / 1000).toFixed(1)} s`);
        assert.ok(!inRed(result.track[0].axle), 'it starts outside the red square');
        assert.equal(result.track[0].color, 10, 'the sensor starts over white');
        assert.ok(r.sawRed, 'the sensor saw red');
        assert.ok(r.settled, 'the robot has come to rest');
        assert.ok(r.inside, `not inside the red square: axle ${where(r.axle)}, spot ${where(r.spot)}`);
    });

    test('the judge can fail: the program waiting for blue drives through the red square and on', async t => {
        const blind = PROGRAM.replace('spike color C is red', 'spike color C is blue');
        assert.notEqual(blind, PROGRAM);
        const r = judge(await run(blind));
        t.diagnostic(`waiting for blue: ends at axle ${where(r.axle)}, saw red: ${r.sawRed}`);
        assert.ok(r.sawRed, 'it passed over red');
        assert.ok(!r.inside, 'and did not stop there');
    });
}
