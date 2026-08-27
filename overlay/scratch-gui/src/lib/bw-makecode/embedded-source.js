/**
 * Read the project source that MakeCode embeds in everything it
 * downloads — .hex, .uf2, .bin, and the .png "cartridge".
 *
 * THE POINT
 * ---------
 * A MakeCode .hex is native ARM machine code, so nothing we ship can
 * execute it: our micro:bit simulator interprets MicroPython, and the
 * arcade-shield build is Cortex-M4 for an nRF52833 driving a 160x128
 * SPI screen. But the file is not opaque. MakeCode writes the project
 * itself into the artefact ("source embedding"), so importing someone's
 * game is a PARSING problem, and this module is the parser.
 *
 * The container, from makecode.com/source-embedding, is the same in
 * every artefact — only the envelope differs:
 *
 *   offset 0   8 bytes  magic 41 14 0E 2F B8 2F A2 BB
 *   offset 8   u16 LE   length of the JSON header
 *   offset 10  u32 LE   length of the text that follows it
 *   offset 14  2 bytes  reserved
 *   offset 16  ...      JSON header, then the text
 *
 * The JSON header carries `compression` ("LZMA" or absent), `headerSize`
 * and `textSize`. When compressed, the decompressed bytes are a SECOND
 * JSON header of `headerSize` bytes followed by the project text — which
 * for every pxt target is a JSON map of {filename: contents}, i.e.
 * main.ts, main.blocks, pxt.json and the assets.
 *
 * Verified against real files, not just the spec: micro:bit MakeCode
 * hexes and arcade-shield hexes/uf2s both round-trip here (see
 * test/makecode-import.test.mjs).
 *
 * @module
 */

import {lzmaDecode} from './lzma.js';

const MAGIC = [0x41, 0x14, 0x0E, 0x2F, 0xB8, 0x2F, 0xA2, 0xBB];

const UF2_MAGIC_START0 = 0x0A324655;
const UF2_MAGIC_START1 = 0x9E5D5157;
const UF2_MAGIC_END = 0x0AB16F30;
const UF2_FLAG_NOFLASH = 0x00000001;

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** Universal-hex record types that delimit a chip section. */
const REC_BLOCK_START = 0x0A;
const REC_BLOCK_END = 0x0B;

const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u16le = (b, i) => b[i] | (b[i + 1] << 8);

const startsWith = (buf, sig, at = 0) => sig.every((v, i) => buf[at + i] === v);

const utf8 = bytes => new TextDecoder('utf-8').decode(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

/**
 * What KIND of file is this? Callers use this to explain themselves to
 * the user before any parsing has succeeded — "this is a UF2, and it has
 * no source in it" is a much better message than "import failed".
 *
 * @param {Uint8Array} bytes
 * @returns {'hex'|'uf2'|'png'|'elf'|'bin'}
 */
export function sniffFormat (bytes) {
    if (!bytes || !bytes.length) return 'bin';
    if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
    if (u32le(bytes, 0) === UF2_MAGIC_START0 && u32le(bytes, 4) === UF2_MAGIC_START1) return 'uf2';
    if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) return 'elf';
    // A hex file is text and its first record starts with a colon. Allow
    // a UTF-8 BOM, because Windows editors leave them behind.
    if (bytes[0] === 0x3A) return 'hex';
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF && bytes[3] === 0x3A) return 'hex';
    return 'bin';
}

/**
 * Parse Intel HEX into records. Deliberately tolerant: we are reading
 * someone else's download, and a bad checksum on an unrelated record is
 * not a reason to refuse the source that sits ten lines further down.
 *
 * @param {string} text
 * @returns {Array<{len: number, addr: number, type: number, data: Uint8Array}>}
 */
export function parseHexRecords (text) {
    const out = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length < 11 || line[0] !== ':') continue;
        const len = parseInt(line.substr(1, 2), 16);
        if (!Number.isFinite(len) || line.length < 11 + len * 2) continue;
        const data = new Uint8Array(len);
        for (let i = 0; i < len; i++) data[i] = parseInt(line.substr(9 + i * 2, 2), 16);
        out.push({
            len,
            addr: parseInt(line.substr(3, 4), 16),
            type: parseInt(line.substr(7, 2), 16),
            data
        });
    }
    return out;
}

/**
 * Pull the raw {meta, text} embed out of an Intel HEX (universal hex
 * included).
 *
 * Universal hexes carry the same program twice — once per chip — so the
 * source block can appear twice as well. We latch onto the first magic
 * and then read ONLY records of that same type, stopping at a section
 * boundary, so the two copies can never be spliced into each other.
 */
