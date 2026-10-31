/**
 * TypeScript classes on the micro:bit (2026-11-01): static methods, static
 * fields and get/set accessors, joining the fields, constructor and methods
 * the importer already lowers to parallel arrays and procedures
 * (translate-base.js, "records"). Each program runs in MakeCode's simulator
 * and as lite imports it; the printed lines must agree. Inheritance is in
 * microbit-class-heritage.test.mjs.
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

const STATICS = `
class Util {
    static twice(n: number): number {
        return n * 2
    }
    static greet(name: string) {
        serial.writeLine("hi " + name)
    }
}
class Shape {
    static made: number = 0
    static label = "s"
    side: number
    constructor(s: number) {
        this.side = s
        Shape.made += 1
    }
    area(): number {
        return Util.twice(this.side)
    }
    describe() {
        serial.writeLine(Shape.label + this.side)
    }
}
let a = new Shape(2)
let b = new Shape(3)
a.describe()
b.describe()
Util.greet("x")
serial.writeLine("" + Shape.made + " " + b.area() + " " + Util.twice(4))
Shape.made = 10
Shape.label = "t"
a.describe()
serial.writeLine("" + Shape.made)
`;

test('static methods and static fields behave as MakeCode\'s do', {skip}, async () => {
    const r = await both(STATICS, {ms: 1000});
    assert.deepEqual(r.mc.lines, ['s2', 's3', 'hi x', '2 6 8', 't2', '10']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

const ACCESSORS = `
class Temp {
    private _c: number
    constructor(c: number) {
        this._c = c
    }
    get f(): number {
        return this._c * 2 + 32
    }
    get c(): number {
        return this._c
    }
    set c(v: number) {
        this._c = v < 0 ? 0 : v
    }
}
let t = new Temp(100)
serial.writeLine("" + t.f)
t.c = -5
serial.writeLine("" + t.c + " " + t.f)
t.c = 20
if (t.f > 60) {
    serial.writeLine("warm")
}
let warm = new Temp(30)
serial.writeLine("" + (warm.f + t.f))
`;

test('get and set accessors call the getter and the setter, as MakeCode\'s do', {skip}, async () => {
    const r = await both(ACCESSORS, {ms: 1000});
    assert.deepEqual(r.mc.lines, ['232', '0 32', 'warm', '164']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('a class that extends something this program does not define stays refused by name', {skip}, () => {
    const imported = microbitToPseudocode('class A {\n    x = 1\n}\nclass B extends Elsewhere {\n    y = 2\n}\nlet b = new B()\nserial.writeLine("" + b.y)\n');
    assert.ok(imported.unsupported.some(u => /^class B .*extends Elsewhere/.test(u)), imported.unsupported.join('\n'));
});

test('a constructor\'s omitted optional parameter takes its default, so `new X()` calls the constructor with all its arguments', {skip}, async () => {
    const r = await both([
        'class Box {',
        '    n: number',
        '    constructor(start?: number, step: number = 2) {',
        '        this.n = start ? start : 7',
        '        this.n += step',
        '    }',
        '    get value(): number {',
        '        return this.n',
        '    }',
        '}',
        'let a = new Box()',
        'let b = new Box(10)',
        'let c = new Box(10, 5)',
        'serial.writeLine("" + a.value + " " + b.value + " " + c.value)'
    ].join('\n'), {ms: 500});
    assert.deepEqual(r.mc.lines, ['9 12 15']);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('a comparison of two number literals (a call with no block, against a constant) still compiles in MakeCode', {skip}, async () => {
    const ex = exportToMakeCode(new SB3Creator().parse('DEVICE MICROBIT\n\nWHEN flag clicked:\n  IF (0 = 2) THEN:\n    print "never"\n'), {name: 'literals'});
    assert.match(ex.ts, /\(\(0 \+ 0\) == 2\)/);
    await compileMakeCode(ex.ts);
});
