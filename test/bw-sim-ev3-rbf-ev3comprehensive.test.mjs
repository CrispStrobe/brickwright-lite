// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * ev3comprehensive's compile route on the Virtual EV3 (docs/EV3-RBF-VM.md "Hosts"): the REAL extension
 * transpiles the project to lmsasm and POSTs it to its LMS compiler through `Scratch.fetch` (the CrispStrobe
 * adapter's; before it existed this block failed), with the network replaced by a stub that checks the
 * request and answers what the owner's hosted lmsasm produced for the wall stopper — the committed fixture
 * test/fixtures/ev3-rbf/wall-stopper.rbf. The extension's own upload goes to an HTTP bridge on the brick
 * (an ev3dev-style service the Virtual EV3 does not offer), so the test is the host that downloads the
 * compiled bytes over the system commands and starts them (CDK §4.2.1); the robot stops before the wall.
 * No network.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {WALL} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));
const {startDirectCommand, stepDirectCommand, parseFrame} = await import(path.join(GUI, 'src/lib/bw-sim/hubs/ev3/ev3-direct-commands.js'));

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('ev3comprehensive compiles to .rbf: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnBtHub, projectOfBlocks} = await import('./helpers/bt-hub-vm.mjs');
    const le16 = v => [v & 0xff, (v >> 8) & 0xff];
    const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    const cstr = text => [...text].map(c => c.charCodeAt(0)).concat(0);
    /** A system command or direct command frame through the brick's own handlers (as the session would). */
    const frame = (type, body) => Uint8Array.from([...le16(3 + body.length), 1, 0, type, ...body]);

    test('ev3comprehensive: transpile → Scratch.fetch to the LMS compiler (stubbed) → the .rbf runs on the Virtual EV3', async t => {
        const ev3 = MODELS.find(m => m.file === 'ev3-wall-stopper.ldr');
        const rbf = readFileSync(path.join(REPO, 'test/fixtures/ev3-rbf/wall-stopper.rbf'));
        const requests = [];
        const savedFetch = globalThis.fetch;
        const savedAlert = globalThis.alert;
        globalThis.alert = () => {};
        globalThis.fetch = async (url, options = {}) => {
            requests.push({url: String(url), method: options.method, body: JSON.parse(options.body)});
            return {ok: true, status: 200, statusText: 'OK', json: async () => ({success: true, base64: rbf.toString('base64')})};
        };
        let compiling = null;
        let compiled = null;
        let started = false;
        let wallAt = null;
        try {
            const {track, hub} = await runOnBtHub({project: projectOfBlocks({extensions: ['ev3comprehensive'], blocks: {}})}, {
                modelText: readFileSync(path.join(GUI, MODELS_BASE, ev3.file), 'utf8'), mat: ev3.mat, profile: 'ev3',
                extensionId: 'ev3comprehensive', timeLimitMs: 6000, connect: false,
                stopWhen: (point, all, brick, {extension}) => {
                    const inst = extension._inst || extension;
                    if (!compiling) {
                        compiling = (async () => {
                            extension.transpileToLMS();
                            await extension.compileToRBF();
                        })().then(() => { compiled = inst.rbfBytecode; }, e => { compiled = e; });
                    }
                    if (compiled instanceof Uint8Array && !started) {
                        started = true;
                        const bytes = Array.from(compiled);
                        assert.equal(brick.systemCommand(parseFrame(frame(0x01, [0x92, ...le32(bytes.length), ...cstr('../prjs/bw/wall.rbf'), ...bytes])))[6], 0x08);
                        const run = startDirectCommand(frame(0x00, [8, 0, 0xc0, 0x08, 0x82, 0x01, 0x00, 0x84, ...cstr('../prjs/bw/wall.rbf'), 0x60, 0x64,
                            0x03, 0x01, 0x60, 0x64, 0x00]));
                        assert.equal(stepDirectCommand(run, brick).done, true);
                    }
                    if (wallAt === null && brick.events.some(e => e.kind === 'write' && e.text === 'wall')) wallAt = point.t;
                    return compiled instanceof Error || (wallAt !== null && point.t > wallAt + 1000);
                }
            });
            assert.ok(compiled instanceof Uint8Array, `compiled: ${compiled && compiled.stack}`);
            assert.equal(requests.length, 1, 'one compile request');
            assert.equal(requests[0].url, 'http://127.0.0.1:7860/compile', 'the extension\'s LMS compiler');
            assert.equal(requests[0].method, 'POST');
            assert.match(requests[0].body.code, /vmthread\s+MAIN/, 'the transpiled lmsasm went to the compiler');
            assert.deepEqual(Array.from(compiled), Array.from(rbf), 'the extension holds exactly the compiler\'s answer');
            assert.ok(wallAt !== null, 'the program saw the wall');
            const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
            t.diagnostic(`wall at ${(wallAt / 1000).toFixed(2)} s, ${cm} cm; x = ${track.at(-1).position[0].toFixed(3)} m (wall ${WALL.faceX} m)`);
            assert.ok(cm > 2 && cm < 15, `stopped before the wall: ${cm} cm`);
        } finally {
            globalThis.fetch = savedFetch;
            globalThis.alert = savedAlert;
        }
    });
}
