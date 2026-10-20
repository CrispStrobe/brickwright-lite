// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * legonxt's compiled route on the Virtual NXT (docs/NXT-RXE-VM.md "legonxt"): the REAL extension, over the
 * Scratch Link BT-classic registry (test/helpers/bt-hub-vm.mjs), uploads a compiled `.rxe` with its own
 * system commands (DELETE, OPEN WRITE, WRITE in 32-byte chunks, CLOSE) and starts it with its own
 * STARTPROGRAM block; the brick runs it in the Robot Lab on the nxt-bumper-bot.
 *
 * The compile step is not exercised: legonxt reaches the hosted compiler through `Scratch.fetch`, which the
 * CrispStrobe adapter's `Scratch` object does not provide (docs/NXT-RXE-VM.md "Open"). The test hands the
 * extension the compiler's answer the way its compile block stores it (`rxeBase64`) — the committed
 * fixture test/fixtures/nxt-rxe/touch-bumper.rxe, which that compiler produced. No network.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {WALL} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('legonxt uploads and starts an .rxe: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnBtHub, projectOfBlocks} = await import('./helpers/bt-hub-vm.mjs');

    test('legonxt uploads touch-bumper.rxe with its own system commands, starts it, and the bumper bot stops at the wall', async t => {
        const nxt = MODELS.find(m => m.file === 'nxt-bumper-bot.ldr');
        const rxe = readFileSync(path.join(REPO, 'test/fixtures/nxt-rxe/touch-bumper.rxe'));
        const alerts = [];
        const savedAlert = globalThis.alert;
        globalThis.alert = message => alerts.push(String(message));
        let workflow = null;
        let workflowDone = false;
        let workflowError = null;
        let startedAt = null;
        let pressedAt = null;
        let stoppedAt = null;
        try {
            const {track, hub, connectError} = await runOnBtHub({project: projectOfBlocks({extensions: ['legonxt'], blocks: {}})}, {
                modelText: readFileSync(path.join(GUI, MODELS_BASE, nxt.file), 'utf8'), mat: nxt.mat, profile: 'nxt',
                extensionId: 'legonxt', timeLimitMs: 15000,
                stopWhen: (point, all, brick, {extension}) => {
                    if (!workflow) {
                        // What compileToRXE stores on success, then the upload and start blocks.
                        (extension._inst || extension).rxeBase64 = rxe.toString('base64');
                        workflow = (async () => {
                            await extension.uploadToNXT({FILENAME: 'bumper.rxe'});
                            await extension.startProgram({FILENAME: 'bumper.rxe'});
                        })().then(() => { workflowDone = true; }, e => { workflowError = e; workflowDone = true; });
                    }
                    if (startedAt === null && brick.currentProgramName() === 'bumper.rxe') startedAt = point.t;
                    if (pressedAt === null && brick.getInputValues(0).scaled === 1) pressedAt = point.t;
                    if (stoppedAt === null && brick.events.some(e => e.kind === 'display' && e.text === 'bumped')) stoppedAt = point.t;
                    return workflowError !== null || (stoppedAt !== null && point.t > stoppedAt + 800);
                }
            });
            assert.equal(connectError, null, 'legonxt connected to the Virtual NXT');
            assert.equal(workflowError, null, String(workflowError && workflowError.stack));
            assert.ok(workflowDone, 'upload and start finished');
            assert.ok(alerts.some(a => /uploaded/i.test(a)), `the extension reported the upload: ${alerts.join(' | ')}`);
            assert.deepEqual(hub.s.files['bumper.rxe'], Array.from(rxe), 'the brick holds exactly the compiled bytes');
            assert.ok(startedAt !== null, 'STARTPROGRAM ran it');
            assert.ok(pressedAt !== null && stoppedAt !== null, 'it drove into the wall and saw the bumper');
            const last = track.at(-1);
            t.diagnostic(`started ${(startedAt / 1000).toFixed(2)} s, pressed ${(pressedAt / 1000).toFixed(2)} s; x = ${last.position[0].toFixed(3)} m (wall ${WALL.faceX} m)`);
            assert.ok(last.position[0] < WALL.faceX, 'in front of the wall');
            const before = track.find(p => p.t >= last.t - 500);
            for (const port of ['B', 'C']) assert.ok(Math.abs(last.motors[port] - before.motors[port]) < 3, `${port} stopped`);
        } finally {
            globalThis.alert = savedAlert;
        }
    });
}
