/**
 * TypeScript class inheritance on the micro:bit (2026-11-01): `extends`,
 * `super(...)`, `super.method()`, overrides called through a base-typed
 * variable (virtual dispatch), `instanceof`. Each program
 * runs in MakeCode's simulator and as lite imports it (MicroPython in lite's
 * firmware); the printed lines must agree. Then the blocks export back and
 * MakeCode compiles the export.
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

function lite (ts) {
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    return {code: imported.code, py: gen.py};
}

async function both (ts, {ms = 1500} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: [ms - 1]});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const {code, py} = lite(ts);
    const run = await runOnMicrobitFirmware(py, {ms});
    assert.equal(run.traceback, null, `lite's firmware stopped:\n${run.traceback}\n---\n${code}`);
    const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return {mc: mc.serial.map(l => l.text.trim()).filter(Boolean), lite: lines(run.out), code};
}

const SHAPES = `
class Shape {
    static made = 0
    name = "shape"
    constructor(public side: number) {
        Shape.made += 1
    }
    area(): number {
        return this.side
    }
    describe() {
        serial.writeLine(this.name + " " + this.area())
    }
    grow() {
    }
}
class Square extends Shape {
    constructor(s: number) {
        super(s)
        this.name = "square"
    }
    area(): number {
        return this.side * this.side
    }
    grow() {
        this.side += 1
    }
}
class Cube extends Square {
    depth = 2
    constructor(s: number) {
        super(s)
    }
    area(): number {
        return super.area() * this.depth
    }
}
class Dot extends Shape {
    grow() {
    }
}
let all: Shape[] = []
all.push(new Square(2))
all.push(new Cube(3))
all.push(new Dot(5))
for (let s of all) {
    s.describe()
}
all[0].grow()
all[1].grow()
serial.writeLine("" + all[0].area() + " " + all[1].area() + " " + all[2].area())
if (all[1] instanceof Square) {
    serial.writeLine("cube is a square")
}
if (!(all[2] instanceof Square)) {
    serial.writeLine("dot is not")
}
serial.writeLine("made " + Shape.made)
`;

test('overrides, super(...), super.m() and a base-typed call dispatch as MakeCode\'s do', {skip}, async () => {
    const r = await both(SHAPES);
    assert.deepEqual(r.mc, ['square 4', 'square 18', 'shape 5', '9 32 5', 'cube is a square', 'dot is not', 'made 3']);
    assert.deepEqual(r.lite, r.mc);
});

test('a subclass without a constructor takes its base class\'s, and inherits fields and their initialisers', {skip}, async () => {
    const r = await both([
        'class Counter {',
        '    n = 10',
        '    step: number',
        '    constructor(step: number) {',
        '        this.step = step',
        '    }',
        '    tick() {',
        '        this.n += this.step',
        '    }',
        '    show() {',
        '        serial.writeLine("n=" + this.n)',
        '    }',
        '}',
        'class Doubler extends Counter {',
        '    tick() {',
        '        super.tick()',
        '        super.tick()',
        '    }',
        '}',
        'let c = new Counter(1)',
        'let d = new Doubler(5)',
        'c.tick()',
        'd.tick()',
        'c.show()',
        'd.show()'
    ].join('\n'));
    assert.deepEqual(r.mc, ['n=11', 'n=20']);
    assert.deepEqual(r.lite, r.mc);
});

test('an overriding method is reached from a base class method (this.m() dispatches on the instance)', {skip}, async () => {
    const r = await both([
        'class Base {',
        '    label(): string {',
        '        return "base"',
        '    }',
        '    say() {',
        '        serial.writeLine("I am " + this.label())',
        '    }',
        '}',
        'class Kid extends Base {',
        '    label(): string {',
        '        return "kid"',
        '    }',
        '}',
        'let items: Base[] = []',
        'items.push(new Base())',
        'items.push(new Kid())',
        'for (let i of items) {',
        '    i.say()',
        '}'
    ].join('\n'));
    assert.deepEqual(r.mc, ['I am base', 'I am kid']);
    assert.deepEqual(r.lite, r.mc);
});

test('the blocks of a class family export back to MakeCode TS that compiles, and the export runs the same', {skip}, async () => {
    const {code} = lite(SHAPES);
    const ex = exportToMakeCode(new SB3Creator().parse(code), {name: 'family'});
    assert.deepEqual(ex.unsupported, []);
    const mc = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms: 1500, at: []});
    assert.equal(mc.error, null);
    assert.deepEqual(mc.serial.map(l => l.text.trim()).filter(Boolean),
        ['square 4', 'square 18', 'shape 5', '9 32 5', 'cube is a square', 'dot is not', 'made 3']);
});

test('a class extending something the program does not define stays refused by name', {skip}, () => {
    const imported = microbitToPseudocode('class B extends Elsewhere {\n    y = 2\n}\nlet b = new B()\n');
    assert.ok(imported.unsupported.some(u => /^class B .*extends Elsewhere/.test(u)), imported.unsupported.join('\n'));
});
