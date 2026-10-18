// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// RCX standard-firmware bytecode: the opcode table, the operand sources and
// the four branch-offset encodings, as data. Read by rcx-vm.js; no logic of
// the interpreter lives here.
//
// CLEAN ROOM (owner decision D4, docs/ROBOT-LAB-ARCHITECTURE.md). Sources:
//
//   1. LEGO MINDSTORMS RCX 2.0 SDK, "RCX 2.0 Firmware Command Overview"
//      (LEGO, 2000/2001; the bytecode reference of the RCX 2.0 SDK — title
//      and edition as remembered, not verified). Used FROM MEMORY: no copy
//      was available to this work and none was downloaded. What is taken from it is the shape
//      of the instruction set — opcode numbers, the "source type + value"
//      operand model, the output/direction/mode bit fields, sensor type and
//      mode codes, 32 globals + 16 task locals on RCX2, 10 tasks, 8
//      subroutines, timers in 100 ms and (RCX2) 10 ms ticks. Every number
//      below that came from memory was then checked against (2).
//   2. The in-repo NQC 3.2 r1 (overlay/scratch-gui/src/lib/nqc-wasm, MPL-2.0,
//      a public tool) run with `-L`, which prints a listing of each emitted
//      instruction with its mnemonic and bytes. That listing is how the
//      operand layouts and branch encodings here were established: by
//      compiling programs whose control flow is known and reading where each
//      branch lands. NQC's SOURCE was not read. Where the listing and the
//      bytes disagree (it prints some unsigned forward offsets as negative),
//      the bytes win, because the jump target is fixed by the program text.
//   3. The public NQC Programmer's Guide (Dave Baum, version 3.x) for the
//      meaning of the API NQC exposes (Wait in 10 ms, Random(n) in 0..n,
//      SENSOR_CELSIUS in tenths, sensor modes), from memory.
//
// No GPL firmware, brickEmu or legOS/brickOS code was consulted.
//
// The `-L` mnemonic is kept for each opcode so a VM error can name what it
// stopped at in the same words a developer sees in `nqc -L`.

/**
 * @typedef {object} OpcodeInfo
 * @property {string} name       readable name (used in errors and events)
 * @property {string} mnemonic   NQC `-L` listing mnemonic
 * @property {number} length     instruction length in bytes, opcode included
 * @property {boolean} [unsupported] known RCX2 opcode the VM deliberately does
 *                               not implement yet (events, access control,
 *                               global output control) — refused by name
 */

