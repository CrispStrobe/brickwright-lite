import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require = createRequire(import.meta.url);
const {PxtBuffer, NumberFormat, MAX_BUFFER_BYTES} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const names = Object.keys(NumberFormat).filter(name => !/^\d+$/.test(name));

test('byte buffer algorithms regenerate exactly from the pinned original PXT core', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-buffers.mjs', '--check'], {stdio: 'pipe'});
    assert.equal(names.length, 16);
});

test('all sixteen numeric buffer formats match executed original MakeCode', async () => {
    const cases = names.flatMap(name => [-123.75, 0, 2147483647, 4294967295, 1.23456789].map(value => ({name, value})));
    const source = `let trace = ""\nlet bytes = control.createBuffer(16)\n` + cases.map(({name, value}) =>
        `bytes.fill(170)\nbytes.setNumber(NumberFormat.${name}, 3, ${value})\ntrace += bytes.toHex() + ":" + bytes.getNumber(NumberFormat.${name}, 3) + ";"`
    ).join('\n');
    const original = await runPxtArcade(source);
    const actual = cases.map(({name, value}) => {
        const bytes = new PxtBuffer(16).fill(170);
        bytes.setNumber(name, 3, value);
        assert.equal(bytes.getNumber(NumberFormat[name], 3), bytes.getNumber(name, 3));
        return bytes.toHex() + ':' + bytes.getNumber(name, 3) + ';';
    }).join('');
    assert.equal(actual, original.trace);
});

test('mutable byte aliasing, copying, overlapping writes and range operations match original MakeCode', async () => {
    const source = `let bytes = control.createBuffer(8)
for (let i = 0; i < bytes.length; i++) bytes[i] = i + 1
let alias = bytes
alias[2] = 255
let aliased = bytes.toHex()
let copy = bytes.slice(1, 4)
copy[0] = 99
let detached = bytes.toHex() + ":" + copy.toHex()
bytes.write(2, bytes)
let overlap = bytes.toHex()
bytes.fill(12, 2, 3)
let filled = bytes.toHex()
bytes.shift(-2, 1, 6)
let shifted = bytes.toHex()
bytes.rotate(3, 1, 6)
let rotated = bytes.toHex()
let clipped = bytes.slice(6, 20).toHex()
let negative = bytes.slice(-2, 3).toHex()
let past = bytes[200]
bytes[200] = 23
let outside = bytes.toHex()
let decoded = Buffer.fromUTF8("A€").toString()`;
    const original = await runPxtArcade(source);
    const bytes = new PxtBuffer(8);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i + 1;
    const alias = bytes; alias.setByte(2, 255);
    const actual = {aliased: bytes.toHex()};
    const copy = bytes.slice(1, 4); copy.setByte(0, 99);
    actual.detached = bytes.toHex() + ':' + copy.toHex();
    assert.notEqual(copy.buffer, bytes.buffer);
    bytes.write(2, bytes); actual.overlap = bytes.toHex();
    bytes.fill(12, 2, 3); actual.filled = bytes.toHex();
    bytes.shift(-2, 1, 6); actual.shifted = bytes.toHex();
    bytes.rotate(3, 1, 6); actual.rotated = bytes.toHex();
    actual.clipped = bytes.slice(6, 20).toHex(); actual.negative = bytes.slice(-2, 3).toHex();
    actual.past = bytes.getByte(200); bytes.setByte(200, 23); actual.outside = bytes.toHex();
    actual.decoded = new PxtBuffer(new TextEncoder().encode('A€')).toString();
    for (const [name, value] of Object.entries(actual)) assert.equal(value, original[name], name);
});

test('byte allocation limits apply before allocation and unsupported numeric formats fail explicitly', () => {
    assert.equal(new PxtBuffer(MAX_BUFFER_BYTES).length, MAX_BUFFER_BYTES);
    for (const size of [MAX_BUFFER_BYTES + 1, Infinity, -1])
        assert.throws(() => new PxtBuffer(size), /byte allocation limit/);
    const bytes = new PxtBuffer(8);
    assert.throws(() => bytes.getNumber('InventedFormat', 0), /bad format/);
    assert.throws(() => bytes.setNumber('InventedFormat', 0, 1), /bad format/);
    const subarray = bytes.subarray(2, 6);
    subarray.setByte(0, 9); assert.equal(bytes[2], 9);
    assert.equal(subarray.length, 4);
});