function extractFromHex (text) {
    const records = parseHexRecords(text);
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (rec.data.length < 16 || !startsWith(rec.data, MAGIC)) continue;

        const metaLen = u16le(rec.data, 8);
        const textLen = u32le(rec.data, 10);
        const want = metaLen + textLen;
        const buf = new Uint8Array(want);
        let got = 0;
        for (let j = i + 1; j < records.length && got < want; j++) {
            const next = records[j];
            if (next.type === REC_BLOCK_START || next.type === REC_BLOCK_END) break;
            if (next.type !== rec.type) continue;   // address records and the other chip's section
            for (let k = 0; k < next.data.length && got < want; k++) buf[got++] = next.data[k];
        }
        if (got < want) return null;                // truncated download
        return {meta: utf8(buf.subarray(0, metaLen)), text: buf.subarray(metaLen)};
    }
    return null;
}

/** Scan a flat image for the 16-byte-aligned source header. */
function extractFromBin (bin) {
    for (let p = 0; p + 16 <= bin.length; p += 16) {
        if (!startsWith(bin, MAGIC, p)) continue;
        const metaLen = u16le(bin, p + 8);
        const textLen = u32le(bin, p + 10);
        const start = p + 16;
        const end = start + metaLen + textLen;
        if (end > bin.length) continue;
        return {
            meta: utf8(bin.subarray(start, start + metaLen)),
            text: bin.subarray(start + metaLen, end)
        };
    }
    return null;
}

/**
 * Flatten a UF2 into the flash image it describes.
 *
 * Blocks are 512 bytes: magic, flags, target address, payload size, block
 * index/count, family id, then up to 476 bytes of payload and a trailing
 * magic. We honour the address so 16-byte alignment survives — the source
 * header is only findable because pxt aligns it in flash.
 *
 * @param {Uint8Array} bytes
 * @returns {{buf: Uint8Array, baseAddr: number}|null}
 */
export function uf2ToBin (bytes) {
    const blocks = [];
    for (let p = 0; p + 512 <= bytes.length; p += 512) {
        if (u32le(bytes, p) !== UF2_MAGIC_START0) continue;
        if (u32le(bytes, p + 4) !== UF2_MAGIC_START1) continue;
        if (u32le(bytes, p + 508) !== UF2_MAGIC_END) continue;
        const flags = u32le(bytes, p + 8);
        if (flags & UF2_FLAG_NOFLASH) continue;
        const addr = u32le(bytes, p + 12);
        const size = Math.min(u32le(bytes, p + 16), 476);
        blocks.push({addr, data: bytes.subarray(p + 32, p + 32 + size)});
    }
    if (!blocks.length) return null;
    blocks.sort((a, b) => a.addr - b.addr);
    const baseAddr = blocks[0].addr;
    const last = blocks[blocks.length - 1];
    const total = last.addr + last.data.length - baseAddr;
    // A UF2 that claims a gigabyte of flash is not a UF2 we want to
    // allocate for; every real one is a few hundred KB.
    if (total <= 0 || total > 64 * 1024 * 1024) return null;
    const buf = new Uint8Array(total).fill(0xFF);
    for (const b of blocks) buf.set(b.data, b.addr - baseAddr);
    return {buf, baseAddr};
}

/**
 * Decode the LSB-steganography MakeCode uses for its .png cartridges.
 *
 * The format (pxt's Util.encodeBlobAsync, MIT): the first pixel's three
 * colour channels carry `bpp` in their low bits; then a 36-byte header
 * — magic 0x59347a7d, blob length, and the number of scan lines appended
 * to hold an overflow — then the blob, `bpp` bits per channel, alpha
 * bytes skipped. The overflow lines, when present, hold whole bytes.
 *
 * @param {{width: number, height: number, data: Uint8Array|Uint8ClampedArray}} image RGBA pixels
 * @returns {Uint8Array} the embedded blob (LZMA-compressed project text)
 */
export function decodePngBlob (image) {
    const d = image.data;
    const bpp = (d[0] & 1) | ((d[1] & 1) << 1) | ((d[2] & 1) << 2);
    if (bpp === 0 || bpp > 5) throw new Error('PNG carries no MakeCode blob (bad bpp)');

    const decode = (ptr, bits, target) => {
        const mask = (1 << bits) - 1;
        let shift = 0;
        let acc = 0;
        let i = 0;
        while (i < target.length) {
            acc |= (d[ptr++] & mask) << shift;
            if ((ptr & 3) === 3) ptr++;                   // alpha byte carries nothing
            shift += bits;
            if (shift >= 8) {
                target[i++] = acc & 0xFF;
                acc >>= 8;
                shift -= 8;
            }
        }
        return ptr;
    };

    const HEADER_SIZE = 36;                               // divisible by 9, as pxt requires
    const header = new Uint8Array(HEADER_SIZE);
    let ptr = decode(4, bpp, header);
    if (u32le(header, 0) !== 0x59347A7D) throw new Error('PNG carries no MakeCode blob (bad magic)');
    const blobLen = u32le(header, 4);
    const addedLines = u32le(header, 8);
    const blob = new Uint8Array(blobLen);
    if (addedLines > 0) {
        const origPixels = (image.height - addedLines) * image.width;
        const capacity = (((origPixels - 1) * 3 * bpp) >> 3) - HEADER_SIZE;
        const head = new Uint8Array(Math.min(capacity, blobLen));
        decode(ptr, bpp, head);
        blob.set(head);
        if (blobLen > head.length) {
            const tail = new Uint8Array(blobLen - head.length);
            decode(origPixels * 4, 8, tail);
            blob.set(tail, head.length);
        }
    } else {
        decode(ptr, bpp, blob);
    }
    return blob;
}

