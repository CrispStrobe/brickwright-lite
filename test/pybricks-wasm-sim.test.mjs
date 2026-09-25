// The Pybricks SPIKE Prime simulator: Pybricks MicroPython compiled to wasm
// (build-pybricks-wasm.sh) on Brickwright's HAL (firmware/pybricks-wasm/).
//
// These tests load the SHIPPED assets from overlay/scratch-gui/static/pybricks-sim/
// and run real Pybricks programs on them, in deterministic simulated time.
// Each behavioural test states the state it starts from, so a subject that
// was already true before the program ran cannot pass it.
//
// Mutation evidence: scripts/pybricks-wasm-mutation-check.sh rebuilds the wasm
// with one subject removed at a time (light-matrix PWM store, motor drive,
// distance sensor input) and requires the matching test here to fail.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

import {createPybricksHost, isPybricksProgram, DEVICE_TYPES} from '../overlay/scratch-gui/src/lib/pybricks-sim/pybricks-hub-host.js';
import {applyHubStateToSim, mirrorSimToHubState} from '../overlay/scratch-gui/src/lib/pybricks-sim/pybricks-hub-bridge.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const assetDir = resolve(here, '../overlay/scratch-gui/static/pybricks-sim');
const require = createRequire(import.meta.url);
const factory = require(resolve(assetDir, 'pybricks-hub.js'));
const wasmBinary = readFileSync(resolve(assetDir, 'pybricks-hub.wasm'));

const newHub = async (options = {}) => {
    let output = '';
    const host = await createPybricksHost({
        factory, wasmBinary, realtime: false,
        onOutput: text => { output += text; },
        ...options
    });
    return {host, output: () => output};
};

const lines = text => text.split(/\r?\n/).filter(Boolean);

test('shipped assets match their provenance record', () => {
    const provenance = JSON.parse(readFileSync(resolve(assetDir, 'PROVENANCE.json'), 'utf8'));
    for (const name of ['pybricks-hub.js', 'pybricks-hub.wasm']) {
        const sha = createHash('sha256').update(readFileSync(resolve(assetDir, name))).digest('hex');
        assert.equal(sha, provenance.assets[name].sha256, `${name} differs from PROVENANCE.json — rebuild with build-pybricks-wasm.sh`);
    }
    assert.equal(provenance.upstream['pybricks-micropython'].commit, '4104553405decb0384bcfb030fbfcb4b5a9854cc');
    assert.ok(provenance.licence_gate.files > 400, 'licence gate must have judged the compiled file set');
    assert.deepEqual(provenance.licence_gate.reviewed, ['pybricks/util_mp/pb_kwarg_helper.h: CC-BY-SA-4.0 AND MIT']);
});

test('a program prints through the hub stdout', async () => {
    const {host, output} = await newHub();
    const run = await host.run('print("hello", 6 * 7)\n');
    assert.equal(run.result, 'ok');
    assert.deepEqual(lines(output()), ['hello 42']);
});

test('light matrix: pixels the program sets are the pixels the page reads', async () => {
    const {host} = await newHub();
    await host.boot();
    assert.deepEqual(host.pixels(), Array(25).fill(0), 'precondition: the matrix starts dark');
    const run = await host.run([
        'from pybricks.hubs import PrimeHub',
        'from pybricks.tools import wait',
        'hub = PrimeHub()',
        'hub.display.off()',
        'hub.display.pixel(0, 4, 100)',
        'hub.display.pixel(2, 2, 60)',
        'hub.display.pixel(4, 0, 30)',
        'wait(50)',
        ''
    ].join('\n'));
    assert.equal(run.result, 'ok');
    const expected = Array(25).fill(0);
    expected[4] = 100; // row 0, column 4
    expected[12] = 60; // row 2, column 2
    expected[20] = 30; // row 4, column 0
    assert.deepEqual(host.pixels(), expected);
});

test('motor: run_target moves the simulated shaft to the target and angle() reads it back', async () => {
    const {host, output} = await newHub();
    host.setDevice('A', 'motor-m');
    await host.boot();
    assert.ok(host.synced('A'), 'the Medium motor completed the LUMP handshake');
    assert.ok(Math.abs(host.motorAngle('A')) < 1, 'precondition: the shaft starts at 0 degrees');
    const run = await host.run([
        'from pybricks.pupdevices import Motor',
        'from pybricks.parameters import Port',
        'from pybricks.tools import wait, StopWatch',
        'm = Motor(Port.A)',
        'print("start", m.angle())',
        'm.run_target(500, 90, wait=False)',
        'sw = StopWatch()',
        'while not m.done() and sw.time() < 3000:',
        '    wait(10)',
        'wait(200)',
        'print("end", m.angle())',
        ''
    ].join('\n'));
    assert.equal(run.result, 'ok', output());
    const [start, end] = lines(output());
    assert.equal(start, 'start 0');
    const reported = Number(end.split(' ')[1]);
    assert.ok(Math.abs(reported - 90) <= 2, `Motor.angle() after run_target(90): ${reported}`);
    const physical = host.motorAngle('A');
    assert.ok(Math.abs(physical - 90) <= 3, `simulated shaft after run_target(90): ${physical}`);
});

