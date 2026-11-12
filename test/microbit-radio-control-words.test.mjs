/**
 * Radio off and band, the serial port's pins and rate, reset, panic, compass calibration and the
 * accelerometer range (2026-11-01): imported as words, MicroPython's own calls, and exported as
 * MakeCode's. radio.off / setFrequencyBand run in MakeCode's simulator and in lite's firmware;
 * the rest are checked as generated code that runs on the simulated board (reset and panic only
 * generated: they end the program) and as exports MakeCode compiles.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {compileMakeCode, runMakeCodeSim, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';
import {runOnMicrobitFirmware} from '../scripts/lib/microbit-firmware.mjs';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const SB3Creator = existsSync(COMPILER) ? (await import(COMPILER)).default : null;
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode)' :
    !SB3Creator ? 'sb3-creator not integrated' : false;
const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

function lite (ts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    return {imported, py: gen.py};
}

test('radio.off and setFrequencyBand run as MakeCode\'s do, and export back', {skip}, async () => {
    const ts = [
        'radio.setGroup(2)',
        'radio.setFrequencyBand(7)',
        'radio.sendNumber(1)',
        'radio.off()',
        'serial.writeLine("done")'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 800, at: []});
    assert.equal(mc.error, null);
    const {imported, py} = lite(ts);
    assert.ok(py.includes('radio.config(channel=int(7))') && py.includes('radio.off()'));
    const run = await runOnMicrobitFirmware(py, {ms: 800});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out), mc.serial.map(l => l.text.trim()).filter(Boolean));
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    for (const w of ['radio.setFrequencyBand(7)', 'radio.off()']) assert.ok(ex.ts.includes(w), w);
    await compileMakeCode(ex.ts);
});

test('serial redirect and baud, compass calibration and the accelerometer range are MicroPython calls and export', {skip}, async () => {
    const ts = [
        'serial.redirect(SerialPin.P0, SerialPin.P1, BaudRate.BaudRate9600)',
        'serial.setBaudRate(BaudRate.BaudRate115200)',
        'input.setAccelerometerRange(AcceleratorRange.FourG)',
        'input.calibrateCompass()',
        'serial.writeLine("after")'
    ].join('\n');
    await compileMakeCode(ts);
    const {imported, py} = lite(ts);
    for (const w of ['uart.init(baudrate=int(9600), tx=pin0, rx=pin1)', 'uart.init(baudrate=int(115200))', 'accelerometer.set_range(int(4))', 'compass.calibrate()']) {
        assert.ok(py.includes(w), w);
    }
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    for (const w of ['serial.redirect(SerialPin.P0, SerialPin.P1, BaudRate.BaudRate9600)', 'serial.setBaudRate(BaudRate.BaudRate115200)',
        'input.setAccelerometerRange(AcceleratorRange.FourG)', 'input.calibrateCompass()']) assert.ok(ex.ts.includes(w), w);
    await compileMakeCode(ex.ts);
});

test('control.reset and control.panic are MicroPython\'s reset() and panic(), and export back', {skip}, async () => {
    const ts = 'control.panic(7)\ncontrol.reset()\n';
    const {imported, py} = lite(ts);
    assert.ok(py.includes('panic(int(7))') && py.includes('reset()'));
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.ok(ex.ts.includes('control.panic(7)') && ex.ts.includes('control.reset()'));
    await compileMakeCode(ex.ts);
});
