/**
 * Get the Python back out of a micro:bit MicroPython .hex.
 *
 * WHY THIS IS THE CHEAPEST WIN IN THE WHOLE IMPORT STORY
 * -----------------------------------------------------
 * Our simulator IS a MicroPython interpreter — microbit-sim-pane flashes
 * it a `{filename: Uint8Array}` map of .py files. So a hex from
 * python.microbit.org or uflash does not need translating, mapping or
 * emulating: pull the script out and hand it to the sim, and someone
 * else's program runs. Everything else in bw-makecode is a translation
 * problem; this one is a file-format problem, and file formats end.
 *
 * TWO STORAGE FORMATS, because the micro:bit has two generations:
 *
 * - **V1 (and every universal hex that still carries a V1 section)**:
 *   the script is appended at flash 0x3E000 as "MP", a u16 LE length,
 *   then the UTF-8 source. That is the whole format.
 * - **V2**: MicroPython keeps a real filesystem — 128-byte chunks in a
 *   doubly-linked list, one byte of marker at the head and one byte of
 *   next-index at the tail, the first chunk of a file carrying the data
 *   end offset and the name. Format per bbcmicrobit/micropython's
 *   filesystem.c, as documented by microbit-fs (MIT).
 *
 * The V2 reader has to know where the filesystem region begins, because
 * chunk links are INDEXES relative to it, and that address officially
 * comes from a UICR table we would otherwise have to parse. We search
 * for it instead: the region is page-aligned, so there are only a few
 * dozen candidates, and the right one is the only one under which every
 * chunk's back-link agrees with its predecessor's index. A wrong guess
 * fails loudly on the first link, which is what makes the search safe.
 *
 * @module
 */

import {parseHexRecords} from './embedded-source.js';

const APPENDED_SCRIPT_ADDR = 0x3E000;
const APPENDED_MAGIC_0 = 0x4D;   // 'M'
const APPENDED_MAGIC_1 = 0x50;   // 'P'

const CHUNK_LEN = 128;
const CHUNK_MARKER = 0;
const CHUNK_END_OFFSET = 1;
const CHUNK_NAME_LEN = 2;
const CHUNK_TAIL = 127;
const MARKER_FREED = 0x00;
const MARKER_PERSISTENT = 0xFD;
const MARKER_FILE_START = 0xFE;
const MARKER_UNUSED = 0xFF;
const MAX_CHUNKS = 256 - 4;

/** Universal-hex block-start device identifiers. */
const DEVICE_V1 = [0x9900, 0x9901];
const DEVICE_V2 = [0x9903, 0x9904];

const utf8 = bytes => new TextDecoder('utf-8').decode(bytes);

/**
 * Fold Intel HEX records into a sparse address → byte map.
 *
 * Universal hexes interleave two devices' images, so a caller that wants
 * one generation's flash asks for it by name; without a filter every
 * section is merged, which is right for a plain single-device hex.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {'v1'|'v2'|null} [opts.device] which universal-hex section to keep
 * @returns {Map<number, number>} address → byte
 */
export function buildFlashMap (text, opts = {}) {
    const want = opts.device === 'v1' ? DEVICE_V1 : (opts.device === 'v2' ? DEVICE_V2 : null);
    const map = new Map();
    let upper = 0;
    let inWantedBlock = true;
    for (const rec of parseHexRecords(text)) {
        switch (rec.type) {
        case 0x00:                                   // data
        case 0x0D:                                   // universal hex: custom data
            if (!inWantedBlock) break;
            for (let i = 0; i < rec.data.length; i++) map.set(upper + rec.addr + i, rec.data[i]);
            break;
        case 0x0C:                                   // universal hex: padded data — no content
            break;
        case 0x02:                                   // extended segment address
            upper = ((rec.data[0] << 8) | rec.data[1]) * 16;
            break;
        case 0x04:                                   // extended linear address
            upper = ((rec.data[0] << 8) | rec.data[1]) * 0x10000;
            break;
        case 0x0A: {                                 // universal hex: block start
            const device = (rec.data[0] << 8) | rec.data[1];
            inWantedBlock = !want || want.includes(device);
            break;
        }
        case 0x0B:                                   // universal hex: block end
            inWantedBlock = true;
            break;
        default:
            break;
        }
    }
    return map;
}

/** Read `len` bytes from a sparse map, or null if any byte is missing. */
function readRun (map, addr, len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const b = map.get(addr + i);
        if (b === undefined) return null;
        out[i] = b;
    }
    return out;
}

/**
 * The V1 story: "MP", u16 LE length, source — at a fixed address.
 *
 * @param {Map<number, number>} map
 * @returns {string|null}
 */
