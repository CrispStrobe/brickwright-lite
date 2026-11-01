/**
 * Built-in event sources on control.onEvent (2026-11-01): the buttons' DOWN, UP,
 * CLICK and LONG_CLICK as CODAL raises them (the ids and values of pxt-microbit's
 * EventBusSource / EventBusValue). The program runs in MakeCode's simulator with
 * button presses made the way the board's own view makes them (makecode-sim.mjs,
 * presses), and as lite imports it (MicroPython in lite's firmware, the same
 * presses); the printed lines must agree, and so must the export's. Gestures and
 * pins are polled like input.onGesture and input.onPinPressed; those are checked
 * by the words they become, since the simulator has no scripted shake or touch.
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

/** MakeCode's lines, lite's lines (from the imported blocks), and the export's lines, under the same button presses. */
async function three (ts, presses, {ms = 5000} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: [], presses: presses.map(([at, which, hold]) => [at, which.toUpperCase(), hold])});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:
${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    const run = await runOnMicrobitFirmware(gen.py, {ms, presses});
    assert.equal(run.traceback, null, `lite's firmware stopped:
${run.traceback}`);
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'events'});
    assert.deepEqual(ex.unsupported, []);
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms, at: [], presses: presses.map(([at, which, hold]) => [at, which.toUpperCase(), hold])});
    assert.equal(back.error, null, `the export stopped: ${back.error}`);
    const text = r => r.serial.map(l => l.text.trim()).filter(Boolean);
    return {mc: text(mc), lite: lines(run.out), back: text(back)};
}

const BUTTONS = `
control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_A, EventBusValue.MICROBIT_BUTTON_EVT_DOWN, function () {
    serial.writeLine("down")
})
control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_A, EventBusValue.MICROBIT_BUTTON_EVT_UP, function () {
    serial.writeLine("up")
})
control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_A, EventBusValue.MICROBIT_BUTTON_EVT_CLICK, function () {
    serial.writeLine("click")
})
control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_B, EventBusValue.MICROBIT_BUTTON_EVT_CLICK, function () {
    serial.writeLine("b click")
})
control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_B, 4, function () {
    serial.writeLine("b long")
})
`;

test('control.onEvent on the buttons: DOWN at the press, UP then CLICK at the release, LONG_CLICK after a second', {skip}, async () => {
    const r = await three(BUTTONS, [[500, 'a', 100], [1000, 'b', 50], [2000, 'b', 1500]]);
    assert.deepEqual(r.mc, ['down', 'up', 'click', 'b click', 'b long']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('control.onEvent on A+B, a gesture and a pin is polled like the dedicated handlers', {skip}, () => {
    const imported = microbitToPseudocode([
        'control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_AB, EventBusValue.MICROBIT_BUTTON_EVT_DOWN, function () {',
        '    serial.writeLine("ab")',
        '})',
        'control.onEvent(EventBusSource.MICROBIT_ID_GESTURE, Gesture.Shake, function () {',
        '    serial.writeLine("shake")',
        '})',
        'control.onEvent(EventBusSource.MICROBIT_ID_IO_P1, EventBusValue.MICROBIT_BUTTON_EVT_CLICK, function () {',
        '    serial.writeLine("p1")',
        '})',
        'control.onEvent(EventBusSource.MICROBIT_ID_IO_P8, EventBusValue.MICROBIT_PIN_EVT_RISE, function () {',
        '    serial.writeLine("p8")',
        '})'
    ].join('\n'));
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /IF \(read button_a\) and \(read button_b\) THEN:/);
    assert.match(imported.code, /IF shake happening THEN:/);
    assert.match(imported.code, /IF pin P1 touched THEN:/);
    assert.match(imported.code, /IF pin P8 digital = 1 THEN:/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.ok(creator.generateMicroPython().ok);
});

test('an event source of the programs own stays a hat for control.raiseEvent', {skip}, () => {
    const imported = microbitToPseudocode('control.onEvent(4000, 1, function () {\n    serial.writeLine("mine")\n})\ncontrol.raiseEvent(4000, 1)\n');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN event 4000 1:/);
});
