/**
 * An LZMA1 decoder, because MakeCode's embedded source is LZMA and every
 * JS implementation we could depend on is either unlicensed or a
 * megabyte of compressor we would never call.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * MakeCode writes the project source into the artefact it downloads —
 * .hex, .uf2, .png cartridge — as a blob whose `compression` field says
 * "LZMA" (see embedded-source.js for the container). Reading that blob
 * is the whole reason we can import someone's MakeCode project without
 * a network round-trip, so the decoder is load-bearing, not optional.
 *
 * DECODE ONLY. There is no compressor here and there should not be: we
 * never need to *write* an LZMA stream (our export path emits plain
 * uncompressed source, which pxt accepts — `compression` absent means
 * "the text is the text"), and a compressor is several times this size.
 *
 * Written against the LZMA specification (the LZMA SDK, from which the
 * algorithm is taken, is public domain), not adapted from any GPL
 * implementation — lite's licence rule applies to build-time code too.
 *
 * The stream shape we accept is the "alone" container that both
 * LZMA-JS (what pxt compresses with) and xz-utils' FORMAT_ALONE emit:
 *
 *   byte  0      properties = (pb * 5 + lp) * 9 + lc
 *   bytes 1..4   dictionary size, u32 LE (advisory; we size to output)
 *   bytes 5..12  uncompressed size, u64 LE (0xFF.. = unknown)
 *   bytes 13..   the range-coded payload
 *
 * TRAILING BYTES ARE NORMAL. The blob comes out of fixed-width hex
 * records or a UF2 page, so it is padded; decoding stops at the
 * declared size (or the end marker) and whatever follows is ignored.
 * A strict decoder — Python's, for one — calls that padding corrupt
 * input, which is exactly the trap this comment exists to spare the
 * next reader.
 *
 * @module
 */

const PROB_INIT = 1024;        // 2^11 / 2 — "no idea yet"
const MOVE_BITS = 5;
const MODEL_TOTAL_BITS = 11;
const TOP = 1 << 24;

const LEN_TO_POS_STATES = 4;
const MATCH_MIN_LEN = 2;
const END_POS_MODEL_INDEX = 14;
const FULL_DISTANCES = 1 << (END_POS_MODEL_INDEX >> 1);
const ALIGN_BITS = 4;
const NUM_STATES = 12;
const NUM_POS_SLOT_BITS = 6;

/** Range decoder over a byte array, with an explicit read pointer. */
class RangeDecoder {
    constructor (buf, pos) {
        this.buf = buf;
        this.pos = pos;
        this.range = 0xFFFFFFFF;
        this.code = 0;
        this.corrupt = false;
        // The first byte of the range-coded payload is always 0 and is
        // not part of the code word; a non-zero one means we are not
        // where we think we are in the stream.
        if (buf[this.pos] !== 0) this.corrupt = true;
        this.pos++;
        for (let i = 0; i < 4; i++) {
            this.code = ((this.code << 8) | (this.buf[this.pos++] | 0)) >>> 0;
        }
    }

    normalize () {
        if (this.range < TOP) {
            this.range = (this.range << 8) >>> 0;
            this.code = ((this.code << 8) | (this.buf[this.pos++] | 0)) >>> 0;
        }
    }

    /** One context-coded bit. `probs` is a Uint16Array, `i` the context. */
    decodeBit (probs, i) {
        const bound = ((this.range >>> MODEL_TOTAL_BITS) * probs[i]) >>> 0;
        let bit;
        if ((this.code >>> 0) < bound) {
            probs[i] += ((1 << MODEL_TOTAL_BITS) - probs[i]) >>> MOVE_BITS;
            this.range = bound;
            bit = 0;
        } else {
            probs[i] -= probs[i] >>> MOVE_BITS;
            this.code = (this.code - bound) >>> 0;
            this.range = (this.range - bound) >>> 0;
            bit = 1;
        }
        this.normalize();
        return bit;
    }

    /** `count` bits with no context at all — used for far distances. */
    decodeDirectBits (count) {
        let res = 0;
        for (let i = 0; i < count; i++) {
            this.range = this.range >>> 1;
            this.code = (this.code - this.range) >>> 0;
            const t = 0 - (this.code >>> 31);
            this.code = (this.code + (this.range & t)) >>> 0;
            if (this.code === this.range) this.corrupt = true;
            this.normalize();
            res = ((res << 1) + t + 1) >>> 0;
        }
        return res;
    }

