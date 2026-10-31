/**
 * Arrays held in class fields, functions held as values, abstract base classes
 * (2026-11-01). Each program runs in MakeCode's simulator and as lite imports
 * it (MicroPython in lite's firmware); the printed lines must agree. Then the
 * blocks export back and MakeCode compiles and runs the export: the same lines.
 * lower-handle-values.js is the lowering (handles into pool arrays, function
 * ids with a dispatch procedure).
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

/** MakeCode's lines, lite's lines (from the imported blocks), and the export's lines. */
async function three (ts, {ms = 1500} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at: []});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    const run = await runOnMicrobitFirmware(gen.py, {ms});
    assert.equal(run.traceback, null, `lite's firmware stopped:\n${run.traceback}`);
    const ex = exportToMakeCode(new SB3Creator().parse(imported.code), {name: 'lowered'});
    assert.deepEqual(ex.unsupported, []);
    const back = await runMakeCodeSim(await compileMakeCode(ex.ts), {ms, at: []});
    assert.equal(back.error, null, `the export stopped: ${back.error}`);
    const text = r => r.serial.map(l => l.text.trim()).filter(Boolean);
    return {mc: text(mc), lite: lines(run.out), back: text(back)};
}

const LITERALS = `
let a = [1,2,3].map((x) => x * 2)
serial.writeLine("" + a.length + " " + a[2])
let b = [3,1,2].filter((x) => x > 1)
serial.writeLine("" + b.length)
let n = [1]
if (Array.isArray(n)) {
 serial.writeLine("y")
}
if (Array.isArray(a)) {
 serial.writeLine("z")
}
`;

const CHAIN = `
class Block {
    constructor(public index: number, public data: string, public prev: number) {
    }
    hash(): number {
        let h = this.index * 31 + this.prev
        for (let i = 0; i < this.data.length; i++) {
            h = (h * 7 + i + 5) % 10007
        }
        return h
    }
}
class Chain {
    blocks: Block[] = []
    log: string[] = []
    constructor() {
    }
    add(data: string) {
        let prev = 0
        if (this.blocks.length > 0) {
            prev = this.blocks[this.blocks.length - 1].hash()
        }
        this.blocks.push(new Block(this.blocks.length, data, prev))
        this.log.push("added " + data)
    }
    valid(): boolean {
        for (let i = 1; i < this.blocks.length; i++) {
            if (this.blocks[i].prev != this.blocks[i - 1].hash()) {
                return false
            }
        }
        return true
    }
}
let chain = new Chain()
chain.add("a")
chain.add("bb")
chain.add("ccc")
let ok = "no"
if (chain.valid()) {
    ok = "yes"
}
serial.writeLine("len " + chain.blocks.length + " valid " + ok)
serial.writeLine("hash " + chain.blocks[2].hash())
chain.blocks[1].data = "zz"
ok = "no"
if (chain.valid()) {
    ok = "yes"
}
serial.writeLine("valid " + ok)
let last = chain.blocks.slice(1)
serial.writeLine("slice " + last.length)
let first = chain.log.shift()
serial.writeLine(first + " " + chain.log.length)
`;

const FUNCTIONS = `
function call(f: (n: number) => number, v: number): number {
    return f(v)
}
function triple(n: number): number {
    return n * 3
}
class Button2 {
    handler: (n: number) => number
    total = 0
    constructor(h: (n: number) => number) {
        this.handler = h
    }
    press(v: number) {
        this.total += this.handler(v)
    }
}
let twice = (n: number) => n * 2
serial.writeLine("a " + call(twice, 4))
serial.writeLine("b " + call(triple, 4))
serial.writeLine("c " + call((n: number) => n + 100, 4))
let b = new Button2(triple)
b.press(2)
b.press(5)
let c = new Button2((n: number) => n - 1)
c.press(10)
serial.writeLine("d " + b.total + " " + c.total)
let fs = [twice, triple]
let sum = 0
for (let f of fs) {
    sum += f(10)
}
serial.writeLine("e " + sum)
`;

const ARRAYS_A = `
class Item {
    constructor(public id: number, public name: string) {
    }
}
class Bag {
    items: Item[] = []
    nums: number[] = []
    tags: string[] = []
    constructor() {
        this.nums = [5, 6]
    }
    add(i: Item) {
        this.items.push(i)
        this.nums.push(i.id * 10)
        this.tags.push(i.name)
    }
}
let bag = new Bag()
bag.add(new Item(1, "ax"))
bag.add(new Item(2, "bee"))
bag.add(new Item(3, "cat"))
serial.writeLine("n " + bag.items.length + " " + bag.nums.length + " " + bag.tags.length)
let doubled = bag.nums.map((x) => x * 2)
serial.writeLine("d " + doubled.length + " " + doubled[0] + " " + doubled[4])
let big = bag.nums.filter((x) => x > 20)
serial.writeLine("f " + big.length)
let total = bag.nums.reduce((acc, x) => acc + x, 0)
serial.writeLine("r " + total)
let alias = bag.tags
alias.push("dog")
serial.writeLine("alias " + bag.tags.length + " " + bag.tags[3])
let first = bag.tags.shift()
serial.writeLine(first + " " + bag.tags.length + " " + bag.tags[0])
bag.tags.unshift("zed")
serial.writeLine("u " + bag.tags[0] + bag.tags[1])
`;

