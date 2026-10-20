// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The REAL LEGO extensions drive the Robot Lab's radio hubs, headless (docs/ROBOT-LAB-HUBS-PLAN.md
 * P3 acceptance): pseudocode -> SB3 -> the real Scratch VM -> the bundled legopoweredup /
 * legoboostunified / wedo2unified extension, unchanged -> Web Bluetooth or a Scratch Link BLE
 * socket -> the virtual peripheral -> the hub's protocol and controller -> Jolt physics
 * (test/helpers/lab-hubs-vm.mjs). Judged from the world and the hub's encoder, never from the
 * extension's own bookkeeping:
 *
 *   - legopoweredup's "turn motor A on for 360 degrees" turns the Technic large motor on the
 *     Technic Hub's port A by 360 ± 2° (its encoder, the hinge's measured rotation), over Web
 *     Bluetooth AND over Scratch Link, and the shipped example turns it back to 0 ± 2°;
 *   - the shipped BOOST example drives the Move Hub rover ahead with one "AB" block — its heading is the one
 *     the 50 ms start skew between A and B explains, held while cruising — and then spins it, on either
 *     Move Hub firmware's port map;
 *   - the shipped WeDo 2.0 example runs the rover's motor until the motion sensor sees the
 *     wall, then stops it short of the wall, over both transports;
 *   - what the extension wrote is LWP3 / WeDo bytes the hub took (no error message back).
 *
 * And the judges can fail: without the stop, the WeDo rover reaches the wall.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the LEGO hub runs: their inputs are present', () => {
        assert.fail(`missing ${missing} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runLabHubProgram, runStockHubExtension, modelText, programText} = await import('./helpers/lab-hubs-vm.mjs');
    const DEG_TOLERANCE = 2;

    /** The hub body's floor position (x, z) and heading (degrees about +y) from the session. */
    const pose = session => {
        const s = session.snapshot();
        const i = s.bodyIds.indexOf(session.hubs[0].body);
        const [x, , z] = [s.bodies[i * 7], s.bodies[i * 7 + 1], s.bodies[i * 7 + 2]];
        const [qx, qy, qz, qw] = [s.bodies[i * 7 + 3], s.bodies[i * 7 + 4], s.bodies[i * 7 + 5], s.bodies[i * 7 + 6]];
        const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)) * 180 / Math.PI;
        return {x, z, yaw};
    };
    const errorsBack = received => received.filter(b => b[2] === 0x05);

    for (const transport of ['ble', 'scratchlink']) {
        test(`legopoweredup turns the Technic large motor on port A by 360 ± ${DEG_TOLERANCE}° (over ${transport})`, async () => {
            const source = 'WHEN flag clicked:\n  pup set motor A power to 50 %\n  pup turn motor A on for 360 degrees\n';
            const r = await runLabHubProgram(source, {modelText: modelText('technic-hub-bench.ldr'), transport, timeLimitMs: 3000});
            try {
                assert.equal(r.extensionId, 'legopoweredup');
                const angle = r.hub.readPort('A').angleDeg;
                assert.ok(Math.abs(angle - 360) <= DEG_TOLERANCE, `motor A at ${angle.toFixed(2)}°`);
                // The command the extension sent is §3.27.9 StartSpeedForDegrees: port 0, execute immediately with
                // feedback, 0x0B, Int32 360, speed 50, max power 100, then its end state and profile bytes.
                // Scoped by the message's own length byte (§3.1 common header), not a fixed prefix: the
                // write is exactly one 14-byte message, and every field is read from it by position.
                const degrees = r.written.find(b => b[2] === 0x81 && b[5] === 0x0b);
                assert.ok(degrees, 'a StartSpeedForDegrees write');
                assert.equal(degrees.length, degrees[0], 'the write is one whole LWP3 message');
                const [length, hubId, type, port, startup, sub, d0, d1, d2, d3, speed, maxPower] = degrees;
                assert.deepEqual({length, hubId, type, port, startup, sub, degrees: d0 | d1 << 8 | d2 << 16 | d3 << 24, speed, maxPower},
                    {length: 14, hubId: 0x00, type: 0x81, port: 0x00, startup: 0x11, sub: 0x0b, degrees: 360, speed: 0x32, maxPower: 0x64});
                assert.deepEqual(errorsBack(r.received), [], 'the hub took every message');
                // §3.32 feedback: in progress (0x01), then idle + completed (0x0A) for the degrees command.
                const feedback = r.received.filter(b => b[2] === 0x82).map(b => b[4]);
                assert.ok(feedback.includes(0x01) && feedback.lastIndexOf(0x0a) > feedback.indexOf(0x01), JSON.stringify(feedback));
            } finally {
                r.session.dispose();
            }
        });
    }

    test('the shipped Technic Hub example turns motor A a full turn and back', async () => {
        const samples = [];
        const r = await runLabHubProgram(programText('technic-hub-bench.bw'), {modelText: modelText('technic-hub-bench.ldr'),
            timeLimitMs: 5000, onFrame: ({hub, t}) => samples.push([t, hub.readPort('A').angleDeg])});
        try {
            // The first turn has finished and rests before the second starts (the extension waits 2 s for it).
            const rest = samples.filter(([t]) => t > 1500 && t < 2000).map(([, a]) => a);
            assert.ok(rest.length && rest.every(a => Math.abs(a - 360) <= DEG_TOLERANCE), `after the first turn: ${rest.slice(0, 3)}`);
            const end = r.hub.readPort('A').angleDeg;
            assert.ok(Math.abs(end) <= DEG_TOLERANCE, `back at ${end.toFixed(2)}°`);
        } finally {
            r.session.dispose();
        }
    });

    // The BOOST rover (boost-rover.ldr): wheels of radius 70 LDU on the Move Hub's outputs at x = ±125 LDU.
    const WHEEL_RADIUS_M = 70 * 0.0004;
    const TRACK_M = 250 * 0.0004;
    // The Move Hub runs either firmware: the current port map (A 0x00, B 0x01) or the legacy one before
    // 1.0.00.0224 (A 0x37, B 0x38); legoboostunified reads the version and the attached I/O and picks it.
    for (const [firmware, ports] of [['current', [0x00, 0x01]], ['legacy', [0x37, 0x38]]]) {
        test(`the shipped BOOST example drives the Move Hub rover ahead with "AB", then spins it (${firmware} firmware)`, async () => {
            const track = [];
            const r = await runLabHubProgram(programText('boost-rover.bw'), {modelText: modelText('boost-rover.ldr'), mat: 'plain',
                firmware, timeLimitMs: 5000, onFrame: ({session, hub, t}) => track.push({t, ...pose(session), speed: hub.readPort('A').speedDps})});
            try {
                assert.equal(r.extensionId, 'legoboostunified');
                // One "AB" block reaches both motors: the extension queues one StartSpeedForTime per port, 50 ms apart.
                const timed = r.log.filter(e => e.dir === 'down' && e.bytes[2] === 0x81 && e.bytes[5] === 0x09);
                assert.deepEqual(timed.map(e => e.bytes[3]), ports, 'StartSpeedForTime to A, then to B');
                const skewMs = timed[1].t - timed[0].t;
                assert.ok(skewMs >= 50 && skewMs <= 120, `B starts ${skewMs} ms after A`);
                const start = track[0];
                const ahead = track.filter(p => p.t <= 2000);
                const end = ahead.at(-1);
                const driven = Math.hypot(end.x - start.x, end.z - start.z);
                assert.ok(driven > 0.4, `drove ${driven.toFixed(3)} m ahead`);
                // The heading it takes is the start skew's and no more: wheel A turns speed · skew further than B
                // before B catches up, which turns the rover by that arc over the track — on a real Move Hub as here,
                // since the hub starts each motor when its command arrives. Then it holds that heading (no spin-out).
                const speed = ahead.at(-1).speed;
                const expected = speed * skewMs / 1000 * Math.PI / 180 * WHEEL_RADIUS_M / TRACK_M * 180 / Math.PI;
                const heading = end.yaw - start.yaw;
                assert.ok(Math.abs(Math.abs(heading) - expected) <= 5, `heading ${heading.toFixed(1)}°, the skew explains ${expected.toFixed(1)}°`);
                const cruise = ahead.filter(p => p.t >= 1000).map(p => p.yaw);
                assert.ok(Math.max(...cruise) - Math.min(...cruise) < 2, `it holds its heading while cruising: ${Math.min(...cruise).toFixed(1)}…${Math.max(...cruise).toFixed(1)}°`);
                let turned = track.at(-1).yaw - end.yaw;
                turned = ((turned + 540) % 360) - 180;
                assert.ok(Math.abs(turned) > 45, `then spun ${turned.toFixed(1)}°`);
                assert.deepEqual(errorsBack(r.received), []);
            } finally {
                r.session.dispose();
            }
        });
    }

    for (const transport of ['ble', 'scratchlink']) {
        test(`the shipped WeDo 2.0 example runs the motor until the motion sensor sees the wall (over ${transport})`, async () => {
            const track = [];
            const r = await runLabHubProgram(programText('wedo-milo.bw'), {modelText: modelText('wedo-milo.ldr'), mat: 'wall', transport,
                timeLimitMs: 6000, onFrame: ({session, hub, t}) => track.push({t, ...pose(session), motor: hub.readPort('A'), seen: hub.readPort('B')})});
            try {
                assert.equal(r.extensionId, 'wedo2unified');
                const started = track.find(p => p.motor.state === 'run');
                assert.ok(started, 'the motor ran');
                const stopped = track.find(p => p.t > started.t && p.motor.state !== 'run');
                assert.ok(stopped, 'and stopped');
                const moved = track.at(-1).x - track[0].x;
                assert.ok(moved > 0.3, `the rover drove ${moved.toFixed(3)} m toward the wall`);
                // It stopped because the sensor saw the wall: at the stop its ray met something within the
                // detect threshold (value < 5 of 10, MOTION_RANGE_MM 150 → < 75 mm), and it never touched it.
                assert.ok(stopped.seen.distanceMm >= 0 && stopped.seen.distanceMm < 90, JSON.stringify(stopped.seen));
                assert.ok(track.at(-1).seen.distanceMm > 35, `rests ${track.at(-1).seen.distanceMm} mm from the wall`);
                // The WeDo hub's own protocol: the motor power command [connect id 1, command 1, length 1, power].
                assert.ok(r.written.some(b => b[0] === 1 && b[1] === 1 && b[2] === 1 && b[3] === 100), 'power 100 on port A');
            } finally {
                r.session.dispose();
            }
        });
    }

    test('the judge can fail: without its stop the WeDo rover drives into the wall', async () => {
        const source = 'WHEN flag clicked:\n  wedo set motor A power to 100 %\n  wedo turn motor A on\n';
        let last = null;
        const r = await runLabHubProgram(source, {modelText: modelText('wedo-milo.ldr'), mat: 'wall', timeLimitMs: 5000,
            onFrame: ({hub}) => { last = {motor: hub.readPort('A'), seen: hub.readPort('B')}; }});
        try {
            assert.equal(last.motor.state, 'run');
            const seen = last.seen.distanceMm;
            // Its front is against the wall: the sensor's window sits 8 mm behind the hub's front edge and the castors.
            assert.ok(seen >= 0 && seen <= 30, `pressed against the wall: ${seen} mm`);
        } finally {
            r.session.dispose();
        }
    });

    for (const [firmware, ports] of [['current', [0x00, 0x01]], ['legacy', [0x37, 0x38]]]) {
    test(`scratch-vm's own BOOST extension finds the Move Hub by its manufacturer data over Scratch Link and turns A and B two rotations (${firmware} firmware)`, async () => {
        // Its io/ble.js discovers with a manufacturerData filter (company 0x0397, System Type 0x40) and waits for
        // each motor's §3.32 feedback before the block ends; it picks the port map by the firmware version.
        let finished = false;
        const r = await runStockHubExtension('boost', {modelText: modelText('boost-rover.ldr'), mat: 'plain', firmware,
            steps: async (ext, wait, block) => {
                finished = await block(ext.motorOnForRotation({MOTOR_ID: 'AB', ROTATION: 2}));
                await wait(300);
            }});
        try {
            assert.equal(finished, true, 'the block ended on the hub\'s completion feedback');
            for (const port of ['A', 'B']) {
                const angle = r.hub.readPort(port).angleDeg;
                assert.ok(Math.abs(angle - 720) <= 3, `${port} at ${angle.toFixed(2)}°`);
            }
            // Its max power is the power + 10 (scratch3_boost BoostMotorMaxPowerAdd): 50 + 10 = 60 (0x3C).
            const sent = r.written.filter(b => b[2] === 0x81 && b[5] === 0x0b);
            assert.deepEqual(sent.map(b => [b[3], b[11]]), [[ports[0], 0x3c], [ports[1], 0x3c]]);
        } finally {
            r.session.dispose();
        }
    });
    }

    // "turn motor off" honours the stop action (CrispStrobe/extensions PR #55): LWP3 §6.1 StartPower 0 floats and
    // 127 brakes; §3.27.5 StartSpeed 0 holds the position. Judged from the hub's motor state and the shaft.
    for (const action of ['float', 'brake', 'hold']) {
        test(`legopoweredup "turn motor A off" with stop action ${action}: the Technic Hub's motor ends in ${action}`, async () => {
            const source = `WHEN flag clicked:\n  pup set motor A stop action to ${action}\n  pup set motor A power to 60 %\n` +
                '  pup turn motor A on\n  wait 1 seconds\n  pup turn motor A off\n';
            const samples = [];
            const r = await runLabHubProgram(source, {modelText: modelText('technic-hub-bench.ldr'), timeLimitMs: 2500,
                onFrame: ({hub, t}) => samples.push({t, ...hub.readPort('A')})});
            try {
                assert.deepEqual(errorsBack(r.received), [], 'the hub took every message');
                const running = samples.filter(p => p.mode === 'speed' || p.mode === 'power');
                assert.ok(running.length, 'the motor ran');
                const last = samples.at(-1);
                assert.equal(last.mode, action, `the motor's state after "off": ${last.mode}`);
                // Its shaft then: braked and held it stands still; floating it may still be coasting, but slowing.
                const stop = samples.find(p => p.t > running.at(-1).t);
                const settled = samples.filter(p => p.t >= stop.t + 500);
                const turned = settled.at(-1).angleDeg - settled[0].angleDeg;
                if (action !== 'float') assert.ok(Math.abs(turned) < 2, `${action}: ${turned.toFixed(2)}° after it stopped`);
            } finally {
                r.session.dispose();
            }
        });
    }

    test('legopoweredup names the hub it is connected to by its LWP3 System Type (the Technic Hub, 0x80)', async () => {
        const r = await runLabHubProgram('WHEN flag clicked:\n  pup set motor A power to 10 %\n', {
            modelText: modelText('technic-hub-bench.ldr'), timeLimitMs: 800});
        try {
            const name = String(await r.extension.getHubType());
            // The Technic Hub's System Type 0x80 (community id; LEGO's document lists 0x00–0x42) is the "Control+ Hub".
            assert.equal(name, 'Control+ Hub');
        } finally {
            r.session.dispose();
        }
    });

    test('scratch-vm\'s own WeDo 2.0 extension runs the rover until its distance (percent) drops, then floats the motor', async () => {
        let seen = null;
        const r = await runStockHubExtension('wedo2', {modelText: modelText('wedo-milo.ldr'), mat: 'wall',
            steps: async (ext, wait) => {
                ext.motorOn({MOTOR_ID: 'motor'});
                for (let i = 0; i < 200 && !(ext.getDistance() > 0 && ext.getDistance() < 50); i++) await wait(50);
                seen = ext.getDistance();
                ext.motorOff({MOTOR_ID: 'motor'});
                await wait(500);
            }});
        try {
            assert.ok(seen > 0 && seen < 50, `the sensor reads ${seen} % near the wall`);
            assert.equal(r.hub.readPort('A').state, 'float');
            // scratch3_wedo2's input command for its distance sensor: unit 1 (percent).
            assert.ok(r.written.some(b => b.join(',') === [1, 2, 2, 0x23, 0, 1, 0, 0, 0, 1, 1].join(',')));
        } finally {
            r.session.dispose();
        }
    });
}
