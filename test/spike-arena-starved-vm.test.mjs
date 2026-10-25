// SPDX-License-Identifier: BSD-3-Clause
/**
 * The arena's verdict must not depend on runner load — end to end.
 *
 * test/spike-arena-clock.test.mjs holds VmStepClock (#518) as a unit. This file
 * holds the CLAIM it was written for, with real programs: the browser pane's
 * frame loop, run headless on a fake clock, with the VM STARVED — animation
 * frames keep arriving every 33 ms of wall time, but the VM gets no step at all
 * for longer than the mission's whole time limit after the green flag, then
 * one step every other frame.
 * That is the shape a loaded CI runner gave the light browser shard on
 * 2026-09-28 (four passes and four "time is up" on unchanged content, never a
 * wrong position): frames kept coming while the program had not run.
 *
 * Measured while writing this: THINNING alone (one step in four, from the
 * start) does not reproduce it — a sensor-driven program only reacts a few
 * frames later and still stops in the band. The budget is lost to a STALL, so
 * the stall is what this file throttles with.
 *
 * Each frame's simulated time comes from frameSimMs, the pane's own rule
 * (lib/spike-arena/arena-clock.js), so this measures what ships:
 *   - with the step clock installed (what ships), a correct reference solution
 *     passes exactly as it does unstarved — a timed mission and the line
 *     follower — and a wrong one still fails for its own reason;
 *   - with the step clock left off, frameSimMs falls back to wall-clock frame
 *     deltas (the rule before #518) and the same correct solutions fail with
 *     `time is up`. That half is the proof this file can go red.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const UNIT_DIR = path.join(REPO, 'overlay', 'scratch-gui', 'static', 'spike-arena', 'rover-basics');
const world = id => JSON.parse(readFileSync(path.join(UNIT_DIR, `${id}.json`), 'utf8'));
const program = (w, which) => readFileSync(path.join(UNIT_DIR, w[which]), 'utf8');

const FRAME_MS = 1000 / 30;
/** Frames with no VM step at all after the green flag: the time limit and 5 s more. */
const stallFrames = w => Math.round((w.timeLimitMs + 5000) / FRAME_MS);
/** Stalled, then one VM step every other frame. */
const run = (runOnArena, w, which, stepClock = true) => {
    const stall = stallFrames(w);
    return runOnArena(program(w, which), w, {
        vmStepsOn: frame => frame >= stall && frame % 2 === 0,
        stepClock,
        maxFrames: stall + 2 * Math.ceil((w.timeLimitMs + 1000) / FRAME_MS)
    });
};
// A timed mission (sensor stop, 15 s limit) and the line follower (40 s).
const MISSIONS = ['rb07-stop-at-the-line', 'rb08-follow-the-track'];

const vmSrc = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(vmSrc)) {
    // FAILS rather than skips: a skip would count as the claim holding.
    test('the starved-VM arena gate: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, vmSrc)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnArena, VM} = await import('./helpers/spike-arena-vm.mjs');
    const {VmStepClock, INERT_AFTER_FRAMES} =
        await import(path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'spike-arena', 'arena-clock.js'));

    // The inert detector reads scratch-vm's own per-step bookkeeping
    // (_lastStepDoneThreads). Held against the REAL runtime, both ways, so an
    // upstream change to that field cannot silently disarm the detector.
    test('against the real scratch-vm runtime: a bypassed hook is inert, a starved one is not', () => {
        const vm = new VM();
        try {
            const starved = new VmStepClock();
            starved.install(vm.runtime);
            for (let i = 0; i < INERT_AFTER_FRAMES * 3; i++) starved.take();
            assert.equal(starved.isInert(), false, 'no step anywhere: not inert, mission time stays frozen');
            starved.uninstall();

            const bypassed = new VmStepClock();
            const bound = vm.runtime._step.bind(vm.runtime); // what setInterval(this._step.bind(this)) would hold
            bypassed.install(vm.runtime);
            for (let i = 0; i < INERT_AFTER_FRAMES; i++) { bound(); bypassed.take(); }
            assert.equal(bypassed.isInert(), true, 'the VM stepped around the hook: inert, the pane falls back');
            bypassed.uninstall();
        } finally {
            vm.quit();
        }
    });

    for (const id of MISSIONS) {
        test(`${id}: with the VM stalled past the time limit and then halved, the reference solution still passes on the step clock`, async () => {
            const w = world(id);
            const starved = await run(runOnArena, w, 'solution');
            const lockstep = await runOnArena(program(w, 'solution'), w);
            assert.equal(starved.verdict.status, 'pass', `${id}: ${JSON.stringify(starved.verdict)}`);
            // The VM really was starved: the stall alone outlasts the mission's whole time limit.
            assert.ok(stallFrames(w) * FRAME_MS > w.timeLimitMs, 'the stall is longer than the time limit');
            assert.ok(starved.frames > stallFrames(w) + lockstep.frames,
                `${starved.frames} pane frames against ${lockstep.frames} in lockstep`);
            // One clock means the SAME run, however slowly it arrived.
            assert.equal(starved.verdict.reason, lockstep.verdict.reason);
            assert.equal(starved.verdict.timeMs, lockstep.verdict.timeMs, 'the same simulated finishing time');
        });

        test(`${id}: the same starved run on wall-clock frame time (the rule before #518) runs out of time`, async () => {
            const w = world(id);
            const result = await run(runOnArena, w, 'solution', false);
            assert.deepEqual([result.verdict.status, result.verdict.reason], ['fail', 'fail.timeLimit'],
                `${id}: the frame clock must fail a correct program the VM could not keep up with, ` +
                `or this file cannot tell #518 from its absence: ${JSON.stringify(result.verdict)}`);
        });
    }

    test('a wrong solution still fails, for its own reason, when the VM is starved', async () => {
        const w = world('rb07-stop-at-the-line');
        const result = await run(runOnArena, w, 'wrong');
        assert.deepEqual([result.verdict.status, result.verdict.reason], ['fail', 'fail.enteredZone'],
            JSON.stringify(result.verdict));
    });
}
