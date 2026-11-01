/**
 * The micro:bit API gaps of 2026-11-01 (second batch): control.onEvent /
 * raiseEvent / eventValue, game.showScore, led.displayMode(), the legacy radio
 * packet (radio.onDataPacketReceived and its properties),
 * radio.writeReceivedPacketToSerial, and datalogger.log / createCV. Programs
 * run in pxt-microbit's own simulator and as lite imports them (MicroPython in
 * lite's firmware); the printed lines must agree where the simulator can show
 * the behaviour. Then the blocks export back to MakeCode's calls, and pxt
 * compiles them.
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
const hasWords = (() => {
    try {
        return Boolean(SB3Creator) && JSON.stringify(new SB3Creator().parse('DEVICE MICROBIT\n\nWHEN flag clicked:\n  raise event 1 2\n')).includes('microbitplus_raiseevent');
    } catch (e) {
        return false;
    }
})();
const translatorOnly = false;
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode)' :
    !SB3Creator ? 'sb3-creator not integrated' :
        !hasWords ? 'the integrated sb3-creator predates these words (waiting for the sb3-creator pin)' : false;

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
const DEPS = {core: '*', radio: '*', microphone: '*', datalogger: '*'};
const exported = (code, name) => {
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name});
    assert.deepEqual(ex.unsupported, []);
    return ex;
};

const EVENTS = `
control.onEvent(1000, 1, function () {
    serial.writeLine("one " + control.eventValue())
})
control.onEvent(1000, 0, function () {
    serial.writeLine("any " + control.eventValue())
})
control.onEvent(0, 0, function () {
    serial.writeLine("all")
})
basic.pause(100)
control.raiseEvent(1000, 1)
basic.pause(100)
control.raiseEvent(1000, 7)
basic.pause(100)
control.raiseEvent(2000, 3)
basic.pause(100)
serial.writeLine("" + led.displayMode())
led.setDisplayMode(DisplayMode.Greyscale)
serial.writeLine("" + led.displayMode())
led.setDisplayMode(DisplayMode.BlackAndWhite)
serial.writeLine("" + led.displayMode())
game.setScore(7)
game.showScore()
serial.writeLine("shown")
`;

test('events (source and value, "any" as 0, newest handler first), led.displayMode() and game.showScore run as MakeCode\'s do', {skip}, async () => {
    const ms = 12000;
    const mc = await runMakeCodeSim(await compileMakeCode(EVENTS), {ms, at: []});
    assert.equal(mc.error, null);
    const {code, py} = lite(EVENTS);
    assert.match(code, /WHEN event 1000 1:/);
    assert.match(code, /raise event 1000 7/);
    assert.match(code, /show game score/);
    assert.match(code, /display mode/);
    const run = await runOnMicrobitFirmware(py, {ms});
    assert.equal(run.traceback, null, run.traceback);
    const want = mc.serial.map(l => l.text.trim()).filter(Boolean);
    assert.deepEqual(want, ['all', 'any 1', 'one 1', 'all', 'any 7', 'all', '0', '1', '0', 'shown']);
    assert.deepEqual(lines(run.out), want);
    const ex = exported(code, 'events');
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms, at: []});
    assert.deepEqual(back.serial.map(l => l.text.trim()).filter(Boolean), want);
});

test('built-in event ids (EventBusSource, EventBusValue) are their numbers', {skip: translatorOnly}, () => {
    const imported = microbitToPseudocode([
        'control.onEvent(EventBusSource.MICROBIT_ID_BUTTON_A, EventBusValue.MICROBIT_EVT_ANY, function () {',
        '    basic.showString("a")',
        '})',
        'control.raiseEvent(control.eventSourceId(EventBusSource.MES_BROADCAST_GENERAL_ID), control.eventValueId(EventBusValue.MICROBIT_BUTTON_EVT_CLICK))'
    ].join('\n'));
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN event 1 0:/);
    assert.match(imported.code, /raise event 2000 3/);
});

const LOGGING = [
    'datalogger.log(datalogger.createCV("temp", 21), datalogger.createCV("light", input.lightLevel()))',
    'let n = 3',
    'datalogger.log(datalogger.createCV("n", n))',
    'serial.writeLine("logged")'
].join('\n');

test('datalogger.log with createCV pairs imports as a block, runs on the log module, and exports as the same calls', {skip}, async () => {
    // pxt-microbit's own simulator has no data logger (it stops at the first call), so this is
    // compiled with MakeCode, run on lite's firmware, and exported.
    await compileMakeCode(LOGGING, {dependencies: DEPS});
    const {code, py} = lite(LOGGING);
    assert.match(code, /log data "temp" = 21 and "light" = /);
    assert.match(py, /log\.add\(/);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out), ['logged']);
    const ex = exported(code, 'logging');
    for (const call of ['datalogger.log(datalogger.createCV("temp", 21), datalogger.createCV("light", ', 'datalogger.log(datalogger.createCV("n", n))']) {
        assert.ok(ex.ts.includes(call), `${call} not in the export:\n${ex.ts}`);
    }
    assert.equal(JSON.parse(ex.files['pxt.json']).dependencies.datalogger, '*');
    await compileMakeCode(ex.ts, {dependencies: JSON.parse(ex.files['pxt.json']).dependencies});
});

test('datalogger.log with something that is not createCV pairs is named, not dropped', {skip: translatorOnly}, () => {
    const imported = microbitToPseudocode('let cv = datalogger.createCV("a", 1)\ndatalogger.log(cv)\n');
    assert.ok(imported.unsupported.some(u => /datalogger/.test(u)), imported.unsupported.join('\n'));
});

const PACKETS_TX = [
    'radio.setGroup(7)',
    'radio.sendNumber(5)',
    'radio.sendValue("k", 3)',
    'radio.sendString("hi")'
].join('\n');
const DUMP_RX = [
    'radio.setGroup(7)',
    'radio.onReceivedNumber(function (receivedNumber) {',
    '    serial.writeLine("n " + receivedNumber)',
    '    radio.writeReceivedPacketToSerial()',
    '})',
    'radio.onReceivedValue(function (name, value) {',
    '    serial.writeLine(name + "=" + value)',
    '    radio.writeReceivedPacketToSerial()',
    '})',
    'radio.onReceivedString(function (receivedString) {',
    '    serial.writeLine("s " + receivedString)',
    '    radio.writeReceivedPacketToSerial()',
    '})'
].join('\n');
const maskTime = line => line.replace(/"t":-?\d+/, '"t":T');

test('radio.writeReceivedPacketToSerial prints the packet as MakeCode does, bar its time (a MicroPython packet carries no send time)', {skip}, async () => {
    const mcTx = await runMakeCodeSim(await compileMakeCode(PACKETS_TX), {ms: 500, at: []});
    assert.equal(mcTx.sent.length, 3);
    const mcRx = await runMakeCodeSim(await compileMakeCode(DUMP_RX), {ms: 1000, at: [], radio: mcTx.sent.map((m, i) => [100 + i * 100, m])});
    assert.equal(mcRx.error, null);
    const tx = await runOnMicrobitFirmware(lite(PACKETS_TX).py, {ms: 500});
    assert.equal(tx.traceback, null, tx.traceback);
    const {code, py} = lite(DUMP_RX);
    assert.match(code, /radio write received packet to serial/);
    const rx = await runOnMicrobitFirmware(py, {ms: 1000, radio: tx.sent.map((p, i) => [100 + i * 100, p.slice(3)])});
    assert.equal(rx.traceback, null, rx.traceback);
    const want = mcRx.serial.map(l => maskTime(l.text.trim())).filter(Boolean);
    assert.deepEqual(want, ['n 5', '{"t":T,"s":0,"v":5}', 'k=3', '{"t":T,"s":0,"n":"k","v":3}', 's hi', '{"t":T,"s":0,"n":"hi"}']);
    assert.deepEqual(lines(rx.out).map(maskTime), want);
    const ex = exported(code, 'dump');
    assert.ok(ex.ts.includes('radio.writeReceivedPacketToSerial()'), ex.ts);
    await compileMakeCode(ex.ts);
});

const LEGACY = [
    'radio.setGroup(7)',
    'radio.onDataPacketReceived(function (packet) {',
    '    serial.writeLine("got " + packet.receivedNumber + " [" + packet.receivedString + "] " + packet.serial)',
    '})',
    'radio.onReceivedNumber(function (receivedNumber) {',
    '    serial.writeLine("num " + receivedNumber)',
    '})'
].join('\n');

test('radio.onDataPacketReceived runs for every packet; MakeCode\'s radio no longer has it, so the export registers each kind of handler to the same body', {skip}, async () => {
    const {code, py} = lite(LEGACY);
    assert.match(code, /WHEN radio receives packet:/);
    const tx = await runOnMicrobitFirmware(lite(PACKETS_TX).py, {ms: 500});
    const rx = await runOnMicrobitFirmware(py, {ms: 1000, radio: tx.sent.map((p, i) => [100 + i * 100, p.slice(3)])});
    assert.equal(rx.traceback, null, rx.traceback);
    assert.deepEqual(lines(rx.out), ['num 5', 'got 5 [] 0', 'got 3 [k] 0', 'got 0 [hi] 0']);
    // Its destructured form reads the same properties.
    const destructured = lite('radio.onDataPacketReceived(({receivedNumber, signal}) => {\n    serial.writeLine("n" + receivedNumber)\n})\n');
    assert.match(destructured.code, /read last radio number/);
    const ex = exported(code, 'legacy');
    assert.ok(!ex.ts.includes('onDataPacketReceived'), ex.ts);
    const mcTx = await runMakeCodeSim(await compileMakeCode(PACKETS_TX), {ms: 500, at: []});
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms: 1000, at: [], radio: mcTx.sent.map((m, i) => [100 + i * 100, m])});
    assert.equal(back.error, null);
    const heard = back.serial.map(l => l.text.trim());
    assert.ok(heard.includes('num 5') && heard.includes('got 5 [] 0') && heard.some(l => /^got .* \[k\] 0$/.test(l)), heard.join('\n'));
});

test('the export of a packet hat reads back as the packet hat it came from', {skip}, () => {
    const ex = exported(lite(LEGACY).code, 'legacy');
    const again = microbitToPseudocode(ex.ts);
    assert.deepEqual(again.unsupported, []);
    assert.match(again.code, /WHEN radio receives packet:/);
    assert.match(again.code, /WHEN radio receives number:/);
    assert.doesNotMatch(again.code, /onRadioPacket/);
    assert.equal((again.code.match(/WHEN radio receives/g) || []).length, 2, again.code);
});
