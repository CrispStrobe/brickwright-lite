// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Verify our optional ABI marker in a file-backed userspace ELF32 load segment. */
export function programStorageAbiAddress (elf, symbols) {
    const marker = symbols.match(/^([a-fA-F0-9]+)\s+\w\s+g_bw_program_storage_abi$/m);
    if (!marker) return null;
    const address = Number.parseInt(marker[1], 16);
    if (address % 4 || address < 0x08060000 || address > 0x08100000 - 4) throw new Error('Program storage ABI marker exceeds userspace flash');
    if (elf.length < 52 || elf.subarray(0, 6).toString('hex') !== '7f454c460101') throw new Error('Expected little-endian ELF32 storage marker');
    const phoff = elf.readUInt32LE(28), phsize = elf.readUInt16LE(42), count = elf.readUInt16LE(44);
    if (phsize < 32 || count > 256 || phoff + phsize * count > elf.length) throw new Error('Malformed storage marker ELF headers');
    let found = false;
    for (let i = 0; i < count; i++) {
        const p = phoff + i * phsize;
        if (elf.readUInt32LE(p) !== 1) continue;
        const base = elf.readUInt32LE(p + 8), size = elf.readUInt32LE(p + 16), offset = elf.readUInt32LE(p + 4);
        if (address < base || address + 4 > base + size) continue;
        const pos = offset + address - base;
        if (found || pos + 4 > elf.length || elf.readUInt32LE(pos) !== 1) throw new Error('Invalid program storage ABI marker');
        found = true;
    }
    if (!found) throw new Error('Program storage ABI marker is not file-backed');
    return address;
}
