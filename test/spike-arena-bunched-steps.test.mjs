// SPDX-License-Identifier: BSD-3-Clause
/**
 * Two VM steps in the same millisecond must not lose a hub command.
 *
 * The light browser shard's intermittent "time is up" on the SPIKE arena
 * (#520, run 36522528267: 15.0 s of mission time, the rover on its start mark,
 * both drive motors at 0 degrees) was not the clock. A loaded browser fired the
 * VM's setInterval twice with almost no wall time between, right after the
 * green flag, so `set movement speed` and `start moving` ran within the
 * spikeprime extension's 25 ms send interval, and its RateLimiter DROPPED the
 * second, silently. The program then waited for a black line it never reached.
 *
 * Fixed upstream in CrispStrobe/extensions#24 (the limiter delays a command to
 * its slot instead of discarding it), vendored here at d9f0417f.
 *
 * This file runs the pane's frame loop headless with ONE frame given two VM
 * steps. Measured while writing it, on the bundle before #24: bunching on
 * frame 1 fails rb07 with `time is up`, pose (20, 50), motors at 0 -- the CI
 * screenshot exactly -- while frames 0, 2 and 3 pass (which command pair lands
 * in the same step decides it; hence the sweep, and hence intermittent in CI).
 * On the #24 bundle every frame of the sweep passes.
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
/** Frames, counted from the green flag, that each get two VM steps in one run. */
const BUNCHED = [0, 1, 2, 3, 4, 5];

const vmSrc = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(vmSrc)) {
    // FAILS rather than skips: a skip would count as the claim holding.
    test('the bunched-steps arena gate: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, vmSrc)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnArena} = await import('./helpers/spike-arena-vm.mjs');
    const w = world('rb07-stop-at-the-line');
    const maxFrames = Math.ceil((w.timeLimitMs + 1000) / FRAME_MS);

    for (const bunched of BUNCHED) {
        test(`rb07: two VM steps in the same millisecond on frame ${bunched} after the green flag, and the reference solution still passes`, async () => {
            const result = await runOnArena(program(w, 'solution'), w, {
                vmStepsOn: frame => (frame === bunched ? 2 : 1),
                maxFrames
            });
            assert.deepEqual([result.verdict.status, result.verdict.reason], ['pass', 'pass.stoppedIn'],
                `bunched on frame ${bunched}: ${JSON.stringify(result.verdict)} at ` +
                `${JSON.stringify(result.snapshot && result.snapshot.pose)} -- a hub command was lost`);
        });
    }
}
