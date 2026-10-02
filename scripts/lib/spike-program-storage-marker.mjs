// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Verify our optional constant through ELF symbols, sections and load mapping.
 * NuttX can merge rodata into .text (nm T) and give PT_LOAD RWE flags; the
 * four-byte OBJECT's allocated section must still exclude SHF_WRITE. */
export function programStorageAbiAddress (elf, symbols) {
    const markers = [...symbols.matchAll(/^([a-fA-F0-9]+)\s+(\w)\s+g_bw_program_storage_abi$/gm)];
    if (!markers.length) return null;
    if (markers.length !== 1 || !['R', 'r', 'T', 't'].includes(markers[0][2])) throw new Error('Invalid program storage ABI symbol kind');
    const address = Number.parseInt(markers[0][1], 16);
    if (address % 4 || address < 0x08060000 || address > 0x08100000 - 4) throw new Error('Program storage ABI marker exceeds userspace flash');
    if (elf.length < 52 || elf.subarray(0, 6).toString('hex') !== '7f454c460101' || elf.readUInt16LE(18) !== 40) throw new Error('Expected little-endian ARM ELF32 storage marker');
    const range = (offset, size) => offset <= elf.length && size <= elf.length - offset;
    const phoff = elf.readUInt32LE(28), phsize = elf.readUInt16LE(42), count = elf.readUInt16LE(44);
    if (phsize !== 32 || count > 256 || !range(phoff, phsize * count)) throw new Error('Malformed storage marker ELF headers');
    const shoff = elf.readUInt32LE(32), shsize = elf.readUInt16LE(46), shcount = elf.readUInt16LE(48);
    if (shsize !== 40 || !shcount || shcount > 4096 || !range(shoff, shsize * shcount)) throw new Error('Malformed storage marker section table');
    const sections = Array.from({length: shcount}, (_, i) => {
        const p = shoff + i * shsize;
        return {type: elf.readUInt32LE(p + 4), flags: elf.readUInt32LE(p + 8),
            address: elf.readUInt32LE(p + 12), offset: elf.readUInt32LE(p + 16), size: elf.readUInt32LE(p + 20),
            link: elf.readUInt32LE(p + 24), entrySize: elf.readUInt32LE(p + 36)};
    });
    let objectOffset = null;
    for (const table of sections.filter(s => s.type === 2)) {
        const names = sections[table.link];
        if (table.entrySize !== 16 || table.size % 16 || !range(table.offset, table.size) ||
            !names || names.type !== 3 || !range(names.offset, names.size)) throw new Error('Malformed storage marker symbol table');
        for (let p = table.offset; p < table.offset + table.size; p += 16) {
            const nameOffset = elf.readUInt32LE(p);
            if (nameOffset >= names.size) throw new Error('Invalid storage marker symbol name');
            const start = names.offset + nameOffset, end = elf.indexOf(0, start);
            if (end < start || end >= names.offset + names.size) throw new Error('Unterminated storage marker symbol name');
            if (elf.toString('utf8', start, end) !== 'g_bw_program_storage_abi') continue;
            const section = sections[elf.readUInt16LE(p + 14)];
            if (objectOffset !== null || (elf[p + 12] & 15) !== 1 || elf.readUInt32LE(p + 8) !== 4 ||
                elf.readUInt32LE(p + 4) !== address || !section || section.type !== 1 ||
                !(section.flags & 2) || (section.flags & 1) || address < section.address ||
                address + 4 > section.address + section.size || !range(section.offset, section.size)) {
                throw new Error('Storage marker must be one four-byte OBJECT in an allocated nonwritable section');
            }
            objectOffset = section.offset + address - section.address;
        }
    }
    if (objectOffset === null) throw new Error('Storage marker OBJECT is missing');
    let found = false;
    for (let i = 0; i < count; i++) {
        const p = phoff + i * phsize;
        if (elf.readUInt32LE(p) !== 1) continue;
        const base = elf.readUInt32LE(p + 8), size = elf.readUInt32LE(p + 16), offset = elf.readUInt32LE(p + 4);
        if (address < base || address + 4 > base + size) continue;
        const pos = offset + address - base;
        if (found || !range(offset, size) || pos !== objectOffset || elf.readUInt32LE(pos) !== 1) throw new Error('Invalid program storage ABI marker load mapping or value');
        found = true;
    }
    if (!found) throw new Error('Program storage ABI marker is not file-backed');
    return address;
}
