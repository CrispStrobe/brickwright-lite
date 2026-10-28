// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {inflateRawSync} from 'node:zlib';
import {ApiError} from './protocol.mjs';
import {ARTIFACT_BYTES, newContext, remaining} from './bounded-http.mjs';
export {boundedResponseBytes} from './bounded-http.mjs';
const NAME = Buffer.from('result.enc');
const invalid = () => new ApiError(503, 'invalid-result', 'Invalid bounded result archive');
const tooLarge = () => new ApiError(503, 'result-too-large', 'Artifact exceeds the result limit');
const need = value => { if (!value) throw invalid(); };
const crcTable = Uint32Array.from({length: 256}, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    return n >>> 0;
});
export function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
    return (value ^ 0xffffffff) >>> 0;
}
function extras(bytes, start, length) {
    need(length <= 128 && start + length <= bytes.length);
    const seen = new Set();
    for (let at = start; at < start + length;) {
        need(at + 4 <= start + length);
        const id = bytes.readUInt16LE(at), size = bytes.readUInt16LE(at + 2);
        // Bounded timestamps / Unix IDs only. No ZIP64 or Unicode filename overrides.
        need((id === 0x5455 || id === 0x7875) && !seen.has(id) && size <= 32 && at + 4 + size <= start + length);
        seen.add(id); at += 4 + size;
    }
}
/** Admit the complete, single-root worker layout BEFORE JSZip can allocate entry metadata. */
export function admitResultLayout(bytes, limit = ARTIFACT_BYTES) {
    need(Buffer.isBuffer(bytes) && Number.isSafeInteger(limit) && limit > 0 && limit <= ARTIFACT_BYTES);
    if (bytes.length > limit) throw tooLarge();
    need(bytes.length >= 118);
    const end = bytes.length - 22;
    need(bytes.readUInt32LE(end) === 0x06054b50 && bytes.readUInt16LE(end + 20) === 0);
    need(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 &&
        bytes.readUInt16LE(end + 8) === 1 && bytes.readUInt16LE(end + 10) === 1);
    const size = bytes.readUInt32LE(end + 12), central = bytes.readUInt32LE(end + 16);
    need(size >= 56 && size <= 184 && central >= 40 && central + size === end);
    need(bytes.readUInt32LE(central) === 0x02014b50);
    const version = bytes.readUInt16LE(central + 6), flags = bytes.readUInt16LE(central + 8), method = bytes.readUInt16LE(central + 10);
    const crc = bytes.readUInt32LE(central + 16), compressed = bytes.readUInt32LE(central + 20), uncompressed = bytes.readUInt32LE(central + 24);
    const extra = bytes.readUInt16LE(central + 30), attributes = bytes.readUInt32LE(central + 38), fileType = (attributes >>> 16) & 0xf000;
    need(version >= 10 && version <= 20 && (flags & ~0x0808) === 0 && (method === 0 || method === 8));
    need(bytes.readUInt16LE(central + 28) === NAME.length && bytes.readUInt16LE(central + 32) === 0 &&
        bytes.readUInt16LE(central + 34) === 0 && bytes.readUInt32LE(central + 42) === 0);
    need((attributes & 0x10) === 0 && (fileType === 0 || fileType === 0x8000));
    need(extra <= 128 && size === 46 + NAME.length + extra && bytes.subarray(central + 46, central + 46 + NAME.length).equals(NAME));
    extras(bytes, central + 46 + NAME.length, extra);
    if (uncompressed > limit || compressed > limit) throw tooLarge();
    need(method !== 0 || compressed === uncompressed);
    need(bytes.readUInt32LE(0) === 0x04034b50 && bytes.readUInt16LE(4) === version &&
        bytes.readUInt16LE(6) === flags && bytes.readUInt16LE(8) === method && bytes.readUInt16LE(26) === NAME.length);
    const localExtra = bytes.readUInt16LE(28), start = 30 + NAME.length + localExtra;
    need(localExtra <= 128 && start <= central && bytes.subarray(30, 30 + NAME.length).equals(NAME));
    extras(bytes, 30 + NAME.length, localExtra);
    for (const [at, expected] of [[14, crc], [18, compressed], [22, uncompressed]]) {
        const value = bytes.readUInt32LE(at);
        need(value === expected || ((flags & 8) !== 0 && value === 0));
    }
    const dataEnd = start + compressed;
    need(dataEnd <= central);
    if (flags & 8) {
        const length = central - dataEnd;
        need(length === 12 || length === 16);
        const at = dataEnd + (length === 16 ? 4 : 0);
        if (length === 16) need(bytes.readUInt32LE(dataEnd) === 0x08074b50);
        need(bytes.readUInt32LE(at) === crc && bytes.readUInt32LE(at + 4) === compressed && bytes.readUInt32LE(at + 8) === uncompressed);
    } else need(dataEnd === central);
    return {start, compressed, uncompressed, method, crc};
}
async function loadPinnedZip(bytes) {
    const {default: JSZip} = await import('jszip');
    if (JSZip.version !== '3.10.1') throw new ApiError(503, 'unqualified-decoder', 'Unqualified archive decoder');
    return JSZip.loadAsync(bytes, {checkCRC32: false});
}
export async function boundedResultArchive(bytes, {limit = ARTIFACT_BYTES, context = newContext(), loadZip = loadPinnedZip} = {}) {
    const layout = admitResultLayout(bytes, limit);
    remaining(context);
    // Metadata only: CRC/inflation is performed below with a native output cap.
    const zip = await loadZip(bytes), names = Object.keys(zip.files), entry = zip.file('result.enc'), metadata = entry?._data;
    need(names.length === 1 && names[0] === 'result.enc' && entry && !entry.dir &&
        (entry.unsafeOriginalName === undefined || entry.unsafeOriginalName === 'result.enc'));
    need(metadata && metadata.compressedSize === layout.compressed && metadata.uncompressedSize === layout.uncompressed &&
        Number.isInteger(metadata.crc32) && (metadata.crc32 >>> 0) === layout.crc);
    remaining(context);
    const compressed = bytes.subarray(layout.start, layout.start + layout.compressed);
    let output;
    if (layout.method === 0) output = compressed;
    else {
        let decoded;
        try { decoded = inflateRawSync(compressed, {maxOutputLength: limit, info: true}); }
        catch (error) { if (error.code === 'ERR_BUFFER_TOO_LARGE') throw tooLarge(); throw invalid(); }
        need(decoded.engine.bytesWritten === compressed.length);
        output = decoded.buffer;
    }
    remaining(context);
    need(output.length === layout.uncompressed && crc32(output) === layout.crc);
    try { return new TextDecoder('utf-8', {fatal: true}).decode(output); }
    catch { throw invalid(); }
}
