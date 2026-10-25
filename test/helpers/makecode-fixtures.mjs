/**
 * Writers for the MakeCode / MicroPython containers, so the readers in
 * overlay/.../bw-makecode can be tested against something other than the
 * three binaries checked into test/fixtures.
 *
 * These are TEST-ONLY inverses. The app never writes a .png cartridge, a
 * MicroPython filesystem or an appended script — but a reader with no
 * inverse is a reader whose failure mode is silence, and the .png and
 * filesystem paths in particular have no committed fixture (a real
 * cartridge is a quarter-megabyte of someone's artwork, and a real V2
 * Python hex is 1.8 MB). Round-tripping them here is what keeps those
 * two paths honest.
 *
 * @module
 */

const u32le = v => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];

// ─── PNG ────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

const crc32 = bytes => {
    let c = 0xFFFFFFFF;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
};

const adler32 = bytes => {
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
};

/** zlib stream using stored (uncompressed) deflate blocks — no compressor needed. */
const zlibStored = data => {
    const out = [0x78, 0x01];
    for (let p = 0; p < data.length || p === 0; p += 65535) {
        const chunk = data.subarray(p, p + 65535);
        const last = p + 65535 >= data.length ? 1 : 0;
        out.push(last, chunk.length & 0xFF, (chunk.length >> 8) & 0xFF,
            ~chunk.length & 0xFF, (~chunk.length >> 8) & 0xFF);
        for (const b of chunk) out.push(b);
        if (last) break;
    }
    const ad = adler32(data);
    out.push((ad >>> 24) & 0xFF, (ad >>> 16) & 0xFF, (ad >>> 8) & 0xFF, ad & 0xFF);
    return new Uint8Array(out);
};

const chunk = (type, data) => {
    const typeBytes = [...type].map(c => c.charCodeAt(0));
    const body = new Uint8Array(typeBytes.length + data.length);
    body.set(typeBytes);
    body.set(data, typeBytes.length);
    const crc = crc32(body);
    return [
        (data.length >>> 24) & 0xFF, (data.length >>> 16) & 0xFF,
        (data.length >>> 8) & 0xFF, data.length & 0xFF,
        ...body,
        (crc >>> 24) & 0xFF, (crc >>> 16) & 0xFF, (crc >>> 8) & 0xFF, crc & 0xFF
    ];
};

/**
 * Encode RGBA pixels as an 8-bit non-interlaced PNG.
 *
 * @param {{width: number, height: number, data: Uint8Array}} image
 * @returns {Uint8Array}
 */
export function encodePng (image) {
    const {width, height, data} = image;
    const raw = new Uint8Array((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;                    // filter: none
        raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
    }
    const ihdr = new Uint8Array([
        (width >>> 24) & 0xFF, (width >>> 16) & 0xFF, (width >>> 8) & 0xFF, width & 0xFF,
        (height >>> 24) & 0xFF, (height >>> 16) & 0xFF, (height >>> 8) & 0xFF, height & 0xFF,
        8, 6, 0, 0, 0
    ]);
    return new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        ...chunk('IHDR', ihdr),
        ...chunk('IDAT', zlibStored(raw)),
        ...chunk('IEND', new Uint8Array(0))
    ]);
}

/**
 * Hide a blob in an image the way MakeCode's cartridges do: bpp low bits
 * per colour channel, alpha skipped, a 36-byte header after the first
 * pixel. The inverse of decodePngBlob.
 *
 * @param {{width: number, height: number, data: Uint8Array}} image mutated in place
 * @param {Uint8Array} blob
 */
export function encodePngBlob (image, blob) {
    const HEADER_SIZE = 36;
    const d = image.data;
    const needed = HEADER_SIZE + blob.length;
    const usable = (image.width * image.height - 1) * 3;
    let bpp = 1;
    while (bpp < 4 && usable * bpp < needed * 8) bpp++;
    if (((usable * bpp) >> 3) < needed) throw new Error('fixture image too small for blob');

    const write = (ptr, bits, bytes) => {
        const mask = (1 << bits) - 1;
        let shift = 0;
        let dp = 0;
        let v = bytes[dp++];
        for (;;) {
            let outBits = (v >> shift) & mask;
            const left = 8 - shift;
            let stop = false;
            if (left <= bits) {
                if (dp >= bytes.length) {
                    if (left === 0) break;
                    stop = true;
                }
                v = bytes[dp++] | 0;
                outBits |= (v << left) & mask;
                shift = bits - left;
            } else {
                shift += bits;
            }
            d[ptr] = ((d[ptr] & ~mask) | outBits) & 0xFF;
            ptr++;
            if ((ptr & 3) === 3) d[ptr++] = 0xFF;
            if (stop) break;
        }
        return ptr;
    };

    const header = new Uint8Array([
        ...u32le(0x59347A7D), ...u32le(blob.length), ...u32le(0),
        ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0)
    ]);
    write(0, 1, new Uint8Array([bpp]));
    const after = write(4, bpp, header);
    write(after, bpp, blob);
    for (let p = 3; p < d.length; p += 4) if (d[p] !== 0xFF) d[p] = 0xFF;
}

