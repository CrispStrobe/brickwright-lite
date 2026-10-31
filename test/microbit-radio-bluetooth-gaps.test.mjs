/**
 * The micro:bit radio.sendValue / onReceivedValue, loops.everyInterval and
 * bluetooth.* gaps (2026-11-01). Programs run in pxt-microbit's own simulator
 * and as lite imports them (MicroPython in lite's firmware); the printed lines
 * must agree where the simulator can show the behaviour. Then the blocks
 * export back to MakeCode's calls, and pxt compiles them.
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

function lite (ts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    return {code: imported.code, py: gen.py};
}
const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

test('loops.everyInterval repeats on a timer: the same ticks as MakeCode\'s, none lost to a slow body', {skip}, async () => {
    const ts = [
        'let n = 0',
        'loops.everyInterval(500, function () {',
        '    n += 1',
        '    serial.writeLine("tick " + n)',
        '    basic.pause(100)',
        '})',
        'loops.everyInterval(1200, function () {',
        '    serial.writeLine("slow")',
        '})'
    ].join('\n');
    const ms = 2300;
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: []});
    assert.equal(mc.error, null);
    const {code, py} = lite(ts);
    assert.match(code, /WHEN every 500 ms:/);
    const run = await runOnMicrobitFirmware(py, {ms});
    assert.equal(run.traceback, null, run.traceback);
    const sim = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(lines(run.out), sim);
    assert.ok(sim.includes('tick 4'), `ticks seen: ${sim}`);
});

test('radio.sendValue sends the pair, the name cut to 8 characters; onReceivedValue splits it again', {skip}, async () => {
    const tx = lite('radio.setGroup(4)\nradio.sendValue("temperature", 21)\nradio.sendValue("x", -3.5)\n');
    const sent = await runOnMicrobitFirmware(tx.py, {ms: 500});
    assert.equal(sent.traceback, null, sent.traceback);
    assert.deepEqual(sent.sent.map(p => p.slice(3)), ['\u0000Vtemperat\u000021', '\u0000Vx\u0000-3.5']);
    const rx = lite([
        'radio.onReceivedValue(function (name, value) {',
        '    serial.writeLine(name + "=" + value)',
        '})',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    serial.writeLine("num " + receivedNumber)',
        '})'].join('\n'));
    const got = await runOnMicrobitFirmware(rx.py, {ms: 1000, radio: [[100, '\u0000Vtemperat\u000021'], [200, '7'], [300, '\u0000Vx\u0000-3.5']]});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(lines(got.out), ['temperat=21', 'num 7', 'x=-3.5']);
});

test('radio.sendValue with a serial number in front still arrives as a value', {skip}, async () => {
    const rx = lite([
        'radio.setTransmitSerialNumber(true)',
        'radio.onReceivedValue(function (name, value) {',
        '    serial.writeLine(name + ":" + value + ":" + radio.receivedPacket(RadioPacketProperty.SerialNumber))',
        '})'].join('\n'));
    const got = await runOnMicrobitFirmware(rx.py, {ms: 500, radio: [[100, '\u0000S9\u0000\u0000Vk\u00005']]});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(lines(got.out), ['k:5:9']);
});

const BLUETOOTH = [
    'bluetooth.startUartService()',
    'bluetooth.onBluetoothConnected(function () {',
    '    basic.showString("C")',
    '})',
    'bluetooth.onBluetoothDisconnected(function () {',
    '    basic.showString("D")',
    '})',
    'bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {',
    '    serial.writeLine(bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine)))',
    '})',
    'bluetooth.advertiseUrl("https://example.org", 7, false)',
    'bluetooth.uartWriteString("hi")',
    'bluetooth.uartWriteValue("t", 3)',
    'bluetooth.setTransmitPower(7)',
    'serial.writeLine("done")'
].join('\n');

test('bluetooth calls import as blocks, run as the simulator does (nothing happens), and are never dropped', {skip}, async () => {
    const imported = microbitToPseudocode(BLUETOOTH);
    assert.deepEqual(imported.unsupported, [], imported.code);
    const {py} = lite(BLUETOOTH);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out), ['done']);
});

test('bluetooth words export as MakeCode\'s own calls, and MakeCode compiles the export', {skip}, async () => {
    const {code} = lite(BLUETOOTH);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'bt'});
    assert.deepEqual(ex.unsupported, []);
    for (const call of ['bluetooth.startUartService()', 'bluetooth.onBluetoothConnected(function () {',
        'bluetooth.onBluetoothDisconnected(function () {',
        'bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {',
        'bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))', 'bluetooth.advertiseUrl("https://example.org", 7, false)',
        'bluetooth.uartWriteString("hi")', 'bluetooth.uartWriteValue("t", 3)', 'bluetooth.setTransmitPower(7)']) {
        assert.ok(ex.ts.includes(call), `${call} not in the export:\n${ex.ts}`);
    }
    await compileMakeCode(ex.ts, {dependencies: {core: '*', bluetooth: '*'}});
});

test('everyInterval and radio values export as MakeCode\'s own calls, and MakeCode compiles the export', {skip}, async () => {
    const ts = [
        'loops.everyInterval(250, function () {',
        '    serial.writeLine("e")',
        '})',
        'radio.sendValue("n", 5)',
        'radio.onReceivedValue(function (name, value) {',
        '    serial.writeLine(name + value)',
        '})'
    ].join('\n');
    const {code} = lite(ts);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'radiovalue'});
    assert.deepEqual(ex.unsupported, []);
    for (const call of ['loops.everyInterval(250, function () {', 'radio.sendValue("n", 5)', 'radio.onReceivedValue(function (name, value) {']) {
        assert.ok(ex.ts.includes(call), `${call} not in the export:\n${ex.ts}`);
    }
    await compileMakeCode(ex.ts);
});

test('a project that calls bluetooth depends on the bluetooth package (not radio, which MakeCode will not mix with it)', {skip}, () => {
    const {code} = lite('bluetooth.startUartService()\nbluetooth.uartWriteString("hi")\n');
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'btdeps'});
    const deps = JSON.parse(ex.files['pxt.json']).dependencies;
    assert.deepEqual(Object.keys(deps).sort(), ['bluetooth', 'core', 'microphone']);
    const plain = exportToMakeCode(new SB3Creator().parse(lite('radio.sendNumber(1)\n').code), {name: 'plain'});
    assert.deepEqual(Object.keys(JSON.parse(plain.files['pxt.json']).dependencies).sort(), ['core', 'microphone', 'radio']);
});
