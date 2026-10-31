/**
 * MakeCode Buffers on the micro:bit (2026-11-01): control.createBuffer,
 * getNumber / setNumber with every NumberFormat, length, fill, slice, toHex,
 * buffers kept in variables, class fields, arrays and procedure parameters,
 * and radio.sendBuffer / onReceivedBuffer. Programs run in pxt-microbit's own
 * simulator and as lite imports them (a bytearray and struct in lite's
 * MicroPython firmware); the printed lines must agree. Then the blocks export
 * back to MakeCode's calls, pxt compiles them, and the export prints the same.
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
// The words come with the vendored sb3-creator: a Lite checkout still on the
// pin before they were added has nothing to run them with.
const hasWords = Boolean(SB3Creator) && JSON.stringify(new SB3Creator().parse('DEVICE MICROBIT\n\nWHEN flag clicked:\n  set b to create buffer 4\n')).includes('microbitplus_createbuffer');
const translatorOnly = false;
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode)' :
    !SB3Creator ? 'sb3-creator not integrated' :
        !hasWords ? 'the integrated sb3-creator predates the buffer words (waiting for the sb3-creator pin)' : false;

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

/** MakeCode's run, lite's run, and the export's run of one program: the printed lines. */
async function all (ts, {ms = 1500} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: []});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const {code, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms});
    assert.equal(run.traceback, null, `lite's firmware stopped:\n${run.traceback}\n---\n${code}`);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'buffers'});
    assert.deepEqual(ex.unsupported, []);
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms, at: []});
    assert.equal(back.error, null, `the export stopped: ${back.error}`);
    return {mc: mc.serial.map(l => l.text.trim()).filter(Boolean), lite: lines(run.out), back: back.serial.map(l => l.text.trim()).filter(Boolean), ts: ex.ts};
}

