// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The EV3 instruction set as data (docs/EV3-RBF-VM.md §Opcodes): opcode numbers and names, the
// subcommand numbers the program VM executes, program slots and object states. Facts from LEGO's EV3
// Firmware Developer Kit §4 and LEGO's lms2012 `bytecodes.h` (read as a fact source; GPL-2, nothing
// copied), cross-checked with ev3dev/lmsasm's opcode list (BSD-3) — the encoding the fixtures' assembler
// uses. The input/output/sound/UI/timer instructions the direct commands already execute are described
// in hubs/ev3/ev3-direct-commands.js; the VM reuses them.

/** Every opcode LEGO's firmware dispatches, by number (an opcode outside this map is not an instruction). */
const OPCODE_LIST = `
00 ERROR 01 NOP 02 PROGRAM_STOP 03 PROGRAM_START 04 OBJECT_STOP 05 OBJECT_START 06 OBJECT_TRIG 07 OBJECT_WAIT
08 RETURN 09 CALL 0a OBJECT_END 0b SLEEP 0c PROGRAM_INFO 0d LABEL 0e PROBE 0f DO
10 ADD8 11 ADD16 12 ADD32 13 ADDF 14 SUB8 15 SUB16 16 SUB32 17 SUBF 18 MUL8 19 MUL16 1a MUL32 1b MULF
1c DIV8 1d DIV16 1e DIV32 1f DIVF 20 OR8 21 OR16 22 OR32 24 AND8 25 AND16 26 AND32 28 XOR8 29 XOR16 2a XOR32
2c RL8 2d RL16 2e RL32 2f INIT_BYTES
30 MOVE8_8 31 MOVE8_16 32 MOVE8_32 33 MOVE8_F 34 MOVE16_8 35 MOVE16_16 36 MOVE16_32 37 MOVE16_F
38 MOVE32_8 39 MOVE32_16 3a MOVE32_32 3b MOVE32_F 3c MOVEF_8 3d MOVEF_16 3e MOVEF_32 3f MOVEF_F
40 JR 41 JR_FALSE 42 JR_TRUE 43 JR_NAN
44 CP_LT8 45 CP_LT16 46 CP_LT32 47 CP_LTF 48 CP_GT8 49 CP_GT16 4a CP_GT32 4b CP_GTF
4c CP_EQ8 4d CP_EQ16 4e CP_EQ32 4f CP_EQF 50 CP_NEQ8 51 CP_NEQ16 52 CP_NEQ32 53 CP_NEQF
54 CP_LTEQ8 55 CP_LTEQ16 56 CP_LTEQ32 57 CP_LTEQF 58 CP_GTEQ8 59 CP_GTEQ16 5a CP_GTEQ32 5b CP_GTEQF
5c SELECT8 5d SELECT16 5e SELECT32 5f SELECTF 60 SYSTEM 61 PORT_CNV_OUTPUT 62 PORT_CNV_INPUT 63 NOTE_TO_FREQ
64 JR_LT8 65 JR_LT16 66 JR_LT32 67 JR_LTF 68 JR_GT8 69 JR_GT16 6a JR_GT32 6b JR_GTF
6c JR_EQ8 6d JR_EQ16 6e JR_EQ32 6f JR_EQF 70 JR_NEQ8 71 JR_NEQ16 72 JR_NEQ32 73 JR_NEQF
74 JR_LTEQ8 75 JR_LTEQ16 76 JR_LTEQ32 77 JR_LTEQF 78 JR_GTEQ8 79 JR_GTEQ16 7a JR_GTEQ32 7b JR_GTEQF
7c INFO 7d STRINGS 7e MEMORY_WRITE 7f MEMORY_READ
80 UI_FLUSH 81 UI_READ 82 UI_WRITE 83 UI_BUTTON 84 UI_DRAW 85 TIMER_WAIT 86 TIMER_READY 87 TIMER_READ
88 BP0 89 BP1 8a BP2 8b BP3 8c BP_SET 8d MATH 8e RANDOM 8f TIMER_READ_US 90 KEEP_ALIVE 91 COM_READ 92 COM_WRITE
94 SOUND 95 SOUND_TEST 96 SOUND_READY 97 INPUT_SAMPLE 98 INPUT_DEVICE_LIST 99 INPUT_DEVICE 9a INPUT_READ
9b INPUT_TEST 9c INPUT_READY 9d INPUT_READSI 9e INPUT_READEXT 9f INPUT_WRITE
a0 OUTPUT_GET_TYPE a1 OUTPUT_SET_TYPE a2 OUTPUT_RESET a3 OUTPUT_STOP a4 OUTPUT_POWER a5 OUTPUT_SPEED a6 OUTPUT_START
a7 OUTPUT_POLARITY a8 OUTPUT_READ a9 OUTPUT_TEST aa OUTPUT_READY ac OUTPUT_STEP_POWER ad OUTPUT_TIME_POWER
ae OUTPUT_STEP_SPEED af OUTPUT_TIME_SPEED b0 OUTPUT_STEP_SYNC b1 OUTPUT_TIME_SYNC b2 OUTPUT_CLR_COUNT
b3 OUTPUT_GET_COUNT b4 OUTPUT_PRG_STOP
c0 FILE c1 ARRAY c2 ARRAY_WRITE c3 ARRAY_READ c4 ARRAY_APPEND c5 MEMORY_USAGE c6 FILENAME
c8 READ8 c9 READ16 ca READ32 cb READF cc WRITE8 cd WRITE16 ce WRITE32 cf WRITEF
d0 COM_READY d1 COM_READDATA d2 COM_WRITEDATA d3 COM_GET d4 COM_SET d5 COM_TEST d6 COM_REMOVE d7 COM_WRITEFILE
d8 MAILBOX_OPEN d9 MAILBOX_WRITE da MAILBOX_READ db MAILBOX_TEST dc MAILBOX_READY dd MAILBOX_CLOSE ff TST`;

