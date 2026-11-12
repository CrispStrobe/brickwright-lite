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

// MakeCode's radio packet (pxt-microbit libs/radio/radio.ts): 32 bytes, | type | time | serial | payload |,
// behind the 3-byte header every MicroPython frame carries. The two boards must read each other's packets.
const SENDER = [
    'radio.setGroup(4)',
    'radio.setTransmitSerialNumber(true)',
    'radio.sendNumber(42)',
    'radio.sendNumber(1.5)',
    'radio.sendString("hi")',
    'radio.sendValue("temperature", 21)',
    'radio.sendValue("pi", 3.5)',
    'let b = control.createBuffer(3)',
    'b.setUint8(0, 7)',
    'b.setUint8(1, 8)',
    'b.setUint8(2, 9)',
    'radio.sendBuffer(b)'
].join('\n');
const RECEIVER = [
    'radio.setGroup(4)',
    'radio.onReceivedNumber(function (receivedNumber) {',
    '    serial.writeLine("num " + receivedNumber)',
    '})',
    'radio.onReceivedString(function (receivedString) {',
    '    serial.writeLine("str " + receivedString)',
    '})',
    'radio.onReceivedValue(function (name, value) {',
    '    serial.writeLine("val " + name + "=" + value)',
    '})',
    'radio.onReceivedBuffer(function (receivedBuffer) {',
    '    let second = receivedBuffer.getUint8(1)',
    '    serial.writeLine("buf " + second)',
    '})'
].join('\n');
const WANT = ['num 42', 'num 1.5', 'str hi', 'val temperat=21', 'val pi=3.5', 'buf 8'];
const toFrame = bytes => Buffer.from(bytes.slice(0, 32)).toString('latin1');
const toMessage = (bytes, serial = 0) => ({type: 'radiopacket', broadcast: true, rssi: -60, serial, time: 0,
    payload: {type: 0, groupId: 4, bufferData: [...bytes.slice(0, 32), 0, 0, 0, 0]}});

test('packets from MakeCode\'s own simulator are read by lite: number, double, string, value, double value, buffer', {skip}, async () => {
    const tx = await runMakeCodeSim(await compileMakeCode(SENDER), {ms: 600, at: []});
    assert.equal(tx.error, null);
    assert.equal(tx.sent.length, 6);
    const rx = lite(RECEIVER);
    const got = await runOnMicrobitFirmware(rx.py, {ms: 2000, radio: tx.sent.map((m, i) => [100 + i * 100, toFrame(m.payload.bufferData)])});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(lines(got.out), WANT);
    // and MakeCode itself reads the same packets the same way
    const back = await runMakeCodeSim(await compileMakeCode(RECEIVER), {ms: 2000, at: [], radio: tx.sent.map((m, i) => [100 + i * 100, m])});
    assert.deepEqual(back.serial.map(l => l.text.trim()), WANT);
});

test('packets lite sends are read by MakeCode\'s simulator, and match its own byte for byte (the time stamp aside)', {skip}, async () => {
    const tx = lite(SENDER);
    const sent = await runOnMicrobitFirmware(tx.py, {ms: 600});
    assert.equal(sent.traceback, null, sent.traceback);
    assert.equal(sent.sent.length, 6);
    const frames = sent.sent.map(f => [...Buffer.from(f, 'latin1')]);
    for (const f of frames) {
        assert.deepEqual(f.slice(0, 3), [1, 0, 1], 'MicroPython frame header');
        assert.equal(f.length, 35);
    }
    const mc = await runMakeCodeSim(await compileMakeCode(SENDER), {ms: 600, at: []});
    mc.sent.forEach((m, i) => {
        const theirs = m.payload.bufferData.slice(0, 32);
        const ours = frames[i].slice(3);
        // type, then (time 1..4 aside) serial and payload
        assert.deepEqual([ours[0], ...ours.slice(9)], [theirs[0], ...theirs.slice(9)], `packet ${i}`);
        // the serial number: both transmit one, non-zero
        assert.notEqual(Buffer.from(ours.slice(5, 9)).readInt32LE(0), 0);
    });
    const back = await runMakeCodeSim(await compileMakeCode(RECEIVER), {ms: 2000, at: [], radio: frames.map((f, i) => [100 + i * 100, toMessage(f.slice(3))])});
    assert.equal(back.error, null);
    assert.deepEqual(back.serial.map(l => l.text.trim()), WANT);
});

test('a plain MicroPython radio.send(text) from another board still arrives as text or a number', {skip}, async () => {
    const rx = lite(RECEIVER);
    const got = await runOnMicrobitFirmware(rx.py, {ms: 1000, radio: [[100, 'hello'], [200, '7']]});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(lines(got.out), ['str hello', 'num 7']);
});

test('the sender\'s serial number and time ride in the packet, as MakeCode reads them', {skip}, async () => {
    const rx = lite([
        'radio.setGroup(4)',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    let s = radio.receivedPacket(RadioPacketProperty.SerialNumber)',
        '    let t = radio.receivedPacket(RadioPacketProperty.Time)',
        '    serial.writeLine("n " + receivedNumber + " " + s + " " + t)',
        '})'].join('\n'));
    // type 0, time 1234, serial 9, number 5
    const packet = Buffer.alloc(32);
    packet[0] = 0;
    packet.writeUInt32LE(1234, 1);
    packet.writeInt32LE(9, 5);
    packet.writeInt32LE(5, 9);
    const got = await runOnMicrobitFirmware(rx.py, {ms: 500, radio: [[100, packet.toString('latin1')]]});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(lines(got.out), ['n 5 9 1234']);
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
