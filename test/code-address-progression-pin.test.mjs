import {importPackageSource} from './helpers/package-source.mjs';
/**
 * The vendored targets own progression through their real code-address spaces.
 *
 * This is a pin/graft proof: three 16-bit engines wrap at their bus boundary,
 * while i8086 keeps a 20-bit linear address and advances the 16-bit IP inside
 * its segment. LabWired is deliberately absent because its disassembler can
 * decode only the current PC; method presence would falsely advertise a
 * listable address space to the later GUI consumer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {createEmu8051DebugTarget} = await importPackageSource('bw-board/emu8051-debug.js');
const {createM6502DebugTarget} = await importPackageSource('bw-board/m6502-debug.js');
const {createZ80DebugTarget} = await importPackageSource('bw-board/z80-debug.js');
const {createI8086DebugTarget} = await importPackageSource('bw-board/i8086-debug.js');
const {createLabwiredDebugTarget} = await importPackageSource('bw-board/labwired-debug.js');

const emu8051Surface = Object.fromEntries([
    '_emu_dbg_state', '_emu_dbg_run', '_emu_dbg_halt', '_emu_dbg_step',
    '_emu_dbg_reset', '_emu_dbg_run_until_ns', '_emu_dbg_read_mem',
    '_emu_dbg_write_mem', '_emu_dbg_pc'
].map(name => [name, () => 0]));

const targets16 = () => [
    ['8051', createEmu8051DebugTarget(emu8051Surface)],
    ['6502', createM6502DebugTarget({machine: {
        cpu: {step () {}, write () {}}, cycles: 0, mem: new Uint8Array(0x10000)
    }})],
    ['Z80', createZ80DebugTarget({machine: {
        cpu: {step () {}, write () {}, inPort () {}, outPort () {}},
        cycles: 0, mem: new Uint8Array(0x10000)
    }})]
];

test('the three 16-bit targets normalize and wrap code-listing addresses', () => {
    for (const [name, target] of targets16()) {
        assert.equal(target.nextCodeAddress(0x10002, 0), 0x0002, `${name} normalization`);
        assert.equal(target.nextCodeAddress(0xffff, 2), 0x0001, `${name} boundary wrap`);
    }
});

test('i8086 keeps high linear addresses and advances through an IP wrap in the same segment', () => {
    const target = createI8086DebugTarget({machine: {cpu: {cs: 0x2000}}});
    assert.equal(target.nextCodeAddress(0x2f000, 3), 0x2f003,
        'a 16-bit normalization would silently name a different physical byte');
    assert.equal(target.nextCodeAddress(0x2ffff, 2), 0x20001,
        'flat physical addition would cross into the wrong segment');
});

test('i8086 disassembly and progression share position across physical wrap', () => {
    const bytes = new Map([[0xfffff, 0xb8], [0x00000, 0x34], [0x00001, 0x12]]);
    const target = createI8086DebugTarget({machine: {
        cpu: {cs: 0xffff},
        _read: addr => bytes.get(addr & 0xfffff) ?? 0x90
    }});
    const row = target.disasm(0xfffff);
    assert.equal(row.text, 'mov ax, 1234h');
    assert.equal(row.length, 3);
    assert.equal(target.nextCodeAddress(0xfffff, row.length), 0x00002);
});

test('wrapped-CS labels remain visible after the pin/graft', () => {
    // CS ffff has base ffff0; offset 0010 is physical 00000. The pre-graft
    // range comparison dropped that label because 00000 is numerically below
    // ffff0 even though it is inside the segment after physical wrap.
    const bytes = new Map([[0xfffff, 0xeb], [0x00000, 0xff]]);
    const target = createI8086DebugTarget({machine: {
        cpu: {cs: 0xffff},
        _read: addr => bytes.get(addr & 0xfffff) ?? 0x90
    }});
    target.setSymbols(new Map([[0x00000, 'wrapped_target']]));
    assert.equal(target.disasm(0xfffff).text, 'jmp wrapped_target',
        'the wrapped target must not fall back to the anonymous 0010h operand');
});

test('progression rejects malformed values at each shipped target', () => {
    const targets = [...targets16().map(([, target]) => target),
        createI8086DebugTarget({machine: {cpu: {cs: 0}}})];
    for (const target of targets) {
        for (const addr of [undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.equal(typeof target.nextCodeAddress(addr, 1), 'object', `address ${String(addr)}`);
        }
        for (const length of [undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.equal(typeof target.nextCodeAddress(0, length), 'object', `length ${String(length)}`);
        }
    }
    assert.equal(typeof targets.at(-1).nextCodeAddress(0x100000, 1), 'object');
});

test('LabWired stays non-listable because it can only disassemble its current PC', () => {
    const target = createLabwiredDebugTarget({adapter: {
        clockHz: 48_000_000,
        timeNs: () => 0n,
        sim: {get_pc: () => 0x08000000}
    }});
    assert.equal(typeof target.nextCodeAddress, 'undefined');
});