/** @type {Map<number, OpcodeInfo>} */
export const OPCODES = new Map([
    // Outputs. Output list = bits 0..2 (A, B, C).
    [0x13, {name: 'SetPower', mnemonic: 'pwr', length: 4}],          // list, src, val8
    [0xe1, {name: 'SetDirection', mnemonic: 'dir', length: 2}],      // bits 7..6 | list
    [0x21, {name: 'SetOutputMode', mnemonic: 'out', length: 2}],     // bits 7..6 | list
    // Sensors.
    [0x32, {name: 'SetSensorType', mnemonic: 'sent', length: 3}],    // sensor, type
    [0x42, {name: 'SetSensorMode', mnemonic: 'senm', length: 3}],    // sensor, mode<<5 | slope
    [0xd1, {name: 'ClearSensor', mnemonic: 'senz', length: 2}],      // sensor
    // Time.
    [0x43, {name: 'Wait', mnemonic: 'wait', length: 4}],             // src, val16 (10 ms)
    [0xa1, {name: 'ClearTimer', mnemonic: 'tmrz', length: 2}],       // timer
    // Variables: var, src, val16.
    [0x14, {name: 'SetVar', mnemonic: 'setv', length: 5}],
    [0x24, {name: 'AddVar', mnemonic: 'sumv', length: 5}],
    [0x34, {name: 'SubVar', mnemonic: 'subv', length: 5}],
    [0x44, {name: 'DivVar', mnemonic: 'divv', length: 5}],
    [0x54, {name: 'MulVar', mnemonic: 'mulv', length: 5}],
    [0x64, {name: 'SgnVar', mnemonic: 'sgnv', length: 5}],
    [0x74, {name: 'AbsVar', mnemonic: 'absv', length: 5}],
    [0x84, {name: 'AndVar', mnemonic: 'andv', length: 5}],
    [0x94, {name: 'OrVar', mnemonic: 'orv', length: 5}],
    // RCX2 generic set: dstType, dstVal, srcType, srcVal16.
    [0x05, {name: 'Set', mnemonic: 'set', length: 6}],
    // Control flow.
    [0x85, {name: 'CheckBranch', mnemonic: 'chk', length: 7}],       // rel<<6|src1, src2, val16, val8, off8
    [0x95, {name: 'CheckBranchFar', mnemonic: 'chkl', length: 8}],   // ... off16
    [0x27, {name: 'Jump', mnemonic: 'jmp', length: 2}],
    [0x72, {name: 'JumpFar', mnemonic: 'jmpl', length: 3}],
    [0xf2, {name: 'DecVarJumpNeg', mnemonic: 'decvjn', length: 3}],  // var, off
    [0xf3, {name: 'DecVarJumpNegFar', mnemonic: 'decvjnl', length: 4}],
    [0x82, {name: 'SetLoopCounter', mnemonic: 'loops', length: 3}],  // src, val8 (RCX 1 repeat)
    [0x37, {name: 'DecLoopCounter', mnemonic: 'loopc', length: 2}],  // off8
    [0x17, {name: 'CallSub', mnemonic: 'calls', length: 2}],
    // Tasks.
    [0x71, {name: 'StartTask', mnemonic: 'start', length: 2}],
    [0x81, {name: 'StopTask', mnemonic: 'stop', length: 2}],
    [0x50, {name: 'StopAllTasks', mnemonic: 'stop', length: 1}],
    [0xd7, {name: 'SetPriority', mnemonic: 'setp', length: 2}],
    // Sound, display, messages, datalog, housekeeping: recorded as events.
    [0x51, {name: 'PlaySound', mnemonic: 'plays', length: 2}],
    [0x23, {name: 'PlayTone', mnemonic: 'playt', length: 4}],        // freq16, duration8 (10 ms)
    [0x33, {name: 'SelectDisplay', mnemonic: 'view', length: 4}],    // src, val16
    [0xe5, {name: 'SetUserDisplay', mnemonic: 'disp', length: 6}],   // 0, precision, src, val16
    [0xb2, {name: 'SendMessage', mnemonic: 'msg', length: 3}],       // src, val8
    [0x90, {name: 'ClearMessage', mnemonic: 'msgz', length: 1}],
    [0x52, {name: 'CreateDatalog', mnemonic: 'logz', length: 3}],    // size16
    [0x62, {name: 'AddToDatalog', mnemonic: 'log', length: 3}],      // src, val8
    [0x22, {name: 'SetWatch', mnemonic: 'setw', length: 3}],         // hours, minutes
    [0xb1, {name: 'SetSleepTime', mnemonic: 'tout', length: 2}],
    [0x31, {name: 'SetTxPower', mnemonic: 'txs', length: 2}],
    // Known RCX2 opcodes NQC emits for events, acquire/monitor and global
    // output control. Recognised so the error says WHAT is missing, rather
    // than "unknown opcode" for something that is perfectly well known.
    [0x67, {name: 'SetGlobalOutput', mnemonic: 'gout', length: 2, unsupported: true}],
    [0x77, {name: 'SetGlobalDirection', mnemonic: 'gdir', length: 2, unsupported: true}],
    [0xa3, {name: 'SetMaxPower', mnemonic: 'gpwr', length: 4, unsupported: true}],
    [0x73, {name: 'AcquireStart', mnemonic: 'monal', length: 4, unsupported: true}],
    [0xa0, {name: 'AcquireEnd', mnemonic: 'monax', length: 1, unsupported: true}],
    [0x93, {name: 'SetEvent', mnemonic: 'sete', length: 4, unsupported: true}],
    [0xb4, {name: 'MonitorStart', mnemonic: 'mone', length: 5, unsupported: true}],
    [0xb0, {name: 'MonitorEnd', mnemonic: 'monex', length: 1, unsupported: true}]
]);

