import {importPackageSource} from './helpers/package-source.mjs';
/**
 * The installed i8086 target keeps direct physical code addresses distinct
 * from segment:offset hardware addresses. This runtime proof survives the
 * retired Lite fork: package identity alone does not prove the range behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {I8086Machine} = await importPackageSource('bw-board/i8086-machine.js');
const {createI8086DebugTarget} = await importPackageSource('bw-board/i8086-debug.js');

const targetWith = () => {
    const machine = new I8086Machine();
    const image = new Uint8Array(0x8000);
    image.set([0xeb, 0xfe]);
    image.set([0xea, 0x00, 0x00, 0x00, 0xf8], 0x7ff0);
    machine.loadRom(image);
    machine.reset();
    machine.step();
    return createI8086DebugTarget({machine});
};

const REFUSAL = {
    unsupported: 'code breakpoint addr must be a safe integer within 20-bit physical space'
};

for (const [name, addr] of [
    ['a negative address', -1],
    ['a fractional address', 1.5],
    ['a NaN address', Number.NaN],
    ['an infinite address', Number.POSITIVE_INFINITY],
    ['an address beyond physical space', 0x100000]
]) {
    test(`the vendored i8086 direct code breakpoint refuses ${name}`, () => {
        assert.deepEqual(targetWith().setBreakpoint({kind: 'code', addr}), REFUSAL,
            'invalid physical input must not wrap onto a different instruction');
    });
}

test('the vendored i8086 direct code breakpoint accepts high memory and the final physical byte', () => {
    const target = targetWith();
    assert.equal(typeof target.setBreakpoint({kind: 'code', addr: 0x1f000}), 'number');
    assert.equal(typeof target.setBreakpoint({kind: 'code', addr: 0xfffff}), 'number');
});

test('the vendored i8086 keeps symbol and segment:offset breakpoint semantics separate', () => {
    const target = targetWith();
    target.setSymbols(new Map([[0xf8000, 'start']]));
    assert.deepEqual(target.setBreakpoint({kind: 'code', symbol: 'missing'}),
        {unsupported: 'no symbol named "missing"'});
    assert.equal(typeof target.setBreakpoint({kind: 'code', seg: 0xffff, addr: 0x10}), 'number',
        'segment:offset input retains the hardware 20-bit wrap');
});