// ─── Intel HEX ──────────────────────────────────────────────────────────

const hexRecord = (addr, type, data) => {
    const bytes = [data.length, (addr >> 8) & 0xFF, addr & 0xFF, type, ...data];
    const sum = bytes.reduce((a, b) => a + b, 0);
    const crc = ((~sum) + 1) & 0xFF;
    return `:${[...bytes, crc].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
};

/** Records that place `bytes` at `addr`, with the extended-address record. */
function dataRecords (addr, bytes) {
    const lines = [];
    let upper = -1;
    for (let p = 0; p < bytes.length; p += 16) {
        const at = addr + p;
        const hi = at >>> 16;
        if (hi !== upper) {
            upper = hi;
            lines.push(hexRecord(0, 0x04, [(hi >> 8) & 0xFF, hi & 0xFF]));
        }
        lines.push(hexRecord(at & 0xFFFF, 0x00, [...bytes.subarray(p, p + 16)]));
    }
    return lines;
}

/**
 * A micro:bit V1-style hex with a Python script appended at 0x3E000.
 *
 * @param {string} script
 * @returns {string}
 */
export function makeAppendedScriptHex (script) {
    const code = new TextEncoder().encode(script);
    const body = new Uint8Array(4 + code.length);
    body[0] = 0x4D;                                      // 'M'
    body[1] = 0x50;                                      // 'P'
    body[2] = code.length & 0xFF;
    body[3] = (code.length >> 8) & 0xFF;
    body.set(code, 4);
    return [
        ...dataRecords(0x0000, new Uint8Array(16).fill(0)),   // a little "firmware"
        ...dataRecords(0x3E000, body),
        ':00000001FF',
        ''
    ].join('\n');
}

/**
 * A micro:bit V2-style hex carrying a MicroPython filesystem.
 *
 * Chunks are 128 bytes: head marker (previous chunk index, or 0xFE for a
 * file start), tail byte pointing at the next index, and for a file start
 * an end-offset and the filename between them.
 *
 * @param {Object<string, string>} files
 * @param {number} [base] where the filesystem region begins
 * @returns {string}
 */
export function makeFilesystemHex (files, base = 0x6D000) {
    const CHUNK = 128;
    const chunks = [];                                   // index 1 = chunks[0]
    for (const [name, content] of Object.entries(files)) {
        const nameBytes = new TextEncoder().encode(name);
        const data = new TextEncoder().encode(content);
        const first = 3 + nameBytes.length;
        const perChunk = CHUNK - 2;
        let dataAt = 0;
        let firstChunk = true;
        const own = [];
        while (dataAt < data.length || firstChunk) {
            const c = new Uint8Array(CHUNK).fill(0xFF);
            const start = firstChunk ? first : 1;
            const room = CHUNK - 1 - start;
            const slice = data.subarray(dataAt, dataAt + room);
            c.set(slice, start);
            if (firstChunk) {
                c[0] = 0xFE;
                c[2] = nameBytes.length;
                c.set(nameBytes, 3);
                firstChunk = false;
            }
            own.push({chunk: c, used: start + slice.length});
            dataAt += slice.length;
            if (!slice.length) break;
        }
        const startIndex = chunks.length + 1;
        own.forEach((entry, i) => {
            const index = startIndex + i;
            if (i > 0) entry.chunk[0] = index - 1;        // back-link
            if (i < own.length - 1) entry.chunk[CHUNK - 1] = index + 1;
            chunks.push(entry.chunk);
        });
        // The end offset lives in the FIRST chunk and describes the LAST.
        chunks[startIndex - 1][1] = own[own.length - 1].used - 1;
        void perChunk;
    }
    const region = new Uint8Array(chunks.length * CHUNK);
    chunks.forEach((c, i) => region.set(c, i * CHUNK));
    return [...dataRecords(base, region), ':00000001FF', ''].join('\n');
}
