// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * legonxt over Web Serial ("direct") and over its WebSocket bridge, in the Robot Lab physics
 * (docs/ROBOT-LAB-HUB-COVERAGE.md, NXT "Web Serial, bridge").
 *
 * The REAL vendored legonxt is connected by its own `set connection mode` and `connect` blocks, with
 * no Scratch Link anywhere (test/helpers/virtual-transport-vm.mjs):
 *   - direct: navigator.serial, 9600 8N1 (bw-sim/transports/virtual-serial.js) -> the Virtual NXT session;
 *   - bridge: ws://localhost:8765, each telegram (two length bytes first) as one base64 text message
 *     (bw-sim/transports/virtual-bridge.js) -> the same session.
 * Both routes needed CrispStrobe/extensions fixes to legonxt's own backends (SerialBackend called a
 * getFirmwareVersion it does not have, BridgeBackend a getBattery it does not have, so neither could
 * ever connect; the bridge resolved replies as numbers its callers then parsed as telegrams).
 * The shipped bumper bot turns B and C 360°, drives until the bumper meets the wall and stops; a copy
 * without its stop blocks keeps pushing (the judge can fail).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync, existsSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE, PROGRAMS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {WALL} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));
const entry = MODELS.find(m => m.file === 'nxt-bumper-bot.ldr');
const modelText = readFileSync(path.join(GUI, MODELS_BASE, entry.file), 'utf8');
const blocks = JSON.parse(readFileSync(path.join(GUI, PROGRAMS_BASE, entry.example), 'utf8'));
const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');

if (!existsSync(missing)) {
    test('legonxt over Web Serial and the bridge', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOverVirtualTransport} = await import('./helpers/virtual-transport-vm.mjs');
    const {projectOfBlocks} = await import('./helpers/bt-hub-vm.mjs');

    const ROUTES = {
        direct: {route: 'serial', connect: async extension => {
            extension.setConnectionMode({MODE: 'direct'});
            return extension.connect({});
        }},
        bridge: {route: 'bridge', connect: async extension => {
            extension.setConnectionMode({MODE: 'bridge'});
            return extension.connect({URL: 'ws://localhost:8765'});
        }}
    };

    const run = (program, mode) => {
        let pressedAt = null;
        return runOverVirtualTransport({project: projectOfBlocks(program)}, {
            modelText, mat: entry.mat, profile: 'nxt', extensionId: 'legonxt', route: ROUTES[mode].route,
            bridge: {port: 8765, framing: 'base64'}, connect: ROUTES[mode].connect, timeLimitMs: 12000,
            stopWhen: (point, all, hub) => {
                if (pressedAt === null && hub.getInputValues(0).scaled === 1) pressedAt = point.t;
                return pressedAt !== null && point.t > pressedAt + 1500;
            }
        });
    };

    /** Bumped into the wall, and stood still against it for its last second. */
    const judge = ({track, hub}) => {
        const last = track.at(-1);
        const before = track.find(p => p.t >= last.t - 1000);
        const stopped = ['B', 'C'].every(p => Math.abs(last.motors[p] - before.motors[p]) < 3);
        const pressed = hub.getInputValues(0).scaled === 1;
        const travelled = last.position[0] - track[0].position[0];
        return {stopped, pressed, travelled, ok: stopped && pressed && travelled > 0.1 && last.position[0] < WALL.faceX};
    };

    for (const mode of ['direct', 'bridge']) {
        test(`legonxt over ${mode === 'direct' ? 'Web Serial ("direct", 9600 baud)' : 'its WebSocket bridge (base64 telegrams)'}: the bumper bot drives until the bumper meets the wall and stops`, async t => {
            const result = await run(blocks, mode);
            assert.equal(result.connectError, null);
            assert.equal(result.connected, true, 'the connect block reported a connection');
            assert.equal(result.extension._inst.peripheral.connectionMode, mode);
            assert.ok(result.traffic.bytesIn > 50 && result.traffic.bytesOut > 10, JSON.stringify(result.traffic));
            const judged = judge(result);
            t.diagnostic(`${mode}: ${JSON.stringify(judged)}`);
            assert.ok(judged.ok, JSON.stringify(judged));
            // The first two moves were the 360° ones: B and C turned at least that far before the drive.
            for (const port of ['B', 'C']) assert.ok(result.track.at(-1).motors[port] > 360, `${port} turned`);
        });
    }

    test('control: without its stop blocks the bumper bot keeps pushing and fails the judge, on both routes', async () => {
        const broken = structuredClone(blocks);
        const wait = Object.values(broken.blocks).find(b => b.opcode === 'control_wait_until');
        assert.ok(wait && wait.next, 'the stops follow the wait');
        wait.next = null;
        for (const mode of ['direct', 'bridge']) {
            const result = await run(broken, mode);
            assert.equal(result.connected, true, mode);
            assert.equal(judge(result).ok, false, `${mode}: a bot that never stops must not pass`);
        }
    });
}
