// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Loading an `.rcx` image into the shape the RCX VM runs.
//
// The container is NQC's, not the brick's: a header, one chunk per task and
// subroutine, then a symbol table. Its layout is already established (by
// measurement) and parsed in lib/rcx/rcx-protocol.js `parseRcxImage`, which
// the IR download uses to send exactly these chunks to a real RCX — so the VM
// reads the SAME parse the tower path sends, and the two cannot drift. What a
// real brick receives is per chunk: `start task download` / `start subroutine
// download` with the chunk number and length, then the bytecode. Variables
// are not downloaded at all; the symbol table only names them for listings
// (and here, for `getVariable(name)`).
//
// This module adds what the VM needs on top: chunks filed by number with the
// firmware's limits enforced (10 tasks, 8 subroutines on RCX/RCX2), task 0
// present (NQC always numbers `main` 0, and the brick starts task 0 when Run
// is pressed), the target refused if it is not an RCX, and a fingerprint so a
// snapshot cannot be restored onto a different program.

import {parseRcxImage} from '../../../rcx/rcx-protocol.js';

export const MAX_TASKS = 10;
export const MAX_SUBROUTINES = 8;

/** Target word at offset 10 of the container, as NQC writes it for `-T`. */
export const RCX_TARGET = Object.freeze({RCX: 0, CM: 1, SCOUT: 2, RCX2: 3});

/** 32-bit FNV-1a, hex. Identity of a program for snapshot/restore. */
export function fingerprint (bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/**
 * @typedef {object} RcxProgram
 * @property {number} target                      RCX_TARGET value
 * @property {Array<Uint8Array|null>} tasks       index = task number
 * @property {Array<Uint8Array|null>} subroutines index = subroutine number
 * @property {Array<{kind: string, index: number, name: string}>} symbols
 * @property {string} fingerprint
 */

/**
 * Parse and validate an image. Refuses rather than throws: the bytes may be a
 * file a user picked.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ok: true, program: RcxProgram} | {ok: false, error: string, detail: string}}
 */
export function loadRcxProgram (bytes) {
    const image = parseRcxImage(bytes);
    if (!image.ok) return {ok: false, error: image.error, detail: image.detail};
    if (image.target !== RCX_TARGET.RCX && image.target !== RCX_TARGET.RCX2) {
        return {ok: false, error: 'UNSUPPORTED_TARGET',
            detail: `image target ${image.target} is not RCX (0) or RCX2 (3); ` +
                'CyberMaster and Scout run a different firmware this VM does not model'};
    }
    const tasks = new Array(MAX_TASKS).fill(null);
    const subroutines = new Array(MAX_SUBROUTINES).fill(null);
    for (const chunk of image.chunks) {
        const table = chunk.kind === 'task' ? tasks : subroutines;
        if (chunk.number >= table.length) {
            return {ok: false, error: 'TOO_MANY_CHUNKS',
                detail: `${chunk.kind} ${chunk.number}: the firmware has ${table.length} slots`};
        }
        if (table[chunk.number]) {
            return {ok: false, error: 'DUPLICATE_CHUNK',
                detail: `${chunk.kind} ${chunk.number} appears twice`};
        }
        table[chunk.number] = chunk.data.slice();
    }
    if (!tasks[0]) {
        return {ok: false, error: 'NO_MAIN', detail: 'the image has no task 0 (main)'};
    }
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return {ok: true, program: {
        target: image.target,
        tasks,
        subroutines,
        symbols: image.symbols.map(s => ({kind: s.kind, index: s.index, name: s.name})),
        fingerprint: fingerprint(raw)
    }};
}
