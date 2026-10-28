// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The EV3 program file (`.rbf`, "Rudolf byte code file"): its header, its object headers and its
// byte codes (docs/EV3-RBF-VM.md §File). Facts from LEGO's EV3 Firmware Developer Kit §3 and LEGO's
// lms2012 source (read as a fact source, GPL-2; no code copied); the layouts are what the owner's
// hosted lmsasm writes (test/fixtures/ev3-rbf/).
//
//   image header  16 bytes: sign 'LEGO', image size u32, version u16, objects u16, global bytes u32
//   object header 12 bytes each: offset to instructions u32, owner object u16, trigger count u16,
//                 local bytes u32
//   byte codes    the rest; a SUBCALL's code starts with its parameter count and types
//
// An object is a VMTHREAD (owner 0, trigger 0), a SUBCALL (owner 0, trigger 1) or a BLOCK (owner ≠ 0:
// it runs on its owner's locals). Object ids count from 1.

export const IMAGE_HEADER_BYTES = 16;
export const OBJECT_HEADER_BYTES = 12;
export const SIGN = 'LEGO';

/** Sub-call parameter type byte [FDK §3.4]: bit 7 in, bit 6 out, low three bits the type. */
export const CALLPAR = Object.freeze({IN: 0x80, OUT: 0x40, TYPE: 0x07, DATA8: 0, DATA16: 1, DATA32: 2, DATAF: 3, STRING: 4});

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** A short, stable fingerprint of a program's bytes (FNV-1a), so a snapshot can name its program. */
const fingerprint = bytes => {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${bytes.length}:${h.toString(16).padStart(8, '0')}`;
};

const refuse = (status, detail) => ({ok: false, status, detail});

/**
 * Reads an `.rbf`.
 * @param {Uint8Array|number[]} input
 * @returns {{ok: true, program: object}|{ok: false, status: string, detail: string}}
 *   status: 'BAD_SIGN' (ours: the firmware's validator does not compare it), 'BAD_SIZE', 'NO_OBJECTS',
 *   'BAD_OBJECT' — the firmware's refusals of an image (VM_PROGRAM_VALIDATION) and ours where the
 *   file is shorter than it says
 */
export const parseRbf = input => {
    const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
    if (bytes.length < IMAGE_HEADER_BYTES) return refuse('BAD_SIZE', `an image header is ${IMAGE_HEADER_BYTES} bytes; the file has ${bytes.length}`);
    const sign = String.fromCharCode(...bytes.subarray(0, 4));
    if (sign !== SIGN) return refuse('BAD_SIGN', `the image starts '${sign}', not '${SIGN}'`);
    const size = u32(bytes, 4);
    const version = u16(bytes, 8);
    const count = u16(bytes, 10);
    const globalBytes = u32(bytes, 12);
    if (count === 0) return refuse('NO_OBJECTS', 'the image has no objects');
    const codeStart = IMAGE_HEADER_BYTES + count * OBJECT_HEADER_BYTES;
    // The firmware refuses an image whose size does not cover its headers; the file must hold the size it states.
    if (size < codeStart) return refuse('BAD_SIZE', `image size ${size} does not cover the ${codeStart} header bytes`);
    if (size > bytes.length) return refuse('BAD_SIZE', `the image says ${size} bytes; the file has ${bytes.length}`);
    const objects = [null];
    for (let id = 1; id <= count; id++) {
        const at = IMAGE_HEADER_BYTES + (id - 1) * OBJECT_HEADER_BYTES;
        // An offset of 0 means "the code right after the headers" (the firmware's validator sets it so).
        const offset = u32(bytes, at) || codeStart;
        const owner = u16(bytes, at + 4);
        const trigger = u16(bytes, at + 6);
        const localBytes = u32(bytes, at + 8);
        if (offset < codeStart || offset >= size) return refuse('BAD_OBJECT', `object ${id}'s code at ${offset} is outside ${codeStart}..${size - 1}`);
        if (owner > count || owner === id) return refuse('BAD_OBJECT', `object ${id} is owned by object ${owner}`);
        const kind = owner !== 0 ? 'block' : (trigger === 1 ? 'subcall' : 'vmthread');
        let params = null;
        let entry = offset;
        if (kind === 'subcall') {
            // NoOfPars, then a type byte per parameter (a string's is followed by its allocated size).
            params = [];
            let p = offset;
            const n = bytes[p++];
            for (let k = 0; k < n; k++) {
                if (p >= size) return refuse('BAD_OBJECT', `subcall ${id}'s parameter list runs past the image`);
                const type = bytes[p++];
                const par = {in: Boolean(type & CALLPAR.IN), out: Boolean(type & CALLPAR.OUT), type: type & CALLPAR.TYPE, size: 0};
                if (par.type === CALLPAR.STRING) par.size = bytes[p++];
                if (par.type > CALLPAR.STRING) return refuse('BAD_OBJECT', `subcall ${id} parameter ${k + 1} has type code ${par.type}`);
                params.push(par);
            }
            entry = p;
        }
        objects.push({id, offset, entry, owner, trigger, localBytes, kind, params});
    }
    return {ok: true, program: {
        size, version, globalBytes, objects, code: bytes.slice(0, size), fingerprint: fingerprint(bytes.subarray(0, size))
    }};
};