/**
 * Turn an embed's {meta, text} into the project text, decompressing when
 * the header says to.
 */
function unwrap (embed) {
    const outer = JSON.parse(embed.meta);
    if (!outer.compression) {
        return {meta: outer, source: utf8(embed.text)};
    }
    if (outer.compression !== 'LZMA') {
        throw new Error(`MakeCode: compression "${outer.compression}" is not supported`);
    }
    const headerSize = outer.headerSize || outer.metaSize || 0;

    // The LZMA stream carries its own uncompressed size, and it is the
    // one to trust. `headerSize + textSize` looks like the same number
    // and is not: on a project with a non-ASCII character — a German
    // game name is enough — the sum is short of the byte count, and
    // capping the decoder at it silently truncates the tail. That looked
    // like "unterminated JSON", ten thousand lines from the cause.
    const plain = utf8(lzmaDecode(embed.text));

    // The split, however, IS in characters: headerSize counts the inner
    // header's CHARACTERS, which is how pxt's own reader slices it.
    const meta = Object.assign({}, outer);
    if (headerSize) {
        try {
            Object.assign(meta, JSON.parse(plain.slice(0, headerSize)));
        } catch (e) { /* the inner header is a nicety, not the payload */ }
    }
    return {meta, source: plain.slice(headerSize)};
}

/**
 * The one entry point: bytes in, project out.
 *
 * @param {Uint8Array} bytes the file the user dropped
 * @param {object} [opts]
 * @param {function} [opts.decodePng] `bytes => {width, height, data}` — the
 *   caller supplies pixel decoding, because the browser has canvas and
 *   Node has neither canvas nor an opinion. See png.js for the shared one.
 * @returns {Promise<{format: string, meta: object, source: string, files: object|null}>}
 */
export async function unpackMakeCodeSource (bytes, opts = {}) {
    const format = sniffFormat(bytes);
    let embed = null;

    if (format === 'hex') {
        embed = extractFromHex(utf8(bytes));
    } else if (format === 'uf2') {
        const bin = uf2ToBin(bytes);
        if (bin) embed = extractFromBin(bin.buf);
    } else if (format === 'png') {
        if (!opts.decodePng) throw new Error('MakeCode: a PNG needs a pixel decoder');
        const image = await opts.decodePng(bytes);
        const blob = decodePngBlob(image);
        // The cartridge blob is bare LZMA over the project text — no
        // magic-header envelope, because the PNG header did that job.
        const source = utf8(lzmaDecode(blob));
        return {format, meta: {}, source, files: parseFiles(source)};
    } else {
        embed = extractFromBin(bytes);
    }

    if (!embed) {
        const e = new Error(`No MakeCode source is embedded in this ${format} file`);
        e.code = 'NO_EMBEDDED_SOURCE';
        e.format = format;
        throw e;
    }

    const {meta, source} = unwrap(embed);
    return {format, meta, source, files: parseFiles(source)};
}

/**
 * The project text is a JSON map of files for every pxt target, but the
 * spec says the text is editor-defined — so a text that is not that map
 * is returned as-is rather than treated as an error.
 *
 * @param {string} source
 * @returns {object|null}
 */
export function parseFiles (source) {
    try {
        const obj = JSON.parse(source);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const ok = Object.values(obj).every(v => typeof v === 'string');
            if (ok) return obj;
        }
    } catch (e) { /* not JSON: a bare source file, which is legal */ }
    return null;
}

/**
 * Which MakeCode editor made this, in the terms the rest of the app
 * thinks in. `pxtTarget` is authoritative when present; the editor URL is
 * the fallback for older files.
 *
 * @param {object} meta
 * @returns {{target: string, editorUrl: string, name: string, version: string}}
 */
export function describeProject (meta = {}) {
    const editorUrl = meta.eURL || meta.editor || '';
    let target = meta.pxtTarget || '';
    if (!target && /arcade/.test(editorUrl)) target = 'arcade';
    if (!target && /microbit/.test(editorUrl)) target = 'microbit';
    if (!target && /calliope/.test(editorUrl)) target = 'calliopemini';
    return {
        target: target || 'unknown',
        editorUrl,
        name: meta.name || '',
        version: meta.eVER || ''
    };
}