    bitTreeDecode (probs, offset, numBits) {
        let m = 1;
        for (let i = 0; i < numBits; i++) m = (m << 1) + this.decodeBit(probs, offset + m);
        return m - (1 << numBits);
    }

    bitTreeReverseDecode (probs, offset, numBits) {
        let m = 1;
        let sym = 0;
        for (let i = 0; i < numBits; i++) {
            const bit = this.decodeBit(probs, offset + m);
            m = (m << 1) + bit;
            sym |= bit << i;
        }
        return sym;
    }

    /** The stream is over when the coder has consumed exactly its code word. */
    isFinished () {
        return this.code === 0;
    }
}

/** Match-length decoder: the choice/low/mid/high ladder, twice per stream. */
class LenDecoder {
    constructor () {
        this.choice = new Uint16Array(2).fill(PROB_INIT);
        this.lowCoder = new Uint16Array(16 * 8).fill(PROB_INIT);
        this.midCoder = new Uint16Array(16 * 8).fill(PROB_INIT);
        this.highCoder = new Uint16Array(256).fill(PROB_INIT);
    }

    decode (rc, posState) {
        if (rc.decodeBit(this.choice, 0) === 0) {
            return rc.bitTreeDecode(this.lowCoder, posState * 8, 3);
        }
        if (rc.decodeBit(this.choice, 1) === 0) {
            return 8 + rc.bitTreeDecode(this.midCoder, posState * 8, 3);
        }
        return 16 + rc.bitTreeDecode(this.highCoder, 0, 8);
    }
}

/**
 * Decode an LZMA "alone"-framed stream.
 *
 * @param {Uint8Array} input the stream, starting at the 13-byte header
 * @param {object} [opts]
 * @param {number} [opts.expectedSize] trust this size over the header's
 *   (MakeCode's container knows it independently, and a header that says
 *   "unknown" is then still decodable)
 * @returns {Uint8Array} the decompressed bytes
 */
