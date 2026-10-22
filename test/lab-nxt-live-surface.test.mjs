// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runOnBtHub, projectOfBlocks} from './helpers/bt-hub-vm.mjs';
import {REPO} from './helpers/bw-integrated.mjs';

const bot = readFileSync(`${REPO}/overlay/scratch-gui/static/sim-lab/models/nxt-bumper-bot.ldr`, 'utf8');
const literal = value => [1, [typeof value === 'number' ? 4 : 10, String(value)]];
const command = (opcode, next, args, parent) => ({opcode, next, parent, inputs: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, literal(v)])), fields: {}, shadow: false, topLevel: false});
const motorProgram = power => projectOfBlocks({extensions: ['legonxt'], blocks: {
    flag: {opcode: 'event_whenflagclicked', next: 'sync', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0},
    sync: command('legonxt_motorSync', 'wait', {FIRST: 'B', SECOND: 'C', POWER: power, TURN: 0}, 'flag'),
    wait: command('control_wait', 'stopB', {DURATION: 0.4}, 'sync'),
    stopB: command('legonxt_motorStop', 'stopC', {PORT: 'B', ACTION: 'brake'}, 'wait'),
    stopC: command('legonxt_motorStop', null, {PORT: 'C', ACTION: 'brake'}, 'stopB')
}});
for (const power of [50, 0]) {
    test(`NXT live sync: VM blocks drive the actual two-motor Lab model at ${power}% then brake`, async () => {
        let paired = false;
        const r = await runOnBtHub({project: motorProgram(power)}, {modelText: bot, profile: 'nxt', extensionId: 'legonxt', timeLimitMs: 1800,
            stopWhen: (p, all, hub) => { paired ||= hub.s.outputs[1].regulation === 2 && hub.s.outputs[2].regulation === 2; return false; }});
        assert.equal(r.connectError, null);
        assert.equal(paired, true, 'real SETOUTPUTSTATE reached both sync registers');
        for (const port of ['B', 'C']) {
            const motion = Math.abs(r.track.at(-1).motors[port] - r.track[0].motors[port]);
            assert.equal(motion > 20, power !== 0, `${port} same motion judge rejects the zero-power program (${motion})`);
            const earlier = r.track.find(p => p.t > 1200);
            assert.ok(Math.abs(r.track.at(-1).motors[port] - earlier.motors[port]) < 3, `${port} braked`);
        }
    });
}

test('NXT buttons: real extension IOMap reads held state and short/long release counts without clearing', async () => {
    let task, done = false, error;
    const observations = [];
    const r = await runOnBtHub({project: projectOfBlocks({extensions: ['legonxt'], blocks: {}})}, {modelText: bot, profile: 'nxt', extensionId: 'legonxt', timeLimitMs: 4000,
        stopWhen: (p, all, hub, {extension}) => {
            if (!task) task = (async () => {
                observations.push(await extension.buttonPressed({BUTTON: 'enter'}));
                hub.pressButton(3, true);
                observations.push(await extension.buttonPressed({BUTTON: 'enter'}));
                observations.push(await extension.buttonReleaseCount({BUTTON: 'enter'}));
                await (extension._inst || extension).peripheral.sleep(2100);
                hub.pressButton(3, false);
                observations.push(await extension.buttonPressed({BUTTON: 'enter'}));
                observations.push(await extension.buttonReleaseCount({BUTTON: 'enter'}));
                hub.pressButton(3, true); hub.pressButton(3, false);
                observations.push(await extension.buttonReleaseCount({BUTTON: 'enter'}));
                observations.push(await extension.buttonReleaseCount({BUTTON: 'enter'}));
                observations.push(await extension.buttonReleaseCount({BUTTON: 'left'}));
            })().then(() => {done = true;}, e => {error = e; done = true;});
            return done;
        }});
    assert.equal(r.connectError, null);
    assert.equal(error, undefined, String(error?.stack));
    assert.equal(done, true);
    assert.deepEqual(observations, [false, true, 0, false, 1, 2, 2, 0]);
    assert.equal(r.hub.s.buttons[3].longReleases, 1, 'the held duration used the actual Lab clock');
    assert.equal(r.hub.s.buttons[3].shortReleases, 1);
});

const sensorScene = facing => [
    '0 NXT ultrasonic listening bench', '0 !BW ID hub',
    '1 7 0 0 0 1 0 0 0 1 0 0 0 1 53788.dat',
    '0 !BW ID listener', '0 !BW PORT 4',
    '1 7 600 -2000 0 1 0 0 0 1 0 0 0 1 53792.dat',
    '0 !BW ID emitter', '0 !BW PORT 2',
    `1 7 600 -2000 600 ${facing ? '1 0 0 0 1 0 0 0 1' : '-1 0 0 0 1 0 0 0 -1'} 53792.dat`, ''
].join('\n');
for (const facing of [true, false]) {
    test(`NXT ultrasonic: actual scene emitter ${facing ? 'faces the listener' : 'faces away and fails the same event judge'}`, async () => {
        let task, done = false, error;
        const bytes = [];
        const r = await runOnBtHub({project: projectOfBlocks({extensions: ['legonxt'], blocks: {}})}, {modelText: sensorScene(facing), profile: 'nxt', extensionId: 'legonxt', timeLimitMs: 1000,
            stopWhen: (p, all, hub, {extension}) => {
                if (!task) task = (async () => {
                    await extension.setUltrasonicMode({PORT: 'S4', MODE: 'listen'});
                    bytes.push(await extension.getUltrasonicEventByte({PORT: 'S4'}));
                    bytes.push(await extension.getUltrasonicEventByte({PORT: 'S4'}));
                    await assert.rejects(extension.getUltrasonicEventByte({PORT: 'S1'}), /failed/);
                })().then(() => {done = true;}, e => {error = e; done = true;});
                return done;
            }});
        assert.equal(r.connectError, null);
        assert.equal(error, undefined, String(error?.stack));
        assert.equal(done, true);
        assert.deepEqual(bytes, facing ? [1, 1] : [0, 0], '0/1 is the documented scene model estimate, not a hardware encoding claim');
    });
}
