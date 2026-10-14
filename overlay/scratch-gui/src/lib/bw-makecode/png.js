/**
 * A PNG decoder small enough to justify itself, for one job: getting the
 * raw pixels of a MakeCode .png "cartridge" so the project hidden in
 * their low bits can be read back out.
 *
 * WHY NOT CANVAS. The browser decodes PNGs already, and the UI could
 * hand us an ImageData. But then the importer would only be testable in
 * a browser, and the format work — which is where the bugs live — would
 * have no test at all. Inflate is the only hard part and both runtimes
 * ship it as `DecompressionStream`, so one decoder serves the app and
 * `node --test` alike.
 *
 * Scope is honest rather than complete: 8-bit non-interlaced PNGs, which
 * is everything `canvas.toDataURL("image/png")` has ever produced and so
 * everything MakeCode writes. A cartridge re-encoded by some other tool
 * has lost its payload to requantisation anyway.
 *
 * @module
 */

const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Channels per pixel for each PNG colour type. */
const CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4};

async function inflate (bytes) {
    if (typeof DecompressionStream !== 'function') {
        throw new Error('PNG: this runtime has no DecompressionStream');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const chunks = [];
    let total = 0;
    const reader = stream.getReader();
    for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return out;
}

/** Undo the per-scanline filters PNG applies before compression. */
function unfilter (raw, width, height, bpp) {
    const stride = width * bpp;
    const out = new Uint8Array(stride * height);
    let rp = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rp++];
        const line = out.subarray(y * stride, (y + 1) * stride);
        const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const cur = raw[rp++];
            const a = x >= bpp ? line[x - bpp] : 0;
            const b = prev ? prev[x] : 0;
            const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
            let val;
            switch (filter) {
            case 0: val = cur; break;
            case 1: val = cur + a; break;
            case 2: val = cur + b; break;
            case 3: val = cur + ((a + b) >> 1); break;
            case 4: {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                val = cur + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
                break;
            }
            default: throw new Error(`PNG: unknown filter ${filter} on line ${y}`);
            }
            line[x] = val & 0xFF;
        }
    }
    return out;
}

/**
 * @param {Uint8Array} bytes a whole .png file
 * @returns {Promise<{width: number, height: number, data: Uint8Array}>} RGBA pixels
 */
export async function decodePng (bytes) {
    if (!SIGNATURE.every((v, i) => bytes[i] === v)) throw new Error('PNG: bad signature');

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    let palette = null;
    let transparency = null;
    const idat = [];

    let p = 8;
    while (p + 8 <= bytes.length) {
        const len = u32be(bytes, p);
        const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
        const data = bytes.subarray(p + 8, p + 8 + len);
        if (type === 'IHDR') {
            width = u32be(data, 0);
            height = u32be(data, 4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'PLTE') {
            palette = data;
        } else if (type === 'tRNS') {
            transparency = data;
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        p += 12 + len;                                  // length + type + data + crc
    }

    if (!width || !height) throw new Error('PNG: no IHDR');
    if (bitDepth !== 8) throw new Error(`PNG: only 8-bit images are supported (got ${bitDepth})`);
    if (interlace) throw new Error('PNG: interlaced images are not supported');
    const channels = CHANNELS[colorType];
    if (!channels) throw new Error(`PNG: unsupported colour type ${colorType}`);

    let total = 0;
    for (const c of idat) total += c.length;
    const zlibBytes = new Uint8Array(total);
    let at = 0;
    for (const c of idat) {
        zlibBytes.set(c, at);
        at += c.length;
    }

    const raw = unfilter(await inflate(zlibBytes), width, height, channels);
    const out = new Uint8Array(width * height * 4);
    for (let i = 0, n = width * height; i < n; i++) {
        const s = i * channels;
        const d = i * 4;
        switch (colorType) {
        case 0:                                          // greyscale
            out[d] = out[d + 1] = out[d + 2] = raw[s];
            out[d + 3] = 0xFF;
            break;
        case 2:                                          // truecolour
            out[d] = raw[s];
            out[d + 1] = raw[s + 1];
            out[d + 2] = raw[s + 2];
            out[d + 3] = 0xFF;
            break;
        case 3: {                                        // indexed
            const idx = raw[s] * 3;
            if (!palette) throw new Error('PNG: indexed image without a palette');
            out[d] = palette[idx];
            out[d + 1] = palette[idx + 1];
            out[d + 2] = palette[idx + 2];
            out[d + 3] = transparency && raw[s] < transparency.length ? transparency[raw[s]] : 0xFF;
            break;
        }
        case 4:                                          // greyscale + alpha
            out[d] = out[d + 1] = out[d + 2] = raw[s];
            out[d + 3] = raw[s + 1];
            break;
        default:                                         // 6: truecolour + alpha
            out[d] = raw[s];
            out[d + 1] = raw[s + 1];
            out[d + 2] = raw[s + 2];
            out[d + 3] = raw[s + 3];
        }
    }
    return {width, height, data: out};
}

export default decodePng;
