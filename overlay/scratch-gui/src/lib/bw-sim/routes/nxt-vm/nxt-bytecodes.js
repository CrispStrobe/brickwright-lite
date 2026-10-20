// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The NXT VM's instruction set and the IO-map fields a program reaches, as data (numbers and names).
// Read by nxt-vm.js; no logic of the interpreter lives here.
//
// CLEAN ROOM. The numbers are FACTS from LEGO's open-source NXT firmware 1.29 (`lego-1.29` tag of
// schodet/nxt-firmware: the bytecode header, the command module's header and IO-map tables), checked
// against what NBC emits for the fixtures in test/fixtures/nxt-rxe/. Cited in docs/NXT-RXE-VM.md;
// the names are ours (where they match the firmware's, it is because they name the same thing).

/** Opcodes 0x00..0x37 by name. */
export const OP = Object.freeze({
    ADD: 0x00, SUB: 0x01, NEG: 0x02, MUL: 0x03, DIV: 0x04, MOD: 0x05,
    AND: 0x06, OR: 0x07, XOR: 0x08, NOT: 0x09,
    CMNT: 0x0a, LSL: 0x0b, LSR: 0x0c, ASL: 0x0d, ASR: 0x0e, ROTL: 0x0f, ROTR: 0x10,
    CMP: 0x11, TST: 0x12, CMPSET: 0x13, TSTSET: 0x14,
    INDEX: 0x15, REPLACE: 0x16, ARRSIZE: 0x17, ARRBUILD: 0x18, ARRSUBSET: 0x19, ARRINIT: 0x1a,
    MOV: 0x1b, SET: 0x1c,
    FLATTEN: 0x1d, UNFLATTEN: 0x1e, NUMTOSTRING: 0x1f, STRINGTONUM: 0x20, STRCAT: 0x21, STRSUBSET: 0x22,
    STRTOBYTEARR: 0x23, BYTEARRTOSTR: 0x24,
    JMP: 0x25, BRCMP: 0x26, BRTST: 0x27, SYSCALL: 0x28, STOP: 0x29,
    FINCLUMP: 0x2a, FINCLUMPIMMED: 0x2b, ACQUIRE: 0x2c, RELEASE: 0x2d, SUBCALL: 0x2e, SUBRET: 0x2f,
    SETIN: 0x30, SETOUT: 0x31, GETIN: 0x32, GETOUT: 0x33,
    WAIT: 0x34, GETTICK: 0x35, SQRT: 0x36, ABS: 0x37
});
export const OP_NAMES = Object.freeze(Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k])));
/** The firmware's opcode count: anything at or above it is not an instruction. */
export const OPCODE_COUNT = 0x38;

/** Short ops (bit 11 of the instruction word set; bits 8–10 pick one; the low byte is a signed argument). */
export const SHORT_OPS = Object.freeze(['MOV', 'ACQUIRE', 'RELEASE', 'SUBCALL']);

/** Comparison codes (bits 8–10 of CMP, TST, BRCMP, BRTST). */
export const CC = Object.freeze({LT: 0, GT: 1, LTEQ: 2, GTEQ: 3, EQ: 4, NEQ: 5});

/** An instruction word's size nibble that means "the size is in the next word". */
export const VARIABLE_SIZE = 0x0e;
/** Instructions a clump runs before the next one in the queue gets a turn (the firmware's slice). */
export const SLICE_INSTRUCTIONS = 20;

/** Interpreter outcomes of one instruction (positive) — the firmware's own numbers. */
export const RUN = Object.freeze({NO_ERR: 0, CLUMP_DONE: 1, CLUMP_SUSPEND: 2, BREAKOUT_REQ: 3, STOP_REQ: 4, ROTATE_QUEUE: 5, TIMES_UP: 6});

/** Input IO-map fields per port (GETIN / SETIN): 6 per port. */
export const IN_FIELD = Object.freeze({TYPE: 0, MODE: 1, RAW: 2, NORMALIZED: 3, SCALED: 4, INVALID: 5});
export const IN_FIELDS_PER_PORT = 6;
export const INPUT_PORTS = 4;
/** Output IO-map fields per port (GETOUT / SETOUT): 15 per port. */
export const OUT_FIELD = Object.freeze({FLAGS: 0, MODE: 1, SPEED: 2, ACTUAL_SPEED: 3, TACHO_COUNT: 4, TACHO_LIMIT: 5,
    RUN_STATE: 6, TURN_RATIO: 7, REG_MODE: 8, OVERLOAD: 9, REG_P: 10, REG_I: 11, REG_D: 12, BLOCK_TACHO_COUNT: 13,
    ROTATION_COUNT: 14});
export const OUT_FIELDS_PER_PORT = 15;
export const OUTPUT_PORTS = 3;

/** The output module's update flags (the FLAGS field). PENDING keeps the IO map's run state from being refreshed. */
export const UPDATE = Object.freeze({MODE: 0x01, SPEED: 0x02, TACHO_LIMIT: 0x04, RESET_COUNT: 0x08, PID: 0x10,
    RESET_BLOCK_COUNT: 0x20, RESET_ROTATION_COUNT: 0x40, PENDING: 0x80});

/** What the brick's PID fields start at (the output module's defaults). */
export const DEFAULT_PID = Object.freeze({p: 96, i: 32, d: 32});

/** Input passes a sensor's data stays invalid after its type changes: 20 (sound sensors 300). */
export const INVALID_PASSES = 20;
export const INVALID_PASSES_SOUND = 300;
