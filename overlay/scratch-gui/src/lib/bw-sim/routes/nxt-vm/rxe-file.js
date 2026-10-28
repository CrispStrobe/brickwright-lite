// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Reading an NXT executable (`.rxe`, what NBC/NXC and NXT-G produce) into the shape the NXT VM
// (nxt-vm.js) runs, with the checks the brick makes before it runs one.
//
// CLEAN ROOM. The layout and the checks are FACTS read from LEGO's open-source NXT firmware 1.29
// (the `lego-1.29` tag of schodet/nxt-firmware: the command module's file-header reader, program
// activation and its type/status headers) and confirmed on files NBC wrote (the fixtures in
// test/fixtures/nxt-rxe/). Every fact is cited in docs/NXT-RXE-VM.md §File; no code, table or comment
// of the firmware is copied here. Written in our own structure: one pass that returns plain data.
//
// THE FILE, in order (little-endian; every section after the header starts on an even byte):
//   header       16 bytes "MindstormsNXT", a zero, then the format version: major, minor
//                11 UWORDs: dataspace entries, dataspace bytes, static bytes, defaults bytes,
//                where the dynamic defaults start in the defaults and how long they are, the memory
//                manager's head and tail dope vector, where the dope-vector array sits in the
//                dataspace, clump count, code words
//   TOC          4 bytes per dataspace entry: type, flags, UWORD offset (a cluster's "offset" is its
//                member count; an array is followed by its element's entries)
//   defaults     the static defaults (one per entry not flagged "default is zero", in TOC walk order),
//                then the dynamic defaults: the dope-vector array and the arrays' initial contents
//   clumps       4 bytes each: fire count, dependent count, UWORD first code word
//   dependents   each clump's dependent clump numbers, one byte each
//   code         UWORDs, to the end of the file
//
// REFUSALS mirror the brick's: a wrong format string or an incompatible version is ERR_VER; an
// inconsistent file (no clump, too many, no code, sections that do not add up to the file length,
// defaults that do not add up, a dope-vector array not where the header says, a program larger than
// the 32 KB pool, no clump ready to run) is ERR_FILE; an unknown type code is ERR_INSTR. Each refusal
// also says, in words, what was wrong.

/** Dataspace type codes (the firmware's TOC types). */
export const TC = Object.freeze({
    VOID: 0, UBYTE: 1, SBYTE: 2, UWORD: 3, SWORD: 4, ULONG: 5, SLONG: 6, ARRAY: 7, CLUSTER: 8, MUTEX: 9, FLOAT: 10
});
export const TC_NAMES = Object.freeze(['void', 'ubyte', 'sbyte', 'uword', 'sword', 'ulong', 'slong', 'array', 'cluster', 'mutex', 'float']);
/** Bytes an entry of each type takes where it sits (an array: its UWORD dope-vector index; a cluster: none of its own). */
export const TC_SIZE = Object.freeze([0, 1, 1, 2, 2, 4, 4, 2, 0, 4, 4]);
export const TC_LAST_INT = TC.SLONG;
export const isAggregate = t => t === TC.ARRAY || t === TC.CLUSTER;

/** TOC flag: this entry has no default in the file; it starts as zero. */
export const DEFAULT_IS_ZERO = 0x01;
/** "No dataspace argument": the firmware's marker for an unwired operand. */
export const NOT_A_DS_ID = 0xffff;
/** A dope vector's Offset for an array with no storage yet. */
export const NOT_AN_OFFSET = 0xffff;
/** A clump number that is no clump (a free mutex's owner, an empty queue's head). */
export const NOT_A_CLUMP = 0xff;

/** The firmware's VM status numbers (negative: errors), by name. */
export const VM_STATUS = Object.freeze({
    NO_ERR: 0, ERR_ARG: -1, ERR_INSTR: -2, ERR_FILE: -3, ERR_VER: -4, ERR_MEM: -5, ERR_BAD_PTR: -6,
    ERR_INVALID_PORT: -16, ERR_INVALID_FIELD: -17, ERR_INVALID_QUEUE: -18, ERR_INVALID_SIZE: -19, ERR_NO_PROG: -20,
    ERR_COMM_CHAN_NOT_READY: -32, ERR_COMM_CHAN_INVALID: -33, ERR_COMM_BUFFER_FULL: -34, ERR_COMM_BUS_ERR: -35,
    STAT_MSG_EMPTY_MAILBOX: 64, STAT_COMM_PENDING: 32
});

