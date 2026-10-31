/**
 * The micro:bit LED API gaps (2026-11-01): led.pointBrightness, led.brightness,
 * led.setDisplayMode, led.enable and an Image's setPixelBrightness /
 * pixelBrightness. Each program runs in pxt-microbit's own simulator and as
 * lite imports it (MicroPython in lite's firmware); the printed lines must
 * agree. Then the blocks export back to MakeCode's calls, and pxt compiles them.
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
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode): no pxt-microbit simulator to compare with' :
    !SB3Creator ? 'sb3-creator not integrated' : false;

/** lite's MicroPython for a MakeCode program (nothing refused). */
function lite (ts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    return {code: imported.code, py: gen.py};
}

/** MakeCode's run and lite's run of the same program: the printed lines, and the LEDs at the end. */
async function both (ts, {ms = 3000, liteMs = ms} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: [ms - 1]});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const {code, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms: liteMs});
    assert.equal(run.traceback, null, `lite's firmware stopped:\n${run.traceback}\n---\n${code}`);
    return {
        mc: {lines: mc.serial.map(l => l.text.trim()).filter(Boolean), leds: mc.frames[ms - 1]},
        lite: {lines: run.out.split(/\r?\n/).map(l => l.trim()).filter(Boolean), leds: run.pixels.flat()},
        code
    };
}

const level = b => Math.floor(((b || 0) * 9 + 254) / 255);
const lit = px => px.map(p => (p > 0 ? 1 : 0)).join('');

const BRIGHTNESS = `
led.plotBrightness(1, 1, 255)
serial.writeLine("a " + led.pointBrightness(1, 1))
led.plotBrightness(2, 2, 0)
serial.writeLine("b " + led.pointBrightness(2, 2))
led.plotBrightness(0, 0, 255)
led.plotBrightness(0, 0, 128)
serial.writeLine("c " + led.pointBrightness(0, 0))
serial.writeLine("d " + led.pointBrightness(9, 9))
serial.writeLine("e " + led.brightness())
led.setBrightness(100)
serial.writeLine("f " + led.brightness())
led.plotBrightness(3, 3, 200)
serial.writeLine("g " + led.pointBrightness(3, 3))
led.setBrightness(300)
serial.writeLine("h " + led.brightness())
led.setBrightness(0)
serial.writeLine("i " + led.brightness())
`;

test('led.pointBrightness and led.brightness read back what MakeCode\'s do (0..255, clamped to the display brightness)', {skip}, async () => {
    const r = await both(BRIGHTNESS, {ms: 1000});
    assert.equal(r.mc.lines.length, 9);
    // 128 is stored exactly in MakeCode; the 5x5 display here holds ten levels,
    // so lite reads back the level it drew (plotBrightness stores the exact
    // value and pointBrightness returns it).
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

const IMAGE_BRIGHTNESS = `
let img = images.createImage(\`
    . . . . .
    . . . . .
    . . . . .
    . . . . .
    . . . . .
    \`)
img.setPixelBrightness(1, 2, 255)
img.setPixelBrightness(3, 3, 0)
img.setPixelBrightness(9, 9, 255)
serial.writeLine("a " + img.pixelBrightness(1, 2))
serial.writeLine("b " + img.pixelBrightness(3, 3))
serial.writeLine("c " + img.pixelBrightness(9, 9))
serial.writeLine("d " + img.pixelBrightness(0, 0))
img.setPixelBrightness(0, 4, 100)
if (img.pixelBrightness(0, 4) > 0) {
    serial.writeLine("e lit")
}
img.plotImage(0)
`;

test('an image\'s setPixelBrightness and pixelBrightness: 0 and 255 exact, off-image reads 0, and it draws', {skip}, async () => {
    const r = await both(IMAGE_BRIGHTNESS, {ms: 1000});
    assert.deepEqual(r.lite.lines, r.mc.lines);
    assert.equal(lit(r.lite.leds), lit(r.mc.leds));
});

test('led.setDisplayMode(BlackAndWhite) turns every lit grey fully on, as the simulator draws it', {skip}, async () => {
    const ts = 'led.plotBrightness(1, 1, 100)\nled.plotBrightness(2, 2, 255)\nled.setDisplayMode(DisplayMode.BlackAndWhite)\n';
    const r = await both(ts, {ms: 500});
    assert.equal(lit(r.lite.leds), lit(r.mc.leds));
    assert.equal(r.lite.leds[6], 9, 'the dim pixel is fully on');
    const grey = await both('led.plotBrightness(1, 1, 100)\nled.setDisplayMode(DisplayMode.Greyscale)\n', {ms: 500});
    assert.equal(grey.lite.leds[6], level(100), 'greyscale leaves the grey alone');
});

test('led.enable(false) is display.off() (the pins are freed), led.enable(true) display.on()', {skip}, async () => {
    const {code, py} = lite('led.enable(false)\nbasic.pause(100)\nled.enable(true)\nlet on = input.buttonIsPressed(Button.A)\nled.enable(on)\n');
    assert.match(code, /led enable off/);
    assert.match(code, /led enable on/);
    assert.match(py, /display\.off\(\)/);
    assert.match(py, /display\.on\(\)/);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
});

test('the LED words export as MakeCode\'s own calls, and MakeCode compiles the export', {skip}, async () => {
    const ts = [
        'let img = images.createImage(`',
        '    # . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    `)',
        'led.setDisplayMode(DisplayMode.Greyscale)',
        'led.plotBrightness(2, 2, 100)',
        'serial.writeLine("" + led.pointBrightness(2, 2) + led.brightness())',
        'img.setPixelBrightness(1, 1, 50)',
        'serial.writeLine("" + img.pixelBrightness(1, 1))',
        'led.setDisplayMode(DisplayMode.BlackAndWhite)',
        'led.enable(false)',
        'led.enable(true)'
    ].join('\n');
    const {code} = lite(ts);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'ledapi'});
    assert.deepEqual(ex.unsupported, []);
    for (const call of ['led.setDisplayMode(DisplayMode.Greyscale)', 'led.setDisplayMode(DisplayMode.BlackAndWhite)',
        'led.pointBrightness(2, 2)', 'led.brightness()', '.setPixelBrightness(1, 1, 50)', '.pixelBrightness(1, 1)',
        'led.enable(false)', 'led.enable(true)']) {
        assert.ok(ex.ts.includes(call), `${call} not in the export:\n${ex.ts}`);
    }
    await compileMakeCode(ex.ts);
});
