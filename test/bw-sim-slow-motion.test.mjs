// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Slow motion (the Robot Lab API's setTimeScale and Simulate's speed control) paces simulated
// time against the wall clock (sim-clock.js slowMotionWait), so it holds its rate whatever a
// step costs and however the VM schedules its steps:
//
//   - ½× and ¼× come out within 2 % of half and a quarter of real time, with steps that take
//     0-10 ms on top of a 16 ms VM cadence (the old "wait ms·(1/scale - 1) after each step"
//     ran ½× at about 0.72);
//   - changing the scale starts the pacing afresh at the new rate;
//   - a long pause (Pause, a hidden tab) does not make the next seconds rush to catch up.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SimLabClock, slowMotionWait, SLOW_MOTION_GAP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-clock.js';

test('fast forward schedules another unchanged VM step after the world catches up; Pause cancels it', async () => {
    for (const scale of [1, 2, 4]) {
        const tasks = [];
        let steps = 0;
        const runtime = {currentStepTime: 20, _step () { steps++; }};
        const session = {time: 0, tick (ms) { this.time += ms; }, idle: async () => {}};
        const clock = new SimLabClock({defer: fn => tasks.push(fn), wallNow: () => 0});
        clock.timeScale = scale;
        clock.install(runtime, session);
        runtime._step();
        tasks.shift()();
        for (let i = 0; i < 8; i++) await Promise.resolve();
        assert.equal(session.time, 20, 'physics step size stays unchanged');
        assert.equal(clock.programMs, 20, 'program time agrees with physics');
        assert.equal(tasks.length, scale > 1 ? 1 : 0, 'fast forward requests an extra VM step');
        if (scale > 1) { tasks.shift()(); assert.equal(steps, 2); }
        clock.uninstall();
        while (tasks.length) tasks.shift()();
        assert.equal(steps, scale > 1 ? 2 : 1, 'queued work cannot restart after Pause');
    }
});

/** A run of `steps` VM steps of `stepMs` simulated each; returns simulated and wall time spent. */
const run = (scale, {steps = 600, stepMs = 1000 / 60, start = {now: 0, sim: 0, pace: null}, cost = i => (i * 7919) % 11} = {}) => {
    let {now, sim, pace} = start;
    const wall0 = now;
    const sim0 = sim;
    for (let i = 0; i < steps; i++) {
        now += 16 + cost(i); // the VM's next frame, then the step's own work
        sim += stepMs;
        const w = slowMotionWait(pace, {scale, simMs: sim, nowMs: now});
        pace = w.pace;
        now += w.ms;
    }
    return {rate: (sim - sim0) / (now - wall0), state: {now, sim, pace}};
};

test('½× and ¼× hold their rate whatever the steps cost', () => {
    for (const scale of [0.5, 0.25]) {
        const {rate} = run(scale);
        assert.ok(Math.abs(rate / scale - 1) < 0.02, `${scale}× ran at ${rate.toFixed(3)}`);
    }
});

test('a new scale starts the pacing afresh', () => {
    const half = run(0.5, {steps: 300});
    const quarter = run(0.25, {steps: 300, start: half.state});
    assert.ok(Math.abs(quarter.rate / 0.25 - 1) < 0.03, `after ½×, ¼× ran at ${quarter.rate.toFixed(3)}`);
});

test('a long pause does not make the next steps rush', () => {
    const before = run(0.5, {steps: 120});
    const paused = {...before.state, now: before.state.now + 5000}; // 5 s with no step
    const first = slowMotionWait(paused.pace, {scale: 0.5, simMs: paused.sim + 1000 / 60, nowMs: paused.now});
    assert.equal(first.ms, 0, 'the first step after the pause is not held back for time already past');
    const after = run(0.5, {steps: 120, start: {now: paused.now, sim: paused.sim + 1000 / 60, pace: first.pace}});
    assert.ok(Math.abs(after.rate / 0.5 - 1) < 0.03, `after the pause ½× ran at ${after.rate.toFixed(3)} (no catch-up burst)`);
    assert.ok(SLOW_MOTION_GAP_MS >= 100);
});
