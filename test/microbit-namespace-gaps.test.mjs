/**
 * The rest of the 13 pxt-microbit namespaces (2026-11-03): library members whose definition is TypeScript in
 * pxt-microbit (toggleAll, fadeIn/Out, assert, fail, allocateEventSource, benchmark, getFrequencyForNote, ...),
 * constants and aliases, the display's plotLeds / showAnimation / screenshot / big images, waitForEvent, the
 * pitch pin, the device's name, delimiters of any characters, sounds kept in a variable, and the said no-ops.
 * Programs run in MakeCode's simulator and lite's firmware where the simulated board can show them; the rest
 * are checked as generated code that runs and as exports MakeCode compiles.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {builtInMelodyNotes} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-library.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {compileMakeCode, runMakeCodeSim, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';
import {runOnMicrobitFirmware} from '../scripts/lib/microbit-firmware.mjs';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const SB3Creator = existsSync(COMPILER) ? (await import(COMPILER)).default : null;
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode)' :
    !SB3Creator ? 'sb3-creator not integrated' : false;
const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const serialOf = run => run.serial.map(l => l.text.trim()).filter(Boolean);

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
/** MakeCode's simulator, lite's firmware and the export run in MakeCode's simulator print the same lines. */
async function threeWays (ts, {ms = 1500, presses = []} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: [], presses});
    assert.equal(mc.error, null);
    const want = serialOf(mc);
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms, presses: presses.map(([at, which, hold]) => [at, which.toLowerCase(), hold])});
    assert.equal(run.traceback, null, run.traceback);
    assert.deepEqual(lines(run.out), want);
    const back = await runMakeCodeSim(await compileMakeCode(await exported(imported)), {ms, at: [], presses});
    assert.equal(back.error, null);
    assert.deepEqual(serialOf(back), want);
    return want;
}
/** No simulator can show it (audio, pins, the bluetooth uart): the generated code runs and the export compiles. */
async function runsAndExports (ts, {ms = 800, dependencies} = {}) {
    const {imported, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms});
    assert.equal(run.traceback, null, run.traceback);
    await exported(imported, dependencies);
    return {imported, py, out: lines(run.out)};
}

test('pxt library functions run as pxt writes them: toggleAll, event ids, benchmark, frequencies, melodies, versions, fades', {skip}, async () => {
    const ts = [
        'led.plot(1, 1)',
        'led.toggleAll()',
        'serial.writeLine("p " + (led.point(1, 1) ? "on" : "off") + " " + (led.point(2, 2) ? "on" : "off"))',
        'serial.writeLine("e " + control.allocateEventSource() + " " + control.allocateEventSource())',
        'serial.writeLine("n " + control.allocateNotifyEvent() + " " + control.allocateNotifyEvent())',
        'let us = control.benchmark(() => { basic.pause(100) })',
        'serial.writeLine("b " + (us >= 100000 && us < 200000 ? "ok" : "bad"))',
        'serial.writeLine("f " + music.getFrequencyForNote(4, 9) + " " + music.getFrequencyForNote(9, 2) + " " + music.getFrequencyForNote(0, 3))',
        'serial.writeLine("a " + images.arrowNumber(ArrowNames.SouthWest) + " " + control.eventSourceId(EventBusSource.MICROBIT_ID_BUTTON_B) + " " + control.eventValueId(EventBusValue.MICROBIT_BUTTON_EVT_CLICK))',
        'let m = music.builtInMelody(Melodies.BaDing)',
        'serial.writeLine("m " + m.length + " " + m[0] + " " + m[1])',
        'let g = music.getMelody(Melodies.PowerUp)',
        'serial.writeLine("g " + g[0] + " " + g[3] + " " + g[5])',
        'let notes = music.getMelodyNotes("E D G - C5 B")',
        'serial.writeLine("o " + notes[3] + " " + notes[5])',
        'serial.writeLine("v " + control.compareVersion("1.2.10", "1.2.9") + " " + control.compareVersion("2.x", "2.0.0") + " " + control.compareVersion("1", "1.0.3"))',
        'serial.writeLine("w " + music.melodyEditor("C D E"))',
        'console.log("console " + 3)',
        'led.fadeOut(200)',
        'serial.writeLine("d " + led.brightness())',
        'led.fadeIn(100)',
        'serial.writeLine("i " + led.brightness())',
        'let s = game.invalidSprite()',
        'serial.writeLine("s " + (s ? "some" : "none"))',
        'input.calibrate()',
        'serial.writeLine("end")'
    ].join('\n');
    assert.deepEqual(await threeWays(ts, {ms: 2500}), ['p off on', 'e 32769 32770', 'n 1024 1025', 'b ok', 'f 415 8870 0', 'a 5 2 3',
        'm 2 b5:1 e6:3', 'g g4:1 g:2 g:3', 'o R B4', 'v 1 0 -3', 'w C D E', 'console 3', 'd 0', 'i 255', 's none', 'end']);
});