export function lzmaDecode (input, opts = {}) {
    if (!input || input.length < 14) throw new Error('LZMA: stream too short');

    const props = input[0];
    if (props >= 9 * 5 * 5) throw new Error(`LZMA: bad properties byte 0x${props.toString(16)}`);
    const lc = props % 9;
    const rem = (props / 9) | 0;
    const lp = rem % 5;
    const pb = (rem / 5) | 0;

    // bytes 1..4 are the dictionary size: advisory only. We keep the
    // whole output in memory anyway, so the output IS the window.
    let size = 0;
    let sizeKnown = true;
    for (let i = 0; i < 8; i++) {
        const b = input[5 + i];
        if (b !== 0xFF) sizeKnown = sizeKnown && true;
        size += b * Math.pow(2, 8 * i);
    }
    if (size >= Math.pow(2, 64) - 1) sizeKnown = false;
    if (opts.expectedSize != null) {
        size = opts.expectedSize;
        sizeKnown = true;
    } else if (!Number.isSafeInteger(size)) {
        sizeKnown = false;
    }
    // An unknown size means "run to the end marker"; cap the buffer so a
    // malformed stream cannot eat the tab.
    const cap = sizeKnown ? size : Math.min(64 * 1024 * 1024, input.length * 64);

    const rc = new RangeDecoder(input, 13);

    const posStateMask = (1 << pb) - 1;
    const literalPosMask = (1 << lp) - 1;

    const litProbs = new Uint16Array(0x300 << (lc + lp)).fill(PROB_INIT);
    const isMatch = new Uint16Array(NUM_STATES << 4).fill(PROB_INIT);
    const isRep = new Uint16Array(NUM_STATES).fill(PROB_INIT);
    const isRepG0 = new Uint16Array(NUM_STATES).fill(PROB_INIT);
    const isRepG1 = new Uint16Array(NUM_STATES).fill(PROB_INIT);
    const isRepG2 = new Uint16Array(NUM_STATES).fill(PROB_INIT);
    const isRep0Long = new Uint16Array(NUM_STATES << 4).fill(PROB_INIT);
    const posSlotDecoder = new Uint16Array(LEN_TO_POS_STATES << NUM_POS_SLOT_BITS).fill(PROB_INIT);
    const posDecoders = new Uint16Array(1 + FULL_DISTANCES - END_POS_MODEL_INDEX).fill(PROB_INIT);
    const alignDecoder = new Uint16Array(1 << ALIGN_BITS).fill(PROB_INIT);
    const lenDecoder = new LenDecoder();
    const repLenDecoder = new LenDecoder();

    let out = new Uint8Array(Math.min(cap, 1 << 16) || 1);
    let outPos = 0;
    const push = byte => {
        if (outPos >= out.length) {
            const next = new Uint8Array(Math.min(cap, Math.max(out.length * 2, 1024)));
            next.set(out);
            out = next;
        }
        out[outPos++] = byte;
    };

    let state = 0;
    let rep0 = 0;
    let rep1 = 0;
    let rep2 = 0;
    let rep3 = 0;

    while (outPos < cap) {
        const posState = outPos & posStateMask;

        if (rc.decodeBit(isMatch, (state << 4) + posState) === 0) {
            // ── literal ──────────────────────────────────────────────
            const prevByte = outPos === 0 ? 0 : out[outPos - 1];
            const litState = ((outPos & literalPosMask) << lc) + (prevByte >>> (8 - lc));
            const probsOffset = 0x300 * litState;
            let symbol = 1;
            if (state >= 7) {
                // After a match, literals are coded against the byte the
                // match would have produced ("matched literal").
                let matchByte = out[outPos - rep0 - 1];
                do {
                    const matchBit = (matchByte >>> 7) & 1;
                    matchByte = (matchByte << 1) & 0xFF;
                    const bit = rc.decodeBit(litProbs, probsOffset + ((1 + matchBit) << 8) + symbol);
                    symbol = (symbol << 1) | bit;
                    if (matchBit !== bit) break;
                } while (symbol < 0x100);
            }
            while (symbol < 0x100) {
                symbol = (symbol << 1) | rc.decodeBit(litProbs, probsOffset + symbol);
            }
            push(symbol & 0xFF);
            state = state < 4 ? 0 : (state < 10 ? state - 3 : state - 6);
            continue;
        }

        let len;
        if (rc.decodeBit(isRep, state) !== 0) {
            // ── a repeat of an earlier distance ──────────────────────
            if (outPos === 0) throw new Error('LZMA: rep match before any output');
            if (rc.decodeBit(isRepG0, state) === 0) {
                if (rc.decodeBit(isRep0Long, (state << 4) + posState) === 0) {
                    state = state < 7 ? 9 : 11;
                    push(out[outPos - rep0 - 1]);
                    continue;
                }
            } else {
                let dist;
                if (rc.decodeBit(isRepG1, state) === 0) {
                    dist = rep1;
                } else {
                    if (rc.decodeBit(isRepG2, state) === 0) {
                        dist = rep2;
                    } else {
                        dist = rep3;
                        rep3 = rep2;
                    }
                    rep2 = rep1;
                }
                rep1 = rep0;
                rep0 = dist;
            }
            len = repLenDecoder.decode(rc, posState) + MATCH_MIN_LEN;
            state = state < 7 ? 8 : 11;
        } else {
            // ── a new distance ───────────────────────────────────────
            rep3 = rep2;
            rep2 = rep1;
            rep1 = rep0;
            len = lenDecoder.decode(rc, posState) + MATCH_MIN_LEN;
            state = state < 7 ? 7 : 10;

            const lenState = Math.min(len - MATCH_MIN_LEN, LEN_TO_POS_STATES - 1);
            const posSlot = rc.bitTreeDecode(posSlotDecoder, lenState << NUM_POS_SLOT_BITS, NUM_POS_SLOT_BITS);
            if (posSlot < 4) {
                rep0 = posSlot;
            } else {
                const numDirectBits = (posSlot >> 1) - 1;
                rep0 = (2 | (posSlot & 1)) << numDirectBits;
                if (posSlot < END_POS_MODEL_INDEX) {
                    rep0 += rc.bitTreeReverseDecode(posDecoders, rep0 - posSlot, numDirectBits);
                } else {
                    rep0 += rc.decodeDirectBits(numDirectBits - ALIGN_BITS) * (1 << ALIGN_BITS);
                    rep0 += rc.bitTreeReverseDecode(alignDecoder, 0, ALIGN_BITS);
                    rep0 = rep0 >>> 0;
                }
            }
            if (rep0 === 0xFFFFFFFF) break;                 // end-of-stream marker
            if (rep0 >= outPos) throw new Error('LZMA: distance points before the start of the stream');
        }

        for (let i = 0; i < len && outPos < cap; i++) push(out[outPos - rep0 - 1]);
    }

    if (rc.corrupt) throw new Error('LZMA: range coder desynchronised');
    return out.length === outPos ? out : out.slice(0, outPos);
}

export default lzmaDecode;
