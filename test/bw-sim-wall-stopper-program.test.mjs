// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's Wall stopper example, run for real: the DEVICE SPIKE text
 * the pane's "Load example program" puts into the Code tab
 * (static/sim-lab/programs/wall-stopper.bw) runs through the real Scratch VM,
 * the spikeprime extension and the virtual hub (test/helpers/sim-lab-vm.mjs)
 * on the shipped Wall stopper model, placed on the Wall mat as the pane places
 * it. Nothing here commands a motor: the program's `wait until (spike
 * distance D) < 10` reads the distance sensor's ray, which meets the wall the
 * mat carries as a static obstacle.
 *
 * The model first: the S1 driving base plus a distance sensor looking ahead,
 * held by real connections (two beams pinned to the hub's top holes, a cross
 * beam pinned across them, the sensor hung under it on two pins in its blind side holes). No two
 * solid parts overlap (editor/overlap.js's solidOverlaps, the Build editor's
 * rule), and the compiler puts the sensor in the hub's body.
 *
 * The outcome is judged on the run's own record and the model, not on a fixed
 * window (scripts/lib/sim-lab-wall-stopper-judge.mjs, shared with the browser
 * gate): the wall face is where the compiled wall body is (its centre minus its
 * half thickness), the robot's front is the foremost point of any of its bodies'
 * colliders at their simulated poses, and the sensor's ray origin is carried by
 * the hub body's pose. (a) The front never reaches the wall face; (b) the drive
 * motors stop within two VM frames and one sensor period after the hub's reading
 * first goes below 10 cm, and not before; (c) the ray origin runs on after that
 * crossing no more than the crossing speed times that budget plus the braking
 * distance of the shorted DC motors from the program's 30 %, computed from the
 * catalogue and the compiled model. Expected from those numbers: ≈ 8 cm.
 *
 * The judge is shown able to fail twice: the same program with a threshold of
 * 1 cm (the sensor reads nothing under 5 cm, which the extension reports as
 * 0, so it stops about 4 cm out: long after the reading passed 10 cm), and with
 * a threshold the reading never goes below (< 0: it drives into the wall and
 * touches it).
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
const ENTRY = MODELS.find(m => m.file === 'wall-stopper.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
const {brakingBound, judgeWallStop} = await import(path.join(REPO, 'scripts', 'lib', 'sim-lab-wall-stopper-judge.mjs'));
const {STEP_MS} = await import(path.join(SIM, 'hub-bridge.js'));
const BUDGET_MS = 15000;
/** The example's threshold, as the hub reports distance: `wait until (spike distance D) < 10` (cm). */
const THRESHOLD_MM = 100;

/** Rotate v by the unit quaternion [x, y, z, w]. */
const rotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How far a collider (body-local, as compiled) reaches along unit direction d, at the body's pose. */
const reach = (collider, pose, d) => {
    const toWorld = q => v => rotate(pose.rotation, rotate(q, v));
    const local = toWorld(collider.rotation || [0, 0, 0, 1]);
    const centre = rotate(pose.rotation, collider.position || [0, 0, 0]).map((v, i) => v + pose.position[i]);
    const c = dot(centre, d);
    if (collider.shape === 'sphere') return c + collider.radius;
    if (collider.shape === 'box') {
        const h = collider.halfExtents;
        return c + [[1, 0, 0], [0, 1, 0], [0, 0, 1]].reduce((s, axis, i) => s + Math.abs(dot(local(axis), d)) * h[i], 0);
    }
    if (collider.shape === 'cylinder') {
        const a = Math.abs(dot(local([0, 1, 0]), d));
        return c + a * collider.halfHeight + Math.sqrt(Math.max(0, 1 - a * a)) * collider.radius;
    }
    throw new Error(`collider shape ${collider.shape}`);
};

/** The wall's face toward the robot, from the compiled obstacle body: plane x = faceX, normal -x. */
const wallFace = mechanism => {
    const wall = mechanism.bodies.find(b => b.id === 'obstacle:wall');
    assert.ok(wall, 'the Wall mat compiles a wall body');
    assert.deepEqual(wall.rotation, [0, 0, 0, 1], 'the wall stands square to x');
    return wall.position[0] - wall.colliders[0].halfExtents[0];
};

/** The program's movement speed (%), read from its text: the braking bound starts from it. */
const speedOf = source => Number(/set movement speed (\d+)/.exec(source)[1]);

/** The record as the shared judge reads it, judged: (a) no touch, (b) stopped because of the reading, (c) bounded overrun. */
const judge = ({track, mechanism, hubId}, source, frameMs) => {
    const faceX = wallFace(mechanism);
    const robot = mechanism.bodies.filter(b => b.motion === 'dynamic');
    const ports = (mechanism.actuators || []).map(a => a.port);
    const samples = track.map(p => ({
        t: p.t,
        front: Math.max(...robot.flatMap(b => b.colliders.map(c => reach(c, p.bodies[b.id], [1, 0, 0])))),
        ray: p.points.D[0],
        reading: p.readings.D.distance,
        driving: ports.every(port => p.busy[port])
    }));
    const brake = brakingBound(mechanism, {speedPercent: speedOf(source), hubBody: hubId});
    const verdict = judgeWallStop(samples, {faceX, thresholdMm: THRESHOLD_MM, frameMs, sensorMs: STEP_MS, brakeM: brake.brakeM});
    const last = track.at(-1);
    return {
        ...verdict, faceX, brake,
        // At rest: the last second of simulated time moved the robot less than 2 mm.
        settled: Math.hypot(...[0, 2].map(i => last.axle[i] - track.find(p => p.t >= last.t - 1000).axle[i])) < 0.002,
        reading: last.readings.D.distance
    };
};

test('the Wall stopper is built from real connections: no solid overlaps, the sensor rides in the hub body', () => {
    const {model, refusals} = parseModel(MODEL_TEXT, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    for (const part of model.parts) {
        assert.deepEqual(solidOverlaps(model, CATALOG, part), [], `${part.id} overlaps no solid part`);
    }
    const {model: placed, mechanism, issues} = prepareModel(MODEL_TEXT, CATALOG, {mat: ENTRY.mat});
    assert.deepEqual(issues, [], 'no notes about this model');
    const [sensor, ...others] = mechanism.sensors;
    assert.deepEqual(others, []);
    assert.equal(sensor.kind, 'distance');
    assert.equal(sensor.port, 'D');
    assert.equal(sensor.body, hubBodyOf(placed, mechanism, CATALOG), 'the distance sensor is welded to the hub body');
    // On the Wall mat it looks along the start heading (+x), at the wall.
    assert.ok(sensor.direction[0] > 0.999, `the sensor looks at the wall: ${sensor.direction}`);
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab, FRAME_MS} = await import('./helpers/sim-lab-vm.mjs');
    const runJudged = async source => {
        const result = await runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: BUDGET_MS});
        return {result, r: judge(result, source, FRAME_MS)};
    };
    const report = r => `front ${(r.frontGap * 100).toFixed(1)} cm, ray origin ${(r.rayGap * 100).toFixed(1)} cm, ` +
        `closest ${(r.closestGap * 100).toFixed(1)} cm from the wall face; hub reads ${r.reading} mm; ` +
        `stop began ${r.reactionMs?.toFixed(1)} ms after the reading went below ${THRESHOLD_MM} mm (budget ${r.budgetMs.toFixed(1)}), ` +
        `ran on ${r.overrunM === null ? '-' : (r.overrunM * 100).toFixed(2)} cm (bound ${r.overrunBoundM === null ? '-' : (r.overrunBoundM * 100).toFixed(2)}: ` +
        `${r.vCross?.toFixed(3)} m/s at the crossing, braking ${(r.brake.brakeM * 100).toFixed(2)} cm)` +
        (r.failures.length ? `; ${r.failures.join('; ')}` : '');

    test('the example program is the one the pane offers for the Wall stopper on the Wall mat', () => {
        assert.equal(ENTRY.example, 'wall-stopper.bw');
        assert.equal(ENTRY.mat, 'wall');
        assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
        assert.match(PROGRAM, /wait until \(spike distance D\) < 10/);
    });

    test('the braking bound comes from the catalogue and the model: the shorted motors, the robot\'s mass, no skid', () => {
        const {mechanism, model} = prepareModel(MODEL_TEXT, CATALOG, {mat: ENTRY.mat});
        const brake = brakingBound(mechanism, {speedPercent: speedOf(PROGRAM), hubBody: hubBodyOf(model, mechanism, CATALOG)});
        // 30 % of the medium motor's 1110 °/s on a 28 mm tyre; back-EMF damping only (no ramp: D5).
        assert.ok(brake.speedMps > 0.15 && brake.speedMps < 0.17, JSON.stringify(brake));
        assert.ok(brake.noSlip, `the brake would skid the tyres: ${JSON.stringify(brake)}`);
        assert.ok(brake.brakeM > 0.005 && brake.brakeM < 0.02, `braking distance ${brake.brakeM} m: ${JSON.stringify(brake)}`);
    });

    test('the example program stops the Wall stopper because of the reading, without touching the wall', async t => {
        const {result, r} = await runJudged(PROGRAM);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command the program sent was understood by the hub');
        assert.ok(result.run.calls.get('getDistance') > 10 && result.run.calls.get('stopMovement') === 1,
            `the program read the sensor and stopped: ${JSON.stringify([...result.run.calls])}`);
        t.diagnostic(report(r));
        // It started far away and drove: the wall was more than half a metre ahead at t = 0.
        assert.ok(r.faceX - result.track[0].points.D[0] > 0.5, 'the robot starts well away from the wall');
        assert.ok(r.settled, 'the robot has come to rest');
        assert.deepEqual(r.failures, [], report(r));
        assert.ok(r.ok);
    });

    test('the judge can fail: a 1 cm threshold stops too late (the sensor reads nothing under 5 cm)', async t => {
        const close = PROGRAM.replace('(spike distance D) < 10', '(spike distance D) < 1');
        assert.notEqual(close, PROGRAM);
        const {r} = await runJudged(close);
        t.diagnostic(`threshold 1 cm: ${report(r)}`);
        assert.equal(r.ok, false, `a 1 cm threshold passed the judge: ${report(r)}`);
        assert.ok(r.failures.some(f => f.startsWith('(b)')), `not judged late: ${report(r)}`);
        assert.ok(r.rayGap < 0.06, `a 1 cm threshold stopped ${r.rayGap} m out`);
    });

    test('the judge can fail: a threshold the reading never passes drives into the wall', async t => {
        const blind = PROGRAM.replace('(spike distance D) < 10', '(spike distance D) < 0');
        assert.notEqual(blind, PROGRAM);
        const {r} = await runJudged(blind);
        t.diagnostic(`threshold 0 cm: ${report(r)}`);
        assert.equal(r.ok, false);
        assert.ok(r.closestGap <= 0.001, `the blind program kept ${r.closestGap} m off the wall`);
        assert.ok(r.failures.some(f => f.startsWith('(a)')), report(r));
    });
}
