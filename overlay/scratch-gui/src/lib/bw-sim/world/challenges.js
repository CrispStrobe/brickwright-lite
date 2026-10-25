// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Challenges on the mats (world/mats.js): a goal, a judge and 1-3 stars. A judge sees only
// what anyone watching the mat could see, so it works for every hub and every program:
//
//   obs = {tS, points: [[x, z], ...], touching: {<obstacle id>: boolean}, drawing: [[[x, z], ...], ...]}
//
// tS the simulated seconds since the challenge started, points the robot's outline on the floor
// (the corners of its parts' colliders, world metres, the mats' frame), touching which of the
// mat's obstacles a part touches now, `drawing` what the pens have drawn (view/pen-layer.js, world
// metres). The pane (sim-lab-pane.jsx) feeds a judge 10 times a
// simulated second through the Robot Lab API (partOutline, touching). Stars are for how well, never for how: a time, a gap, a margin.

import {LINE_OVAL, MAZE, SUMO, WALL, distanceToOvalCentre} from './mats.js';

/** How a challenge's stars are earned: [threshold for 3, threshold for 2], lower is better. */
const starsFor = (value, [three, two]) => (value <= three ? 3 : value <= two ? 2 : 1);

const centreOf = points => {
    let x = 0;
    let z = 0;
    for (const p of points) { x += p[0]; z += p[1]; }
    return points.length ? [x / points.length, z / points.length] : [0, 0];
};

// Each challenge: id, mat, timeLimitS (no result by then: failed), stars (thresholds, see
// starsFor; what they measure is in `measure`) and judge(), a function of the run so far.
export const CHALLENGES = Object.freeze([
    {
        // One lap of the oval, following the line: the robot's centre goes once around the
        // oval's centre (its angle unwrapped), never more than OFF_TRACK_M from the line for
        // longer than OFF_TRACK_S.
        id: 'oval-lap', mat: 'line-oval', timeLimitS: 180, stars: [20, 35], measure: 'time',
        judge: () => {
            const OFF_TRACK_M = LINE_OVAL.radius * 0.5;
            const OFF_TRACK_S = 3;
            let last = null;
            let turned = 0;
            let offSince = null;
            return obs => {
                const c = centreOf(obs.points);
                const angle = Math.atan2(c[1], c[0]);
                if (last !== null) {
                    let d = angle - last;
                    if (d > Math.PI) d -= 2 * Math.PI;
                    if (d < -Math.PI) d += 2 * Math.PI;
                    turned += d;
                }
                last = angle;
                const off = distanceToOvalCentre(c[0], c[1]) > OFF_TRACK_M;
                offSince = off ? (offSince ?? obs.tS) : null;
                if (offSince !== null && obs.tS - offSince > OFF_TRACK_S) return {status: 'failed', why: 'offTrack'};
                const progress = Math.min(1, Math.abs(turned) / (2 * Math.PI));
                if (progress >= 1) return {status: 'done', value: obs.tS};
                return {status: 'running', progress};
            };
        }
    },
    {
        // Stop in front of the wall without touching it: done once the robot has driven at least
        // 0.1 m and then stood still for STILL_S; the stars are for the gap left (its front edge
        // to the wall's face, the robot heading +x at it).
        id: 'wall-stop', mat: 'wall', timeLimitS: 60, stars: [0.08, 0.15], measure: 'gap', maxGapM: 0.3,
        judge: () => {
            const STILL_S = 1;
            const STILL_M = 0.005;
            let start = null;
            let moved = false;
            const trail = [];
            return obs => {
                if (obs.touching.wall) return {status: 'failed', why: 'touched'};
                const c = centreOf(obs.points);
                if (!start) start = c;
                if (Math.hypot(c[0] - start[0], c[1] - start[1]) >= 0.1) moved = true;
                trail.push({tS: obs.tS, c});
                while (trail.length > 1 && obs.tS - trail[1].tS >= STILL_S) trail.shift();
                const frontX = Math.max(...obs.points.map(p => p[0]));
                const gap = Math.max(0, WALL.faceX - frontX);
                const progress = Math.min(1, Math.max(0, 1 - (gap - 0.05) / (WALL.faceX - start[0])));
                const still = trail.length > 1 && obs.tS - trail[0].tS >= STILL_S &&
                    trail.every(t => Math.hypot(t.c[0] - c[0], t.c[1] - c[1]) < STILL_M);
                if (moved && still && gap <= 0.3) return {status: 'done', value: gap};
                return {status: 'running', progress};
            };
        }
    },
    {
        // Stay in the sumo ring for HOLD_S: failed when the robot's centre leaves it; the stars
        // are for how far its parts ever went past the ring's outer edge.
        id: 'sumo-stay', mat: 'sumo', timeLimitS: 31, stars: [0, 0.05], measure: 'overshoot',
        judge: () => {
            const HOLD_S = 30;
            const R = SUMO.outerDiameter / 2;
            let worst = 0;
            return obs => {
                const c = centreOf(obs.points);
                if (Math.hypot(c[0], c[1]) > R) return {status: 'failed', why: 'leftRing'};
                for (const p of obs.points) worst = Math.max(worst, Math.hypot(p[0], p[1]) - R);
                if (obs.tS >= HOLD_S) return {status: 'done', value: Math.max(0, worst)};
                return {status: 'running', progress: obs.tS / HOLD_S};
            };
        }
    },
    {
        // Reach the maze's green goal cell (its centre inside it).
        id: 'maze-goal', mat: 'maze', timeLimitS: 300, stars: [60, 120], measure: 'time',
        judge: () => {
            const [gi, gj] = MAZE.goalCell;
            const x0 = -MAZE.cell * MAZE.n / 2 + gi * MAZE.cell;
            const z0 = -MAZE.cell * MAZE.n / 2 + gj * MAZE.cell;
            const goal = [x0 + MAZE.cell / 2, z0 + MAZE.cell / 2];
            let far = null;
            return obs => {
                const c = centreOf(obs.points);
                if (c[0] >= x0 && c[0] <= x0 + MAZE.cell && c[1] >= z0 && c[1] <= z0 + MAZE.cell) return {status: 'done', value: obs.tS};
                const d = Math.hypot(c[0] - goal[0], c[1] - goal[1]);
                if (far === null) far = d;
                return {status: 'running', progress: Math.max(0, Math.min(0.95, 1 - d / far))};
            };
        }
    },
    {
        // Visit the four coloured corners of the colour-zones mat, in any order (its centre inside each).
        id: 'zones-tour', mat: 'colour-zones', timeLimitS: 240, stars: [60, 120], measure: 'time',
        judge: () => {
            const corners = [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]];
            const seen = new Set();
            return obs => {
                const c = centreOf(obs.points);
                corners.forEach((k, i) => {
                    if (Math.abs(c[0] - k[0]) <= 0.15 && Math.abs(c[1] - k[1]) <= 0.15) seen.add(i);
                });
                if (seen.size === 4) return {status: 'done', value: obs.tS};
                return {status: 'running', progress: seen.size / 4, visited: seen.size};
            };
        }
    },
    {
        // Draw a square with a pen (a part marked "Draws on the floor"), then stop: done once the robot has
        // stood still for STILL_S and its longest stroke goes at least MIN_LENGTH_M and comes back near its
        // start (judged at rest: a pen behind the wheels loops at each corner, and a loop can pass the start
        // before the square is done). The stars are for how square it is — its box's two sides alike, and
        // its end on its start, each as a share of the side.
        id: 'draw-square', mat: 'plain', timeLimitS: 120, stars: [0.15, 0.35], measure: 'shape',
        judge: () => {
            const MIN_LENGTH_M = 0.48;
            const MIN_SIDE_M = 0.1;
            const STILL_S = 1;
            const STILL_M = 0.003;
            const trail = [];
            const lengthOf = s => s.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0);
            return obs => {
                const c = centreOf(obs.points);
                trail.push({tS: obs.tS, c});
                while (trail.length > 1 && obs.tS - trail[1].tS >= STILL_S) trail.shift();
                const still = trail.length > 1 && obs.tS - trail[0].tS >= STILL_S &&
                    trail.every(t => Math.hypot(t.c[0] - c[0], t.c[1] - c[1]) < STILL_M);
                let best = null;
                for (const s of obs.drawing || []) {
                    const len = lengthOf(s);
                    if (!best || len > best.len) best = {s, len};
                }
                if (!best) return {status: 'running', progress: 0};
                const progress = Math.min(0.95, best.len / (MIN_LENGTH_M * 1.25));
                if (!still) return {status: 'running', progress};
                const xs = best.s.map(p => p[0]);
                const zs = best.s.map(p => p[1]);
                const w = Math.max(...xs) - Math.min(...xs);
                const h = Math.max(...zs) - Math.min(...zs);
                const side = (w + h) / 2;
                const gap = Math.hypot(best.s.at(-1)[0] - best.s[0][0], best.s.at(-1)[1] - best.s[0][1]);
                if (best.len >= MIN_LENGTH_M && side >= MIN_SIDE_M && gap <= 0.3 * side) {
                    return {status: 'done', value: Math.abs(w - h) / side + gap / side};
                }
                return {status: 'running', progress};
            };
        }
    }
]);

