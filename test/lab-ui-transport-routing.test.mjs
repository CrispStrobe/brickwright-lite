// SPDX-License-Identifier: BSD-3-Clause
// The production routing and connection controllers, actual Scratch VM,
// bundled extension, HTTP protocol and Jolt models. No replacement block,
// connection result, encoder or motor is supplied by the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runLabHubProgram, modelText, programText} from './helpers/lab-hubs-vm.mjs';
import {httpEndpointFor} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-http.js';
import {bridgeEndpointFor} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-bridge.js';
import {runOverVirtualTransport} from './helpers/virtual-transport-vm.mjs';
import {projectOfBlocks} from './helpers/bt-hub-vm.mjs';
import {blocksBuilder} from './helpers/scratch-blocks-builder.mjs';
import {runSpikeProjectInLab, projectFromSource, FRAME_MS as SPIKE_FRAME_MS} from './helpers/spike-lab-routes.mjs';
import {judgeWallStopRun, reportWallStop} from './helpers/wall-stop-lab-judge.mjs';

const turn = degrees => `WHEN flag clicked:\n  pup set motor A power to 50 %\n  pup turn motor A on for ${degrees} degrees\n`;
const routed = result => {
    for (const request of ['POST /scan', 'POST /connect', 'POST /write', 'GET /notifications', 'POST /disconnect']) {
        assert.ok(result.bridged.includes(request), `${request} reached the production Lab route`);
    }
    assert.deepEqual(result.received.filter(bytes => bytes[2] === 0x05), [], 'no protocol error replies');
    assert.equal(httpEndpointFor('http://localhost:8080/scan'), null, 'owned HTTP endpoint removed after clean disconnect');
    assert.equal(bridgeEndpointFor('ws://localhost:8080'), null, 'owned stream endpoint removed too');
};

for (const degrees of [360, 180]) test(`production Lab HTTP route executes ${degrees} actual Powered Up degrees and restores host APIs`, async () => {
    const fetch = globalThis.fetch;
    const socket = globalThis.WebSocket;
    const serial = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serial');
    const result = await runLabHubProgram(turn(degrees), {modelText: modelText('technic-hub-bench.ldr'),
        transport: 'bridge', useLabRouting: true, timeLimitMs: 3000});
    try {
        routed(result);
        const actual = result.hub.readPort('A').angleDeg;
        assert.ok(Math.abs(actual - degrees) <= 2, `${degrees}-degree program ended at ${actual}`);
        if (degrees === 180) assert.ok(Math.abs(actual - 360) > 2, 'the 360-degree acceptance rejects the shorter program');
        assert.equal(globalThis.fetch, fetch);
        assert.equal(globalThis.WebSocket, socket);
        assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis.navigator, 'serial'), serial);
    } finally { result.session.dispose(); }
});

test('production Lab HTTP route drives the actual BOOST rover ahead with its shipped program', async () => {
    const positions = [];
    const result = await runLabHubProgram(programText('boost-rover.bw'), {modelText: modelText('boost-rover.ldr'),
        mat: 'plain', transport: 'bridge', useLabRouting: true, timeLimitMs: 2000,
        onFrame: ({session}) => positions.push(session.core.bodyPose(session.hubs[0].body).position)});
    try {
        routed(result);
        assert.equal(result.extensionId, 'legoboostunified');
        const first = positions[0];
        const last = positions.at(-1);
        assert.ok(Math.hypot(last[0] - first[0], last[2] - first[2]) > 0.4, 'actual rover traveled the shipped forward bound');
    } finally { result.session.dispose(); }
});

for (const route of ['serial', 'bridge']) {
    test(`production Lab ${route} route carries the actual EV3 program to a stop before the wall`, async () => {
        const result = await runOverVirtualTransport({bw: programText('ev3-wall-stopper.bw')}, {
            modelText: modelText('ev3-wall-stopper.ldr'), mat: 'wall', profile: 'ev3', extensionId: 'ev3comprehensive',
            route, useLabRouting: true, timeLimitMs: 6000});
        assert.equal(result.connectError, null);
        assert.equal(result.connected, true);
        assert.deepEqual(result.dialled, [], 'no physical socket fallback');
        const last = result.track.at(-1);
        const before = result.track.find(point => point.t >= last.t - 1000);
        const cm = result.hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
        assert.ok(last.position[0] - result.track[0].position[0] > 0.2, 'drove at the actual wall');
        assert.ok(cm > 2 && cm < 15, `stopped before the wall: ${cm} cm`);
        assert.ok(Math.abs(last.position[0] - before.position[0]) < 0.005, 'remained stopped');
    });

    test(`production Lab ${route} route carries the actual NXT bumper program`, async () => {
        let pressedAt = null;
        const result = await runOverVirtualTransport({project: projectOfBlocks(JSON.parse(programText('nxt-bumper-bot.blocks.json')))}, {
            modelText: modelText('nxt-bumper-bot.ldr'), mat: 'wall', profile: 'nxt', extensionId: 'legonxt',
            route, useLabRouting: true, timeLimitMs: 12000,
            stopWhen: (point, all, hub) => {
                if (pressedAt === null && hub.getInputValues(0).scaled === 1) pressedAt = point.t;
                return pressedAt !== null && point.t > pressedAt + 1500;
            }});
        assert.equal(result.connectError, null);
        assert.equal(result.connected, true);
        assert.deepEqual(result.dialled, [], 'no physical socket fallback');
        const last = result.track.at(-1);
        const before = result.track.find(point => point.t >= last.t - 1000);
        assert.ok(last.position[0] - result.track[0].position[0] > 0.1, 'actual bumper bot drove toward the wall');
        assert.equal(result.hub.getInputValues(0).scaled, 1, 'the physical bumper met the wall');
        for (const port of ['B', 'C']) {
            assert.ok(last.motors[port] > 360, `${port}: the initial finite move reached the motor`);
            assert.ok(Math.abs(last.motors[port] - before.motors[port]) < 3, `${port}: motor stopped at the bumper`);
        }
    });
}

