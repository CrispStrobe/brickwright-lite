// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {programStorageAbiAddress} from '../scripts/lib/spike-program-storage-marker.mjs';
const symbol = (address = 0x08060000, kind = 'R') => `${address.toString(16)} ${kind} g_bw_program_storage_abi\n`;
function image (address = 0x08060000, value = 1) {
    const elf = Buffer.alloc(320);Buffer.from('7f454c460101', 'hex').copy(elf);
    elf.writeUInt16LE(40, 18);elf.writeUInt32LE(52, 28);elf.writeUInt16LE(32, 42);elf.writeUInt16LE(1, 44);
    elf.writeUInt32LE(160, 32);elf.writeUInt16LE(40, 46);elf.writeUInt16LE(4, 48);
    elf.writeUInt32LE(1, 52);elf.writeUInt32LE(84, 56);elf.writeUInt32LE(address, 60);elf.writeUInt32LE(4, 68);elf.writeUInt32LE(7, 76);elf.writeUInt32LE(value, 84);
    // .text allocated, executable, nonwritable; PT_LOAD deliberately RWE like NuttX.
    elf.writeUInt32LE(1, 204);elf.writeUInt32LE(6, 208);elf.writeUInt32LE(address, 212);elf.writeUInt32LE(84, 216);elf.writeUInt32LE(4, 220);
    elf.writeUInt32LE(3, 244);elf.writeUInt32LE(88, 256);elf.writeUInt32LE(26, 260);
    elf.write('\0g_bw_program_storage_abi\0', 88);
    elf.writeUInt32LE(2, 284);elf.writeUInt32LE(120, 296);elf.writeUInt32LE(32, 300);elf.writeUInt32LE(2, 304);elf.writeUInt32LE(16, 316);
    elf.writeUInt32LE(1, 136);elf.writeUInt32LE(address, 140);elf.writeUInt32LE(4, 144);elf[148] = 0x11;elf.writeUInt16LE(1, 150);
    return elf;
}
test('old image stays unadvertised; R/T constants use OBJECT and nonwritable section proof', () => {
    assert.equal(programStorageAbiAddress(image(), ''), null);
    for (const kind of ['R', 'r', 'T', 't']) assert.equal(programStorageAbiAddress(image(), symbol(undefined, kind)), 0x08060000);
    for (const address of [0x08060000, 0x080ffffc]) assert.equal(programStorageAbiAddress(image(address), symbol(address)), address);
    for (const address of [0x0805fffc, 0x08100000, 0x08060001]) assert.throws(() => programStorageAbiAddress(image(address), symbol(address)));
    assert.throws(() => programStorageAbiAddress(image(0x08060000, 2), symbol()));
    assert.throws(() => programStorageAbiAddress(image(0x08060004), symbol()));
});
test('code, writable objects, wrong size, wrong section and invalid load mappings fail', () => {
    for (const kind of ['D', 'd', 'B', 'b', 'A', 'W']) assert.throws(() => programStorageAbiAddress(image(), symbol(undefined, kind)));
    for (const mutate of [
        elf => {elf[148] = 0x12;}, // STT_FUNC, even with nm T
        elf => elf.writeUInt32LE(8, 144),
        elf => elf.writeUInt32LE(7, 208), // SHF_WRITE
        elf => elf.writeUInt32LE(4, 208), // missing SHF_ALLOC
        elf => elf.writeUInt32LE(8, 204), // NOBITS
        elf => elf.writeUInt16LE(0xffff, 150),
        elf => elf.writeUInt32LE(88, 56), // PT_LOAD disagrees with section offset
        elf => elf.writeUInt16LE(62, 18)
    ]) {const elf = image();mutate(elf);assert.throws(() => programStorageAbiAddress(elf, symbol(undefined, 'T')));}
});
test('truncated and malformed ELF tables or symbol names fail closed', () => {
    for (const mutate of [
        elf => elf.writeUInt16LE(31, 42),
        elf => elf.writeUInt32LE(319, 32),
        elf => elf.writeUInt16LE(0, 48),
        elf => elf.writeUInt32LE(15, 316),
        elf => elf.writeUInt32LE(31, 300),
        elf => elf.writeUInt32LE(99, 304),
        elf => elf.writeUInt32LE(26, 136),
        elf => {elf[113] = 65;},
        elf => elf.writeUInt32LE(319, 296)
    ]) {const elf = image();mutate(elf);assert.throws(() => programStorageAbiAddress(elf, symbol()));}
    assert.throws(() => programStorageAbiAddress(image().subarray(0, 319), symbol()));
    assert.throws(() => programStorageAbiAddress(image(), symbol() + symbol()));
});
