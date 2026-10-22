// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * legopoweredup and legoboostunified over their HTTP bridge connection type, in the Robot Lab physics
 * (docs/ROBOT-LAB-HUB-COVERAGE.md, BOOST and Powered Up "bridge").
 *
 * The REAL extensions are set up with their own `set connection type` (bridge) and `set bridge URL`
 * (http://localhost:8080) and connect with their own connect; every request goes through
 * Scratch.fetch -> bw-sim/transports/virtual-http.js -> bw-sim/transports/virtual-ble-bridge.js -> the
 * scene's LWP3 hub GATT peripheral (lib/virtual-hub/lab-ble-peripherals.js) -> the hub -> Jolt
 * (test/helpers/lab-hubs-vm.mjs, transport 'bridge'). No Web Bluetooth, no Scratch Link. Judged from
 * the hub's encoder and the world, as test/lab-hubs-coverage.test.mjs judges the other transports.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the LEGO hub bridge runs: their inputs are present', () => {
        assert.fail(`missing ${missing} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runLabHubProgram, modelText, programText} = await import('./helpers/lab-hubs-vm.mjs');
    const errorsBack = received => received.filter(b => b[2] === 0x05);
    const position = session => {
        const s = session.snapshot();
        const i = s.bodyIds.indexOf(session.hubs[0].body);
        return {x: s.bodies[i * 7], z: s.bodies[i * 7 + 2]};
    };
    const turn = degrees => `WHEN flag clicked:\n  pup set motor A power to 50 %\n  pup turn motor A on for ${degrees} degrees\n`;
    const assertBridged = r => {
        for (const request of ['POST /scan', 'POST /connect', 'POST /write', 'GET /notifications']) {
            assert.ok(r.bridged.includes(request), `${request} went over the bridge`);
        }
    };

    test('legopoweredup over its HTTP bridge turns the Technic Hub\'s large motor on port A by 360 ± 2°', async () => {
        const r = await runLabHubProgram(turn(360), {modelText: modelText('technic-hub-bench.ldr'), transport: 'bridge', timeLimitMs: 3000});
        try {
            assert.equal(r.extensionId, 'legopoweredup');
            assertBridged(r);
            assert.deepEqual(errorsBack(r.received), [], 'the hub took every message');
            const degrees = r.written.find(b => b[2] === 0x81 && b[5] === 0x0b);
            assert.ok(degrees, 'a StartSpeedForDegrees write reached the hub');
            const angle = r.hub.readPort('A').angleDeg;
            assert.ok(Math.abs(angle - 360) <= 2, `motor A at ${angle.toFixed(2)}°`);
            // The §3.32 feedback came back through GET /notifications.
            const feedback = r.received.filter(b => b[2] === 0x82).map(b => b[4]);
            assert.ok(feedback.includes(0x0a), JSON.stringify(feedback));
        } finally {
            r.session.dispose();
        }
    });

    test('control: a program that turns 180 degrees fails the 360 ± 2° judge over the bridge', async () => {
        const r = await runLabHubProgram(turn(180), {modelText: modelText('technic-hub-bench.ldr'), transport: 'bridge', timeLimitMs: 3000});
        try {
            const angle = r.hub.readPort('A').angleDeg;
            assert.ok(Math.abs(angle - 180) <= 2, `it did turn, ${angle.toFixed(2)}°`);
            assert.ok(Math.abs(angle - 360) > 2, 'the judge rejects it');
        } finally {
            r.session.dispose();
        }
    });

    test('legoboostunified over its HTTP bridge drives the BOOST Move Hub rover ahead (the shipped example)', async () => {
        const track = [];
        const r = await runLabHubProgram(programText('boost-rover.bw'), {modelText: modelText('boost-rover.ldr'), mat: 'plain',
            transport: 'bridge', timeLimitMs: 2000, onFrame: ({session, t}) => track.push({t, ...position(session)})});
        try {
            assert.equal(r.extensionId, 'legoboostunified');
            assertBridged(r);
            const timed = r.log.filter(e => e.dir === 'down' && e.bytes[2] === 0x81 && e.bytes[5] === 0x09);
            assert.ok(timed.length >= 2, 'StartSpeedForTime to A and B');
            const driven = Math.hypot(track.at(-1).x - track[0].x, track.at(-1).z - track[0].z);
            assert.ok(driven > 0.4, `drove ${driven.toFixed(3)} m ahead`);
            assert.deepEqual(errorsBack(r.received), []);
        } finally {
            r.session.dispose();
        }
    });

    test('legopoweredup over the bridge also drives the BOOST Move Hub: motor A one full turn', async () => {
        const r = await runLabHubProgram(turn(360), {modelText: modelText('boost-rover.ldr'), mat: 'plain', transport: 'bridge', timeLimitMs: 3000});
        try {
            assert.equal(r.extensionId, 'legopoweredup');
            assertBridged(r);
            const angle = r.hub.readPort('A').angleDeg;
            assert.ok(Math.abs(angle - 360) <= 5, `Move Hub motor A at ${angle}°`);
        } finally {
            r.session.dispose();
        }
    });
}