/** The challenges on a mat (null has none). */
export const challengesFor = mat => CHALLENGES.filter(c => c.mat === mat);

/**
 * A run of one challenge: step(obs) after each sample returns
 * {status: 'running'|'done'|'failed', progress (0..1), timeS, stars (done), value (done: what
 * the stars measure), why (failed: 'offTrack'|'touched'|'leftRing'|'timeUp')}. Once done or
 * failed, the result stays.
 * @param {string} id a CHALLENGES id
 */
export const createChallengeRun = id => {
    const challenge = CHALLENGES.find(c => c.id === id);
    if (!challenge) throw new Error(`unknown challenge '${id}'`);
    const judge = challenge.judge();
    let result = {status: 'running', progress: 0, timeS: 0};
    return {
        challenge,
        get result () { return result; },
        step (obs) {
            if (result.status !== 'running') return result;
            if (!obs.points || !obs.points.length) return result;
            const r = judge(obs);
            if (r.status === 'done') {
                result = {status: 'done', progress: 1, timeS: obs.tS, value: r.value, stars: starsFor(r.value, challenge.stars)};
            } else if (r.status === 'failed') {
                result = {status: 'failed', progress: result.progress, timeS: obs.tS, why: r.why};
            } else if (obs.tS >= challenge.timeLimitS) {
                result = {status: 'failed', progress: r.progress, timeS: obs.tS, why: 'timeUp'};
            } else {
                result = {...r, timeS: obs.tS, progress: Math.max(0, Math.min(1, r.progress || 0))};
            }
            return result;
        }
    };
};

/** Whether `a` is a better result than `b` for this challenge (more stars, then a lower value). */
export const betterResult = (a, b) => !b || a.stars > b.stars || (a.stars === b.stars && a.value < b.value);
