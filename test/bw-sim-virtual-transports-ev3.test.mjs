// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * ev3comprehensive over Web Serial and over its WebSocket bridge, in the Robot Lab physics
 * (docs/ROBOT-LAB-HUB-COVERAGE.md, EV3 "Web Serial, bridge").
 *
 * The REAL vendored ev3comprehensive is connected by its own `set connection mode` and `connect`
 * blocks, with no Scratch Link anywhere (test/helpers/virtual-transport-vm.mjs):
 *   - serial: navigator.serial (bw-sim/transports/virtual-serial.js) -> the Virtual EV3's session;
 *   - bridge: ws://localhost:8080, binary frames (bw-sim/transports/virtual-bridge.js) -> the same session.
 * The shipped DEVICE EV3 wall stopper then has to stop before the wall because of its ultrasonic
 * reading; a copy whose threshold can never be met has to drive into the wall (the judge can fail).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync, existsSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE, PROGRAMS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {WALL} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));
const entry = MODELS.find(m => m.file === 'ev3-wall-stopper.ldr');
const modelText = readFileSync(path.join(GUI, MODELS_BASE, entry.file), 'utf8');
const program = readFileSync(path.join(GUI, PROGRAMS_BASE, entry.example), 'utf8');
const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');

if (!existsSync(missing)) {
    test('ev3comprehensive over Web Serial and the bridge', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOverVirtualTransport} = await import('./helpers/virtual-transport-vm.mjs');

    const run = (source, route, connect, extra = {}) => runOverVirtualTransport({bw: source}, {
        modelText, mat: entry.mat, profile: 'ev3', extensionId: 'ev3comprehensive', route, connect, timeLimitMs: 6000,
        bridge: {port: 8080, framing: 'binary'}, ...extra
    });

    /** The wall-stopper judge: drove at the wall, and the sensor reads a stop before it. */
    const stoppedBeforeWall = ({track, hub}) => {
        const travelled = track.at(-1).position[0] - track[0].position[0];
        const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
        const before = track.find(p => p.t >= track.at(-1).t - 1000);
        const still = Math.abs(track.at(-1).position[0] - before.position[0]) < 0.005;
        return {travelled, cm, still, ok: travelled > 0.2 && cm > 2 && cm < 15 && still && track.at(-1).position[0] < WALL.faceX};
    };

    const serialConnect = async extension => {
        await extension.setMode({MODE: 'serial'});
        return extension.connect({PARAM: ''});
    };
    const bridgeConnect = async extension => {
        await extension.setMode({MODE: 'bridge'});
        return extension.connect({PARAM: 'ws://localhost:8080'});
    };

    test('ev3comprehensive over Web Serial (115200 baud) stops the EV3 wall stopper before the wall by its reading', async t => {
        const result = await run(program, 'serial', serialConnect);
        assert.equal(result.connectError, null);
        assert.equal(result.connected, true, 'the connect block reported a connection');
        assert.equal(result.extension._inst.ev3.mode, 'serial');
        assert.ok(result.traffic.bytesIn > 100 && result.traffic.bytesOut > 20, `frames went both ways: ${JSON.stringify(result.traffic)}`);
        const judged = stoppedBeforeWall(result);
        t.diagnostic(`serial: travelled ${judged.travelled.toFixed(3)} m, stopped ${judged.cm} cm from the wall`);
        assert.ok(judged.ok, JSON.stringify(judged));
    });

    test('ev3comprehensive in auto mode finds an already-authorised virtual serial port first', async () => {
        const result = await run(program, 'serial', async extension => extension.connect({PARAM: ''}), {grantedPort: true});
        assert.equal(result.connectError, null);
        assert.equal(result.connected, true);
        assert.equal(result.extension._inst.ev3.detectedMode, 'serial');
        assert.ok(stoppedBeforeWall(result).ok);
    });

    test('ev3comprehensive over its WebSocket bridge stops the EV3 wall stopper before the wall by its reading', async t => {
        const result = await run(program, 'bridge', bridgeConnect);
        assert.equal(result.connectError, null);
        assert.equal(result.connected, true);
        assert.equal(result.extension._inst.ev3.mode, 'bridge');
        assert.ok(result.traffic.bytesIn > 100 && result.traffic.bytesOut > 20, JSON.stringify(result.traffic));
        const judged = stoppedBeforeWall(result);
        t.diagnostic(`bridge: travelled ${judged.travelled.toFixed(3)} m, stopped ${judged.cm} cm from the wall`);
        assert.ok(judged.ok, JSON.stringify(judged));
    });

    test('control: a wall stopper that can never see the wall fails the judge, over serial and the bridge', async () => {
        const broken = program.replace('< 15', '< 0');
        assert.notEqual(broken, program);
        for (const [route, connect] of [['serial', serialConnect], ['bridge', bridgeConnect]]) {
            const result = await run(broken, route, connect);
            assert.equal(result.connected, true, route);
            assert.equal(stoppedBeforeWall(result).ok, false, `${route}: the broken program must not pass`);
        }
    });

    test('control: with no virtual brick behind the bridge, connect fails and nothing moves', async () => {
        const result = await run(program, 'bridge', async extension => {
            await extension.setMode({MODE: 'bridge'});
            return extension.connect({PARAM: 'ws://localhost:9999'});
        });
        assert.equal(result.connected, false);
        assert.ok(result.dialled.includes('ws://localhost:9999'), 'the extension dialled the address it was given');
        assert.equal(result.traffic.opens, 0);
        assert.ok(Math.abs(result.track.at(-1).position[0] - result.track[0].position[0]) < 0.01);
    });
}
