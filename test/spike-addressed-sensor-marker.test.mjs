// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {programAddressedSensorCapability as discover} from '../scripts/lib/spike-addressed-sensor-marker.mjs';
const NAME = 'g_bw_program_addressed_sensor_abi';
const symbol = `08060000 R ${NAME}\n`;
function image () {
    const elf = Buffer.alloc(800);
    Buffer.from('7f454c46010101', 'hex').copy(elf);
    elf.writeUInt16LE(2, 16);elf.writeUInt16LE(40, 18);elf.writeUInt32LE(1, 20);
    elf.writeUInt32LE(52, 28);elf.writeUInt32LE(600, 32);
    elf.writeUInt16LE(52, 40);elf.writeUInt16LE(32, 42);elf.writeUInt16LE(1, 44);elf.writeUInt16LE(40, 46);elf.writeUInt16LE(4, 48);
    const words = (at, values) => values.forEach((value, i) => elf.writeUInt32LE(value, at + i * 4));
    words(52, [1, 256, 0x08060000, 0x08060000, 4, 4, 7, 4]);
    words(640, [0, 1, 6, 0x08060000, 256, 4, 0, 0, 4, 0]);
    words(680, [0, 2, 0, 0, 400, 32, 3, 0, 4, 16]);
    const names = Buffer.from(`\0${NAME}\0`);names.copy(elf, 500);
    words(720, [0, 3, 0, 0, 500, names.length, 0, 0, 1, 0]);
    words(416, [1, 0x08060000, 4]);elf[428] = 0x11;elf.writeUInt16LE(1, 430);elf.writeUInt32LE(1, 256);
    return elf;
}
test('optional feature is distinct from legacy storage/debug ABI and binds the exact image', () => {
    const elf = image();
    assert.equal(discover(elf, '08060000 R g_bw_program_storage_abi\n'), null);
    const capability = discover(elf, symbol);
    assert.deepEqual(capability, {abi: 1, address: 0x08060000, userspaceSha256: createHash('sha256').update(elf).digest('hex')});
    assert.deepEqual(discover(elf, symbol.replace(' R ', ' T ')), capability);
    elf[799] = 1;
    assert.notEqual(discover(elf, symbol).userspaceSha256, capability.userspaceSha256);
});
test('symbol kind, address, duplicate and unsupported version refusals', () => {
    for (const symbols of [symbol + symbol, symbol.replace(' R ', ' r '), symbol.replace(' R ', 'D '),
        symbol.replace('08060000', '20000000'), symbol.replace('08060000', '08060001'), symbol.replace('08060000', '08100000')]) {
        assert.throws(() => discover(image(), symbols));
    }
    for (const value of [0, 2, 0xffffffff]) {const elf = image();elf.writeUInt32LE(value, 256);assert.throws(() => discover(elf, symbol));}
});
test('malformed executable, OBJECT, sections, symbol names and file mapping are refused', () => {
    const mutations = [[16, 3, 2], [18, 3, 2], [20, 0, 4], [28, 799, 4], [32, 799, 4],
        [40, 0, 2], [42, 0, 2], [44, 0, 2], [46, 0, 2], [48, 0, 2],
        [56, 799, 4], [64, 0x08060004, 4], [68, 3, 4], [72, 3, 4], [76, 0, 4],
        [420, 0x08060004, 4], [424, 8, 4], [428, 0x12, 1], [428, 0x01, 1], [430, 0, 2],
        [644, 8, 4], [648, 7, 4], [648, 0, 4], [656, 257, 4], [696, 799, 4],
        [704, 4, 4], [716, 8, 4], [416, 799, 4], [736, 799, 4]];
    for (const [offset, value, width] of mutations) {
        const elf = image();elf[`writeUInt${width * 8}${width === 1 ? '' : 'LE'}`](value, offset);
        assert.throws(() => discover(elf, symbol), `offset ${offset}`);
    }
    for (const length of [0, 51, 83, 259, 759]) assert.throws(() => discover(image().subarray(0, length), symbol));
});
test('overlapping virtual and partial physical aliases cannot overwrite advertised feature', () => {
    for (const physical of [0x08060000, 0x08060001, 0x0805ffff]) {
        const elf = image();elf.writeUInt16LE(2, 44);elf.copy(elf, 84, 52, 84);
        elf.writeUInt32LE(0x20000000, 92);elf.writeUInt32LE(physical, 96);
        assert.throws(() => discover(elf, symbol));
    }
    const elf = image();elf.writeUInt16LE(2, 44);elf.copy(elf, 84, 52, 84);
    assert.throws(() => discover(elf, symbol));
});
test('source mutations must fail the intended refusal controls', () => {
    const source = readFileSync(new URL('../scripts/lib/spike-addressed-sensor-marker.mjs', import.meta.url), 'utf8');
    const fixture = readFileSync(new URL(import.meta.url), 'utf8');
    const mutations = [
        ['if (elf.readUInt32LE(objects[0]) !== 1)', 'if (false)', 'symbol kind'],
        [' || (section[2] & 1)', '', 'malformed executable'],
        [' || (physical < address + 4 && address < physical + memory)', '', 'overlapping virtual']
    ];
    for (const [old, replacement, intended] of mutations) {
        assert.equal(source.split(old).length, 2, 'mutation must bind uniquely');
        const owned = mkdtempSync(join(tmpdir(), 'bw-addressed-marker-mutant-'));
        try {
            writeFileSync(join(owned, 'marker.mjs'), source.replace(old, replacement));
            writeFileSync(join(owned, 'test.mjs'), fixture.replace('../scripts/lib/spike-addressed-sensor-marker.mjs', './marker.mjs'));
            const env = {...process.env};delete env.NODE_TEST_CONTEXT;
            const result = spawnSync(process.execPath, ['--test', '--test-name-pattern', '^(optional|symbol|malformed|overlapping)', join(owned, 'test.mjs')], {encoding: 'utf8', env});
            assert.equal(result.status, 1, intended);
            assert.match(result.stdout, new RegExp(`not ok .*${intended}`));
            assert.match(result.stdout, /ERR_ASSERTION|AssertionError/);
        } finally {rmSync(owned, {recursive: true, force: true});}
    }
});
