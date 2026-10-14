/**
 * The MakeCode census's last partial programs (task A2, 2026-09-29), held
 * against MakeCode's OWN simulator.
 *
 * Each program is run twice: as MakeCode wrote it, in pxt-microbit's
 * simulator (scripts/lib/makecode-sim.mjs, headless on a virtual clock), and
 * as lite imports it, in lite's micro:bit simulator firmware (scripts/lib/
 * microbit-firmware.mjs). The two must print the same lines and leave the
 * same LEDs. What each one holds:
 *
 *   records   classes and interfaces LOWERED to parallel arrays — fields,
 *             a constructor, methods that change `this` and return values,
 *             an array of records walked by for…of, an object literal a
 *             function returns, a parameter that shares a global's name
 *   life      images as values (create, setPixel, pixel, plotImage,
 *             showImage from an offset), functions that take ARRAYS
 *             (specialised per array), `state = result` (a copy), switch
 *   text      s[i], s.length, convertToText, parseFloat, serial.writeValue,
 *             removeAt as a value, `? :` inside an expression
 *   leds      led.plotBrightness and led.point, on and off the grid
 *   return    a forever's body that returns early
 *   switch    fall-through labels, default, return inside a case, an enum
 *
 * The census (scripts/makecode-census.mjs) runs MakeCode's own apps through
 * the same importer; this file pins each mechanism on a program whose output
 * says what it did.
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

/** MakeCode's 0..255 brightness as the 0..9 level lite draws it (anything lit stays lit). */
const level = b => Math.floor(((b || 0) * 9 + 254) / 255);
const picture = px => [0, 1, 2, 3, 4].map(y => px.slice(y * 5, y * 5 + 5).join(' ')).join(' / ');

const RECORDS = `
interface Point {
    x: number;
    y: number;
}
class Counter {
    count: number
    step: number = 2
    name: string
    constructor(name: string, start: number) {
        this.name = name
        this.count = start
    }
    bump(): number {
        this.count += this.step
        return this.count
    }
    describe() {
        serial.writeLine(this.name + "=" + this.count)
    }
}
const counters: Counter[] = []
function make(name: string, start: number): Counter {
    const c = new Counter(name, start)
    counters.push(c)
    return c
}
function mid(a: Point, b: Point): Point {
    return { x: Math.idiv(a.x + b.x, 2), y: Math.idiv(a.y + b.y, 2) }
}
let a = make("a", 1)
let b = make("b", 10)
a.bump()
b.step = 5
b.bump()
serial.writeLine("" + a.bump() + " " + b.bump())
for (const c of counters) {
    c.describe()
}
let none: Counter = null
if (!none) serial.writeLine("none")
let p: Point = { x: 0, y: 4 }
let q: Point = { x: 4, y: 0 }
let m = mid(p, q)
serial.writeLine("mid " + m.x + "," + m.y)
m.x += 1
serial.writeLine("moved " + m.x + " " + p.x)
`;

const LIFE = `
let lifeChart: Image = null
lifeChart = images.createImage(\`
    . . . . .
    . . . . .
    . . . . .
    . . . . .
    . . . . .
    \`)
let state = [false, false, false, false, false,
    false, false, true, false, false,
    false, false, true, false, false,
    false, false, true, false, false,
    false, false, false, false, false]
function getState(arr: boolean[], x: number, y: number): boolean {
    return arr[x * 5 + y];
}
function setState(arr: boolean[], x: number, y: number, value: boolean): void {
    arr[x * 5 + y] = value;
}
function show() {
    for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
            lifeChart.setPixel(x, y, getState(state, x, y));
        }
    }
    lifeChart.plotImage(0);
    let row = ""
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            row = row + (lifeChart.pixel(x, y) ? "#" : ".")
        }
        row = row + "/"
    }
    serial.writeLine(row)
}
function step() {
    let result: boolean[] = [];
    let count = 0;
    for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
            count = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if ((dx != 0 || dy != 0) && x + dx >= 0 && x + dx < 5 && y + dy >= 0 && y + dy < 5) {
                        if (getState(state, x + dx, y + dy)) {
                            count++;
                        }
                    }
                }
            }
            switch (count) {
                case 2: setState(result, x, y, getState(state, x, y)); break;
                case 3: setState(result, x, y, true); break;
                default: setState(result, x, y, false); break;
            }
        }
    }
    state = result;
}
show()
for (let g = 0; g < 3; g++) {
    step()
    show()
}
lifeChart.showImage(1)
serial.writeLine("shown")
`;

const TEXT = `
const letters = "ABCDEFGHIJ"
let code = ""
for (let i = 0; i < 4; i++) {
    code = "" + code + convertToText(i * 3)
}
serial.writeLine(code + " " + code.length)
serial.writeLine(letters[2] + letters[letters.length - 1])
let k = 4
serial.writeLine(letters[k])
let n = parseFloat(code)
serial.writeLine("" + (n + 1))
serial.writeLine("" + parseFloat("12.5kg"))
serial.writeValue("temp", 21)
let players = [4, 7, 9]
let gone = players.removeAt(1)
serial.writeLine("" + gone + " " + players.length + " " + players[1])
let kinds = ["zero", "one"]
for (let k = 0; k < 3; k++) {
    serial.writeLine(k < 2 ? kinds[k] : "many")
}
`;

