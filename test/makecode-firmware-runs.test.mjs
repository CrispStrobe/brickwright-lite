/**
 * An imported MakeCode program RUNS in lite's own micro:bit simulator
 * firmware — the MicroPython build the Code tab's simulator pane runs
 * (static/microbit-sim/build/firmware.wasm), driven headless by
 * scripts/lib/microbit-firmware.mjs.
 *
 * WHY THIS FILE. "generateMicroPython succeeded" was the census's `sim`
 * stage, and it said "runs" of programs that stopped at their first step:
 * measured 2026-09-27, 111 of MakeCode's 206 compiling doc apps died in this
 * firmware with a Python error — a yield-less script the scheduler could not
 * drive (95), `import json` the simulator build does not have (9),
 * `_radio_last_num` never defined (7). The census now runs every program;
 * these cases pin the mechanisms, with values the firmware itself prints.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {runOnMicrobitFirmware, FIRMWARE_DIR} from '../scripts/lib/microbit-firmware.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';

// The firmware and the compiler are both committed, so neither is ever absent
// in CI; a missing one is a broken checkout, and it says so by failing.
const {default: SB3Creator} = await import(join(SOURCE, 'src', 'lib', 'sb3-creator.js'));

/** MakeCode TypeScript → lite pseudocode → MicroPython → the firmware. */
async function runMakeCode (ts, opts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], 'the import refused something');
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const mp = creator.generateMicroPython();
    assert.ok(mp.ok, `MicroPython: ${JSON.stringify(mp.reasons)}`);
    const run = await runOnMicrobitFirmware(mp.py, opts);
    assert.equal(run.traceback, null, `the program stopped:\n${run.traceback}\n---\n${mp.py}`);
    assert.equal(run.panic, null, 'the firmware panicked');
    return {...run, lines: run.out.split(/\r?\n/).filter(Boolean)};
}

test('the firmware is the one the simulator pane loads', () => {
    assert.ok(existsSync(join(FIRMWARE_DIR, 'firmware.wasm')), FIRMWARE_DIR);
});

test('a plain MicroPython error is reported, not swallowed (the instrument can fail)', async () => {
    const run = await runOnMicrobitFirmware('from microbit import *\nprint("up")\nnot_defined\n', {ms: 1000});
    assert.match(run.out, /^up/);
    assert.match(run.traceback, /NameError: name 'not_defined' isn't defined/);
});

test('a radio handler runs once per packet, with that packet\'s value, while it waits', async () => {
    // MakeCode's onReceivedNumber was POLLED on import, so its body ran on
    // every pass; and reading the last packet was a NameError.
    const {lines} = await runMakeCode([
        'let count = 0',
        'radio.setGroup(1)',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    count += 1',
        '    basic.pause(500)',
        '    serial.writeLine("" + count + ":" + receivedNumber)',
        '})',
        'radio.onReceivedString(function (receivedString) {',
        '    serial.writeLine(receivedString)',
        '})'
    ].join('\n'), {ms: 3000, radio: [[300, '5'], [400, '9'], [900, 'hi']]});
    // 5 arrives at 300 and 9 at 400; each handler waits 500 and still prints
    // ITS packet. The text handler prints at once.
    assert.deepEqual(lines, ['2:5', '2:9', 'hi']);
});

test('music keeps MakeCode\'s time; a script with nothing to wait on does not stop the others', async () => {
    const {lines} = await runMakeCode([
        'basic.showIcon(IconNames.Heart)',
        'basic.forever(function () {',
        '    music.setTempo(60)',
        '    serial.writeLine("" + music.beat(BeatFraction.Whole) + " " + music.noteFrequency(Note.A))',
        '    music.playTone(music.noteFrequency(Note.C), music.beat(BeatFraction.Sixteenth))',
        '    music.rest(10)',
        '    music._playDefaultBackground(music.builtInPlayableMelody(Melodies.JumpUp), music.PlaybackMode.InBackground)',
        '    basic.pause(5000)',
        '})'
    ].join('\n'), {ms: 2000});
    assert.deepEqual(lines, ['1000 440']);
});

test('arrays run without a json module, and a point off the display is ignored as MakeCode ignores it', async () => {
    const {lines, pixels} = await runMakeCode([
        'let words: string[] = []',
        'words.push("cat")',
        'words.push("dog")',
        'let egg = 5',
        'led.plot(2, egg)',
        'led.plot(4, 4)',
        'serial.writeLine(words[1])',
        'serial.writeLine("" + words.length)'
    ].join('\n'), {ms: 1000});
    assert.deepEqual(lines, ['dog', '2']);
    assert.equal(pixels[4][4], 9);
});
