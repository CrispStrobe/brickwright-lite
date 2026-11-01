/**
 * Serial polling and writeNumbers, buffer packers with literals, raw radio packets, the bluetooth
 * uart's buffer calls and the built-in melodies' start/stop (2026-11-01). Single programs run in
 * MakeCode's simulator and lite's firmware where the simulated board can show them; the rest are
 * checked as generated code that runs and as exports MakeCode compiles.
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
const DEPENDENCIES = {core: '*', radio: '*', microphone: '*', bluetooth: '*'};

function lite (ts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    return {imported, py: gen.py};
}
async function exported (imported, dependencies) {
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    await compileMakeCode(ex.ts, dependencies ? {dependencies} : undefined);
    return ex.ts;
}

test('packers with literals: createBufferFromArray, packBuffer and packedSize match MakeCode', {skip}, async () => {
    const ts = [
        'let a = pins.createBufferFromArray([1, 2, 3])',
        'let p = pins.packBuffer("<hBi", [-2, 7, 100000])',
        'serial.writeLine("" + a.length + " " + a.getUint8(2))',
        'serial.writeLine("" + p.length + " " + p.getNumber(NumberFormat.Int16LE, 0) + " " + p.getUint8(2) + " " + p.getNumber(NumberFormat.Int32LE, 3))',
        'serial.writeLine("size " + pins.packedSize("<hBi"))'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 800, at: []});
    assert.equal(mc.error, null);
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: 800});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(want, ['3 3', '7 -2 7 100000', 'size 7']);
    assert.deepEqual(lines(run.out), want);
    const back = await runMakeCodeSim(await compileMakeCode(await exported(imported)), {ms: 800, at: []});
    assert.deepEqual(back.serial.map(l => l.text.trim()).filter(Boolean), want);
});

test('concatBuffers of two buffers and serial.writeNumbers of a literal array', {skip}, async () => {
    const ts = [
        'let a = pins.createBufferFromArray([1, 2])',
        'let b = pins.createBufferFromArray([3])',
        'let c = pins.concatBuffers([a, b])',
        'serial.writeLine("" + c.length + " " + c.getUint8(2))',
        'serial.writeNumbers([4, 5, 6])'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 800, at: []});
    assert.equal(mc.error, null);
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: 800});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(want, ['3 3', '4,5,6']);
    assert.deepEqual(lines(run.out), want);
    await exported(imported);
});

test('serial.onDataReceived polls the shared console buffer; raw radio packets and bluetooth buffers are words', {skip}, async () => {
    const ts = [
        'serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {',
        '    serial.writeLine("got " + serial.readLine())',
        '})',
        'radio.setGroup(3)',
        'radio.sendRawPacket(control.createBuffer(36))',
        'let raw = radio.readRawPacket()',
        'serial.writeLine("raw " + raw.length)'
    ].join('\n');
    await compileMakeCode(ts);
    const {py} = lite(ts);
    for (const w of ['_bw_ser_has("\\n")', "radio.send_bytes(b'\\x01\\x00\\x01' + bytes(", '_radio_last_raw', '_bw_sbuf']) assert.ok(py.includes(w), w);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);

    const bt = 'bluetooth.startUartService()\nbluetooth.uartWriteBuffer(control.createBuffer(2))\nlet got = bluetooth.uartReadBuffer()\nserial.writeLine("n " + got.length)';
    await compileMakeCode(bt, {dependencies: {core: '*', bluetooth: '*', microphone: '*'}});
    const generated = lite(bt);
    const ran = await runOnMicrobitFirmware(generated.py, {ms: 500});
    assert.equal(ran.traceback, null, ran.traceback);
    assert.deepEqual(lines(ran.out), ['n 0']);
    await exported(generated.imported, {core: '*', bluetooth: '*', microphone: '*'});
});

test('startMelody of a built-in melody, once or in the background, and stopMelody are the play-melody block and stop', {skip}, async () => {
    const ts = [
        'music.startMelody(music.builtInMelody(Melodies.Dadadadum), MelodyOptions.OnceInBackground)',
        'music.stopMelody(MelodyStopOptions.All)',
        'serial.writeLine("ok")'
    ].join('\n');
    await compileMakeCode(ts);
    const {imported, py} = lite(ts);
    assert.match(imported.code, /play melody Dadadadum in background/);
    assert.ok(py.includes('music.play(music.DADADADUM'));
    const refused = microbitToPseudocode('music.startMelody(music.builtInMelody(Melodies.Dadadadum), MelodyOptions.Forever)');
    assert.ok(refused.unsupported.length > 0);
});

test('serial.onDataReceived round-trips: the polled hat exports as the handler again, and reimports as the same blocks', {skip}, async () => {
    const ts = [
        'serial.onDataReceived(serial.delimiters(Delimiters.Comma), function () {',
        '    serial.writeLine("got")',
        '})'
    ].join('\n');
    const {imported} = lite(ts);
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    assert.ok(ex.ts.includes('serial.onDataReceived(serial.delimiters(Delimiters.Comma), function () {'), ex.ts);
    assert.ok(!ex.ts.includes('basic.forever'), ex.ts);
    await compileMakeCode(ex.ts);
    const again = microbitToPseudocode(ex.ts);
    assert.deepEqual(again.unsupported, []);
    assert.equal(again.code, imported.code, 'import, export, import: the same blocks');
});

test('pins.unpackBuffer with a literal format gives an array of numbers: length, index, for-of, aliasing', {skip}, async () => {
    const ts = [
        'let p = pins.packBuffer("<hBi", [-2, 7, 100000])',
        'let u = pins.unpackBuffer("<hBi", p)',
        'serial.writeLine("n " + u.length + " " + u[0] + " " + u[1] + " " + u[2])',
        'let sum = 0',
        'for (let x of u) {',
        '    sum += x',
        '}',
        'let v = pins.unpackBuffer("<B", p, 2)',
        'serial.writeLine("sum " + sum + " " + v[0])'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 800, at: []});
    assert.equal(mc.error, null);
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: 20000});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(want, ['n 3 -2 7 100000', 'sum 100005 7']);
    assert.deepEqual(lines(run.out), want);
    const back = await runMakeCodeSim(await compileMakeCode(await exported(imported)), {ms: 800, at: []});
    assert.deepEqual(back.serial.map(l => l.text.trim()).filter(Boolean), want);
});

// pxsim's radio.raiseEvent posts {type: 'eventbus', id, eventid, group} between simulators: there is no byte
// layout to copy. sendMessage(m) is raiseEvent(2000, m + 1) (radio-broadcast.ts). lite sends CODAL's event frame
// (header 01 00 02, uint16 source, uint16 value, uint32 time; as recalled from CODAL, unmeasured here).
test('radio.raiseEvent and sendMessage: pxsim\'s events, lite\'s event frames, and a lite receiver that raises what it hears', {skip}, async () => {
    const sender = 'radio.setGroup(4)\nradio.raiseEvent(4321, 77)\nradio.sendMessage(12)\n';
    const mc = await runMakeCodeSim(await compileMakeCode(sender, {dependencies: {core: '*', radio: '*', 'radio-broadcast': '*', microphone: '*'}}), {ms: 500, at: []});
    assert.deepEqual(mc.events.map(e => [e.id, e.eventid, e.group]), [[4321, 77, 4], [2000, 13, 4]]);
    const tx = lite(sender);
    const sent = await runOnMicrobitFirmware(tx.py, {ms: 500});
    assert.equal(sent.traceback, null, sent.traceback);
    const frames = sent.sent.map(f => Buffer.from(f, 'latin1'));
    assert.deepEqual(frames.map(f => [f.length, f[0], f[1], f[2], f.readUInt16LE(3), f.readUInt16LE(5)]), [[11, 1, 0, 2, 4321, 77], [11, 1, 0, 2, 2000, 13]]);
    const rx = lite([
        'radio.setGroup(4)',
        'control.onEvent(4321, 77, function () {',
        '    serial.writeLine("event")',
        '})',
        'radio.onReceivedMessage(12, function () {',
        '    serial.writeLine("message")',
        '})'
    ].join('\n'));
    const got = await runOnMicrobitFirmware(rx.py, {ms: 1000, radio: frames.map((f, i) => [100 + i * 100, f.subarray(3).toString('latin1'), 'event'])});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(lines(got.out), ['event', 'message']);
    const ex = exportToMakeCode(new SB3Creator().parse(tx.imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    assert.ok(ex.ts.includes('radio.raiseEvent(4321, 77)') && ex.ts.includes('_mc1 = (12 + 1)') && ex.ts.includes('radio.raiseEvent(2000, _mc1)'), ex.ts);
    await compileMakeCode(ex.ts);
});