/** opcode → name ('opADD8' style names are the FDK's; we drop the `op`). */
export const OPCODE_NAMES = Object.freeze(Object.fromEntries((() => {
    const words = OPCODE_LIST.trim().split(/\s+/);
    const out = [];
    for (let i = 0; i < words.length; i += 2) out.push([parseInt(words[i], 16), words[i + 1]]);
    return out;
})()));

/** name → opcode. */
export const OP = Object.freeze(Object.fromEntries(Object.entries(OPCODE_NAMES).map(([n, name]) => [name, Number(n)])));

/** Parameter encoding bits [FDK §3.4]. */
export const PAR = Object.freeze({
    LONG: 0x80, VARIABLE: 0x40, GLOBAL: 0x20, HANDLE: 0x10, ADDR: 0x08, LABEL: 0x20, CONST_SIGN: 0x20,
    INDEX: 0x1f, VALUE: 0x3f, BYTES: 0x07
});

/** MATH subcommands. */
export const MATH = Object.freeze({
    EXP: 1, MOD: 2, FLOOR: 3, CEIL: 4, ROUND: 5, ABS: 6, NEGATE: 7, SQRT: 8, LOG: 9, LN: 10, SIN: 11, COS: 12,
    TAN: 13, ASIN: 14, ACOS: 15, ATAN: 16, MOD8: 17, MOD16: 18, MOD32: 19, POW: 20, TRUNC: 21
});

/** STRINGS subcommands. */
export const STRINGS = Object.freeze({
    GET_SIZE: 1, ADD: 2, COMPARE: 3, DUPLICATE: 5, VALUE_TO_STRING: 6, STRING_TO_VALUE: 7, STRIP: 8,
    NUMBER_TO_STRING: 9, SUB: 10, VALUE_FORMATTED: 11, NUMBER_FORMATTED: 12
});

/** ARRAY subcommands. */
export const ARRAY = Object.freeze({
    DELETE: 0, CREATE8: 1, CREATE16: 2, CREATE32: 3, CREATEF: 4, RESIZE: 5, FILL: 6, COPY: 7, INIT8: 8, INIT16: 9,
    INIT32: 10, INITF: 11, SIZE: 12, READ_CONTENT: 13, WRITE_CONTENT: 14, READ_SIZE: 15
});

/** PROGRAM_INFO subcommands. */
export const PROGRAM_INFO = Object.freeze({OBJ_STOP: 0, OBJ_START: 4, GET_STATUS: 22, GET_SPEED: 23, GET_PRGRESULT: 24, SET_INSTR: 25});

/** FILE subcommands the bricks serve (the others stop a program with UNIMPLEMENTED_SUBCOMMAND). */
export const FILE = Object.freeze({LOAD_IMAGE: 8});

/** Program slots. */
export const SLOT = Object.freeze({GUI: 0, USER: 1, CMD: 2, TERM: 3, DEBUG: 4, CURRENT: -1});

/** Object and program states (OBJSTAT), as GET_STATUS reports them. */
export const OBJSTAT = Object.freeze({RUNNING: 0x10, WAITING: 0x20, STOPPED: 0x40, HALTED: 0x80});

/** Program results (GET_PRGRESULT). */
export const RESULT = Object.freeze({OK: 0, BUSY: 1, FAIL: 2, STOP: 4});

/** Byte codes an object runs before the VM switches to the next one (PRG_PRIORITY, the firmware as built). */
export const SLICE_INSTRUCTIONS = 200;

/** The integer types' "not a number" values and limits (the firmware's DATAx_NAN, _MIN, _MAX). */
export const LIMITS = Object.freeze({
    8: {nan: -128, min: -127, max: 127},
    16: {nan: -32768, min: -32767, max: 32767},
    32: {nan: -2147483648, min: -2147483647, max: 2147483647}
});
