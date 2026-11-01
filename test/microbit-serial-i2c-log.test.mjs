/**
 * The rest of the serial namespace, I2C and SPI, the buffer helpers and the V2
 * log (2026-11-01), as words of the dialect and MicroPython's uart, i2c, spi
 * and log. The console words run in MakeCode's simulator and in lite's firmware
 * and must print the same. The simulated board has no I2C or SPI device and no
 * input on the console, so those are checked as generated code that runs
 * without error, and as exports MakeCode compiles.
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



function lite (ts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    return {imported, py: gen.py, creator};
}
const DEPENDENCIES = {core: '*', radio: '*', microphone: '*', datalogger: '*'};

async function exportCompiles (imported) {
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'x'});
    assert.deepEqual(ex.unsupported, []);
    await compileMakeCode(ex.ts, {dependencies: DEPENDENCIES});
    return ex.ts;
}

test('serial.writeString, writeNumber and writeBuffer print the same text as MakeCode, with no newline of their own', {skip}, async () => {
    const ts = [
        'serial.writeString("ab")',
        'serial.writeNumber(3)',
        'serial.writeString("-")',
        'serial.writeNumber(2.5)',
        'serial.writeLine("")',
        'let b = control.createBuffer(2)',
        'b.setUint8(0, 72)',
        'b.setUint8(1, 105)',
        'serial.writeBuffer(b)',
        'serial.writeLine("")',
        'serial.writeLine("done")'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 800, at: []});
    assert.equal(mc.error, null);
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: 800});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    // pxsim's serial.writeBuffer writes nothing it can show; the board writes the bytes
    assert.deepEqual(want, ['ab3-2.5', 'done']);
    assert.deepEqual(lines(run.out), ['ab3-2.5', 'Hi', 'done']);
    const back = await runMakeCodeSim(await compileMakeCode((await exportCompiles(imported))), {ms: 800, at: []});
    assert.deepEqual(back.serial.map(l => l.text.trim()).filter(Boolean), want);
});

test('serial reads become uart reads: buffer, string, line and until a delimiter', {skip}, async () => {
    const ts = [
        'let b = serial.readBuffer(2)',
        'let s = serial.readString()',
        'let l = serial.readLine()',
        'let u = serial.readUntil(serial.delimiters(Delimiters.Comma))',
        'serial.writeLine(u)'
    ].join('\n');
    const {imported, py} = lite(ts);
    for (const w of ['uart.read(', '_bw_ser_until(",")', '_bw_ser_until("\\n")', '_bw_ser_all()']) assert.ok(py.includes(w), w);
    await exportCompiles(imported);
});

test('pins.i2c* and pins.spi* become MicroPython i2c and spi calls, run on the simulated board, and export as MakeCode calls', {skip}, async () => {
    const ts = [
        'let buf = pins.i2cReadBuffer(30, 2)',
        'let n = pins.i2cReadNumber(30, NumberFormat.UInt16LE)',
        'pins.i2cWriteNumber(30, 513, NumberFormat.UInt16LE)',
        'pins.i2cWriteBuffer(30, control.createBuffer(2))',
        'pins.spiFrequency(500000)',
        'pins.spiFormat(8, 3)',
        'pins.spiPins(DigitalPin.P15, DigitalPin.P14, DigitalPin.P13)',
        'let r = pins.spiWrite(7)',
        'pins.spiTransfer(control.createBuffer(2), control.createBuffer(2))',
        'serial.writeLine("sizes " + pins.sizeOf(NumberFormat.Int16LE) + " " + pins.sizeOf(NumberFormat.Float64BE))'
    ].join('\n');
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms: 500, at: []});
    const {imported, py} = lite(ts);
    for (const w of ['i2c.read(', 'i2c.write(', "_bw_spi_set(baudrate=int(500000))", '_bw_spi_set(bits=int(8), mode=int(3))',
        '_bw_spi_set(mosi=pin15, miso=pin14, sclk=pin13)', 'spi.write_readinto(']) assert.ok(py.includes(w), w);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out), mc.serial.map(l => l.text.trim()).filter(Boolean));
    assert.deepEqual(lines(run.out), ['sizes 2 8']);
    const exported = await exportCompiles(imported);
    for (const w of ['pins.i2cReadBuffer(', 'pins.i2cWriteNumber(', 'pins.spiFrequency(500000)', 'pins.spiPins(DigitalPin.P15, DigitalPin.P14, DigitalPin.P13)', 'pins.spiTransfer(']) {
        assert.ok(exported.includes(w), w);
    }
});

test('datalogger beyond log: column titles, delete, mirroring, timestamps become the log module\'s calls', {skip}, async () => {
    const ts = [
        'datalogger.setColumnTitles("a", "b")',
        'datalogger.mirrorToSerial(true)',
        'datalogger.includeTimestamp(FlashLogTimeStampFormat.Seconds)',
        'datalogger.log(datalogger.createCV("a", 1), datalogger.createCV("b", 2))',
        'datalogger.deleteLog(datalogger.DeleteType.Full)',
        'datalogger.deleteLog()'
    ].join('\n');
    await compileMakeCode(ts, {dependencies: DEPENDENCIES});
    const {imported, py} = lite(ts);
    for (const w of ['log.set_labels(*_bw_log_c[0], timestamp=_bw_log_c[1])', 'log.set_mirroring(True)', '_bw_log_cfg(None, log.SECONDS)', 'log.delete(full=True)', 'log.delete()']) {
        assert.ok(py.includes(w), w);
    }
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    const exported = await exportCompiles(imported);
    for (const w of ['datalogger.setColumnTitles("a", "b")', 'datalogger.mirrorToSerial(true)', 'datalogger.includeTimestamp(FlashLogTimeStampFormat.Seconds)',
        'datalogger.deleteLog(datalogger.DeleteType.Full)']) assert.ok(exported.includes(w), w);
});

test('music.setVolume, volume, isSoundPlaying and the built-in speaker switch become V2 audio calls', {skip}, async () => {
    const ts = [
        'music.setVolume(100)',
        'serial.writeLine("v " + music.volume())',
        'music.setBuiltInSpeakerEnabled(false)',
        'music.setBuiltInSpeakerEnabled(true)',
        'if (music.isSoundPlaying()) {',
        '    serial.writeLine("playing")',
        '}'
    ].join('\n');
    // (the simulator has no audio context here, so MakeCode is only asked to compile it)
    await compileMakeCode(ts);
    const {imported, py} = lite(ts);
    for (const w of ['set_volume(', 'speaker.off()', 'speaker.on()', 'audio.is_playing()']) assert.ok(py.includes(w), w);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out).filter(l => l.startsWith('v ')), ['v 100']);
    await exportCompiles(imported);
});

test('datalogger.logData and setColumns with array literals are the log and column words', {skip}, async () => {
    const ts = [
        'datalogger.setColumns(["a", "b"])',
        'datalogger.logData([datalogger.createCV("a", 1), datalogger.createCV("b", 2)])'
    ].join('\n');
    await compileMakeCode(ts, {dependencies: DEPENDENCIES});
    const {imported, py} = lite(ts);
    for (const w of ['_bw_log_cfg(["a", "b"])', '_bw_log({"a": 1, "b": 2})']) assert.ok(py.includes(w), w);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    const exported = await exportCompiles(imported);
    assert.ok(exported.includes('datalogger.setColumnTitles("a", "b")') && exported.includes('datalogger.log('));
});
