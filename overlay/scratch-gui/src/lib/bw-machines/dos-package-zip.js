import JSZip from 'jszip';

export const DOS_PACKAGE_LIMITS = Object.freeze({rawBytes: 16 * 1024 * 1024,
    decodedBytes: 16 * 1024 * 1024, entries: 32, configBytes: 16384, pathBytes: 128});
const abLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const ta = Object.getPrototypeOf(Uint8Array.prototype);
const taBuffer = Object.getOwnPropertyDescriptor(ta, 'buffer').get;
const taOffset = Object.getOwnPropertyDescriptor(ta, 'byteOffset').get;
const taLength = Object.getOwnPropertyDescriptor(ta, 'byteLength').get;
const taTag = Object.getOwnPropertyDescriptor(ta, Symbol.toStringTag).get;
const need = (condition, reason) => {if (!condition) throw new Error(`DOS package: ${reason}`);};
export function packagePath (name) {
    need(typeof name === 'string' && name.length > 0 && name.length <= DOS_PACKAGE_LIMITS.pathBytes &&
        name.split('/').every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && part !== '.' && part !== '..'),
    'unsafe or unsupported archive path');
    return name;
}
export function packageBytes (value) {
    let buffer, offset = 0, length;
    if (ArrayBuffer.isView(value)) {
        need(taTag.call(value) === 'Uint8Array', 'expected Uint8Array bytes');
        buffer = taBuffer.call(value); offset = taOffset.call(value); length = taLength.call(value);
    } else {buffer = value; length = abLength.call(value);}
    abLength.call(buffer); // SharedArrayBuffer is not an admitted input.
    need(length >= 1 && length <= DOS_PACKAGE_LIMITS.rawBytes, 'archive exceeds the 16 MiB bound or is empty');
    return new Uint8Array(new Uint8Array(buffer, offset, length));
}
function crc32 (bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
/** A finite STORED-only ZIP envelope, checked before JSZip sees any record. */
export function preflightDosPackageZip (value) {
    const bytes = packageBytes(value);
    need(bytes.length >= 22, 'truncated archive');
    const view = new DataView(bytes.buffer);
    const u16 = at => view.getUint16(at, true), u32 = at => view.getUint32(at, true);
    const end = bytes.length - 22;
    need(u32(end) === 0x06054b50 && u16(end + 20) === 0, 'missing closed ZIP footer; comments/trailing bytes are unsupported');
    const count = u16(end + 10), central = u32(end + 16), centralSize = u32(end + 12);
    need(u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 8) === count &&
        count > 0 && count <= DOS_PACKAGE_LIMITS.entries && central + centralSize === end,
    'multipart, ZIP64 or invalid central directory');
    let cursor = central, localEnd = 0, decoded = 0;
    const rows = [], names = new Set();
    for (let index = 0; index < count; index++) {
        need(cursor + 46 <= end && u32(cursor) === 0x02014b50, 'invalid central record');
        const version = u16(cursor + 6), flags = u16(cursor + 8), method = u16(cursor + 10);
        const crc = u32(cursor + 16), compressed = u32(cursor + 20), size = u32(cursor + 24);
        const nameLength = u16(cursor + 28), extra = u16(cursor + 30), comment = u16(cursor + 32);
        const attributes = u32(cursor + 38), mode = (attributes >>> 16) & 0xf000, offset = u32(cursor + 42);
        need((version === 10 || version === 20) && flags === 0 && method === 0,
            'only unencrypted STORED entries without descriptors are supported; DEFLATE is not supported');
        need(extra === 0 && comment === 0 && u16(cursor + 34) === 0 && !(attributes & 0x10) &&
            (mode === 0 || mode === 0x8000), 'extra fields, symlinks and directory entries are unsupported');
        need(nameLength > 0 && nameLength <= DOS_PACKAGE_LIMITS.pathBytes && cursor + 46 + nameLength <= end,
            'invalid member name extent');
        const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
        need([...nameBytes].every(byte => byte >= 0x20 && byte <= 0x7e), 'only plain ASCII member names are supported');
        const name = packagePath(String.fromCharCode(...nameBytes)), folded = name.toLowerCase();
        need(!names.has(folded), 'duplicate or case-colliding member name'); names.add(folded);
        if (/(?:^|\/)dosbox\.conf$/i.test(name)) need(size <= DOS_PACKAGE_LIMITS.configBytes, 'config exceeds 16 KiB');
        need(compressed === size && size > 0 && size <= DOS_PACKAGE_LIMITS.decodedBytes &&
            (decoded += size) <= DOS_PACKAGE_LIMITS.decodedBytes, 'invalid or oversized decoded extent');
        need(offset === localEnd && offset + 30 <= central && u32(offset) === 0x04034b50,
            'SFX, overlapping, reordered or unclaimed local records are unsupported');
        need(u16(offset + 4) === version && u16(offset + 6) === flags && u16(offset + 8) === method &&
            u16(offset + 10) === u16(cursor + 12) && u16(offset + 12) === u16(cursor + 14) &&
            u32(offset + 14) === crc && u32(offset + 18) === compressed && u32(offset + 22) === size &&
            u16(offset + 26) === nameLength && u16(offset + 28) === 0, 'local/central header disagreement');
        const dataStart = offset + 30 + nameLength, dataEnd = dataStart + size;
        need(dataEnd <= central && nameBytes.every((byte, i) => bytes[offset + 30 + i] === byte), 'local name/extent disagreement');
        need(crc32(bytes.subarray(dataStart, dataEnd)) === crc, 'member CRC mismatch');
        rows.push({name, size, dataStart, dataEnd}); localEnd = dataEnd; cursor += 46 + nameLength;
    }
    need(cursor === end && localEnd === central, 'unclaimed ZIP records or padding');
    return {bytes, rows};
}
export async function readDosPackageZip (value) {
    const {bytes, rows} = preflightDosPackageZip(value);
    const archive = await JSZip.loadAsync(bytes, {checkCRC32: true, createFolders: false});
    need(Object.keys(archive.files).length === rows.length, 'ZIP library member census changed');
    const result = [];
    for (const row of rows) {
        const file = archive.file(row.name); need(file && !file.dir, 'ZIP library member mismatch');
        const data = await file.async('uint8array');
        need(data.length === row.size && data.every((byte, i) => byte === bytes[row.dataStart + i]),
            'ZIP library extraction differs from admitted STORED bytes');
        result.push(Object.freeze({name: row.name, bytes: new Uint8Array(data)}));
    }
    return Object.freeze(result);
}
