/**
 * Pin PWM period, servo pulse, pulse timing and touch mode, the game's level and stopwatch, and the
 * MakeCode diagnostics MicroPython has nothing to set (2026-11-01). The game words run in MakeCode's
 * simulator and in lite's firmware; the pin words are checked as generated code that runs on the
 * simulated board (it has no PWM scope or pulse source) and as exports MakeCode compiles.
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

test('game.level, levelUp, startStopwatch and currentTime read as MakeCode\'s do', {skip}, async () => {
    const ts = [
        'game.startStopwatch()',
        'basic.pause(300)',
        'let t = game.currentTime()',
        'if (t >= 300 && t < 400) {',
        '    serial.writeLine("time ok")',
        '}',
        'serial.writeLine("level " + game.level())',
        'game.levelUp()',
        'game.levelUp()',
        'serial.writeLine("level " + game.level())'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 40000, at: []});
    assert.equal(mc.error, null);
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: 40000});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(want, ['time ok', 'level 1', 'level 3']);
    assert.deepEqual(lines(run.out), want);
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms: 40000, at: []});
    assert.deepEqual(back.serial.map(l => l.text.trim()).filter(Boolean), want);
});

test('PWM period, servo pulse, pulse timing and touch mode become MicroPython pin calls, run, and export', {skip}, async () => {
    const ts = [
        'pins.analogSetPeriod(AnalogPin.P1, 20000)',
        'pins.servoSetPulse(AnalogPin.P2, 1500)',
        'pins.touchSetMode(TouchTarget.P1, TouchTargetMode.Resistive)',
        'serial.writeLine("done")'
    ].join('\n');
    // (the simulator firmware has no machine.time_pulse_us, so pulseIn is checked as code and export only)
    const pulse = 'let width = pins.pulseIn(DigitalPin.P0, PulseValue.High, 1000)\nserial.writeLine("w " + width)';
    const generated = lite(pulse);
    assert.ok(generated.py.includes('_bw_pulse_in(pin0, 1, int(1000))'));
    assert.ok(exportToMakeCode(new SB3Creator().parse(generated.imported.code), {name: 'x'}).ts.includes('pins.pulseIn(DigitalPin.P0, PulseValue.High, 1000)'));
    await compileMakeCode(ts);
    const {imported, py} = lite(ts);
    for (const w of ['pin1.set_analog_period_microseconds(int(20000))', 'pin2.set_analog_period(20)', 'pin2.write_analog(int(1500) * 1023 // 20000)',
        'pin1.set_touch_mode(pin1.RESISTIVE)']) assert.ok(py.includes(w), w);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    await compileMakeCode(ex.ts);
    for (const w of ['pins.analogSetPeriod(AnalogPin.P1, 20000)', 'pins.servoSetPulse(AnalogPin.P2, 1500)',
        'pins.touchSetMode(TouchTarget.P1, TouchTargetMode.Resistive)']) assert.ok(ex.ts.includes(w), w);
});

test('MakeCode diagnostics and pin event modes MicroPython has nothing to set import as said no-ops', {skip}, async () => {
    const ts = [
        'control.gc()',
        'control.dmesg("x")',
        'control.setDebugFlags(1)',
        'pins.setEvents(DigitalPin.P1, PinEventType.Edge)',
        'serial.writeLine("after")'
    ].join('\n');
    const {py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out), ['after']);
});