test('sensor: a program waiting on the distance sensor wakes when the page changes it', async () => {
    const CHANGE_AT = 1500; // simulated ms after the program starts
    let programStart = null;
    let changedAt = null;
    const {host, output} = await newHub({
        onTick: ms => {
            if (programStart !== null && changedAt === null && ms - programStart >= CHANGE_AT) {
                host.setDistance('C', 120);
                changedAt = ms - programStart;
            }
        }
    });
    host.setDevice('C', 'distance');
    host.setDistance('C', 800);
    await host.boot();
    await host.idle(0);
    programStart = host.simulatedMs + 400; // run() settles 400 ms first
    const run = await host.run([
        'from pybricks.pupdevices import UltrasonicSensor',
        'from pybricks.parameters import Port',
        'from pybricks.tools import wait, StopWatch',
        'u = UltrasonicSensor(Port.C)',
        'first = u.distance()',
        'sw = StopWatch()',
        'while u.distance() > 200 and sw.time() < 5000:',
        '    wait(10)',
        'print(first, u.distance(), sw.time())',
        ''
    ].join('\n'));
    assert.equal(run.result, 'ok', output());
    const [first, seen, elapsed] = lines(output())[0].split(' ').map(Number);
    assert.equal(first, 800, 'precondition: the program first reads the initial distance');
    assert.equal(seen, 120, 'the loop ended on the value the page set, not on its timeout');
    assert.ok(changedAt !== null, 'the page did change the sensor');
    assert.ok(elapsed < 5000, `the loop ended before its own timeout (${elapsed} ms)`);
    assert.ok(elapsed + 50 >= CHANGE_AT - 400, `the program cannot have seen the change before it happened (${elapsed} ms)`);
});

test('colour and force sensors report what the page sets, through Pybricks\' own conversions', async () => {
    const {host, output} = await newHub();
    host.setDevice('B', 'color');
    host.setDevice('D', 'force');
    host.setColor('B', {r: 20, g: 200, b: 30});
    host.setForce('D', 2.5);
    const run = await host.run([
        'from pybricks.pupdevices import ColorSensor, ForceSensor',
        'from pybricks.parameters import Port',
        'c = ColorSensor(Port.B)',
        'f = ForceSensor(Port.D)',
        // pressed() defaults to 3 N, so 2.5 N is below it and above 2 N.
        'print(c.color(), f.force(), f.pressed(), f.pressed(2))',
        ''
    ].join('\n'));
    assert.equal(run.result, 'ok', output());
    assert.deepEqual(lines(output()), ['Color.GREEN 2.5 False True']);
});

test('IMU: tilt and heading follow the orientation the page sets', async () => {
    const {host, output} = await newHub();
    await host.boot();
    host.setOrientation({pitch: 30, roll: -20, yaw: 90});
    const run = await host.run([
        'from pybricks.hubs import PrimeHub',
        'from pybricks.tools import wait',
        'hub = PrimeHub()',
        'wait(1000)',
        'p, r = hub.imu.tilt()',
        'print(round(p), round(r), round(hub.imu.heading()))',
        ''
    ].join('\n'), {settleMs: 0});
    assert.equal(run.result, 'ok', output());
    assert.deepEqual(lines(output()), ['30 -20 90']);
});

test('buttons, speaker, exceptions and stop', async () => {
    const {host, output} = await newHub({
        onTick: ms => { if (ms === 1200) host.setButtons({left: true}); }
    });
    const run = await host.run([
        'from pybricks.hubs import PrimeHub',
        'from pybricks.parameters import Button',
        'from pybricks.tools import wait',
        'hub = PrimeHub()',
        'while Button.LEFT not in hub.buttons.pressed():',
        '    wait(10)',
        'hub.speaker.beep(440, 50)',
        'print("left")',
        '1 / 0',
        ''
    ].join('\n'), {settleMs: 0});
    assert.equal(run.result, 'exception');
    assert.match(output(), /^left\r?\n/);
    assert.match(output(), /ZeroDivisionError/);
    assert.equal(host.speaker().beeps >= 1, true, 'the beep reached the speaker driver');

    const stopping = host.run('while True:\n    pass\n', {settleMs: 0});
    setTimeout(() => host.stop(), 50);
    const stopped = await stopping;
    assert.equal(stopped.result, 'stopped');
});

test('the virtual SPIKE hub and the Pybricks simulator show the same hub', async () => {
    // Scratch side: lite's virtual hub, as the Virtual SPIKE Prime panel sets it.
    const hubState = new VirtualSpikeHubState();
    hubState.setPort('A', 'motor', {speed: 0, position: 0});
    hubState.setPort('C', 'distance', {distance: 345});
    const {host, output} = await newHub();
    applyHubStateToSim(host, hubState.data);
    assert.equal(host.device('A'), 'motor-m');
    assert.equal(host.device('C'), 'distance');
    const run = await host.run([
        'from pybricks.hubs import PrimeHub',
        'from pybricks.pupdevices import Motor, UltrasonicSensor',
        'from pybricks.parameters import Port',
        'hub = PrimeHub()',
        'print(UltrasonicSensor(Port.C).distance())',
        'Motor(Port.A).run_target(500, 45)',
        'hub.display.off()',
        'hub.display.pixel(1, 1, 100)',
        ''
    ].join('\n'));
    assert.equal(run.result, 'ok', output());
    assert.deepEqual(lines(output()), ['345'], 'Python read the distance the Scratch-side panel set');
    assert.deepEqual(hubState.data.display, Array(25).fill(0), 'precondition: nothing mirrored yet');
    mirrorSimToHubState(host, hubState);
    assert.equal(hubState.data.display[6], 100, 'the light matrix reached the virtual hub');
    assert.ok(Math.abs(hubState.data.motors[0].position - 45) <= 2,
        `the motor position reached the virtual hub: ${hubState.data.motors[0].position}`);
});

test('the Code tab offers the simulator only for Pybricks programs', () => {
    assert.equal(isPybricksProgram('from pybricks.hubs import PrimeHub\n'), true);
    assert.equal(isPybricksProgram('import pybricks\n'), true);
    assert.equal(isPybricksProgram('from microbit import *\n'), false);
    assert.equal(isPybricksProgram('# from pybricks import x\n'), false);
    assert.equal(DEVICE_TYPES.distance, 62);
});