test('number formats, wrap-around, slice, fill, hex and length behave as MakeCode\'s do', {skip}, async () => {
    const r = await all([
        'let buf = control.createBuffer(16)',
        'buf.setNumber(NumberFormat.Int32LE, 0, -2)',
        'buf.setNumber(NumberFormat.UInt16BE, 4, 513)',
        'buf.setNumber(NumberFormat.Int8LE, 6, 200)',
        'buf.setNumber(NumberFormat.Int16BE, 8, -3)',
        'buf.setNumber(NumberFormat.UInt32BE, 10, 3000000000)',
        'buf.setUint8(7, 300)',
        'serial.writeLine("" + buf.getNumber(NumberFormat.Int32LE, 0) + " " + buf.getNumber(NumberFormat.UInt16BE, 4))',
        'serial.writeLine("" + buf.getNumber(NumberFormat.Int8LE, 6) + " " + buf.getNumber(NumberFormat.UInt8LE, 6) + " " + buf.getUint8(7))',
        'serial.writeLine("" + buf.getNumber(NumberFormat.Int16BE, 8) + " " + buf.getNumber(NumberFormat.UInt32BE, 10))',
        'serial.writeLine("" + buf.length + " " + buf.slice(4, 4).length)',
        'serial.writeLine(buf.slice(4, 4).toHex())',
        'serial.writeLine(buf.slice(12).toHex())',
        'buf.fill(255)',
        'serial.writeLine(buf.toHex())',
        'let part = control.createBuffer(3)',
        'part.setNumber(NumberFormat.UInt8LE, 1, 171)',
        'serial.writeLine(part.toHex())'
    ].join('\n'));
    assert.deepEqual(r.mc.slice(0, 3), ['-2 513', '-56 200 44', '-3 3000000000']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('char codes: charCodeAt and fromCharCode', {skip}, async () => {
    const r = await all([
        'let s = "Hi!"',
        'serial.writeLine("" + s.charCodeAt(0) + " " + s.charCodeAt(2) + " " + "z".charCodeAt(0))',
        'serial.writeLine(String.fromCharCode(72) + String.fromCharCode(s.charCodeAt(1) + 1))'
    ].join('\n'));
    assert.deepEqual(r.mc, ['72 33 122', 'Hj']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

const KEPT = `
class Msg {
    private _data: Buffer
    id: number
    constructor(id: number) {
        this.id = id
        this._data = control.createBuffer(6)
        this._data.setNumber(NumberFormat.Int16LE, 0, id)
    }
    set value(v: number) {
        this._data.setNumber(NumberFormat.Int32LE, 2, v)
    }
    get value(): number {
        return this._data.getNumber(NumberFormat.Int32LE, 2)
    }
    get tag(): number {
        return this._data.getNumber(NumberFormat.Int16LE, 0)
    }
    raw(): Buffer {
        return this._data
    }
}
function sum(b: Buffer): number {
    let total = 0
    for (let i = 0; i < b.length; i++) {
        total += b.getNumber(NumberFormat.UInt8LE, i)
    }
    return total
}
let a = new Msg(300)
a.value = -70000
serial.writeLine("" + a.tag + " " + a.value)
serial.writeLine("" + sum(a.raw()))
let bufs: Buffer[] = []
bufs.push(control.createBuffer(2))
bufs[0].setNumber(NumberFormat.UInt16BE, 0, 258)
serial.writeLine(bufs[0].toHex())
for (let item of bufs) {
    serial.writeLine("" + item.length)
}
`;

test('a buffer in a class field, a procedure parameter, a variable and an array', {skip}, async () => {
    const r = await all(KEPT);
    assert.deepEqual(r.mc, ['300 -70000', '936', '0102', '2']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

const TX = [
    'radio.setGroup(7)',
    'let b = control.createBuffer(3)',
    'b.setNumber(NumberFormat.UInt8LE, 0, 65)',
    'b.setNumber(NumberFormat.UInt8LE, 1, 66)',
    'b.setNumber(NumberFormat.UInt8LE, 2, 67)',
    'radio.sendNumber(5)',
    'radio.sendBuffer(b)'
].join('\n');
const RX = [
    'radio.setGroup(7)',
    'radio.onReceivedBuffer(function (receivedBuffer) {',
    '    serial.writeLine("buf " + receivedBuffer.length + " " + receivedBuffer.toHex() + " " + receivedBuffer.getNumber(NumberFormat.UInt8LE, 1))',
    '})',
    'radio.onReceivedNumber(function (receivedNumber) {',
    '    serial.writeLine("num " + receivedNumber)',
    '})'
].join('\n');

test('radio.sendBuffer and onReceivedBuffer: the receiver prints what MakeCode\'s receiver prints for the same sender', {skip}, async () => {
    const mcTx = await runMakeCodeSim(await compileMakeCode(TX), {ms: 500, at: []});
    assert.equal(mcTx.sent.length, 2);
    const mcRx = await runMakeCodeSim(await compileMakeCode(RX), {ms: 1000, at: [], radio: mcTx.sent.map((m, i) => [100 + i * 100, m])});
    assert.equal(mcRx.error, null);
    const tx = await runOnMicrobitFirmware(lite(TX).py, {ms: 500});
    assert.equal(tx.traceback, null, tx.traceback);
    assert.equal(tx.sent.length, 2);
    const rx = await runOnMicrobitFirmware(lite(RX).py, {ms: 1000, radio: tx.sent.map((p, i) => [100 + i * 100, p.slice(3)])});
    assert.equal(rx.traceback, null, rx.traceback);
    assert.deepEqual(mcRx.serial.map(l => l.text.trim()), ['num 5', 'buf 3 414243 66']);
    assert.deepEqual(lines(rx.out), mcRx.serial.map(l => l.text.trim()));
});

test('the radio buffer blocks export as MakeCode\'s calls, and the export hears the same', {skip}, async () => {
    const ex = exportToMakeCode(new SB3Creator().parse(lite(RX).code), {name: 'rxbuf'});
    assert.deepEqual(ex.unsupported, []);
    for (const call of ['radio.onReceivedBuffer(function (receivedBuffer) {', 'receivedBuffer.getNumber(NumberFormat.UInt8LE, 1)']) {
        assert.ok(ex.ts.includes(call), `${call} not in the export:\n${ex.ts}`);
    }
    const mcTx = await runMakeCodeSim(await compileMakeCode(TX), {ms: 500, at: []});
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms: 1000, at: [], radio: mcTx.sent.map((m, i) => [100 + i * 100, m])});
    assert.deepEqual(back.serial.map(l => l.text.trim()), ['num 5', 'buf 3 414243 66']);
    const sender = exportToMakeCode(new SB3Creator().parse(lite(TX).code), {name: 'txbuf'});
    assert.ok(sender.ts.includes('radio.sendBuffer('), sender.ts);
    await compileMakeCode(sender.ts);
});

test('a Buffer method with no block is named, not dropped', {skip: translatorOnly}, () => {
    const imported = microbitToPseudocode('let b = control.createBuffer(4)\nb.rotate(1, 2)\nserial.writeLine("" + b.length)\n');
    assert.ok(imported.unsupported.some(u => /b\.rotate\(\).*Buffer method/.test(u)), imported.unsupported.join('\n'));
});

test('`given || control.createBuffer(4)` keeps the buffer (not a 1), and a buffer parameter left out is null', {skip}, async () => {
    const r = await all([
        'class Holder {',
        '    _data: Buffer',
        '    constructor(input?: Buffer) {',
        '        this._data = input || control.createBuffer(4)',
        '    }',
        '    size(): number {',
        '        return this._data.length',
        '    }',
        '}',
        'let h = new Holder()',
        'serial.writeLine("" + h.size())',
        'let src = control.createBuffer(7)',
        'let h2 = new Holder(src)',
        'serial.writeLine("" + h2.size())'
    ].join('\n'));
    assert.deepEqual(r.mc, ['4', '7']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});