test('built-in melodies decode as pxt\'s _bufferToMelody does', () => {
    assert.deepEqual(builtInMelodyNotes('BaDing'), ['b5:1', 'e6:3']);
    assert.deepEqual(builtInMelodyNotes('Dadadadum').slice(0, 5), ['r4:2', 'g', 'g', 'g', 'd#:8']);
    assert.equal(builtInMelodyNotes('NoSuchMelody'), null);
});

test('assert and fail: the console lines and the panic codes (98, 108)', {skip}, async () => {
    const pass = microbitToPseudocode('control.assert(1 + 1 == 2, "maths")\nserial.writeLine("ok")');
    assert.deepEqual(pass.unsupported, []);
    assert.match(pass.code, /IF not \(.*\) THEN:\n\s+print "ASSERTION FAILED"\n\s+print "maths"\n\s+panic with code 98/);
    const fail = microbitToPseudocode('control.fail("broken")');
    assert.match(fail.code, /print "Fatal failure: "\n\s+print "broken"\n\s+panic with code 108/);
    const mc = await runMakeCodeSim(await compileMakeCode('control.assert(false, "maths")\nserial.writeLine("after")'), {ms: 500, at: []});
    assert.deepEqual(serialOf(mc).slice(0, 2), ['ASSERTION FAILED', 'maths']);
    const {py} = lite('control.assert(false, "maths")\nserial.writeLine("after")');
    await assert.rejects(runOnMicrobitFirmware(py, {ms: 500}), /panic 98/);
    const failed = lite('control.fail("broken")');
    await assert.rejects(runOnMicrobitFirmware(failed.py, {ms: 500}), /panic 108/);
});

test('the display: plotLeds, showAnimation, showArrow of a value, screenshot, a big image', {skip}, async () => {
    const ts = [
        'function row(y: number): string {',
        '    let r = ""',
        '    for (let x = 0; x < 5; x++) r = r + (led.point(x, y) ? "#" : ".")',
        '    return r',
        '}',
        'function screen(tag: string) {',
        '    serial.writeLine(tag + " " + row(0) + row(1) + row(2) + row(3) + row(4))',
        '}',
        'basic.plotLeds(`\n    # . . . #\n    . . . . .\n    . . # . .\n    . . . . .\n    # . . . #\n    `)',
        'screen("plot")',
        'let t0 = input.runningTime()',
        'basic.showAnimation(`\n    # . . . . . # . . . . . # . .\n    . . . . . . . . . . . . . . .\n    . . . . . . . . . . . . . . .\n    . . . . . . . . . . . . . . .\n    . . . . . . . . . . . . . . .\n    `, 100)',
        'let took = input.runningTime() - t0',
        'serial.writeLine("anim " + (took >= 280 && took < 450 ? "ok" : "bad"))',
        'screen("last")',
        'let dir = 2',
        'basic.showArrow(dir, 50)',
        'screen("arrow")',
        'basic.showArrow(4)',
        'screen("arrow4")',
        'let shot = led.screenshot()',
        'basic.clearScreen()',
        'shot.plotImage(0)',
        'screen("shot")',
        'let big = images.createBigImage(`\n    # . . . . . . . . #\n    . # . . . . . . # .\n    . . # . . . . # . .\n    . . . # . . # . . .\n    . . . . # # . . . .\n    `)',
        'big.plotImage(5)',
        'screen("big5")'
    ].join('\n');
    assert.deepEqual(await threeWays(ts, {ms: 3500}), ['plot #...#.......#.......#...#', 'anim ok', 'last ..#......................',
        'arrow ..#.....#.#####...#...#..', 'arrow4 ..#....#..#.#.#.###...#..', 'shot ..#....#..#.#.#.###...#..', 'big5 ....#...#...#...#...#....']);
});

