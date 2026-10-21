// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * spikeprime over its local WebSocket bridge (`connect to bridge at [URL]`, the route that absorbed
 * spikeprimeBridge), in the Robot Lab physics (docs/ROBOT-LAB-HUB-COVERAGE.md, SPIKE "bridge").
 *
 * test/helpers/spike-lab-routes.mjs route 'bridge': the REAL spikeprime's BridgeLink dials
 * ws://localhost:8081 -> bw-sim/transports/virtual-bridge.js (text both ways, as a relay to the
 * hub's serial port forwards it) -> bw-sim/transports/virtual-spike-stream.js -> the same SPIKE 2.x
 * REPL double Scratch Link BT reaches (lib/virtual-hub/spike-classic-scratch-link.js) -> the hub in
 * Jolt. BridgeLink used to send the relay base64 (what Scratch Link takes) while reading the hub's
 * text as text, so the hub's REPL could not have run a single command; that is fixed in
 * CrispStrobe/extensions. Judged by the shared Wall stopper judge (test/helpers/wall-stop-lab-judge.mjs).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the SPIKE bridge runs: their inputs are present', () => {
        assert.fail(`missing ${missing} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runSpikeProjectInLab, projectFromSource, modelText, FRAME_MS} = await import('./helpers/spike-lab-routes.mjs');
    const {judgeWallStopRun, reportWallStop} = await import('./helpers/wall-stop-lab-judge.mjs');
    const WALL = {modelText: modelText('wall-stopper.ldr'), mat: 'wall'};
    const wallStopper = (below = 10) => 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  set movement speed 30\n' +
        `  start moving steering 0\n  wait until (spike distance D) < ${below}\n  stop movement\n`;
    const judged = async below => {
        const run = await runSpikeProjectInLab(await projectFromSource(wallStopper(below)), {route: 'bridge', ...WALL, timeLimitMs: 15000});
        return {run, r: judgeWallStopRun(run, {thresholdMm: below * 10, speedPercent: 30, frameMs: FRAME_MS})};
    };

    test('spikeprime over its WebSocket bridge (firmware 2.x REPL) stops the Wall stopper by its reading', async t => {
        const {run, r} = await judged(10);
        assert.equal(run.connectedProtocol, 'repl');
        assert.ok(run.sockets.some(s => s.url === 'ws://localhost:8081' && s.by === 'VirtualBridgeSocket'),
            `the extension dialled the bridge: ${JSON.stringify(run.sockets)}`);
        assert.ok(!run.sockets.some(s => /:2011[01]\//.test(s.url)), 'no Scratch Link socket');
        assert.deepEqual(run.issues, []);
        t.diagnostic(reportWallStop(r));
        assert.ok(r.startGap > 0.5);
        assert.ok(r.settled, 'the robot has come to rest');
        assert.deepEqual(r.failures, [], reportWallStop(r));
        assert.ok(r.ok);
    });

    test('the judge can fail over the bridge: a threshold the reading never passes drives into the wall', async t => {
        const {r} = await judged(0);
        t.diagnostic(reportWallStop(r));
        assert.equal(r.ok, false);
    });
}