/** Operand source types (the "source" byte of a src/value pair). */
export const SRC = Object.freeze({
    VAR: 0,
    TIMER: 1,             // 100 ms ticks
    CONST: 2,
    OUTPUT_STATUS: 3,
    RANDOM: 4,            // 0..value inclusive
    PROGRAM: 8,           // program slot
    SENSOR_VALUE: 9,
    SENSOR_TYPE: 10,
    SENSOR_MODE: 11,
    SENSOR_RAW: 12,
    SENSOR_BOOL: 13,
    WATCH: 14,            // minutes since midnight
    MESSAGE: 15,
    FAST_TIMER: 26,       // RCX2: 10 ms ticks
    BATTERY: 34           // millivolts
});

/** SetSensorType codes. Light and rotation are ACTIVE (the input powers them). */
export const SENSOR_TYPE = Object.freeze({NONE: 0, SWITCH: 1, TEMPERATURE: 2, LIGHT: 3, ROTATION: 4});
export const ACTIVE_SENSOR_TYPES = Object.freeze([SENSOR_TYPE.LIGHT, SENSOR_TYPE.ROTATION]);

/** SetSensorMode high three bits (the low five are the slope). */
export const SENSOR_MODE = Object.freeze({
    RAW: 0, BOOL: 1, EDGE: 2, PULSE: 3, PERCENT: 4, CELSIUS: 5, FAHRENHEIT: 6, ROTATION: 7
});

/** Bits 7..6 of SetOutputMode. */
export const OUT_MODE_BITS = Object.freeze({FLOAT: 0, OFF: 1, ON: 2});
/** Bits 7..6 of SetDirection. */
export const DIR_BITS = Object.freeze({REV: 0, FLIP: 1, FWD: 2});

/**
 * Check-and-branch relations (bits 7..6 of the first operand byte). The
 * branch is taken when `src1 REL src2` holds — equivalently, per the SDK's
 * wording as remembered, when the opposite relation (> < == !=) is FALSE.
 * Established from `nqc -L` on `if (x > 5)`, `if (x <= 3)`, `if (x == 4)`,
 * `if (x != 4)`: each compiles to a branch AROUND the body taken on the
 * negation, with the constant as src1.
 */
export const RELATIONS = Object.freeze([
    (a, b) => a <= b,
    (a, b) => a >= b,
    (a, b) => a !== b,
    (a, b) => a === b
]);

/** Sign-extend a 16-bit value. Every RCX variable and constant is int16. */
export const int16 = v => (v << 16) >> 16;

/**
 * The four branch-offset encodings NQC emits. Each takes the address of the
 * first offset byte (`at`) and returns the absolute target. Derived from
 * listings of programs with known control flow (rcx-bytecode.js header, 2):
 *
 *  - near7  (jmp 0x27, decvjn 0xf2): one byte, bit 7 = backwards, bits 6..0
 *    the distance. `27 97` at 141 lands on 119 (= 142 − 0x17).
 *  - far15  (jmpl 0x72, decvjnl 0xf3): two bytes, bit 7 of the first =
 *    backwards, distance = (lo & 0x7f) | hi << 7. `72 3b 01` at 11 lands on
 *    199 (= 12 + 187); `72 a1 01` at 166 lands on 6 (= 167 − 161).
 *  - nearU8 (chk 0x85, loopc 0x37): one byte, unsigned, always forwards —
 *    NQC places targets up to 255 bytes ahead with it (`85 … 8d` at 0 skips a
 *    141-byte body) and switches to the far form for any backward branch.
 *  - farS16 (chkl 0x95): two bytes, signed little-endian. `… fa ff` at 111
 *    lands on 111 (= 117 − 6): `until(...)` spinning on itself.
 */
export const OFFSET = Object.freeze({
    near7: (code, at) => (code[at] & 0x80 ? at - (code[at] & 0x7f) : at + code[at]),
    far15: (code, at) => {
        const distance = (code[at] & 0x7f) | (code[at + 1] << 7);
        return code[at] & 0x80 ? at - distance : at + distance;
    },
    nearU8: (code, at) => at + code[at],
    farS16: (code, at) => at + int16(code[at] | (code[at + 1] << 8))
});