export const FORMAT_STRING = 'MindstormsNXT';
export const HEADER_BYTES = 16 + 22;
/** The oldest file format the 1.29 firmware runs: major 0, minor 4; the newest major its own (1). */
export const OLDEST_VERSION = Object.freeze([0, 4]);
export const FIRMWARE_MAJOR = 1;
/** The command module's memory pool: clump records, then the dataspace. */
export const POOL_BYTES = 32768;
/** One clump's run-time record in that pool (ARM7 layout of the firmware's clump record, our arithmetic). */
export const CLUMP_RECORD_BYTES = 28;
export const MAX_CLUMPS = 255;
/** A dope vector: Offset, ElemSize, Count, BackLink, Link — five UWORDs. */
export const DOPE_VECTOR_BYTES = 10;

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const even = n => n + (n % 2);

/** 32-bit FNV-1a, hex: a program's identity for snapshot/restore. */
export const fingerprint = bytes => {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
};

const refuse = (status, detail) => ({ok: false, status, code: VM_STATUS[status], detail});

/** The entry after `id` and everything it contains (an array's element entries, a cluster's members). */
export const nextEntry = (toc, id) => {
    let next = id + 1;
    if (next >= toc.length) return NOT_A_DS_ID;
    const t = toc[id].type;
    if (t === TC.ARRAY) next = nextEntry(toc, next);
    else if (t === TC.CLUSTER) {
        for (let k = 0; k < toc[id].offset && next !== NOT_A_DS_ID; k++) next = nextEntry(toc, next);
    }
    return next;
};

/**
 * Bytes one element of the array at `id` takes in its storage: its scalars laid out with their own
 * alignment, the whole padded to the largest (how the firmware sizes elements of arrays it grows).
 */
export const elementSize = (toc, id) => {
    let size = 0;
    let align = 0;
    let span = 1;
    for (let k = 0; k < span; k++) {
        const e = toc[id + 1 + k];
        if (!e) break;
        if (e.type === TC.CLUSTER) { span += e.offset; continue; }
        const s = TC_SIZE[e.type];
        if (s && size % s) size += s - (size % s);
        size += s;
        if (s > align) align = s;
    }
    if (align && size % align) size += align - (size % align);
    return size;
};

/**
 * Parse and check an `.rxe`. Refuses rather than throws (the bytes may be any file a host downloaded).
 * @param {Uint8Array|number[]} input
 * @returns {{ok: true, program: object} | {ok: false, status: string, code: number, detail: string}}
 */
