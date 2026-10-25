/**
 * basic.showNumber WAITS while the number is shown — in MakeCode's own
 * simulator and, imported as `show number`, in lite's simulator firmware.
 *
 * lite used to import it as `display`, which scrolls and moves on, so a
 * program that showed a count ran ahead of MakeCode's. The two are run side
 * by side here (scripts/lib/makecode-sim.mjs: pxt-microbit's simulator,
 * headless on a virtual clock; scripts/lib/microbit-firmware.mjs: lite's
 * firmware) and must print the same lines — each line carries the time, in
 * tens of ms, at which the program got there — and leave the same LEDs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {compileMakeCode, runMakeCodeSim, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';
import {runOnMicrobitFirmware} from '../scripts/lib/microbit-firmware.mjs';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const SB3Creator = existsSync(COMPILER) ? (await import(COMPILER)).default : null;
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode): no pxt-microbit simulator to compare with' :
    !SB3Creator ? 'sb3-creator not integrated' : false;

async function both (ts, ms) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, JSON.stringify(gen.reasons));
    const lite = await runOnMicrobitFirmware(gen.py, {ms});
    assert.equal(lite.traceback, null, `lite's firmware stopped:\n${lite.traceback}\n---\n${imported.code}`);
    return {
        mc: mc.serial.map(l => l.text),
        lite: lite.out.split(/\r?\n/).map(l => l.trim()).filter(Boolean),
        code: imported.code
    };
}

test('each number holds the program as long as MakeCode\'s does: digits, longer numbers, decimals, an interval', {skip}, async () => {
    // Straight-line, not a loop: each loop pass costs lite's scheduler 1 ms
    // (its tick), which is the loop's timing, not showNumber's.
    const r = await both(`
basic.showNumber(7)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(42)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(-3)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(3.14159)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(100)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(0.001)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(12.999)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(42, 100)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
basic.showNumber(5, 60)
serial.writeLine("" + Math.idiv(input.runningTime(), 10))
`, 30000);
    // Not vacuous: MakeCode's own times (tens of ms) — 7 waits 750, 42 2550 ...
    assert.deepEqual(r.mc.slice(0, 3), ['75', '330', '585']);
    assert.deepEqual(r.lite, r.mc);
});

test('a counter that shows each value counts at MakeCode\'s pace', {skip}, async () => {
    const r = await both(`
let n = 0
basic.forever(function () {
    n += 1
    basic.showNumber(n)
    serial.writeLine("" + n + " " + Math.idiv(input.runningTime(), 10))
})
`, 20000);
    assert.ok(r.mc.length >= 10, r.mc.join('\n'));
    assert.deepEqual(r.lite, r.mc);
});
