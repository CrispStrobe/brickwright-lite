// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The ev3dev extension against a virtual ev3dev brick, in the Robot Lab physics
 * (docs/ROBOT-LAB-HUB-COVERAGE.md, EV3 "ev3dev").
 *
 * The REAL vendored ev3dev extension (id `scratchtoev3`) is pointed at the brick by its own
 * `set connection` block (https, its default address and port) and checked with its own `test
 * connection`; every request then goes through its Scratch.fetch to
 * bw-sim/transports/virtual-http.js -> bw-sim/transports/virtual-ev3dev.js -> the scene's EV3.
 * A wall stopper in its blocks (run B and C, repeat until the ultrasonic reads under 15 cm, stop
 * with brake) has to stop before the wall because of its reading; the same program with a threshold
 * that cannot be met has to drive into it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync, existsSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {WALL} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));
const {createVirtualEv3dev} = await import(path.join(GUI, 'src/lib/bw-sim/transports/virtual-ev3dev.js'));
const entry = MODELS.find(m => m.file === 'ev3-wall-stopper.ldr');
const modelText = readFileSync(path.join(GUI, MODELS_BASE, entry.file), 'utf8');
const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');

const IP = '192.168.178.50'; // the extension's own default address
const PORT = 8443; // its https default

if (!existsSync(missing)) {
    test('ev3dev against the virtual ev3dev brick', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOverVirtualTransport} = await import('./helpers/virtual-transport-vm.mjs');
    const {projectOfBlocks: projectOfEv3dev} = await import('./helpers/bt-hub-vm.mjs');
    const {blocksBuilder} = await import('./helpers/scratch-blocks-builder.mjs');

    const X = 'scratchtoev3';
    const wallStopper = threshold => {
        const b = blocksBuilder();
        const motor = port => [`${X}_menu_motorPorts`, 'motorPorts', port];
        const flag = b.block('event_whenflagclicked', {top: true});
        const runB = b.block(`${X}_ev3MotorRun`, {menus: {PORT: motor('B')}, values: {SPEED: 40}});
        const runC = b.block(`${X}_ev3MotorRun`, {menus: {PORT: motor('C')}, values: {SPEED: 40}});
        const distance = b.block(`${X}_ev3UltrasonicSensor`, {menus: {PORT: [`${X}_menu_sensorPorts`, 'sensorPorts', '4']}, fields: {UNIT: 'cm'}});
        const lt = b.block('operator_lt', {blocksIn: {OPERAND1: distance}});
        b.blocks[lt].inputs.OPERAND2 = [1, b.shadow('text', 'TEXT', String(threshold), lt)];
        const loop = b.block('control_repeat_until', {blocksIn: {CONDITION: lt}});
        const stopB = b.block(`${X}_ev3MotorStop`, {menus: {PORT: motor('B')}, fields: {BRAKE: 'brake'}});
        const stopC = b.block(`${X}_ev3MotorStop`, {menus: {PORT: motor('C')}, fields: {BRAKE: 'brake'}});
        b.stack(flag, runB, runC, loop, stopB, stopC);
        return projectOfEv3dev({extensions: [X], blocks: b.blocks});
    };

    const commands = [];
    const run = (project, {connect = defaultConnect, credentials = null} = {}) => {
        commands.length = 0;
        return runOverVirtualTransport({project}, {
            modelText, mat: entry.mat, profile: 'ev3', extensionId: X, extensionDir: 'ev3dev', route: 'http',
            http: {host: IP, port: PORT, handlerOf: getHub => createVirtualEv3dev(getHub, {...(credentials || {}),
                onCommand: (cmd, params, reply) => commands.push({cmd, params, status: reply.json.status})})},
            connect, timeLimitMs: 6000
        });
    };
    const defaultConnect = async extension => {
        extension.setConnectionMode({MODE: 'https', IP, PORT});
        return extension.testConnection();
    };

    const judge = ({track, hub}) => {
        const travelled = track.at(-1).position[0] - track[0].position[0];
        const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
        const before = track.find(p => p.t >= track.at(-1).t - 1000);
        const still = Math.abs(track.at(-1).position[0] - before.position[0]) < 0.005;
        return {travelled, cm, still, ok: travelled > 0.2 && cm > 2 && cm < 15 && still && track.at(-1).position[0] < WALL.faceX};
    };

    test('ev3dev: its blocks drive the EV3 wall stopper at the wall and stop it before the wall by the ultrasonic reading', async t => {
        const result = await run(wallStopper(15));
        assert.equal(result.connectError, null);
        assert.equal(result.connected, 'Connected', 'test connection saw the bridge');
        const sent = commands.map(c => `${c.cmd}:${c.params.port}:${c.status}`);
        assert.deepEqual(sent, ['motor_run:B:ok', 'motor_run:C:ok', 'motor_stop:B:ok', 'motor_stop:C:ok']);
        const judged = judge(result);
        t.diagnostic(`ev3dev: travelled ${judged.travelled.toFixed(3)} m, stopped ${judged.cm} cm from the wall`);
        assert.ok(judged.ok, JSON.stringify(judged));
        assert.ok(result.track.at(-1).motors.B > 90, 'motor B turned');
    });

    test('ev3dev: motor position reads the brick\'s encoder', async () => {
        const b = blocksBuilder();
        const flag = b.block('event_whenflagclicked', {top: true});
        const turn = b.block(`${X}_ev3MotorRunFor`, {menus: {PORT: [`${X}_menu_motorPorts`, 'motorPorts', 'B']}, values: {ROTATIONS: 1, SPEED: 30}});
        const wait = b.block('control_wait', {values: {DURATION: {value: 3, op: 'math_positive_number'}}});
        const position = b.block(`${X}_ev3MotorPosition`, {menus: {PORT: [`${X}_menu_motorPorts`, 'motorPorts', 'B']}});
        const set = b.block('data_setvariableto', {blocksIn: {VALUE: position}});
        b.blocks[set].fields.VARIABLE = ['pos', 'var-pos'];
        b.stack(flag, turn, wait, set);
        const project = projectOfEv3dev({extensions: [X], blocks: b.blocks});
        project.targets[1].variables = {'var-pos': ['pos', 0]};
        const result = await run(project, {});
        const read = result.vm.runtime.targets[1].variables['var-pos'].value;
        const tacho = result.hub.outputRead(0, 1).tacho;
        assert.ok(Math.abs(tacho - 360) <= 3, `the brick turned B one rotation (${tacho})`);
        assert.equal(Number(read), tacho, 'the reporter is the brick\'s count');
    });

    test('control: a wall stopper whose threshold cannot be met fails the judge', async () => {
        const result = await run(wallStopper(0));
        assert.equal(result.connected, 'Connected');
        assert.equal(judge(result).ok, false);
    });

    test('control: with credentials required and none given, the brick refuses and nothing moves', async () => {
        const result = await run(wallStopper(15), {credentials: {user: 'robot', password: 'maker'}});
        assert.notEqual(result.connected, 'Connected');
        assert.equal(commands.length, 0);
        assert.ok(Math.abs(result.track.at(-1).position[0] - result.track[0].position[0]) < 0.01);
    });

    test('ev3dev: with the right credentials (its set credentials block) the brick answers', async () => {
        const result = await run(wallStopper(15), {credentials: {user: 'robot', password: 'maker'}, connect: async extension => {
            extension.setCredentials({USER: 'robot', PASS: 'maker'});
            return defaultConnect(extension);
        }});
        assert.equal(result.connected, 'Connected');
        assert.ok(judge(result).ok);
    });
}
