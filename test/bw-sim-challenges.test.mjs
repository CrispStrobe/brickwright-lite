// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The mats' challenges (world/challenges.js) judged on made-up runs: a robot of four points
// (a 0.1 m square) moved along a path, sampled 10 times a simulated second as the pane does.
// Each challenge can be won, with the stars its measure earns, and each can be lost in the
// ways it names; a result, once in, stays.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHALLENGES, challengesFor, createChallengeRun, betterResult} from '../overlay/scratch-gui/src/lib/bw-sim/world/challenges.js';
import {LINE_OVAL, MATS, WALL, ovalCentreAt} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';

const robotAt = ([x, z], half = 0.05) => [[x - half, z - half], [x + half, z - half], [x - half, z + half], [x + half, z + half]];

/** Runs a challenge on a path: at(tS) -> centre [x, z]; touching(tS) -> {id: bool}. */
const run = (id, at, {seconds = 400, touching = () => ({})} = {}) => {
    const r = createChallengeRun(id);
    let out = r.result;
    for (let k = 0; k <= seconds * 10 && out.status === 'running'; k++) {
        const tS = k / 10;
        out = r.step({tS, points: robotAt(at(tS)), touching: touching(tS)});
    }
    return out;
};

const ovalLength = 4 * LINE_OVAL.halfStraight + 2 * Math.PI * LINE_OVAL.radius;

test('every challenge is on a mat that exists, and every such mat but Plain and Warehouse has one', () => {
    const mats = new Set(MATS.map(m => m.id));
    for (const c of CHALLENGES) assert.ok(mats.has(c.mat), `${c.id} on ${c.mat}`);
    for (const m of MATS) assert.equal(challengesFor(m.id).length > 0, !['plain', 'warehouse'].includes(m.id), m.id);
});

test('oval lap: once around on the line is done; its time earns the stars; leaving the line fails', () => {
    // ovalCentreAt(s): the centre line by its arc length (2.77 m): at 0.15 m/s a lap is 18 s (3 stars),
    // at 0.1 m/s 28 s (2 stars, the shipped Line follower's ~23 s), at 0.025 m/s 111 s (1 star)
    const fast = run('oval-lap', t => ovalCentreAt((0.15 * t) % ovalLength));
    assert.equal(fast.status, 'done');
    assert.ok(Math.abs(fast.timeS - ovalLength / 0.15) < 1, `a lap at 0.15 m/s took ${fast.timeS} s`);
    assert.equal(fast.stars, 3);
    assert.equal(run('oval-lap', t => ovalCentreAt((0.1 * t) % ovalLength)).stars, 2);
    assert.equal(run('oval-lap', t => ovalCentreAt((0.025 * t) % ovalLength)).stars, 1);
    const off = run('oval-lap', t => (t < 5 ? ovalCentreAt(0.1 * t) : [0, 0]));
    assert.deepEqual([off.status, off.why], ['failed', 'offTrack']);
    // half a lap and back again is not a lap
    const back = run('oval-lap', t => ovalCentreAt(Math.abs(((0.1 * t) % ovalLength) - ovalLength / 2)), {seconds: 170});
    assert.notEqual(back.status, 'done');
});

test('wall stop: stopping close earns 3 stars, farther fewer; touching fails; never stopping times out', () => {
    // robot centre from x -0.3 at 0.2 m/s, stopping so its front (centre + 0.05) leaves `gap` to the wall face
    const stopAt = gap => t => [Math.min(-0.3 + 0.2 * t, WALL.faceX - gap - 0.05), 0];
    const close = run('wall-stop', stopAt(0.04));
    assert.equal(close.status, 'done');
    assert.ok(Math.abs(close.value - 0.04) < 1e-9, `gap ${close.value}`);
    assert.equal(close.stars, 3);
    assert.equal(run('wall-stop', stopAt(0.12)).stars, 2);
    assert.equal(run('wall-stop', stopAt(0.25)).stars, 1);
    const far = run('wall-stop', stopAt(0.5));
    assert.deepEqual([far.status, far.why], ['failed', 'timeUp'], 'standing still 0.5 m away is not a stop at the wall');
    const hit = run('wall-stop', stopAt(0), {touching: t => ({wall: t > 3.5})});
    assert.deepEqual([hit.status, hit.why], ['failed', 'touched']);
    assert.equal(run('wall-stop', () => [-0.3, 0]).status, 'failed', 'never driving off is no stop either');
});

test('sumo: 30 s inside the ring is done; the stars are for parts past the edge; leaving fails', () => {
    const inside = run('sumo-stay', t => [0.2 * Math.cos(t), 0.2 * Math.sin(t)]);
    assert.deepEqual([inside.status, inside.stars], ['done', 3]);
    assert.ok(inside.timeS >= 30 && inside.timeS < 30.2);
    const edge = run('sumo-stay', t => [0.36 * Math.cos(t / 3), 0.36 * Math.sin(t / 3)]);
    assert.deepEqual([edge.status, edge.stars], ['done', 2], 'the corners 2-4 cm past the edge');
    const out = run('sumo-stay', t => [0.03 * t, 0]);
    assert.deepEqual([out.status, out.why], ['failed', 'leftRing']);
});

test('maze: reaching the green cell is done, sooner is more stars; its progress grows on the way', () => {
    const r = createChallengeRun('maze-goal');
    const mid = r.step({tS: 0, points: robotAt([-0.45, -0.45]), touching: {}});
    assert.equal(mid.progress, 0);
    const nearer = r.step({tS: 10, points: robotAt([0.2, -0.45]), touching: {}});
    assert.ok(nearer.progress > 0.5 && nearer.status === 'running');
    const done = r.step({tS: 40, points: robotAt([0.45, -0.45]), touching: {}});
    assert.deepEqual([done.status, done.stars], ['done', 3]);
    assert.deepEqual(r.step({tS: 41, points: robotAt([0, 0]), touching: {}}), done, 'a result stays');
    assert.equal(run('maze-goal', () => [-0.45, -0.45]).why, 'timeUp');
});

test('colour zones: all four corners in any order; three is not enough', () => {
    const corners = [[0.35, 0.35], [-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35]];
    const tour = n => t => corners[Math.min(n - 1, Math.floor(t / 10))];
    const all = run('zones-tour', tour(4));
    assert.deepEqual([all.status, all.stars], ['done', 3]);
    assert.ok(all.timeS >= 30 && all.timeS < 31);
    const three = run('zones-tour', tour(3));
    assert.deepEqual([three.status, three.why, three.progress], ['failed', 'timeUp', 0.75]);
});

test('a better result has more stars, then the lower measure', () => {
    assert.ok(betterResult({stars: 3, value: 50}, {stars: 2, value: 10}));
    assert.ok(betterResult({stars: 2, value: 10}, {stars: 2, value: 20}));
    assert.ok(!betterResult({stars: 2, value: 30}, {stars: 2, value: 20}));
    assert.ok(betterResult({stars: 1, value: 1}, null));
});
