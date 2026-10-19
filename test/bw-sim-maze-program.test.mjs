// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's Maze example, run for real: the DEVICE SPIKE text the pane's
 * "Load example program" puts into the Code tab (static/sim-lab/programs/maze.bw)
 * runs through the real Scratch VM, the spikeprime extension and the virtual hub
 * (test/helpers/sim-lab-vm.mjs) on the shipped Maze runner model, placed on the
 * Maze mat as the pane places it. The program feels its way with the sensors: in
 * every cell it turns a quarter to look left, ahead and right with the distance
 * sensor (port D, a ray 36 mm up looking along the robot's forward) and drives
 * one cell into the first open way (left, then ahead, then right, then back - the
 * left-hand rule); the colour sensor (port C, looking down) stops the robot the
 * moment the floor under it is the goal cell's green.
 *
 * The model first: the S1 driving base plus a distance sensor looking ahead and a
 * colour sensor looking down, held by real connections, no two solid parts
 * overlapping (editor/overlap.js's solidOverlaps, the Build editor's rule), and
 * the compiler welds both into the hub body.
 *
 * The outcome is judged on the mat's own geometry, read back from
 * createMat('maze') rather than retyped. The maze is a 4x4 grid of 0.3 m cells
 * whose lines sit at x, z = -0.6 + 0.3 k (k = 0..4), so the goal cell (3,0)
 * spans x in [0.3, 0.6], z in [-0.6, -0.3] and its floor is the green the mat
 * paints (colour id 6); a point is "in the goal" when the mat paints it green.
 * At rest the colour sensor's spot must be on that green, the axle midpoint too.
 * The axle midpoint must also never cross a wall's centre plane between two
 * ticks: the robot can feel its way around the maze but never through it.
 *
 * The judge is shown able to fail: the same program waiting for a colour that is
 * not on the mat (blue) never stops, so it is not at rest in the goal.
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
const {createMat} = await import(path.join(SIM, 'world/mats.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'maze-runner.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');
const BUDGET_MS = 120000;
const where = p => `(${p[0].toFixed(3)}, ${p[2].toFixed(3)})`;
const greenAt = (mat, p) => mat.colorAt(p[0], p[2]).color === 6;

/** The maze's walls as centre planes, each square to one axis (from the mat's obstacles). */
const wallPlanes = mat => mat.obstacles.map(o => {
    const [sx, , sz] = o.size;
    const [px, , pz] = o.position;
    return sx < sz
        ? {id: o.id, axis: 0, c: px, a0: pz - sz / 2, a1: pz + sz / 2}   // wall on x = c, long in z
        : {id: o.id, axis: 2, c: pz, a0: px - sx / 2, a1: px + sx / 2};  // wall on z = c, long in x
});

/**
 * Every wall's centre plane the axle-midpoint path crosses. The path is a
 * polyline of one tick's axle position to the next; a wall is crossed when that
 * segment changes sign of (axis - plane) while its other coordinate is inside
 * the wall's length (a wall is 0.02 m thick, so its centre plane is the middle
 * of the material the robot would have to be inside to cross).
 */
const crossingsOf = (track, mat) => {
    const hits = [];
    for (let k = 1; k < track.length; k++) {
        const p = track[k - 1].axle, q = track[k].axle;
        for (const w of wallPlanes(mat)) {
            const other = w.axis === 0 ? 2 : 0;
            if ((p[w.axis] - w.c) * (q[w.axis] - w.c) >= 0) continue;
            const t = (w.c - p[w.axis]) / (q[w.axis] - p[w.axis]);
            const a = p[other] + t * (q[other] - p[other]);
            if (a > w.a0 && a < w.a1) hits.push(`${w.id}@${(track[k].t / 1000).toFixed(1)}s`);
        }
    }
    return hits;
};

const judge = ({track, mat}) => {
    const last = track.at(-1);
    const before = track.find(p => p.t >= last.t - 1000);
    // The moment the robot first stays in the goal: the last tick with the axle
    // or the sensor spot off the green floor, plus one (null when it never stays).
    let lastOutside = -1;
    for (let i = 0; i < track.length; i++) {
        if (!(greenAt(mat, track[i].axle) && greenAt(mat, track[i].sensor))) lastOutside = i;
    }
    return {
        axle: last.axle,
        spot: last.sensor,
        inside: greenAt(mat, last.axle) && greenAt(mat, last.sensor),
        settled: Math.hypot(last.axle[0] - before.axle[0], last.axle[2] - before.axle[2]) < 0.002,
        finishMs: lastOutside + 1 < track.length ? track[lastOutside + 1].t : null,
        crossings: crossingsOf(track, mat),
        sawGreen: track.some(p => p.color === 6)
    };
};

test('the Maze runner is built from real connections: no solid overlaps, both sensors ride in the hub body', () => {
    const {model, refusals} = parseModel(MODEL_TEXT, {catalog: CATALOG});
    assert.deepEqual(refusals, []);
    for (const part of model.parts) {
        assert.deepEqual(solidOverlaps(model, CATALOG, part), [], `${part.id} overlaps no solid part`);
    }
    const {model: placed, mechanism, issues} = prepareModel(MODEL_TEXT, CATALOG, {mat: ENTRY.mat});
    assert.deepEqual(issues, [], 'no notes about this model');
    const hub = hubBodyOf(placed, mechanism, CATALOG);
    const distance = mechanism.sensors.find(s => s.kind === 'distance');
    const colour = mechanism.sensors.find(s => s.kind === 'color');
    assert.ok(distance && colour, `both sensors compiled: ${JSON.stringify(mechanism.sensors.map(s => s.kind))}`);
    assert.equal(distance.port, 'D');
    assert.equal(colour.port, 'C');
    assert.equal(distance.body, hub, 'the distance sensor is welded to the hub body');
    assert.equal(colour.body, hub, 'the colour sensor is welded to the hub body');
    // On the Maze mat the robot starts at the start cell's centre heading +z, so
    // the distance sensor looks straight ahead and the colour sensor straight down.
    assert.ok(distance.direction[2] > 0.999, `the distance sensor looks ahead: ${distance.direction}`);
    assert.ok(colour.direction[1] < -0.999, `the colour sensor looks down: ${colour.direction}`);
    // Both rays start above the floor and below the 40 mm wall tops, so they can
    // see a wall and the floor without the body holding them.
    const ground = mechanism.bodies.find(b => b.id === 'ground');
    const top = ground.position[1] + ground.colliders[0].halfExtents[1];
    const distanceHeight = distance.origin[1] - top;
    const colourHeight = colour.origin[1] - top;
    assert.ok(distanceHeight > 0 && distanceHeight < 0.04, `the distance ray is ${distanceHeight} m up`);
    assert.ok(colourHeight > 0 && colourHeight < 0.032, `the colour ray reaches the floor from ${colourHeight} m`);
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const mat = createMat(ENTRY.mat);
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: ENTRY.mat, timeLimitMs: BUDGET_MS});

    test('the example program is the one the pane offers for the Maze runner on the Maze mat', () => {
        assert.equal(ENTRY.example, 'maze.bw');
        assert.equal(ENTRY.mat, 'maze');
        assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
        assert.match(PROGRAM, /REPEAT UNTIL spike color C is green/);
        // One cell is 0.3 m and the ray starts 44 mm ahead of the axle, so a wall
        // on the edge ahead (near face 300/2 - 20/2 = 140 mm from the cell centre)
        // reads 140 - 44 = 96 mm and the nearest open corridor (one cell, then the
        // rim wall's near face at 300 + 140 = 440 mm) reads 440 - 44 = 396 mm; the
        // program's 25 cm threshold sits between, closed below and open above.
        assert.match(PROGRAM, /\(spike distance D\) > 25/);
        // The goal square is the green floor of cell (3,0) = the goal cell's centre
        // (0.45, -0.45) by the lines at -0.6 + 0.3 k; the start cell (0,0) centre is
        // (-0.45, -0.45). The mat itself must paint one green and the other white.
        assert.equal(mat.colorAt(0.45, -0.45).color, 6, 'the mat paints the goal cell green');
        assert.equal(mat.colorAt(-0.45, -0.45).color, 10, 'the mat paints the start cell white');
    });

    test('the example program drives the Maze runner from the start to rest in the green goal cell', async t => {
        const result = await run(PROGRAM);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command the program sent was understood by the hub');
        assert.ok(result.run.calls.get('getDistance') > 10 && result.run.calls.get('isColor') > 5,
            `the program read both sensors: ${JSON.stringify([...result.run.calls])}`);
        const r = judge({track: result.track, mat});
        t.diagnostic(`at rest: axle ${where(r.axle)}, colour spot ${where(r.spot)}, ` +
            `green first seen at ${r.finishMs === null ? '-' : (r.finishMs / 1000).toFixed(1)} s, ` +
            `wall-plane crossings ${r.crossings.length}`);
        assert.ok(!greenAt(mat, result.track[0].axle), 'it starts off the green floor');
        assert.equal(result.track[0].color, 10, 'the colour sensor starts over white');
        assert.ok(r.sawGreen, 'the colour sensor saw the green floor');
        assert.ok(r.settled, 'the robot has come to rest');
        assert.ok(r.inside, `not resting in the goal cell: axle ${where(r.axle)}, spot ${where(r.spot)}`);
        assert.deepEqual(r.crossings, [], 'the axle midpoint never crossed a wall');
        assert.ok(r.finishMs !== null && r.finishMs <= BUDGET_MS - 5000,
            `it settled in the goal at ${r.finishMs} ms, before the ${BUDGET_MS} ms limit`);
    });

    test('the judge can fail: the program waiting for blue never stops in the goal', async t => {
        const blind = PROGRAM.replace('spike color C is green', 'spike color C is blue');
        assert.notEqual(blind, PROGRAM);
        const result = await run(blind);
        const r = judge({track: result.track, mat});
        t.diagnostic(`waiting for blue: ends at axle ${where(r.axle)}, settled ${r.settled}, inside ${r.inside}`);
        assert.ok(result.run.calls.get('isColor') > 5, 'the program still read the colour sensor');
        assert.ok(!(r.settled && r.inside), 'it did not come to rest in the goal');
    });
}
