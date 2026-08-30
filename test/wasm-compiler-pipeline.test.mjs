import test from 'node:test';
import assert from 'node:assert/strict';
import {linkerScript, localTargetSupported} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';

test('local compiler admits only the five mcs51 targets it can faithfully link', () => {
    for (const target of ['stc12c5a60s2', 'stc12c5a16s2', 'stc15f2k60s2', 'stc15w408as', 'stc89c52rc'])
        assert.equal(localTargetSupported(target), true, target);
    for (const target of ['atmega328p', 'rp2040', 'stm32f030', 'eater6502', '', null])
        assert.equal(localTargetSupported(target), false, String(target));
});

test('link script names every runtime library and keeps reset at address zero', () => {
    const script = linkerScript({iram: 0x100, xram: 0x400, code: 0xf000});
    for (const line of ['-b HOME = 0x0000', '-k /lib/small', '-l mcs51', '-l libsdcc',
        '-l libint', '-l liblong', '-l libfloat', '/work/main.rel', '-i /work/main.ihx'])
        assert.ok(script.includes(line), line);
    assert.match(script, /-I 0x100/); assert.match(script, /-X 0x400/); assert.match(script, /-C 0xf000/);
});
