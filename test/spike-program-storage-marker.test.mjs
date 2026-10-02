// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {programStorageAbiAddress} from '../scripts/lib/spike-program-storage-marker.mjs';
const symbol = address => `${address.toString(16)} R g_bw_program_storage_abi\n`;
function image (address = 0x08060000, value = 1) {
    const elf = Buffer.alloc(88);Buffer.from('7f454c460101', 'hex').copy(elf);
    elf.writeUInt16LE(40, 18);elf.writeUInt32LE(52, 28);elf.writeUInt16LE(32, 42);elf.writeUInt16LE(1, 44);
    elf.writeUInt32LE(1, 52);elf.writeUInt32LE(84, 56);elf.writeUInt32LE(address, 60);elf.writeUInt32LE(4, 68);elf.writeUInt32LE(value, 84);
    return elf;
}
test('old image is unadvertised; marker requires aligned userspace file-backed ABI1', () => {
    assert.equal(programStorageAbiAddress(image(), ''), null);
    for (const address of [0x08060000, 0x080ffffc]) assert.equal(programStorageAbiAddress(image(address), symbol(address)), address);
    for (const address of [0x0805fffc, 0x08100000, 0x08060001]) assert.throws(() => programStorageAbiAddress(image(address), symbol(address)));
    assert.throws(() => programStorageAbiAddress(image(0x08060000, 2), symbol(0x08060000)));
    assert.throws(() => programStorageAbiAddress(image().subarray(0, 87), symbol(0x08060000)));
    assert.throws(() => programStorageAbiAddress(image(0x08060004), symbol(0x08060000)));
    const bad = image();bad.writeUInt16LE(31, 42);
    assert.throws(() => programStorageAbiAddress(bad, symbol(0x08060000)));
});


test('storage ABI marker rejects writable/code symbols and non-ARM ELF', () => {
    const address = 0x08060000;
    assert.equal(programStorageAbiAddress(image(), symbol(address).replace(' R ', ' r ')), address);
    for (const kind of ['T', 't', 'D', 'd', 'B', 'b', 'A', 'W']) {
        assert.throws(() => programStorageAbiAddress(image(), symbol(address).replace(' R ', ` ${kind} `)), /read-only/);
    }
    const elf = image();elf.writeUInt16LE(62, 18);
    assert.throws(() => programStorageAbiAddress(elf, symbol(address)), /ARM/);
});
