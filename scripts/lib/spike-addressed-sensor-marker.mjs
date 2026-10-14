// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {createHash} from 'node:crypto';
const NAME = 'g_bw_program_addressed_sensor_abi';
const fail = message => { throw new Error(`Addressed sensor capability: ${message}`); };
/** Optional discovery in our own ELF; this alone does not authorize a topology. */
export function programAddressedSensorCapability (elf, symbols) {
    const markers = symbols.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(row => row.at(-1) === NAME);
    if (!markers.length) return null;
    if (markers.length !== 1 || markers[0].length !== 3 || !['R', 'T'].includes(markers[0][1]) ||
        !/^[0-9a-fA-F]+$/.test(markers[0][0])) fail('expected one global constant symbol');
    const address = Number.parseInt(markers[0][0], 16);
    if (address % 4 || address < 0x08060000 || address > 0x08100000 - 4) fail('outside aligned userspace flash');
    if (elf.length < 52 || elf.length > 64 * 1024 * 1024 || elf.subarray(0, 7).toString('hex') !== '7f454c46010101' ||
        elf.readUInt16LE(16) !== 2 || elf.readUInt16LE(18) !== 40 || elf.readUInt32LE(20) !== 1 || elf.readUInt16LE(40) !== 52) fail('expected ARM ELF32 executable');
    const range = (offset, size) => offset <= elf.length && size <= elf.length - offset;
    const phoff = elf.readUInt32LE(28), phsize = elf.readUInt16LE(42), phcount = elf.readUInt16LE(44);
    const shoff = elf.readUInt32LE(32), shsize = elf.readUInt16LE(46), shcount = elf.readUInt16LE(48);
    if (phsize !== 32 || !phcount || phcount > 128 || phoff < 52 || !range(phoff, phsize * phcount) ||
        shsize !== 40 || !shcount || shcount > 4096 || shoff < 52 || !range(shoff, shsize * shcount)) fail('malformed ELF headers');
    const sections = Array.from({length: shcount}, (_, i) => {
        const at = shoff + i * shsize;
        return Array.from({length: 10}, (unused, j) => elf.readUInt32LE(at + j * 4));
    });
    const objects = [];
    for (const table of sections.filter(section => section[1] === 2)) {
        const offset = table[4], size = table[5], names = sections[table[6]];
        if (table[9] !== 16 || size % 16 || !range(offset, size) || !names || names[1] !== 3 || !range(names[4], names[5])) fail('malformed symbol table');
        for (let at = offset; at < offset + size; at += 16) {
            const nameOffset = elf.readUInt32LE(at);
            if (nameOffset >= names[5]) fail('invalid symbol name');
            const start = names[4] + nameOffset, end = elf.indexOf(0, start);
            if (end < start || end >= names[4] + names[5]) fail('unterminated symbol name');
            if (elf.toString('utf8', start, end) !== NAME) continue;
            const index = elf.readUInt16LE(at + 14), section = sections[index];
            if (elf[at + 12] !== 0x11 || elf.readUInt32LE(at + 4) !== address || elf.readUInt32LE(at + 8) !== 4 ||
                !index || !section || section[1] !== 1 || !(section[2] & 2) || (section[2] & 1) ||
                !range(section[4], section[5]) || address < section[3] || address + 4 > section[3] + section[5]) fail('expected four-byte OBJECT in nonwritable allocated section');
            objects.push(section[4] + address - section[3]);
        }
    }
    if (objects.length !== 1) fail('missing or duplicated OBJECT');
    const mappings = [];
    for (let i = 0; i < phcount; i++) {
        const at = phoff + i * phsize;
        if (elf.readUInt32LE(at) !== 1) continue;
        const offset = elf.readUInt32LE(at + 4), virtual = elf.readUInt32LE(at + 8), physical = elf.readUInt32LE(at + 12);
        const files = elf.readUInt32LE(at + 16), memory = elf.readUInt32LE(at + 20), flags = elf.readUInt32LE(at + 24);
        if (files > memory || !range(offset, files) || virtual + memory > 0x100000000 || physical + memory > 0x100000000) fail('invalid load extent');
        if ((virtual < address + 4 && address < virtual + memory) || (physical < address + 4 && address < physical + memory)) {
            mappings.push({offset, virtual, physical, files, flags});
        }
    }
    if (mappings.length !== 1) fail('missing or overlapping load mapping');
    const mapping = mappings[0];
    if (!(mapping.flags & 4) || mapping.physical !== mapping.virtual || address < mapping.virtual ||
        address + 4 > mapping.virtual + mapping.files || mapping.offset + address - mapping.virtual !== objects[0]) fail('invalid file-backed mapping');
    if (elf.readUInt32LE(objects[0]) !== 1) fail('unsupported version');
    return {abi: 1, address, userspaceSha256: createHash('sha256').update(elf).digest('hex')};
}
