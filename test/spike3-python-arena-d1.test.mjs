// SPDX-License-Identifier: BSD-3-Clause
/**
 * Task D1 (docs/OPEN-TASKS-2026-09-29.md): the SPIKE App 3 Python functions
 * that left the importer's refused set, run end to end and judged by what the
 * virtual hub and the arena actually produce.
 *
 * The whole route, nothing stubbed (test/helpers/spike-arena-vm.mjs):
 * SPIKE 3 Python -> the vendored reader -> the SPIKE dialect -> SB3Creator ->
 * the real Scratch VM -> the real bundled spikeprime extension -> Web
 * Bluetooth -> the virtual hub -> the arena, in simulated time.
 *
 * A reading must come from the model, not from a constant: the colour
 * channels are read over two different mat colours, and the gyro rate is
 * checked against the rate the drive base's geometry implies.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {REPO, importSource} from './helpers/bw-integrated.mjs';
import {runOnArena} from './helpers/spike-arena-vm.mjs';

const {default: pythonToPseudocode} = await importSource('src/lib/sb3-creator-python.js');
const {validateWorld} = await import(path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'spike-arena', 'arena-world.js'));

/** A flat mat of one colour, the rover in the middle; nothing to pass, so the run lasts timeLimitMs. */
const flatWorld = (background, timeLimitMs = 3000) => {
    const world = {
        id: `d1-${background}`,
        title: {en: 'D1', de: 'D1'},
        intro: {en: 'D1', de: 'D1'},
        mat: {width: 150, height: 100, background},
        zones: [{id: 'far', role: 'goal', shape: {type: 'circle', x: 140, y: 90, r: 2}, label: {en: 'far', de: 'fern'}}],
        start: {x: 60, y: 50, heading: 0},
        timeLimitMs,
        success: [{type: 'reach', zone: 'far'}],
        failure: []
    };
    assert.deepEqual(validateWorld(world), [], 'the test world is valid');
    return world;
};

const PRELUDE = [
    'from hub import port, light, light_matrix, sound, motion_sensor',
    'import runloop, motor_pair, color_sensor, distance_sensor, color',
    ''
].join('\n');
const program = (...lines) => `${PRELUDE}\nasync def main():\n${lines.map(l => `    ${l}`).join('\n')}\n\nrunloop.run(main())\n`;

/** Imports SPIKE 3 Python; every call must map (no refusal) for these tests. */
const imported = source => {
    const r = pythonToPseudocode(source);
    assert.equal(r.dialect, 'spike3');
    assert.deepEqual(r.unsupported, [], r.pseudocode);
    return r.pseudocode;
};

const run = async (source, world) => {
    const result = await runOnArena(imported(source), world);
    assert.deepEqual(result.unsupported, [], 'every statement the extension sent was understood by the hub');
    return result;
};

test('color_sensor.rgbi(): red, green and blue are the arena\'s raw channels for the mat under the sensor', async () => {
    const source = program(
        'await runloop.sleep_ms(300)',
        'r = color_sensor.rgbi(port.C)[0]',
        'g = color_sensor.rgbi(port.C)[1]',
        'b = color_sensor.rgbi(port.C)[2]');
    // arena-sim.js MAT_COLORS: red rgb [900, 150, 150], blue [120, 250, 800].
    const onRed = await run(source, flatWorld('red'));
    assert.deepEqual([onRed.variables.r, onRed.variables.g, onRed.variables.b].map(Number), [900, 150, 150]);
    const onBlue = await run(source, flatWorld('blue'));
    assert.deepEqual([onBlue.variables.r, onBlue.variables.g, onBlue.variables.b].map(Number), [120, 250, 800]);
});

test('motion_sensor.angular_velocity()[2] during a right turn in place: the arena\'s rate, in SPIKE 3 decidegrees/s', async () => {
    // velocity 222 deg/s = 20 % of the medium motor (1110 deg/s full speed).
    // Turning in place, each wheel covers 222/360 * pi * 5.6 cm per second on
    // an 11.2 cm track: 2 * 10.85 / 11.2 rad/s = 111 deg/s, clockwise seen
    // from above, which SPIKE 3 reports counterclockwise-positive, x10.
    const source = program(
        'motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)',
        'motion_sensor.reset_yaw(0)',
        'motor_pair.move(motor_pair.PAIR_1, 100, velocity=222)',
        'await runloop.sleep_ms(500)',
        'w = motion_sensor.angular_velocity()[2]',
        'yaw = motion_sensor.tilt_angles()[0]',
        'motor_pair.stop(motor_pair.PAIR_1)');
    const result = await run(source, flatWorld('white'));
    const w = Number(result.variables.w);
    const expected = -10 * (2 * (222 / 360 * Math.PI * 5.6) / 11.2) * 180 / Math.PI;
    assert.ok(Math.abs(w - expected) <= 10, `angular_velocity z ${w}, expected about ${expected.toFixed(0)}`);
    assert.ok(Number(result.variables.yaw) < 0, 'and it agrees with the yaw: both counterclockwise-positive, both negative on a right turn');
});

test('light_matrix.show(): each of the 25 pixels reaches the hub, row by row, at the hub\'s 0-9 level', async () => {
    const pixels = Array.from({length: 25}, (_, i) => (i % 3 === 0 ? 100 : i % 3 === 1 ? 56 : 0));
    const result = await run(program('light_matrix.clear()', `light_matrix.show([${pixels.join(', ')}])`,
        'await runloop.sleep_ms(100)'), flatWorld('white', 2500));
    assert.deepEqual(result.hub.data.display, pixels.map(v => Math.round(v * 9 / 100)));
});

test('light.color(), sound.volume() and distance_sensor.show()/clear() set the hub\'s outputs', async () => {
    const result = await run(program(
        'light.color(light.POWER, color.RED)',
        'sound.volume(40)',
        'distance_sensor.show(port.D, [100, 56, 0, 11])',
        'await runloop.sleep_ms(100)',
        'distance_sensor.clear(port.F)'), flatWorld('white', 2500));
    const {centerLight, volume, distanceLights} = result.hub.data;
    assert.equal(centerLight, 9, 'color.RED is 9 in the hub LED palette');
    assert.equal(volume, 40);
    assert.deepEqual(distanceLights[3], [9, 5, 0, 1], 'port D: top-left, top-right, bottom-left, bottom-right');
    assert.deepEqual(distanceLights[5], [0, 0, 0, 0], 'port F cleared');
});
