// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Bounded virtual projection, not a firmware memory image. See docs/NXT-RXE-VM.md.
const MODULE_MISSING = 0x90;
const UNSUPPORTED_SLICE = 0x91;
const inRange = (offset, count) => Number.isInteger(offset) && Number.isInteger(count) &&
    offset >= 0 && count >= 0 && offset + count <= 36;
const validButton = b => b && typeof b.down === 'boolean' &&
    [b.shortReleases, b.longReleases].every(n => Number.isInteger(n) && n >= 0 && n <= 255);

export function readNxtIOMap (buttons, moduleName, offset, count) {
    if (moduleName !== 'Button.mod') return {status: MODULE_MISSING, data: []};
    if (!inRange(offset, count)) return {status: UNSUPPORTED_SLICE, data: []};
    const data = [];
    for (let address = offset; address < offset + count; address++) {
        const i = address >= 32 ? address - 32 : Math.floor(address / 8);
        const field = address % 8;
        const b = buttons && buttons[i];
        if (!validButton(b)) return {status: UNSUPPORTED_SLICE, data: []};
        if (address >= 32) data.push(b.down ? 0x80 : 0); // held bit; event lifetimes are not modeled
        else if (field === 2) data.push(b.shortReleases);
        else if (field === 3) data.push(b.longReleases);
        else if (field === 4) data.push((b.shortReleases + b.longReleases) & 0xff);
        else return {status: UNSUPPORTED_SLICE, data: []};
    }
    return {status: 0, data};
}

export function writeNxtIOMap (buttons, moduleName, offset, bytes) {
    if (moduleName !== 'Button.mod') return MODULE_MISSING;
    if (!Array.isArray(bytes) || !inRange(offset, bytes.length)) return UNSUPPORTED_SLICE;
    if (bytes.length === 0) return 0;
    const i = (offset - 2) / 8;
    const b = buttons && buttons[i];
    // Only the exact ShortRelCnt/LongRelCnt/RelCnt zeroing operation is backed
    // by virtual state. Stock firmware allows other writes; this model refuses them.
    if (!Number.isInteger(i) || i < 0 || i >= 4 || !validButton(b) ||
        bytes.length !== 3 || bytes.some(byte => byte !== 0)) return UNSUPPORTED_SLICE;
    b.shortReleases = b.longReleases = 0;
    return 0;
}
