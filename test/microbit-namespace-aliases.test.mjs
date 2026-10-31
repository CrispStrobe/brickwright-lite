/**
 * Members of the micro:bit namespaces that are other members under another
 * name (control.millis is input.runningTime in ms, input.onShake is
 * input.onGesture(Gesture.Shake), radio.receiveNumber is the last packet's
 * number, pins.map is Math.map), and the serial settings MicroPython has no
 * use for. Each runs in MakeCode's simulator and as lite imports it
 * (MicroPython in lite's firmware); the printed lines must agree, and the
 * export's too where the call has a block to go back to.
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


const ALIASES = `
serial.setBaudRate(BaudRate.BaudRate115200)
serial.setRxBufferSize(32)
serial.redirectToUSB()
radio.setGroup(3)
radio.on()
basic.pause(300)
let t = control.millis()
let u = control.micros()
let r = input.runningTimeMicros()
if (t >= 300 && t < 400) {
    serial.writeLine("millis ok")
}
if (u >= 300000 && r >= 300000) {
    serial.writeLine("micros ok")
}
let m = pins.map(5, 0, 10, 0, 100)
serial.writeLine("map " + Math.floor(m))
control.runInParallel(function () {
    serial.writeLine("parallel")
})
`;

test('control.millis, micros, pins.map, radio.on, runInParallel and the USB serial settings agree with MakeCode', {skip}, async () => {
    const mc = await runMakeCodeSim(await compileMakeCode(ALIASES), {ms: 1500, at: []});
    assert.equal(mc.error, null);
    const imported = microbitToPseudocode(ALIASES);
    // pins.map is written out as its formula and said so; nothing else is refused.
    assert.deepEqual(imported.unsupported, ['pins.map() — written out as its formula; it goes back to MakeCode as arithmetic']);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, JSON.stringify(gen.reasons));
    const run = await runOnMicrobitFirmware(gen.py, {ms: 1500});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(want.sort(), ['map 50', 'micros ok', 'millis ok', 'parallel']);
    assert.deepEqual(lines(run.out).sort(), want);
});

test('input.onShake, onScreenUp, onScreenDown, onLogoUp, onLogoDown are the gesture handlers', {skip}, () => {
    const imported = microbitToPseudocode([
        'input.onShake(function () {', '    serial.writeLine("a")', '})',
        'input.onScreenUp(function () {', '    serial.writeLine("b")', '})',
        'input.onScreenDown(function () {', '    serial.writeLine("c")', '})',
        'input.onLogoUp(function () {', '    serial.writeLine("d")', '})',
        'input.onLogoDown(function () {', '    serial.writeLine("e")', '})'
    ].join('\n'));
    assert.deepEqual(imported.unsupported, []);
    for (const g of ['shake', 'face up', 'face down', 'tilt up', 'tilt down']) assert.ok(imported.code.includes(`IF ${g} happening THEN:`), g);
});

test('the older radio reporters read the last packet', {skip}, () => {
    const imported = microbitToPseudocode([
        'let a = radio.receivedSerial()', 'let b = radio.receivedTime()', 'let c = radio.receivedSignalStrength()',
        'let d = radio.receiveNumber()', 'let e = radio.receiveString()'
    ].join('\n'));
    assert.deepEqual(imported.unsupported, []);
    for (const w of ['last radio serial number', 'read last radio time', 'last radio signal strength', 'read last radio number', 'read last radio text']) {
        assert.ok(imported.code.includes(w), w);
    }
});