const LEDS = `
led.plot(1, 1)
led.plotBrightness(2, 2, 128)
led.plotBrightness(3, 3, 1)
led.plotBrightness(4, 4, 255)
led.plotBrightness(4, 4, 0)
led.plotBrightness(7, 1, 255)
for (let x = 0; x < 5; x++) {
    if (led.point(x, x)) {
        serial.writeLine("lit " + x)
    }
}
if (!led.point(-1, 9)) {
    serial.writeLine("off the grid")
}
`;

const RETURN = `
let ticks = 0
basic.forever(function () {
    ticks += 1
    if (ticks > 3) {
        return
    }
    serial.writeLine("tick " + ticks)
    basic.pause(100)
})
`;

const SWITCH = `
enum Dir { UP = 0, LEFT, DOWN, RIGHT }
let d: number = Dir.LEFT
let n = 0
function f(k: number) {
    switch (k) {
        case 0: serial.writeLine("zero"); break;
        case 1:
        case 2:
            serial.writeLine("one or two")
            break
        case Dir.RIGHT:
            return
        default: serial.writeLine("other " + k); break;
    }
    serial.writeLine("after " + k)
}
for (let i = 0; i < 6; i++) {
    f(i)
}
switch (d) {
    case Dir.UP: serial.writeLine("up"); break
    case Dir.LEFT: serial.writeLine("left"); break
}
`;