test('production Lab HTTP route configures actual ev3dev blocks to loopback and stops before the wall', async () => {
    const b = blocksBuilder();
    const X = 'scratchtoev3';
    const motor = port => [`${X}_menu_motorPorts`, 'motorPorts', port];
    const flag = b.block('event_whenflagclicked', {top: true});
    const B = b.block(`${X}_ev3MotorRun`, {menus: {PORT: motor('B')}, values: {SPEED: 40}});
    const C = b.block(`${X}_ev3MotorRun`, {menus: {PORT: motor('C')}, values: {SPEED: 40}});
    const distance = b.block(`${X}_ev3UltrasonicSensor`, {menus: {PORT: [`${X}_menu_sensorPorts`, 'sensorPorts', '4']}, fields: {UNIT: 'cm'}});
    const compare = b.block('operator_lt', {blocksIn: {OPERAND1: distance}});
    b.blocks[compare].inputs.OPERAND2 = [1, b.shadow('text', 'TEXT', '15', compare)];
    const wait = b.block('control_repeat_until', {blocksIn: {CONDITION: compare}});
    const stopB = b.block(`${X}_ev3MotorStop`, {menus: {PORT: motor('B')}, fields: {BRAKE: 'brake'}});
    const stopC = b.block(`${X}_ev3MotorStop`, {menus: {PORT: motor('C')}, fields: {BRAKE: 'brake'}});
    b.stack(flag, B, C, wait, stopB, stopC);
    const result = await runOverVirtualTransport({project: projectOfBlocks({extensions: [X], blocks: b.blocks})}, {
        modelText: modelText('ev3-wall-stopper.ldr'), mat: 'wall', profile: 'ev3', extensionId: X, extensionDir: 'ev3dev',
        route: 'http', useLabRouting: true, timeLimitMs: 6000});
    assert.equal(result.connectError, null);
    assert.equal(result.connected, true);
    assert.equal(result.extension._inst.ev3IP, '127.0.0.1');
    assert.equal(result.extension._inst.ev3Port, 8080);
    assert.equal(result.extension._inst.ev3Protocol, 'http');
    assert.deepEqual(result.dialled, []);
    const last = result.track.at(-1);
    const before = result.track.find(point => point.t >= last.t - 1000);
    const cm = result.hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
    assert.ok(last.position[0] - result.track[0].position[0] > 0.2);
    assert.ok(cm > 2 && cm < 15, `actual ev3dev stop: ${cm} cm`);
    assert.ok(Math.abs(last.position[0] - before.position[0]) < 0.005);
});

test('production Lab SPIKE text bridge executes the actual 2.x REPL wall-stop program', async () => {
    const source = 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  set movement speed 30\n' +
        '  start moving steering 0\n  wait until (spike distance D) < 10\n  stop movement\n';
    const result = await runSpikeProjectInLab(await projectFromSource(source), {
        route: 'bridge', useLabRouting: true, modelText: modelText('wall-stopper.ldr'), mat: 'wall', timeLimitMs: 15000});
    const judged = judgeWallStopRun(result, {thresholdMm: 100, speedPercent: 30, frameMs: SPIKE_FRAME_MS});
    assert.equal(result.connectedProtocol, 'repl');
    assert.ok(result.sockets.some(socket => socket.url === 'ws://localhost:8081' && socket.by === 'VirtualBridgeSocket'));
    assert.ok(!result.sockets.some(socket => /:2011[01]\//.test(socket.url)), 'no Scratch Link fallback');
    assert.deepEqual(result.issues, []);
    assert.ok(judged.startGap > 0.5);
    assert.ok(judged.settled, reportWallStop(judged));
    assert.deepEqual(judged.failures, [], reportWallStop(judged));
    assert.equal(judged.ok, true);
});
