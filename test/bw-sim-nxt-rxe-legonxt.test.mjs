// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * legonxt's compiled route on the Virtual NXT (docs/NXT-RXE-VM.md "legonxt"): the REAL extension, over the
 * Scratch Link BT-classic registry (test/helpers/bt-hub-vm.mjs), uploads a compiled `.rxe` with its own
 * system commands (DELETE, OPEN WRITE, WRITE in 32-byte chunks, CLOSE) and starts it with its own
 * STARTPROGRAM block; the brick runs it in the Robot Lab on the nxt-bumper-bot.
 *
 * The first test hands the extension the compiler's answer the way its compile block stores it (`rxeBase64`).
 * The second runs legonxt's whole compile route — its workflow block transpiles the project to NXC, POSTs it
 * to the hosted compiler through `Scratch.fetch` (the CrispStrobe adapter's, TurboWarp's shape: a fetch
 * wrapper), uploads the answer and starts it — with the network replaced by a stub that checks the request
 * and answers what that compiler produced for the bumper bot: the committed fixture
 * test/fixtures/nxt-rxe/touch-bumper.rxe. No network in either.
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

    test('legonxt\'s compile route: transpile → Scratch.fetch to the compiler (stubbed) → upload → start, on the Virtual NXT', async t => {
        const nxt = MODELS.find(m => m.file === 'nxt-bumper-bot.ldr');
        const rxe = readFileSync(path.join(REPO, 'test/fixtures/nxt-rxe/touch-bumper.rxe'));
        const requests = [];
        const savedFetch = globalThis.fetch;
        const savedAlert = globalThis.alert;
        globalThis.alert = () => {};
        // What lego-compiler.vercel.app answers a successful compile: {success, base64}.
        globalThis.fetch = async (url, options = {}) => {
            requests.push({url: String(url), method: options.method, body: JSON.parse(options.body)});
            return {ok: true, status: 200, statusText: 'OK', json: async () => ({success: true, base64: rxe.toString('base64')}),
                text: async () => ''};
        };
        let workflow = null;
        let workflowError = null;
        let workflowDone = false;
        let pressedAt = null;
        let stoppedAt = null;
        try {
            const {track, hub, connectError} = await runOnBtHub({project: projectOfBlocks({extensions: ['legonxt'], blocks: {}})}, {
                modelText: readFileSync(path.join(GUI, MODELS_BASE, nxt.file), 'utf8'), mat: nxt.mat, profile: 'nxt',
                extensionId: 'legonxt', timeLimitMs: 15000,
                stopWhen: (point, all, brick, {extension}) => {
                    if (!workflow) {
                        workflow = (async () => {
                            await extension.fullWorkflow({FILENAME: 'bumper.rxe'});
                            await extension.startProgram({FILENAME: 'bumper.rxe'});
                        })().then(() => { workflowDone = true; }, e => { workflowError = e; workflowDone = true; });
                    }
                    if (pressedAt === null && brick.getInputValues(0).scaled === 1) pressedAt = point.t;
                    if (stoppedAt === null && brick.events.some(e => e.kind === 'display' && e.text === 'bumped')) stoppedAt = point.t;
                    return workflowError !== null || (stoppedAt !== null && point.t > stoppedAt + 800);
                }
            });
            assert.equal(connectError, null, 'legonxt connected to the Virtual NXT');
            assert.equal(workflowError, null, String(workflowError && workflowError.stack));
            assert.ok(workflowDone, 'transpile, compile, upload and start finished');
            assert.equal(requests.length, 1, 'one compile request');
            const [request] = requests;
            assert.equal(request.url, 'https://lego-compiler.vercel.app/compile');
            assert.equal(request.method, 'POST');
            assert.equal(request.body.compiler, 'nxc');
            assert.match(request.body.code, /task main\s*\(\s*\)/, 'the transpiled NXC went to the compiler');
            assert.deepEqual(hub.s.files['bumper.rxe'], Array.from(rxe), 'the brick holds exactly the compiler\'s answer');
            assert.ok(pressedAt !== null && stoppedAt !== null, 'it drove into the wall and saw the bumper');
            const last = track.at(-1);
            t.diagnostic(`pressed ${(pressedAt / 1000).toFixed(2)} s; x = ${last.position[0].toFixed(3)} m (wall ${WALL.faceX} m)`);
            assert.ok(last.position[0] < WALL.faceX, 'in front of the wall');
        } finally {
            globalThis.fetch = savedFetch;
            globalThis.alert = savedAlert;
        }
    });
    for (const admitted of [true, false]) {
        test(`NXC compile then run: ${admitted ? 'exact recorded source drives and stops the bumper bot' : 'a different source is refused and cannot upload or run the fixture'}`, async () => {
            const nxt = MODELS.find(m => m.file === 'nxt-bumper-bot.ldr');
            const source = readFileSync(path.join(REPO, 'test/fixtures/nxt-rxe/touch-bumper.nxc'), 'utf8');
            const rxe = readFileSync(path.join(REPO, 'test/fixtures/nxt-rxe/touch-bumper.rxe'));
            const sentSource = admitted ? source : source.replace('OnFwd(OUT_BC, 60)', 'OnFwd(OUT_BC, 0)');
            const requests = [];
            const alerts = [];
            const savedFetch = globalThis.fetch;
            const savedAlert = globalThis.alert;
            globalThis.alert = message => alerts.push(String(message));
            globalThis.fetch = async (url, options = {}) => {
                const body = JSON.parse(options.body);
                requests.push({url: String(url), method: options.method, body});
                // This fixture is a reply for exactly one recorded input, not
                // an unconditional successful compiler for arbitrary programs.
                const matches = String(url) === 'https://lego-compiler.vercel.app/compile' &&
                    options.method === 'POST' && body.compiler === 'nxc' && body.code === source;
                return {ok: true, status: 200, json: async () => matches ?
                    {success: true, base64: rxe.toString('base64')} : {success: false, error: 'no recorded reply for this source'},
                    text: async () => ''};
            };
            let workflow = null;
            let finished = false;
            let failure = null;
            let stoppedAt = null;
            try {
                const {track, hub, connectError} = await runOnBtHub({project: projectOfBlocks({extensions: ['legonxt'], blocks: {}})}, {
                    modelText: readFileSync(path.join(GUI, MODELS_BASE, nxt.file), 'utf8'), mat: nxt.mat,
                    profile: 'nxt', extensionId: 'legonxt', timeLimitMs: 15000,
                    stopWhen: (point, all, brick, {extension}) => {
                        if (!workflow) workflow = (async () => {
                            (extension._inst || extension).nxcCode = sentSource;
                            await extension.compileToRXE();
                            // Exercise the real upload/start blocks even on the
                            // failure branch: unrecorded input cannot acquire fixture bytes.
                            await extension.uploadToNXT({FILENAME: 'recorded.rxe'});
                            await extension.startProgram({FILENAME: 'recorded.rxe'});
                        })().then(() => { finished = true; }, e => { failure = e; finished = true; });
                        if (stoppedAt === null && brick.events.some(e => e.kind === 'display' && e.text === 'bumped')) stoppedAt = point.t;
                        return admitted ? stoppedAt !== null && point.t > stoppedAt + 800 : finished && point.t > 2000;
                    }
                });
                assert.equal(connectError, null);
                assert.equal(failure, null);
                assert.ok(finished);
                assert.equal(requests.length, 1);
                assert.deepEqual(requests[0], {url: 'https://lego-compiler.vercel.app/compile', method: 'POST',
                    body: {compiler: 'nxc', code: sentSource}});
                if (admitted) {
                    assert.deepEqual(hub.s.files['recorded.rxe'], Array.from(rxe));
                    assert.ok(stoppedAt !== null, 'the recorded program reached its bumper condition');
                    const last = track.at(-1);
                    const before = track.find(p => p.t >= last.t - 500);
                    assert.ok(last.position[0] < WALL.faceX);
                    for (const port of ['B', 'C']) assert.ok(Math.abs(last.motors[port] - before.motors[port]) < 3, `${port} stopped`);
                } else {
                    assert.equal(hub.s.files['recorded.rxe'], undefined);
                    assert.equal(stoppedAt, null);
                    assert.ok(alerts.some(a => a.includes('no recorded reply for this source')));
                    const first = track[0];
                    const last = track.at(-1);
                    for (const port of ['B', 'C']) assert.ok(Math.abs(last.motors[port] - first.motors[port]) < 3, `${port} never driven`);
                }
            } finally {
                globalThis.fetch = savedFetch;
                globalThis.alert = savedAlert;
            }
        });
    }

}
