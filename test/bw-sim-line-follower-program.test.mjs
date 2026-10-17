// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's line-follower example program, run for real: the DEVICE
 * SPIKE text the pane's "Load example program" puts into the Code tab
 * (static/sim-lab/programs/line-follower.bw) is built into a Scratch project,
 * run by the real Scratch VM through the real spikeprime extension and the
 * virtual hub (test/helpers/sim-lab-vm.mjs), on the shipped Line follower
 * model placed on the Line Oval mat as the pane places it. Nothing in this
 * file commands a motor: the program's `IF spike color C is black` reads the
 * colour sensor's ray on the mat, and its `start tank` blocks turn the wheels.
 *
 * A lap is judged on the track alone: 100 checkpoints evenly spaced along the
 * oval's centre line (ovalCentreAt), in driving order; the drive-axle midpoint
 * must come within 4 cm of at least 95 of them, in that order, within 60 s of
 * simulated time, and never be more than 5 cm off the centre line before the
 * lap is done.
 *
 * The judge is shown able to fail: the same program asking for a colour the
 * mat does not have (red, so it never sees what it is looking for and always
 * takes the same branch) does not get round. (Swapping the two steering
 * branches is NOT a failing program: it follows the line's other edge and
 * also completes the lap.)
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE, PROGRAMS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {distanceToOvalCentre, ovalCentreAt, createMat} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));

const ENTRY = MODELS.find(m => m.file === 'line-follower.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, ENTRY.example), 'utf8');

const CHECKPOINTS = 100;
const NEED = 95;
const NEAR_M = 0.04;
const OFF_LINE_M = 0.05;
const BUDGET_MS = 60000;

/**
 * Checkpoint k (1..100) is at arc length k/100 of the centre line, so the last
 * one is the start point, reached at the end of the lap. Matching is in order:
 * each checkpoint is searched from where the previous match was; a checkpoint
 * never reached is counted as missed and the search goes on from the same place.
 * The lap is done when the last checkpoint is reached with at least 95 passed.
 */
const judge = track => {
    const length = createMat('line-oval').centreLineLengthM;
    let from = 0;
    let passed = 0;
    let lapIndex = -1;
    for (let k = 1; k <= CHECKPOINTS; k++) {
        const [cx, cz] = ovalCentreAt(k * length / CHECKPOINTS);
        const at = track.findIndex((p, i) => i >= from && Math.hypot(p.axle[0] - cx, p.axle[2] - cz) < NEAR_M);
        if (at < 0) continue;
        passed++;
        from = at;
        if (k === CHECKPOINTS && passed >= NEED) lapIndex = at;
    }
    const until = lapIndex >= 0 ? lapIndex + 1 : track.length;
    const maxOff = Math.max(...track.slice(0, until).map(p => distanceToOvalCentre(p.axle[0], p.axle[2])));
    return {passed, lapMs: lapIndex >= 0 ? track[lapIndex].t : null, maxOff};
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

    test('the example program is the one the pane offers for the Line follower on the Line Oval', () => {
        assert.equal(ENTRY.example, 'line-follower.bw');
        assert.equal(ENTRY.mat, 'line-oval');
        assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
        assert.match(PROGRAM, /IF spike color C is black THEN:/);
    });

    test('the example program drives the Line follower once round the Line Oval within 60 s', async t => {
        const {track, issues, run: result} = await run(PROGRAM);
        assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
        assert.deepEqual(result.unsupported, [], 'every command the program sent was understood by the hub');
        assert.ok(result.calls.get('isColor') > 100 && result.calls.get('startTank') > 100,
            `the program read the sensor and steered: ${JSON.stringify([...result.calls])}`);
        // The sensor really saw both: black under it at the start, white while following the edge.
        assert.equal(track[0].color, 0, 'the sensor starts over the black line');
        assert.ok(track.some(p => p.color === 10), 'the sensor saw white');
        const {passed, lapMs, maxOff} = judge(track);
        t.diagnostic(`checkpoints ${passed}/${CHECKPOINTS}, lap ${lapMs === null ? 'none' : `${(lapMs / 1000).toFixed(1)} s`}, ` +
            `max ${(maxOff * 1000).toFixed(1)} mm off the centre line`);
        assert.ok(passed >= NEED, `only ${passed} of ${CHECKPOINTS} checkpoints passed in order`);
        assert.ok(lapMs !== null && lapMs <= BUDGET_MS, `lap time ${lapMs}`);
        assert.ok(maxOff <= OFF_LINE_M, `${(maxOff * 100).toFixed(1)} cm off the line`);
    });

    test('the judge can fail: the program looking for red, which the mat does not have, does not get round', async t => {
        const blind = PROGRAM.replace('spike color C is black', 'spike color C is red');
        assert.notEqual(blind, PROGRAM);
        const {track} = await run(blind);
        const {passed, lapMs, maxOff} = judge(track);
        t.diagnostic(`looking for red: checkpoints ${passed}/${CHECKPOINTS}, max ${(maxOff * 100).toFixed(1)} cm off`);
        assert.ok(passed < NEED && lapMs === null, `the blind program passed ${passed} checkpoints`);
    });
}
