/**
 * A boot ROM we are allowed to ship.
 *
 * Raspberry Pi's RP2040 bootrom is BSD-3 — except `mufplib.S`, which says
 * "Raspberry Pi (Trading) Ltd hereby grants to you a non-exclusive license
 * to use the software SOLELY ON A RASPBERRY PI RP2040 DEVICE. No other use
 * is permitted", or GPLv2 from the copyright owner. An emulator is not an
 * RP2040 device and GPL cannot be bundled here, so the 16 KB blob cannot
 * ship under either licence offered, and asking a user to supply one does
 * not change what the licence says.
 *
 * So it is written from the datasheet instead, the same way this repo
 * already does the SSD1306 and the ATmega32U4. These tests hold it to the
 * two things that make it useful: the fixed header the SDK reads by
 * address, and routines that RETURN.
 *
 * That second one is not padding. The first version of memcpy here copied
 * correct bytes and never terminated — a branch offset counted from the
 * wrong place landed inside the loop body and took the count to -1. A test
 * that only compared the destination passed it.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {
    buildBootrom, BOOTROM_SIZE, ROM_FUNC
} from '../overlay/scratch-gui/src/lib/bw-board/rp2040-bootrom.js';

const canEmulate = existsSync(join(INTEGRATED, 'node_modules', 'rp2040js'));
const SKIP = canEmulate ? false : 'needs rp2040js from the integrated tree';

test('the header sits where the datasheet says, because the SDK reads it by address', () => {
    const rom = buildBootrom();
    assert.equal(rom.length, BOOTROM_SIZE);
    const view = new DataView(rom.buffer);

    assert.equal(String.fromCharCode(rom[0x10], rom[0x11]), 'Mu', 'the magic identifies the ROM');
    assert.equal(rom[0x12], 1, 'version');
    // Nothing else names these tables — they are found only by offset.
    assert.ok(view.getUint16(0x14, true) > 0x100, 'no function table pointer');
    assert.ok(view.getUint16(0x18, true) > 0x100, 'no lookup routine pointer');
    // Vectors must not point at zero, or a fault jumps to the SP word.
    assert.ok(view.getUint32(0x04, true) > 0, 'reset vector is null');
    assert.equal(view.getUint32(0x00, true), 0x20042000, 'initial SP is not the top of SRAM');
});

test('function-table entries carry the Thumb bit', () => {
    // The caller `blx`es straight to what the table holds. An even address
    // means ARM mode, which this core does not have — the failure is a
    // fault on the first call, a long way from the table.
    const rom = buildBootrom();
    const view = new DataView(rom.buffer);
    let at = view.getUint16(0x14, true);
    let entries = 0;
    while (view.getUint16(at, true) !== 0 && entries < 16) {
        const addr = view.getUint16(at + 2, true);
        assert.equal(addr & 1, 1, `entry ${entries} is not a Thumb address`);
        entries++;
        at += 4;
    }
    assert.ok(entries >= 4, `only ${entries} functions in the table`);
});

/** Run a ROM routine on a real core and report the steps it took to return. */
const callRom = async (entry, regs, limit = 4000) => {
    const {RP2040} = await import(join(INTEGRATED, 'node_modules', 'rp2040js', 'dist', 'esm', 'index.js'));
    const mcu = new RP2040();
    mcu.loadBootrom(new Uint32Array(buildBootrom().buffer));
    return {mcu, run (pc, r) {
        mcu.core.PC = pc & ~1;
        for (const [i, v] of Object.entries(r)) mcu.core.registers[Number(i)] = v;
        const RETURN = 0x20040000;               // an address we can recognise
        mcu.core.registers[14] = RETURN | 1;
        for (let i = 0; i < limit; i++) {
            if ((mcu.core.PC >>> 0) === RETURN) return i;
            mcu.step();
        }
        return -1;                               // did not return
    }, regs};
};

test('rom_table_lookup finds a function, and misses cleanly', {skip: SKIP}, async () => {
    const {mcu, run} = await callRom();
    const view = new DataView(buildBootrom().buffer);
    const table = view.getUint16(0x14, true);
    const lookup = view.getUint16(0x18, true);

    assert.ok(run(lookup, {0: table, 1: ROM_FUNC.MEMCPY}) >= 0, 'lookup never returned');
    const found = mcu.core.registers[0] >>> 0;
    assert.ok(found > 0x100 && (found & 1) === 1, `lookup gave 0x${found.toString(16)}`);

    // An unknown code must return 0 rather than run off the end of the table.
    assert.ok(run(lookup, {0: table, 1: 0x5A5A}) >= 0, 'lookup never returned on a miss');
    assert.equal(mcu.core.registers[0] >>> 0, 0, 'an unknown code did not return 0');
});

test('memcpy copies, and RETURNS', {skip: SKIP}, async () => {
    const {mcu, run} = await callRom();
    const view = new DataView(buildBootrom().buffer);
    const lookup = view.getUint16(0x18, true);
    run(lookup, {0: view.getUint16(0x14, true), 1: ROM_FUNC.MEMCPY});
    const memcpy = mcu.core.registers[0];

    const dst = 0x20001000;
    const src = 0x20002000;
    for (let i = 0; i < 16; i++) mcu.writeUint8(src + i, 0xA0 + i);
    const steps = run(memcpy, {0: dst, 1: src, 2: 16});

    assert.ok(steps >= 0, 'memcpy never returned — the loop does not terminate');
    const got = [];
    for (let i = 0; i < 16; i++) got.push(mcu.readUint8(dst + i));
    assert.deepEqual(got, [...Array(16)].map((_, i) => 0xA0 + i));
    assert.equal(mcu.core.registers[0] >>> 0, dst, 'memcpy must return its destination');
});

test('memcpy of zero bytes returns immediately and writes nothing', {skip: SKIP}, async () => {
    // The boundary the broken branch got wrong: with n = 0 the very first
    // compare has to exit, not fall into the body.
    const {mcu, run} = await callRom();
    const view = new DataView(buildBootrom().buffer);
    const lookup = view.getUint16(0x18, true);
    run(lookup, {0: view.getUint16(0x14, true), 1: ROM_FUNC.MEMCPY});
    const memcpy = mcu.core.registers[0];

    const dst = 0x20003000;
    mcu.writeUint8(dst, 0x5A);
    assert.ok(run(memcpy, {0: dst, 1: 0x20002000, 2: 0}) >= 0, 'memcpy(n=0) never returned');
    assert.equal(mcu.readUint8(dst), 0x5A, 'memcpy(n=0) wrote anyway');
});

test('memset fills, and returns', {skip: SKIP}, async () => {
    const {mcu, run} = await callRom();
    const view = new DataView(buildBootrom().buffer);
    const lookup = view.getUint16(0x18, true);
    run(lookup, {0: view.getUint16(0x14, true), 1: ROM_FUNC.MEMSET});
    const memset = mcu.core.registers[0];

    const dst = 0x20004000;
    const steps = run(memset, {0: dst, 1: 0x5A, 2: 12});
    assert.ok(steps >= 0, 'memset never returned');
    for (let i = 0; i < 12; i++) assert.equal(mcu.readUint8(dst + i), 0x5A, `byte ${i}`);
    assert.equal(mcu.readUint8(dst + 12), 0, 'memset ran past its count');
});