test('records: a class and an interface lowered to arrays run as MakeCode runs them', {skip}, async () => {
    const r = await both(RECORDS, {ms: 2000});
    // not vacuous: MakeCode's own transcript
    assert.deepEqual(r.mc.lines, ['5 20', 'a=5', 'b=20', 'none', 'mid 2,2', 'moved 3 0']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
    assert.match(r.code, /new array "Counter_count" = \[0\]/, 'a field is an array, index 0 "no record"');
    assert.match(r.code, /DEFINE Counter_bump \(self\):/, 'a method is a procedure of the instance');
});

test('life: images as values, array parameters, an array copy and a switch run as MakeCode runs them', {skip}, async () => {
    // each loop pass costs lite's scheduler a tick, so lite is given the time
    // the generations take; the transcript and the final picture must agree
    const r = await both(LIFE, {ms: 3000, liteMs: 20000});
    assert.equal(r.mc.lines.length, 5);
    assert.deepEqual(r.mc.lines.slice(0, 2), ['...../...../.###./...../...../', '...../..#../..#../..#../...../']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
    // (pxt's simulator keeps an image's pixel as 1, not a brightness: lit is compared)
    const lit = px => picture(px.map(v => (v > 0 ? 1 : 0)));
    assert.equal(lit(r.lite.leds), lit(r.mc.leds), 'showImage(1) draws the image one column left');
    assert.match(r.code, /DEFINE getState_state \(x_\) \(y_\):/, 'getState is specialised for the array it is given');
    assert.match(r.code, /DEFINE setState_result /);
});

test('text: characters, lengths, parseFloat, writeValue, removeAt as a value, a choice inside an expression', {skip}, async () => {
    const r = await both(TEXT, {ms: 2000});
    assert.deepEqual(r.mc.lines, ['0369 4', 'CJ', 'E', '370', '12.5', 'temp:21', '7 2 9', 'zero', 'one', 'many']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('led.plotBrightness and led.point draw and read the LEDs MakeCode\'s do', {skip}, async () => {
    const r = await both(LEDS, {ms: 1000});
    assert.deepEqual(r.mc.lines, ['lit 1', 'lit 2', 'lit 3', 'off the grid']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
    assert.equal(picture(r.lite.leds), picture(r.mc.leds.map(level)));
});

test('a forever\'s body that returns leaves that pass only (it is a procedure of its own)', {skip}, async () => {
    const r = await both(RETURN, {ms: 1000});
    assert.deepEqual(r.mc.lines, ['tick 1', 'tick 2', 'tick 3']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('switch: shared labels, default, a return inside a case', {skip}, async () => {
    const r = await both(SWITCH, {ms: 1000});
    assert.deepEqual(r.mc.lines, ['zero', 'after 0', 'one or two', 'after 1', 'one or two', 'after 2',
        'other 4', 'after 4', 'other 5', 'after 5', 'left']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

// ── lite's firmware only: what one simulator cannot show ──────────────────

test('radio serial numbers: the sender puts its number in front, the receiver reads it and gets the payload', {skip}, async () => {
    const tx = lite('radio.setGroup(4)\nradio.setTransmitSerialNumber(true)\nradio.sendNumber(255)\nserial.writeLine("" + control.deviceSerialNumber())\n');
    const sent = await runOnMicrobitFirmware(tx.py, {ms: 500});
    assert.equal(sent.traceback, null, sent.traceback);
    // the simulator firmware has no machine.unique_id: its serial number is 1
    assert.deepEqual(sent.out.split(/\r?\n/).filter(Boolean), ['1']);
    assert.deepEqual(sent.sent.map(p => p.slice(3)), ['\u0000S1\u0000255']);
    const rx = lite([
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    serial.writeLine("" + radio.receivedPacket(RadioPacketProperty.SerialNumber) + ":" + receivedNumber)',
        '})'].join('\n'));
    const got = await runOnMicrobitFirmware(rx.py, {ms: 1000, radio: [[100, '\u0000S77\u000042'], [300, '5']]});
    assert.equal(got.traceback, null, got.traceback);
    assert.deepEqual(got.out.split(/\r?\n/).filter(Boolean), ['77:42', '0:5'], 'a packet without one reads 0, as in MakeCode');
});

test('input.onSound is a hat, and it runs in the firmware (microphone.was_event)', {skip}, async () => {
    const {code, py} = lite('input.onSound(DetectedSound.Loud, function () {\n    basic.showNumber(1)\n})\n' +
        'input.setSoundThreshold(SoundThreshold.Loud, 128)\n');
    assert.match(code, /WHEN loud sound:\n {2}show number 1/);
    assert.match(code, /set loud sound threshold to 128/);
    const run = await runOnMicrobitFirmware(py, {ms: 500});
    assert.equal(run.traceback, null, run.traceback);
});

// ── the way back: every new word is MakeCode's call again, and recompiles ──

test('the new words export as MakeCode\'s own calls, and MakeCode compiles the export', {skip}, async () => {
    const ts = [
        'let img = images.createImage(`',
        '    # . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . #',
        '    `)',
        'img.setPixel(1, 1, true)',
        'img.plotImage(0)',
        'if (img.pixel(1, 1)) {',
        '    img.showImage(1)',
        '}',
        'led.plotBrightness(2, 2, 100)',
        'if (led.point(2, 2)) {',
        '    serial.writeValue("n", parseFloat("4.5"))',
        '}',
        'radio.setTransmitSerialNumber(true)',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    serial.writeLine("" + radio.receivedPacket(RadioPacketProperty.SerialNumber) + control.deviceSerialNumber())',
        '})',
        'input.onSound(DetectedSound.Quiet, function () {',
        '    basic.clearScreen()',
        '})',
        'input.setSoundThreshold(SoundThreshold.Quiet, 20)',
        'let word = "micro"',
        'let k = 3',
        'serial.writeLine(word[2] + word[k] + word.length)',
        'img.setPixel(2, 2, k > 2)'
    ].join('\n');
    const {code} = lite(ts);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'a2'});
    assert.deepEqual(ex.unsupported, []);
    for (const call of ['images.createImage(', '.setPixel(1, 1, true)', '.plotImage(0)', '.pixel(1, 1)', '.showImage(1)',
        'led.plotBrightness(2, 2, 100)', 'led.point(2, 2)', 'serial.writeValue("n", parseFloat(', 'radio.setTransmitSerialNumber(true)',
        'radio.receivedPacket(RadioPacketProperty.SerialNumber)', 'control.deviceSerialNumber()',
        'input.onSound(DetectedSound.Quiet, function () {', 'input.setSoundThreshold(SoundThreshold.Quiet, 20)',
        'word[2]', 'word[k]', 'word.length']) {
        assert.ok(ex.ts.includes(call), `${call} not in the export:\n${ex.ts}`);
    }
    assert.match(ex.ts, /let img: Image = null/);
    await compileMakeCode(ex.ts);
});

test('records export as arrays and procedures MakeCode compiles, a sprite field typed as sprites', {skip}, async () => {
    const ts = [
        'interface Client {',
        '    id: number',
        '    sprite: game.LedSprite',
        '}',
        'const clients: Client[] = []',
        'function add(id: number): Client {',
        '    const c: Client = { id: id, sprite: game.createSprite(id, 0) }',
        '    clients.push(c)',
        '    return c',
        '}',
        'let k = add(2)',
        'k.sprite.setBrightness(40)',
        'class Ship {',
        '    hull: game.LedSprite',
        '    glyph: Image',
        '}',
        'let ship = new Ship()',
        'ship.hull = game.createSprite(4, 4)',
        'ship.glyph = images.createImage(`',
        '    # . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    `)',
        'serial.writeLine("" + k.id + " " + k.sprite.get(LedSpriteProperty.X))'
    ].join('\n');
    const {code} = lite(ts);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'a2'});
    assert.deepEqual(ex.unsupported, []);
    assert.match(ex.ts, /let Client_sprite: game\.LedSprite\[\] = \[\]/);
    assert.match(ex.ts, /Client_sprite = \[null\]/);
    // a field with no initialiser starts as "none": MakeCode's null for a sprite or an image
    assert.match(ex.ts, /Ship_hull\.push\(null\)/);
    assert.match(ex.ts, /Ship_glyph\.push\(null\)/);
    assert.match(ex.ts, /let Ship_glyph: Image\[\] = \[\]/);
    await compileMakeCode(ex.ts);
    const r = await both(ts, {ms: 500});
    assert.deepEqual(r.mc.lines, ['2 2']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});