const ARRAYS_B1 = `
class Item {
    constructor(public id: number, public name: string) {
    }
}
class Bag {
    items: Item[] = []
    nums: number[] = []
    tags: string[] = []
    constructor() {
        this.nums = [5, 6]
    }
    add(i: Item) {
        this.items.push(i)
        this.nums.push(i.id * 10)
        this.tags.push(i.name)
    }
}
let bag = new Bag()
bag.add(new Item(1, "ax"))
bag.add(new Item(2, "bee"))
bag.add(new Item(3, "cat"))
serial.writeLine("p " + bag.nums.pop() + " " + bag.nums.length)
serial.writeLine("i " + bag.nums.indexOf(20) + " " + bag.nums.indexOf(99))
bag.nums.reverse()
serial.writeLine("rev " + bag.nums.join(","))
`;

const ARRAYS_B2 = `
class Item {
    constructor(public id: number, public name: string) {
    }
}
class Bag {
    items: Item[] = []
    nums: number[] = []
    tags: string[] = []
    constructor() {
        this.nums = [5, 6]
    }
    add(i: Item) {
        this.items.push(i)
        this.nums.push(i.id * 10)
        this.tags.push(i.name)
    }
}
let bag = new Bag()
bag.add(new Item(1, "ax"))
bag.add(new Item(2, "bee"))
bag.add(new Item(3, "cat"))
let sum = 0
for (let it of bag.items) {
    sum += it.id
    serial.writeLine("it " + it.name)
}
bag.items.forEach((it) => {
    serial.writeLine("each " + it.id)
})
let names = bag.items.map((it) => it.name)
serial.writeLine("names " + names.join("+"))
let all = bag.nums.concat(bag.nums)
serial.writeLine("c " + all.length)
bag.nums[0] = 77
bag.nums[1] += 1
serial.writeLine("s " + bag.nums[0] + " " + bag.nums[1] + " " + sum)
`;

const ABSTRACT = `
abstract class Animal {
    legs = 4
    constructor(public name: string) {
    }
    sound(): string { return "" }
    speak() {
        serial.writeLine(this.name + " says " + this.sound() + " on " + this.legs)
    }
}
class Dog extends Animal {
    sound(): string {
        return "woof"
    }
}
class Bird extends Animal {
    constructor(n: string) {
        super(n)
        this.legs = 2
    }
    sound(): string {
        return "tweet"
    }
}
let zoo: Animal[] = [new Dog("rex"), new Bird("tweety")]
for (let a of zoo) {
    a.speak()
}
`;

const ONCE = `
class P {
    static made = 0
    constructor(public v: number) {
        P.made += 1
    }
}
let xs: P[] = [new P(1), new P(2)]
serial.writeLine("made " + P.made + " " + xs.length)
`;

test('an array in a class field: push, length, index, slice, set, and a record read from it', {skip}, async () => {
    const r = await three(CHAIN, {ms: 6000});
    assert.deepEqual(r.mc, ['len 3 valid yes', 'hash 227', 'valid yes', 'slice 2', 'added a 2']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('array fields: map, filter, reduce, aliasing, shift, unshift on number, text and record arrays', {skip}, async () => {
    const r = await three(ARRAYS_A, {ms: 15000});
    assert.deepEqual(r.mc, ['n 3 5 3', 'd 5 10 60', 'f 1', 'r 71', 'alias 4 dog', 'ax 3 bee', 'u zedbee']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('array fields: pop, indexOf, reverse, join', {skip}, async () => {
    const r = await three(ARRAYS_B1, {ms: 15000});
    assert.deepEqual(r.mc, ['p 30 4', 'i 3 -1', 'rev 20,10,6,5']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('array fields: for-of, forEach, map to text, concat, indexed stores', {skip}, async () => {
    const r = await three(ARRAYS_B2, {ms: 15000});
    assert.deepEqual(r.mc, ['it ax', 'it bee', 'it cat', 'each 1', 'each 2', 'each 3', 'names ax+bee+cat', 'c 10', 's 77 7 6']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('function values: variables, parameters, fields, arguments, array items, arrow and named', {skip}, async () => {
    const r = await three(FUNCTIONS, {ms: 3000});
    assert.deepEqual(r.mc, ['a 8', 'b 12', 'c 104', 'd 21 9', 'e 50']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('an abstract base class with concrete subclasses, string constructor properties and a literal of new items', {skip}, async () => {
    const r = await three(ABSTRACT);
    assert.deepEqual(r.mc, ['rex says woof on 4', 'tweety says tweet on 2']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('each new in an array literal constructs once', {skip}, async () => {
    const r = await three(ONCE);
    assert.deepEqual(r.mc, ['made 2 2']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});

test('a function that captures a local stays refused by name', {skip}, () => {
    const imported = microbitToPseudocode('function run(f: () => number) {\n    serial.writeNumber(f())\n}\nlet k = 3\nfunction go() {\n    let local = 5\n    run(() => local + k)\n}\ngo()\n');
    assert.ok(imported.unsupported.length > 0, imported.code);
});

test('callbacks on array literals, and Array as a value (Array.isArray)', {skip}, async () => {
    const r = await three(LITERALS);
    assert.deepEqual(r.mc, ['3 6', '2', 'y', 'z']);
    assert.deepEqual(r.lite, r.mc);
    assert.deepEqual(r.back, r.mc);
});
