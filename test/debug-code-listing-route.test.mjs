import {importPackageSource} from './helpers/package-source.mjs';
/** Target-owned code progression reaches the drawer without host-side masking. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {importSource} from './helpers/bw-integrated.mjs';

const {codeListingRows} = await importSource('src/lib/bw-debug/debug-runner.js');
const {formatCodeAddress, hex16} = await importSource('src/lib/bw-debug/trace.js');
const {createLabwiredDebugTarget} = await importPackageSource('bw-board/labwired-debug.js');
const {createI8086DebugTarget} = await importPackageSource('bw-board/i8086-debug.js');

const objectTarget = next => ({
    disasm: addr => ({text: `at ${addr}`, bytes: [0x90], length: 1}),
    nextCodeAddress: next
});

test('the listing keeps an i8086 physical address above 64 KiB', () => {
    const calls = [];
    const target = objectTarget((addr, length) => {
        calls.push([addr, length]);
        return addr + length;
    });
    const rows = codeListingRows(target, 0x1f000, 2);
    assert.deepEqual(rows.map(row => row.addr), [0x1f000, 0x1f001]);
    assert.deepEqual(calls, [[0x1f000, 0], [0x1f000, 1], [0x1f001, 1]],
        'the target owns the initial address and every advance');
});

test('a 16-bit target still wraps its listing at ffff', () => {
    const rows = codeListingRows(objectTarget((addr, length) =>
        ((addr & 0xffff) + length) & 0xffff), 0xffff, 2);
    assert.deepEqual(rows.map(row => row.addr), [0xffff, 0x0000]);
});

test('the real i8086 listing advances IP within its segment', () => {
    const target = createI8086DebugTarget({machine: {
        cpu: {cs: 0x2000},
        _read: () => 0x90
    }});
    const rows = codeListingRows(target, 0x2ffff, 2);
    assert.deepEqual(rows.map(row => row.addr), [0x2ffff, 0x20000],
        'flat physical addition would put the second row at 0x30000');
});

test('the string disassembler path also delegates its instruction length', () => {
    const calls = [];
    const target = {
        disasm: addr => `op ${addr}`,
        readMem: (_space, _addr, length) => new Uint8Array(length),
        nextCodeAddress: (addr, length) => {
            calls.push([addr, length]);
            return ((addr & 0xffff) + length) & 0xffff;
        }
    };
    assert.deepEqual(codeListingRows(target, 0xffff, 2).map(row => row.addr), [0xffff, 0]);
    assert.deepEqual(calls, [[0xffff, 0], [0xffff, 1], [0, 1]]);
});

test('missing, malformed, throwing and non-progressing progression all fail closed', () => {
    let decoded = 0;
    assert.deepEqual(codeListingRows({disasm: () => { decoded++; }}, 0, 2), []);
    assert.equal(decoded, 0, 'a target without the capability must not be probed as listable');
    for (const target of [
        objectTarget(() => ({unsupported: 'no address'})),
        objectTarget(() => Number.NaN),
        objectTarget(addr => addr),
        objectTarget(() => { throw new Error('refused'); })
    ]) assert.deepEqual(codeListingRows(target, 0x1234, 2), []);
    let advances = 0;
    assert.deepEqual(codeListingRows(objectTarget((addr, length) => {
        if (length === 0) return addr;
        advances++;
        return advances === 1 ? addr + length : Number.NaN;
    }), 0x1234, 2), [], 'a late malformed advance must discard the partial listing');
    assert.deepEqual(codeListingRows({
        disasm: () => ({text: 'shape without bytes', length: 1}),
        readMem: () => new Uint8Array([0]),
        nextCodeAddress: (addr, length) => addr + length
    }, 0x1234, 2), [], 'a malformed object row must not fall through to the 8051 string path');
});

test('LabWired remains explicitly non-listable despite its PC-only disassembler', () => {
    const target = createLabwiredDebugTarget({adapter: {
        clockHz: 48_000_000,
        timeNs: () => 0n,
        sim: {get_pc: () => 0x08000000}
    }});
    assert.equal(typeof target.disasm, 'function');
    assert.equal(typeof target.readMem, 'function');
    assert.equal(typeof target.nextCodeAddress, 'undefined');
    assert.deepEqual(codeListingRows(target, 0x08000000, 2), []);
});

test('code-address formatting is lossless while the 16-bit formatter stays deliberate', () => {
    assert.equal(formatCodeAddress(0x1f000), '1F000');
    assert.equal(formatCodeAddress(2), '0002');
    assert.equal(formatCodeAddress(Number.NaN), '????');
    assert.equal(formatCodeAddress(-1), '????');
    assert.equal(hex16(0x10002), '0002');
});