export function readAppendedScript (map) {
    const header = readRun(map, APPENDED_SCRIPT_ADDR, 4);
    if (!header || header[0] !== APPENDED_MAGIC_0 || header[1] !== APPENDED_MAGIC_1) return null;
    const len = header[2] | (header[3] << 8);
    if (!len) return null;
    const body = readRun(map, APPENDED_SCRIPT_ADDR + 4, len);
    if (!body) return null;
    return utf8(body);
}

/** Every 128-aligned address that holds a plausible file-start chunk. */
function findFileStarts (map) {
    const addrs = [...map.keys()].filter(a => a % CHUNK_LEN === 0 && map.get(a) === MARKER_FILE_START);
    return addrs.filter(a => {
        const nameLen = map.get(a + CHUNK_NAME_LEN);
        if (!nameLen || nameLen > 120) return false;
        const name = readRun(map, a + 3, nameLen);
        if (!name) return false;
        return [...name].every(c => c >= 0x20 && c < 0x7F);
    }).sort((x, y) => x - y);
}

/**
 * Walk the chunk list for one file, given a candidate region base.
 * Returns null — never a partial file — when the links disagree, because
 * that disagreement is exactly the signal that `base` is wrong.
 */
function walkFile (map, base, startAddr) {
    const chunkAt = index => readRun(map, base + (index - 1) * CHUNK_LEN, CHUNK_LEN);
    const start = readRun(map, startAddr, CHUNK_LEN);
    if (!start) return null;
    const endOffset = start[CHUNK_END_OFFSET];
    const nameLen = start[CHUNK_NAME_LEN];
    const name = utf8(start.subarray(3, 3 + nameLen));

    let chunk = start;
    let index = ((startAddr - base) / CHUNK_LEN) + 1;
    if (!Number.isInteger(index) || index < 1 || index > MAX_CHUNKS) return null;
    let dataStart = 3 + nameLen;
    const parts = [];
    for (let guard = 0; guard <= MAX_CHUNKS; guard++) {
        const next = chunk[CHUNK_TAIL];
        if (next === MARKER_UNUSED) {
            parts.push(chunk.subarray(dataStart, 1 + endOffset));
            let total = 0;
            for (const p of parts) total += p.length;
            const data = new Uint8Array(total);
            let at = 0;
            for (const p of parts) {
                data.set(p, at);
                at += p.length;
            }
            return {name, data};
        }
        parts.push(chunk.subarray(dataStart, CHUNK_TAIL));
        const nextChunk = chunkAt(next);
        if (!nextChunk || nextChunk[CHUNK_MARKER] !== index) return null;
        chunk = nextChunk;
        index = next;
        dataStart = 1;
    }
    return null;
}

/**
 * Read the V2 MicroPython filesystem out of a flash map.
 *
 * @param {Map<number, number>} map
 * @returns {Object<string, string>|null} filename → contents
 */
export function readFilesystem (map) {
    const starts = findFileStarts(map);
    if (!starts.length) return null;

    // Candidate region bases: page-aligned, at or below the first file
    // start, within the reach of a 254-chunk index space.
    const first = starts[0];
    const candidates = [];
    for (let base = first; base >= Math.max(0, first - CHUNK_LEN * MAX_CHUNKS); base -= 0x1000) {
        candidates.push(base);
    }

    let best = null;
    for (const base of candidates) {
        const files = {};
        let ok = true;
        for (const addr of starts) {
            const file = walkFile(map, base, addr);
            if (!file) {
                ok = false;
                break;
            }
            files[file.name] = utf8(file.data);
        }
        if (ok && Object.keys(files).length) {
            best = files;
            break;
        }
    }
    return best;
}

/**
 * The entry point: a micro:bit hex in, the Python it carries out.
 *
 * @param {Uint8Array|string} hex
 * @returns {{files: Object<string, string>, variant: 'appended'|'filesystem'}|null}
 *   null when the hex holds no user script at all — a bare MicroPython
 *   runtime, or a MakeCode hex, both of which are legitimate files that
 *   simply are not this.
 */
export function extractMicroPython (hex) {
    const text = typeof hex === 'string' ? hex : utf8(hex);

    // V1 first: it is a fixed address and a 4-byte check, and universal
    // hexes that still carry a V1 section answer here without the search.
    for (const device of ['v1', null]) {
        const script = readAppendedScript(buildFlashMap(text, {device}));
        if (script) return {files: {'main.py': script}, variant: 'appended'};
    }

    for (const device of ['v2', null]) {
        const files = readFilesystem(buildFlashMap(text, {device}));
        if (files) return {files, variant: 'filesystem'};
    }

    return null;
}

export default extractMicroPython;