test('waitForEvent: raised events, any value, a button\'s down and click; folded event sources', {skip}, async () => {
    const ts = [
        'const MY_EVENT = control.allocateEventSource()',
        'const OTHER = control.allocateEventSource()',
        'let n = 0',
        'let phase = 0',
        'control.onEvent(MY_EVENT, 7, function () {',
        '    serial.writeLine("own " + control.eventValue() + " " + (OTHER - MY_EVENT))',
        '})',
        'basic.forever(function () {',
        '    basic.pause(100)',
        '    n += 1',
        '    control.raiseEvent(4100, n)',
        '})',
        'basic.forever(function () {',
        '    if (phase == 0) {',
        '        phase = 1',
        '        control.waitForEvent(4100, 3)',
        '        serial.writeLine("got 3 n=" + n)',
        '        control.waitForEvent(4100, 0)',
        '        serial.writeLine("got any n=" + n)',
        '        control.raiseEvent(MY_EVENT, 7)',
        '        basic.pause(50)',
        '        control.waitForEvent(EventBusSource.MICROBIT_ID_BUTTON_A, EventBusValue.MICROBIT_BUTTON_EVT_DOWN)',
        '        serial.writeLine("a down")',
        '        control.waitForEvent(EventBusSource.MICROBIT_ID_BUTTON_A, EventBusValue.MICROBIT_BUTTON_EVT_CLICK)',
        '        serial.writeLine("a click")',
        '    }',
        '    basic.pause(20)',
        '})'
    ].join('\n');
    assert.deepEqual(await threeWays(ts, {ms: 2200, presses: [[900, 'A', 100], [1300, 'A', 200]]}),
        ['got 3 n=3', 'got any n=4', 'own 7 1', 'a down', 'a click']);
});

test('buffers: packIntoBuffer, concatBuffers of any number, delimiters as values', {skip}, async () => {
    const ts = [
        'let b = pins.createBuffer(6)',
        'pins.packIntoBuffer("<hB", b, 1, [-300, 200])',
        'serial.writeLine("pk " + b.getNumber(NumberFormat.Int16LE, 1) + " " + b.getUint8(3) + " " + b.length)',
        'let x = pins.createBufferFromArray([1, 2])',
        'let y = pins.createBufferFromArray([3])',
        'let z = pins.createBufferFromArray([4, 5])',
        'let all = pins.concatBuffers([x, y, z])',
        'serial.writeLine("cat " + all.length + " " + all.getUint8(2) + " " + all.getUint8(4))',
        'let one = pins.concatBuffers([x])',
        'one.setUint8(0, 9)',
        'serial.writeLine("one " + one.length + " " + x.getUint8(0))',
        'serial.writeLine("delim [" + serial.delimiters(Delimiters.Comma) + "]")',
        'serial.writeLine("hv " + control.hardwareVersion())'
    ].join('\n');
    assert.deepEqual(await threeWays(ts), ['pk -300 200 6', 'cat 5 3 5', 'one 2 1', 'delim [,]', 'hv 2.0']);
});

test('the pitch pin, the device name and long serial, an I2C write\'s status, the said no-ops', {skip}, async () => {
    const ts = [
        'pins.analogSetPitchPin(AnalogPin.P1)',
        'pins.analogSetPitchVolume(100)',
        'serial.writeLine("vol " + pins.analogPitchVolume())',
        'let t0 = input.runningTime()',
        'pins.analogPitch(440, 200)',
        'serial.writeLine("pitch " + (input.runningTime() - t0 >= 200 ? "waited" : "no"))',
        'pins.analogPitch(0, 0)',
        'let ls = control.deviceLongSerialNumber()',
        'serial.writeLine("d " + control.deviceName().length + " " + ls.length + " " + ((ls.getNumber(NumberFormat.Int32LE, 0) & 0x7fffffff) == control.deviceSerialNumber() ? "same" : "diff"))',
        'let b = pins.createBuffer(2)',
        'let st = pins.i2cWriteBuffer(64, b)',
        'serial.writeLine("i2c " + st)',
        'pins.servoSetContinuous(AnalogPin.P2, true)',
        'pins.setMatrixWidth(DigitalPin.P3, 8)',
        'music.setSilenceLevel(10)',
        'control.singleSimulator()',
        'serial.writeLine("ram " + control.ramSize() + " " + (control.profilingEnabled() ? "prof" : "plain"))'
    ].join('\n');
    const {out, py} = await runsAndExports(ts, {ms: 1200});
    assert.deepEqual(out, ['vol 100', 'pitch waited', 'd 5 8 same', 'i2c 0', 'ram 131072 plain']);
    // The duty is 1 << (volume >> 5) of 1023 on the pitch pin (pins.cpp pinAnalogSetPitch).
    assert.match(py, /p\.write_analog\(1 << \(_bw_apitch\[1\] >> 5\)\)/);
});

test('device name: CODAL\'s microbit_friendly_name() of the serial number', {skip}, async () => {
    const {py} = lite('serial.writeLine(control.deviceName())');
    // The name of serial number 0 is all first letters; of 1, the last letter moves on (right to left).
    const named = async serial => {
        const run = await runOnMicrobitFirmware(py.replace(/^(\s*)_bw_serial_no = .*$/m, `$1_bw_serial_no = ${serial}`), {ms: 300});
        assert.equal(run.traceback, null, run.traceback);
        return lines(run.out)[0];
    };
    assert.equal(await named(0), 'zuzuz');
    assert.equal(await named(1), 'zuzuv');
    assert.equal(await named(5), 'zuzoz');
});

