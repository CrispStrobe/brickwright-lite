// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Hub-coverage cells (docs/ROBOT-LAB-HUB-COVERAGE.md) that the Robot Lab's existing virtual hubs
 * already serve but no test drove: the REAL bundled extension, unchanged, over the named route,
 * judged from the hub's encoder or the world (test/helpers/lab-hubs-vm.mjs), never from the
 * extension's own bookkeeping.
 *
 *   - legoboostunified drives the BOOST Move Hub rover ahead over Scratch Link BLE (the existing
 *     BOOST test covers Web Bluetooth only);
 *   - legopoweredup (not only legoboostunified) turns the Move Hub's motor A one full turn;
 *   - legopoweredup turns a motor on the Powered Up City Hub (HUB NO.4, part 28738) one full turn,
 *     over Web Bluetooth and Scratch Link, matching the same motor on a Technic Hub (the existing
 *     test covers the Technic Hub only).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the LEGO hub coverage runs: their inputs are present', () => {
        assert.fail(`missing ${missing} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runLabHubProgram, modelText, programText} = await import('./helpers/lab-hubs-vm.mjs');
    const DEG_TOLERANCE = 2;
    const errorsBack = received => received.filter(b => b[2] === 0x05);
    const position = session => {
        const s = session.snapshot();
        const i = s.bodyIds.indexOf(session.hubs[0].body);
        return {x: s.bodies[i * 7], z: s.bodies[i * 7 + 2]};
    };

    test('legoboostunified drives the BOOST Move Hub rover ahead over Scratch Link BLE', async () => {
        const track = [];
        const r = await runLabHubProgram(programText('boost-rover.bw'), {modelText: modelText('boost-rover.ldr'), mat: 'plain',
            transport: 'scratchlink', timeLimitMs: 2000, onFrame: ({session, t}) => track.push({t, ...position(session)})});
        try {
            assert.equal(r.extensionId, 'legoboostunified');
            const timed = r.log.filter(e => e.dir === 'down' && e.bytes[2] === 0x81 && e.bytes[5] === 0x09);
            assert.equal(timed.length >= 2, true, 'StartSpeedForTime to A and B');
            const driven = Math.hypot(track.at(-1).x - track[0].x, track.at(-1).z - track[0].z);
            assert.ok(driven > 0.4, `drove ${driven.toFixed(3)} m ahead`);
            assert.deepEqual(errorsBack(r.received), []);
        } finally {
            r.session.dispose();
        }
    });

    test('legopoweredup also drives the BOOST Move Hub: its motor A turns one full turn (Web Bluetooth)', async () => {
        const source = 'WHEN flag clicked:\n  pup set motor A power to 50 %\n  pup turn motor A on for 360 degrees\n';
        const r = await runLabHubProgram(source, {modelText: modelText('boost-rover.ldr'), mat: 'plain', timeLimitMs: 3000});
        try {
            assert.equal(r.extensionId, 'legopoweredup');
            assert.deepEqual(errorsBack(r.received), [], 'the hub took every message');
            const angle = r.hub.readPort('A').angleDeg;
            assert.ok(Math.abs(angle - 360) <= 5, `Move Hub motor A at ${angle}°`);
        } finally {
            r.session.dispose();
        }
    });

    // A City Hub on the floor with a Technic large motor on its port A (cable only, nothing pinned), the gear on its axle.
    const cityBench = transportHub => [
        '0 City hub motor bench', '0 !BW ID hub', `1 71 0 0 0 1 0 0 0 1 0 0 0 1 ${transportHub}`,
        '0 !BW ID motor', '0 !BW PORT A', '1 72 300 -20 0 1 0 0 0 1 0 0 0 1 22169.dat',
        '0 !BW ID axle', '1 0 300 -20 -50 0 0 1 0 1 0 -1 0 0 3706.dat',
        '0 !BW ID gear', '1 4 300 -20 -90 1 0 0 0 1 0 0 0 1 3648.dat', ''].join('\n');
    // The same free motor on a Technic Hub is the reference: the unpinned motor overshoots the
    // pinned bench's 360 ± 2° by a few degrees on either hub (no load on its body), so the City Hub
    // is judged against one full turn ± 5° AND against the Technic Hub's own result within 0.5°.
    const turn = async (part, transport) => {
        const source = 'WHEN flag clicked:\n  pup set motor A power to 50 %\n  pup turn motor A on for 360 degrees\n';
        const r = await runLabHubProgram(source, {modelText: cityBench(part), transport, timeLimitMs: 3000});
        try {
            assert.equal(r.extensionId, 'legopoweredup');
            assert.deepEqual(errorsBack(r.received), [], 'the hub took every message');
            const degrees = r.written.find(b => b[2] === 0x81 && b[3] === 0x00 && b[5] === 0x0b);
            assert.ok(degrees, 'a StartSpeedForDegrees write to port A');
            return r.hub.readPort('A').angleDeg;
        } finally {
            r.session.dispose();
        }
    };
    for (const transport of ['ble', 'scratchlink']) {
        test(`legopoweredup turns a motor on the Powered Up City Hub's port A one full turn (over ${transport})`, async () => {
            const city = await turn('28738.dat', transport);
            const technic = await turn('22127.dat', transport);
            assert.ok(Math.abs(city - 360) <= 5, `City Hub motor A at ${city}°`);
            assert.ok(Math.abs(city - technic) <= 0.5, `City Hub ${city}° vs Technic Hub ${technic}°`);
        });
    }
}
