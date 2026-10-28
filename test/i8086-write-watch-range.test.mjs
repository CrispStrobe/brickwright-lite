import {importPackageSource} from './helpers/package-source.mjs';
/**
 * The installed i8086 target accepts one contiguous 20-bit physical write
 * range or refuses it. This runtime proof survives the retired Lite fork:
 * package identity alone cannot prove that the range guard still works.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {I8086Machine} = await importPackageSource('bw-board/i8086-machine.js');
const {createI8086DebugTarget} = await importPackageSource('bw-board/i8086-debug.js');

const CALL_PROGRAM = [
    0xb8, 0x34, 0x12,
    0xe8, 0x05, 0x00,
    0x90, 0x90,
    0xeb, 0xfe,
    0x90,
    0x40,
    0xc3
];

const rom = code => {
    const image = new Uint8Array(0x8000);
    image.set(code);
    image.set([0xea, 0x00, 0x00, 0x00, 0xf8], 0x7ff0);
    return image;
};

const targetWith = (code = CALL_PROGRAM, config) => {
    const machine = config ? new I8086Machine(config) : new I8086Machine();
    machine.loadRom(rom(code));
    machine.reset();
    machine.step();
    return createI8086DebugTarget({machine});
};

test('the vendored i8086 write watch reaches a physical byte above 64 KiB', () => {
    // mov ax,1F00h; mov ds,ax; mov byte [0000],55h; jmp $
    const program = [0xb8, 0x00, 0x1f, 0x8e, 0xd8, 0xc6, 0x06, 0x00, 0x00, 0x55, 0xeb, 0xfe];
    const target = targetWith(program, {
        clockHz: 5_000_000,
        regions: [
            {kind: 'ram', start: 0x00000, end: 0x1ffff},
            {kind: 'rom', start: 0xf8000, end: 0xfffff}
        ],
        chips: []
    });
    const handle = target.setBreakpoint({kind: 'write', addr: 0x1f000});
    let halted;
    target.onHalt(info => { halted = info; });
    target.run();
    assert.equal(target.runFor(1e6), 'halted');
    assert.equal(halted.bp, handle);
    assert.equal(halted.addr, 0x1f000,
        'a 16-bit relocation would arm and report the wrong physical byte');
    assert.equal(halted.value, 0x55);
});

const REFUSAL = {
    unsupported: 'write watchpoint range must be safe integers within 20-bit physical space'
};

for (const [name, spec] of [
    ['a missing address', {kind: 'write'}],
    ['a negative address', {kind: 'write', addr: -1}],
    ['a fractional address', {kind: 'write', addr: 1.5}],
    ['a NaN address', {kind: 'write', addr: Number.NaN}],
    ['an infinite address', {kind: 'write', addr: Number.POSITIVE_INFINITY}],
    ['an address beyond physical space', {kind: 'write', addr: 0x100000}],
    ['a negative length', {kind: 'write', addr: 0, len: -1}],
    ['a zero length', {kind: 'write', addr: 0, len: 0}],
    ['a fractional length', {kind: 'write', addr: 0, len: 1.5}],
    ['a NaN length', {kind: 'write', addr: 0, len: Number.NaN}],
    ['an infinite length', {kind: 'write', addr: 0, len: Number.POSITIVE_INFINITY}],
    ['a range crossing the top of physical space', {kind: 'write', addr: 0xfffff, len: 2}]
]) {
    test(`the vendored i8086 write watch refuses ${name}`, () => {
        assert.deepEqual(targetWith().setBreakpoint(spec), REFUSAL,
            'an armed-looking watch must not relocate, truncate, or partially wrap');
    });
}

test('the vendored i8086 write watch accepts the final physical byte', () => {
    assert.equal(typeof targetWith().setBreakpoint({kind: 'write', addr: 0xfffff, len: 1}), 'number');
});