test('pins.pushButton: a button on the pin, its events the button\'s; pulseDuration in onPulsed', {skip}, async () => {
    const ts = [
        'pins.pushButton(DigitalPin.P5)',
        'control.onEvent(EventBusSource.MICROBIT_ID_IO_P5, EventBusValue.MICROBIT_BUTTON_EVT_CLICK, function () {',
        '    serial.writeLine("clicked")',
        '})',
        'pins.onPulsed(DigitalPin.P1, PulseValue.High, function () {',
        '    serial.writeLine("pulse " + pins.pulseDuration())',
        '})'
    ].join('\n');
    const {imported} = await runsAndExports(ts);
    assert.match(imported.code, /set pin P5 pull up/);
    assert.match(imported.code, /IF pin P5 digital = 0 THEN:/);
    assert.match(imported.code, /set (_pulse_us\d+) to round \(\(timer - _pulse\d+\) \* 1000000\)[\s\S]*print \("pulse " join \1\)/);
});

test('delimiters of any characters, for serial and the bluetooth uart', {skip}, async () => {
    const serial = await runsAndExports([
        'serial.onDataReceived(";!", function () {',
        '    serial.writeLine(serial.readUntil(";!"))',
        '})',
        'let t = serial.readUntil(",")',
        'serial.writeLine(t)'
    ].join('\n'), {ms: 300});
    assert.match(serial.imported.code, /serial has data until any of ";!"/);
    assert.match(serial.imported.code, /serial read until comma/);
    // The first of any of the characters ends the text (CODAL's readUntil), not the whole string.
    assert.match(serial.py, /def _bw_ser_until_any\(chars\):/);
    const bt = await runsAndExports([
        'bluetooth.onUartDataReceived("#", function () {',
        '    basic.showString(bluetooth.uartReadUntil("ab"))',
        '})',
        'basic.showNumber(1)'
    ].join('\n'), {dependencies: {core: '*', bluetooth: '*'}});
    assert.match(bt.imported.code, /WHEN bluetooth uart receives hash:/);
    assert.match(bt.imported.code, /bluetooth uart read until any of "ab"/);
});

test('sounds and playables kept in a variable and played are played where they are', {skip}, async () => {
    const ts = [
        'let snd = music.createSoundEffect(WaveShape.Square, 400, 600, 255, 0, 100, SoundExpressionEffect.None, InterpolationCurve.Linear)',
        'let tune = music.stringPlayable("C D E", 240)',
        'let ding = music.builtInPlayableMelody(Melodies.BaDing)',
        'let t = music.tonePlayable(262, music.beat(BeatFraction.Quarter))',
        'let hi = music.builtinPlayableSoundEffect(soundExpression.hello)',
        'input.onButtonPressed(Button.A, function () {',
        '    music.playSoundEffect(snd, SoundExpressionPlayMode.UntilDone)',
        '})',
        'music.play(tune, music.PlaybackMode.UntilDone)',
        'music.play(ding, music.PlaybackMode.InBackground)',
        'music.play(t, music.PlaybackMode.UntilDone)',
        'music.play(hi, music.PlaybackMode.UntilDone)'
    ].join('\n');
    const {imported} = await runsAndExports(ts, {ms: 2500});
    assert.match(imported.code, /play notes "C_D_E" tempo 240 until done/);
    assert.match(imported.code, /play melody BaDing in background/);
    assert.match(imported.code, /play sound effect square from 400 to 600 hz/);
    // Changed after it is made, or used as anything but a sound to play: still said, not guessed.
    assert.notDeepEqual(microbitToPseudocode('let s = music.tonePlayable(262, 100)\nserial.writeLine("" + s)').unsupported, []);
    assert.notDeepEqual(microbitToPseudocode('let s = music.tonePlayable(262, 100)\ns = music.tonePlayable(300, 100)\nmusic.play(s, music.PlaybackMode.UntilDone)').unsupported, []);
});

test('what stays refused says why', () => {
    const refused = call => microbitToPseudocode(call).unsupported.join(' ');
    assert.match(refused('let h = control.programHash()'), /binary/);
    assert.match(refused('let g = control.gcStats()'), /garbage collector/);
    assert.match(refused('let i = control.setInterval(() => {}, 100, control.IntervalMode.Interval)'), /run time/);
    assert.match(refused('music.onEvent(MusicEvent.MelodyEnded, () => {})'), /melody/);
    assert.match(refused('music.setPlayTone((f, d) => {})'), /notes itself/);
    assert.match(refused('let t = control.eventTimestamp()'), /outside an event handler/);
    assert.match(refused('let t = pins.pulseDuration()'), /outside a pins.onPulsed handler/);
});