export const parseRxe = input => {
    const b = input instanceof Uint8Array ? input : Uint8Array.from(input);
    if (b.length < HEADER_BYTES) return refuse('ERR_FILE', `${b.length} bytes: shorter than the ${HEADER_BYTES}-byte header`);
    for (let i = 0; i < FORMAT_STRING.length; i++) {
        if (b[i] !== FORMAT_STRING.charCodeAt(i)) return refuse('ERR_VER', 'no "MindstormsNXT" format string');
    }
    if (b[13] !== 0) return refuse('ERR_VER', 'the format string is not followed by a zero');
    const major = b[14];
    const minor = b[15];
    // The firmware compares major and minor each on its own (so 1.0 would be refused too).
    if (major < OLDEST_VERSION[0] || minor < OLDEST_VERSION[1] || major > FIRMWARE_MAJOR) {
        return refuse('ERR_VER', `file format ${major}.${minor}: the brick runs ${OLDEST_VERSION.join('.')} up to major ${FIRMWARE_MAJOR}`);
    }
    const h = [];
    for (let i = 0; i < 11; i++) h.push(u16(b, 16 + 2 * i));
    const [dsCount, dsSize, staticSize, defaultsSize, dynOffset, dynSize, mmHead, mmTail, dvOffset, clumpCount, codeWords] = h;
    if (clumpCount === 0 || clumpCount >= MAX_CLUMPS) return refuse('ERR_FILE', `${clumpCount} clumps (1..${MAX_CLUMPS - 1})`);
    if (codeWords === 0) return refuse('ERR_FILE', 'no code');
    let at = even(HEADER_BYTES);
    const tocAt = at;
    at = even(at + 4 * dsCount);
    const defaultsAt = at;
    at = even(at + defaultsSize);
    const clumpsAt = at;
    at += 4 * clumpCount;
    if (at > b.length) return refuse('ERR_FILE', 'the clump records run past the end of the file');
    for (let i = 0; i < clumpCount; i++) at += b[clumpsAt + 4 * i + 1];
    at = even(at);
    const codeAt = at;
    if (codeAt !== b.length - 2 * codeWords) {
        return refuse('ERR_FILE', `the sections end at byte ${codeAt}, but ${codeWords} code words need the code to start at ${b.length - 2 * codeWords}`);
    }
    const poolUse = Math.ceil(clumpCount * CLUMP_RECORD_BYTES / 4) * 4 + dsSize;
    if (poolUse > POOL_BYTES) return refuse('ERR_FILE', `clump records and dataspace need ${poolUse} bytes; the pool has ${POOL_BYTES}`);
    if (dsSize === 0) return refuse('ERR_FILE', 'an empty dataspace');

    const toc = [];
    for (let i = 0; i < dsCount; i++) {
        const o = tocAt + 4 * i;
        toc.push({type: b[o], flags: b[o + 1], offset: u16(b, o + 2)});
    }
    const clumps = [];
    let depAt = clumpsAt + 4 * clumpCount;
    for (let i = 0; i < clumpCount; i++) {
        const o = clumpsAt + 4 * i;
        const dependents = Array.from(b.subarray(depAt, depAt + b[o + 1]));
        depAt += b[o + 1];
        clumps.push({fireCount: b[o], codeStart: u16(b, o + 2), dependents});
    }
    clumps.forEach((c, i) => {
        c.codeEnd = i < clumpCount - 1 ? clumps[i + 1].codeStart - 1 : codeWords - 1;
    });
    if (clumps.some(c => c.codeStart >= codeWords)) return refuse('ERR_FILE', 'a clump starts past the end of the code');
    if (clumps.some(c => c.dependents.some(d => d >= clumpCount))) return refuse('ERR_FILE', 'a clump depends on a clump that does not exist');
    if (!clumps.some(c => c.fireCount === 0)) return refuse('ERR_FILE', 'no clump is ready to run (every fire count is above zero)');

    // The static defaults: walk the top-level entries, each scalar (and each array's dope-vector index)
    // takes its bytes from the defaults stream unless flagged "default is zero".
    const mem = new Array(staticSize).fill(0);
    const defaults = b.subarray(defaultsAt, defaultsAt + defaultsSize);
    let taken = 0;
    const inflate = id => {
        const e = toc[id];
        if (e.type > TC.FLOAT) return `entry ${id} has type code ${e.type}`;
        if (e.type === TC.CLUSTER) {
            let m = id + 1;
            for (let k = 0; k < e.offset; k++) {
                if (m >= toc.length) return `cluster ${id} runs past the TOC`;
                const why = inflate(m);
                if (why) return why;
                m = nextEntry(toc, m);
            }
            return null;
        }
        const size = TC_SIZE[e.type];
        if (e.offset + size > staticSize) return `entry ${id} lies outside the static dataspace`;
        if (e.flags & DEFAULT_IS_ZERO) return null;
        for (let k = 0; k < size; k++) mem[e.offset + k] = defaults[taken + k] ?? 0;
        taken += size;
        return null;
    };
    for (let id = 0; id !== NOT_A_DS_ID && id < toc.length; id = nextEntry(toc, id)) {
        const why = inflate(id);
        if (why) return refuse(why.startsWith('entry') && /type code/.test(why) ? 'ERR_INSTR' : 'ERR_FILE', why);
    }
    if (taken !== dynOffset || dynOffset + dynSize !== defaultsSize) {
        return refuse('ERR_FILE', `the static defaults take ${taken} bytes; the header says the dynamic ones start at ${dynOffset} (${dynSize} of ${defaultsSize})`);
    }

    // The dynamic defaults land at the static size: the dope-vector array and the arrays' contents.
    const dyn = new Array(dsSize).fill(0);
    for (let k = 0; k < dynSize; k++) dyn[staticSize + k] = defaults[dynOffset + k];
    const dvAt = dvOffset;
    if (dvAt + DOPE_VECTOR_BYTES > dsSize) return refuse('ERR_FILE', `the dope-vector array (at ${dvAt}) lies outside the dataspace`);
    const dvWord = (i, field) => dyn[dvAt + 10 * i + 2 * field] | (dyn[dvAt + 10 * i + 2 * field + 1] << 8);
    if (dvWord(0, 0) !== dvOffset) return refuse('ERR_FILE', `dope vector 0 says the array is at ${dvWord(0, 0)}, the header ${dvOffset}`);
    const dvCount = dvWord(0, 2);
    if (dvWord(0, 1) !== DOPE_VECTOR_BYTES || dvCount < 1 || dvAt + DOPE_VECTOR_BYTES * dvCount > dsSize) {
        return refuse('ERR_FILE', `a dope-vector array of ${dvCount} entries of ${dvWord(0, 1)} bytes does not fit`);
    }
    const arrays = [null];
    for (let i = 1; i < dvCount; i++) {
        const offset = dvWord(i, 0);
        const elemSize = dvWord(i, 1);
        const count = dvWord(i, 2);
        const bytes = elemSize * count;
        if (count > 0 && (offset === NOT_AN_OFFSET || offset + bytes > dsSize)) {
            return refuse('ERR_FILE', `dope vector ${i}: ${count} × ${elemSize} bytes at ${offset} lie outside the dataspace`);
        }
        arrays.push({elemSize, data: count > 0 ? dyn.slice(offset, offset + bytes) : []});
    }
    // The memory manager's list must reach its tail from its head without a loop.
    const seen = new Set();
    let tailSeen = false;
    for (let i = mmHead; i !== NOT_A_DS_ID; i = dvWord(i, 4)) {
        if (i >= dvCount || seen.has(i)) return refuse('ERR_FILE', `the memory manager's list breaks at dope vector ${i}`);
        seen.add(i);
        if (i === mmTail) tailSeen = true;
    }
    if (!tailSeen) return refuse('ERR_FILE', `the memory manager's list from ${mmHead} never reaches its tail ${mmTail}`);
    // Every array entry at the top level (and in top-level clusters) must name a dope vector.
    for (let id = 0; id < toc.length; id++) {
        const e = toc[id];
        if (e.type !== TC.ARRAY || e.offset >= staticSize) continue;
        if (!topLevel(toc, id)) continue;
        const dv = mem[e.offset] | (mem[e.offset + 1] << 8);
        if (dv === 0 || dv >= dvCount) return refuse('ERR_FILE', `array entry ${id} names dope vector ${dv} (1..${dvCount - 1})`);
    }

    const code = new Array(codeWords);
    for (let i = 0; i < codeWords; i++) code[i] = u16(b, codeAt + 2 * i);
    return {
        ok: true,
        program: {
            version: [major, minor], toc, staticSize, dataspaceSize: dsSize, staticDefaults: mem, arrays, clumps, code,
            fingerprint: fingerprint(b), bytes: b.length
        }
    };
};

/** Whether `id` is an entry with its own place in the static dataspace (not an array's element template). */
const topLevel = (toc, target) => {
    for (let id = 0; id !== NOT_A_DS_ID && id < toc.length; id = nextEntry(toc, id)) {
        if (id === target) return true;
        if (toc[id].type === TC.CLUSTER && id < target && target < nextEntry(toc, id)) return memberOfClusters(toc, id, target);
    }
    return false;
};

const memberOfClusters = (toc, cluster, target) => {
    let m = cluster + 1;
    for (let k = 0; k < toc[cluster].offset; k++) {
        if (m === target) return true;
        if (toc[m].type === TC.CLUSTER && m < target && target < nextEntry(toc, m)) return memberOfClusters(toc, m, target);
        m = nextEntry(toc, m);
    }
    return false;
};
