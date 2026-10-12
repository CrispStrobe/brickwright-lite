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

test('UTF8 construction and decoding match original MakeCode for Unicode and malformed bytes', async () => {
    const {fromUTF8, fromHex} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
    const texts = ['', '0012', 'A\0B', 'A€🙂', '\ud800', '\udc00', '\ud800A', '\ufeffA'];
    const malformed = ['efbbbf41', 'c0af', 'e282', 'eda080', 'f0808080', '80', '00ff41'];
    const source = 'let encoded = ""\nlet decoded = ""\n' + texts.map(text =>
        `encoded += Buffer.fromUTF8(${JSON.stringify(text)}).toHex() + ";"`
    ).join('\n') + '\n' + malformed.map(hex =>
        `decoded += Buffer.fromHex("${hex}").toString() + ";"`
    ).join('\n');
    const original = await runPxtArcade(source);
    assert.equal(texts.map(text => fromUTF8(text).toHex() + ';').join(''), original.encoded);
    assert.equal(malformed.map(hex => fromHex(hex).toString() + ';').join(''), original.decoded);
    const bytes = fromUTF8('A€🙂');
    assert.equal(bytes.length, 8);
    bytes.setByte(0, 66);
    assert.equal(bytes.toString(), 'B€🙂');
});

test('UTF8 allocation bounds count encoded bytes before invoking TextEncoder', () => {
    const {fromUTF8} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
    assert.equal(fromUTF8('a'.repeat(MAX_BUFFER_BYTES)).length, MAX_BUFFER_BYTES);
    assert.equal(fromUTF8('🙂'.repeat(MAX_BUFFER_BYTES / 4)).length, MAX_BUFFER_BYTES);
    const OriginalEncoder = globalThis.TextEncoder;
    globalThis.TextEncoder = class {encode() {assert.fail('oversized input reached byte allocation');}};
    try {
        for (const text of ['a'.repeat(MAX_BUFFER_BYTES + 1), '€'.repeat(Math.floor(MAX_BUFFER_BYTES / 3) + 1),
            '🙂'.repeat(MAX_BUFFER_BYTES / 4 + 1), '\ud800'.repeat(Math.floor(MAX_BUFFER_BYTES / 3) + 1)])
            assert.throws(() => fromUTF8(text), /byte allocation limit/);
        assert.throws(() => fromUTF8(12), /Expected UTF8 text/);
    } finally {globalThis.TextEncoder = OriginalEncoder;}
});

test('public Buffer readonly introspection matches original construction, aliases and detached slices', async () => {
    const {fromHex, fromUTF8, literal} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
    const source = `let fixed = hex\`01020304\`
let alias = fixed
let copy = fixed.slice(1, 2)
let dynamic = Buffer.fromHex("01020304")
let utf8 = Buffer.fromUTF8("A€")
let allocated = control.createBuffer(4)
let fixedReadonly = fixed.isReadOnly()
let aliasReadonly = alias.isReadOnly()
let copyReadonly = copy.isReadOnly()
let dynamicReadonly = dynamic.isReadOnly()
let utf8Readonly = utf8.isReadOnly()
let allocatedReadonly = allocated.isReadOnly()
copy[0] = 99
let fixedHex = fixed.toHex()
let copyHex = copy.toHex()`;
    const original = await runPxtArcade(source);
    const fixed = literal('01020304'), alias = fixed, copy = fixed.slice(1, 2);
    const actual = {fixedReadonly:fixed.isReadOnly(), aliasReadonly:alias.isReadOnly(),
        copyReadonly:copy.isReadOnly(), dynamicReadonly:fromHex('01020304').isReadOnly(),
        utf8Readonly:fromUTF8('A€').isReadOnly(), allocatedReadonly:new PxtBuffer(4).isReadOnly()};
    copy.setByte(0, 99);
    actual.fixedHex = fixed.toHex(); actual.copyHex = copy.toHex();
    for (const [name, value] of Object.entries(actual)) assert.equal(value, original[name], name);
    assert.throws(() => alias.setByte(0, 99), /read only buffer/);
});
