// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// EV3 direct commands, executed (docs/ROBOT-LAB-EV3-NXT.md "EV3 direct commands"). Clean-room
// from LEGO's PUBLIC developer kits, nothing else:
//
//   [CDK] "LEGO MINDSTORMS EV3 Communication Developer Kit" (2013), §4 "Direct Commands"
//         (the frame: length, message counter, command type 0x00/0x80, the global/local
//         allocation in bytes 5-6), §4.1 "Direct Replies" (0x02 DIRECT_REPLY / 0x04
//         DIRECT_REPLY_ERROR, the global variable space returned as the reply's body), §4.2
//         (worked examples; their bytes are the test's fixtures).
//   [FDK] "LEGO MINDSTORMS EV3 Firmware Developer Kit" (2013), §3.4 "Parameter encoding"
//         (short/long constants and variables), §4.8 "Input port operations", §4.9 "Output
//         port operations", §4.10 "Sound operations", §4.11 "Timer operations", §4.15 "User
//         interface operations", opInfo (§4.1), §5 "Device type list" (type and mode numbers).
//
// What arrives is a direct command: "small programs build of regular byte codes" [CDK §2],
// executed in one VM thread with the globals as the reply buffer. This module decodes the
// frame, runs the byte codes against a BRICK (hubs/ev3/ev3-virtual-hub.js implements one:
// motors, sensors, sound, screen, buttons, battery, timers) and builds the reply. It knows
// the instruction SET, never the physics; the brick knows the physics, never the bytes.
//
// Blocking instructions (opOUTPUT_READY, opSOUND_READY, opTIMER_READY, opUI_BUTTON
// WAIT_FOR_PRESS) "can change [dispatch status] to BUSYBREAK" [FDK]: the reply waits. run()
// returns {blocked} with the program counter, and resume() continues on a later step — the
// direct command's thread waits; the brick's motors go on (the session, ev3-peripheral.js,
// resumes it each time the hub publishes).
//
// The FDK's opUI_DRAW list leaves out the COLOR argument its own drawing subcommands take; the
// CDK's worked example §4.2.6 sends it (FILLWINDOW, BG_COLOR, …; BMPFILE, FG_COLOR, …). The
// table below follows the example: a COLOR first for every drawing subcommand that paints.

/** Command types [CDK §4, §4.1]. */
export const DIRECT_COMMAND_REPLY = 0x00;
export const DIRECT_COMMAND_NO_REPLY = 0x80;
export const DIRECT_REPLY = 0x02;
export const DIRECT_REPLY_ERROR = 0x04;
/** System commands [CDK §3]: file transfer, served by hubs/ev3/ev3-system-commands.js. */
export const SYSTEM_COMMAND_REPLY = 0x01;
export const SYSTEM_COMMAND_NO_REPLY = 0x81;
export const SYSTEM_REPLY = 0x03;
export const SYSTEM_REPLY_ERROR = 0x05;
/** System reply status 0x0A [CDK §3.1: UNKNOWN_ERROR], what a system command the brick lacks is answered with. */
export const UNKNOWN_SYSTEM_COMMAND = 0x0a;

/** Opcodes the executor knows [FDK §4]. */
export const OP = Object.freeze({
    NOP: 0x01, PROGRAM_STOP: 0x02, PROGRAM_START: 0x03, PROGRAM_INFO: 0x0c, INFO: 0x7c, UI_FLUSH: 0x80, UI_READ: 0x81, UI_WRITE: 0x82, UI_BUTTON: 0x83, UI_DRAW: 0x84,
    TIMER_WAIT: 0x85, TIMER_READY: 0x86, TIMER_READ: 0x87, TIMER_READ_US: 0x8f,
    SOUND: 0x94, SOUND_TEST: 0x95, SOUND_READY: 0x96,
    INPUT_DEVICE_LIST: 0x98, INPUT_DEVICE: 0x99, INPUT_READ: 0x9a, INPUT_TEST: 0x9b, INPUT_READY: 0x9c,
    INPUT_READSI: 0x9d, INPUT_READEXT: 0x9e, INPUT_WRITE: 0x9f,
    OUTPUT_GET_TYPE: 0xa0, OUTPUT_SET_TYPE: 0xa1, OUTPUT_RESET: 0xa2, OUTPUT_STOP: 0xa3, OUTPUT_POWER: 0xa4,
    OUTPUT_SPEED: 0xa5, OUTPUT_START: 0xa6, OUTPUT_POLARITY: 0xa7, OUTPUT_READ: 0xa8, OUTPUT_TEST: 0xa9,
    OUTPUT_READY: 0xaa, OUTPUT_STEP_POWER: 0xac, OUTPUT_TIME_POWER: 0xad, OUTPUT_STEP_SPEED: 0xae,
    OUTPUT_TIME_SPEED: 0xaf, OUTPUT_STEP_SYNC: 0xb0, OUTPUT_TIME_SYNC: 0xb1, OUTPUT_CLR_COUNT: 0xb2,
    OUTPUT_GET_COUNT: 0xb3, OUTPUT_PRG_STOP: 0xb4, FILE: 0xc0
});

/** opINPUT_DEVICE subcommands [FDK §4.8]. */
export const INPUT_DEVICE = Object.freeze({
    GET_FORMAT: 0x02, GET_TYPEMODE: 0x05, CLR_ALL: 0x0a, GET_RAW: 0x0b, GET_CONNECTION: 0x0c, STOP_ALL: 0x0d,
    GET_NAME: 0x15, GET_MODENAME: 0x16, GET_FIGURES: 0x18, GET_CHANGES: 0x19, CLR_CHANGES: 0x1a,
    READY_PCT: 0x1b, READY_RAW: 0x1c, READY_SI: 0x1d, GET_MINMAX: 0x1e, GET_BUMPS: 0x1f
});

/** Parameter types: 8/16/32-bit integers, 32-bit float, zero-terminated string [FDK §3.4]. */
const T8 = '8';
const T16 = '16';
const T32 = '32';
const TF = 'F';
const TS = 'S';
export const PARAM_TYPES = Object.freeze({T8, T16, T32, TF, TS, ARRAY: 'ARRAY'});

/**
 * Argument lists: [direction, type] per parameter, 'in' read, 'out' written to the variable the
 * parameter names. A function makes a list from the inputs read so far (VALUES-many replies).
 */
const ins = (...types) => types.map(t => ['in', t]);
const outs = (...types) => types.map(t => ['out', t]);

/** Output = port numbering: inputs 0..15 (4 per layer), outputs 16..31 ("INPUT_DEVICE_LIST", [FDK §4.8]). */
export const OUTPUT_PORT_BASE = 16;

const decodeError = message => Object.assign(new Error(message), {ev3: true});

/** Little-endian reads/writes. */
const i16 = (b, i) => ((b[i] | (b[i + 1] << 8)) << 16) >> 16;
const i32 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);

/**
 * One parameter at pc [FDK §3.4]:
 *   0 0 s v v v v v   short constant, 6-bit two's complement (s: sign)
 *   0 1 g i i i i i   short variable, local (g=0) or global (g=1) index 0..31
 *   1 0 l - - b b b   long constant: l=1 label; bbb 1/2/3 = 1/2/4 bytes follow, 0 or 4 = zero-terminated string
 *   1 1 g h - b b b   long variable: g global, h handle; the index in the following 1/2/4 bytes
 * @returns {{pc: number, kind: 'const', value: number}|{pc: number, kind: 'string', text: string}
 *          |{pc: number, kind: 'var', global: boolean, index: number, handle: boolean}}
 */
export const readParam = (code, pc) => {
    if (pc >= code.length) throw decodeError(`parameter expected at byte ${pc}, the command ended`);
    const b = code[pc++];
    if ((b & 0x80) === 0) {
        if ((b & 0x40) === 0) {
            const v = b & 0x3f;
            return {pc, kind: 'const', value: v & 0x20 ? v - 0x40 : v};
        }
        return {pc, kind: 'var', global: Boolean(b & 0x20), index: b & 0x1f, handle: false};
    }
    const size = b & 0x07;
    const variable = Boolean(b & 0x40);
    if (!variable && (size === 0 || size === 4)) {
        const end = code.indexOf(0, pc);
        if (end < 0) throw decodeError(`unterminated string at byte ${pc}`);
        let text = '';
        for (let i = pc; i < end; i++) text += String.fromCharCode(code[i]);
        return {pc: end + 1, kind: 'string', text};
    }
    const n = {1: 1, 2: 2, 3: 4}[size];
    if (!n) throw decodeError(`parameter encoding 0x${b.toString(16)} at byte ${pc - 1}`);
    if (pc + n > code.length) throw decodeError(`parameter at byte ${pc - 1} runs past the command`);
    const raw = n === 1 ? (code[pc] << 24) >> 24 : n === 2 ? i16(code, pc) : i32(code, pc);
    pc += n;
    if (!variable) return {pc, kind: 'const', value: raw};
    // A variable's index is an address: unsigned.
    const index = n === 1 ? raw & 0xff : n === 2 ? raw & 0xffff : raw >>> 0;
    return {pc, kind: 'var', global: Boolean(b & 0x20), index, handle: Boolean(b & 0x10)};
};

/** Bytes a value of a parameter type takes in a variable. */
const WIDTH = {[T8]: 1, [T16]: 2, [T32]: 4, [TF]: 4};

/** The direct command's memory: globals (the reply) and locals [CDK §4]. */
class Memory {
    constructor (globals, locals) {
        this.globals = new Uint8Array(globals);
        this.locals = new Uint8Array(locals);
    }

    _area (ref, width) {
        const area = ref.global ? this.globals : this.locals;
        if (ref.index + width > area.length) {
            throw decodeError(`${ref.global ? 'global' : 'local'} variable ${ref.index} (+${width}) is outside the ${area.length} bytes the header allocates`);
        }
        return area;
    }

    read (ref, type) {
        if (type === TS) {
            const area = this._area(ref, 1);
            let text = '';
            for (let i = ref.index; i < area.length && area[i] !== 0; i++) text += String.fromCharCode(area[i]);
            return text;
        }
        const width = WIDTH[type];
        const a = this._area(ref, width);
        const view = new DataView(a.buffer, a.byteOffset + ref.index, width);
        if (type === TF) return view.getFloat32(0, true);
        return width === 1 ? view.getInt8(0) : width === 2 ? view.getInt16(0, true) : view.getInt32(0, true);
    }

    write (ref, type, value, length = null) {
        if (type === TS) {
            const text = String(value);
            const max = length === null || length < 0 ? text.length + 1 : length;
            const bytes = [...text.slice(0, Math.max(0, max - 1))].map(c => c.charCodeAt(0) & 0xff);
            const a = this._area(ref, Math.min(bytes.length + 1, max));
            a.set([...bytes, 0].slice(0, max), ref.index);
            return;
        }
        const width = WIDTH[type];
        const a = this._area(ref, width);
        const view = new DataView(a.buffer, a.byteOffset + ref.index, width);
        if (type === TF) view.setFloat32(0, Number(value), true);
        else if (width === 1) view.setInt8(0, Math.trunc(value) << 24 >> 24);
        else if (width === 2) view.setInt16(0, Math.trunc(value) << 16 >> 16, true);
        else view.setInt32(0, Math.trunc(value) | 0, true);
    }
}

/**
 * The instruction table: opcode → {name, args | sub: {code: {name, args}}, run(brick, a, ctx)}.
 * `a` holds the inputs, in order, and `ret(...)` writes the outputs, in order. `run` returns
 * nothing, or {block: true} to wait (the instruction is retried until it does not block).
 */
const SUBS = 'sub';
const table = new Map();
/**
 * The instruction table, shared with the program VM (routes/ev3-vm/ev3-vm.js), which executes these
 * instructions from an `.rbf` against the same brick: opcode → {name, args, run} or {name, sub: {code → …}}.
 */
export const INSTRUCTIONS = table;
export const SUBCOMMANDS = SUBS;
const def = (op, name, args, run) => table.set(op, {name, args, run});
const defSub = (op, name, subs) => table.set(op, {name, [SUBS]: subs});

// ---- general, info -------------------------------------------------------------------------
def(OP.NOP, 'opNOP', [], () => {});
defSub(OP.INFO, 'opINFO', {
    0x01: {name: 'SET_ERROR', args: ins(T8), run: () => {}},
    0x02: {name: 'GET_ERROR', args: outs(T8), run: (brick, a, ret) => ret(0)},
    0x04: {name: 'GET_VOLUME', args: outs(T8), run: (brick, a, ret) => ret(brick.volume())},
    0x05: {name: 'SET_VOLUME', args: ins(T8), run: (brick, [v]) => brick.setVolume(v)},
    0x06: {name: 'GET_MINUTES', args: outs(T8), run: (brick, a, ret) => ret(brick.sleepMinutes())},
    0x07: {name: 'SET_MINUTES', args: ins(T8), run: (brick, [v]) => brick.setSleepMinutes(v)}
});

// ---- programs [FDK §4.1, §4.14; CDK §4.2.1] ----------------------------------------------------
// A host starts a downloaded program the way the CDK's example does: opFILE LOAD_IMAGE into the user
// slot, then opPROGRAM_START with the size and image address LOAD_IMAGE returned (docs/EV3-RBF-VM.md).
def(OP.PROGRAM_STOP, 'opPROGRAM_STOP', ins(T16), (brick, [slot]) => brick.programStop(slot));
def(OP.PROGRAM_START, 'opPROGRAM_START', ins(T16, T32, T32, T8), (brick, [slot, size, ip, debug]) => brick.programStart(slot, size, ip, debug));
defSub(OP.PROGRAM_INFO, 'opPROGRAM_INFO', {
    0x16: {name: 'GET_STATUS', args: [['in', T16], ['out', T8]], run: (brick, [slot], ret) => ret(brick.programStatus(slot))},
    0x18: {name: 'GET_PRGRESULT', args: [['in', T16], ['out', T8]], run: (brick, [slot], ret) => ret(brick.programResult(slot))}
});
defSub(OP.FILE, 'opFILE', {
    // A filename the brick refuses, or a slot that is busy, leaves the outputs as they were; a file that
    // is not there gives size 0 and address 0 (which PROGRAM_START does not start).
    0x08: {name: 'LOAD_IMAGE', args: [['in', T16], ['in', TS], ['out', T32], ['out', T32]], run: (brick, [slot, name], ret) => {
        const image = brick.loadImage(slot, name);
        if (image) ret(image.size, image.ip);
    }}
});

// ---- user interface [FDK §4.15] --------------------------------------------------------------
def(OP.UI_FLUSH, 'opUI_FLUSH', [], () => {});
const string = len => ({name: len, args: [['in', T32], ['out', TS]]});
defSub(OP.UI_READ, 'opUI_READ', {
    0x01: {name: 'GET_VBATT', args: outs(TF), run: (brick, a, ret) => ret(brick.battery().volts)},
    0x02: {name: 'GET_IBATT', args: outs(TF), run: (brick, a, ret) => ret(brick.battery().amps)},
    0x03: {name: 'GET_OS_VERS', args: [['in', T8], ['out', TS]], run: (brick, [n], ret) => ret.string(brick.versions().os, n)},
    0x05: {name: 'GET_TBATT', args: outs(TF), run: (brick, a, ret) => ret(0)},
    0x07: {name: 'GET_IMOTOR', args: outs(TF), run: (brick, a, ret) => ret(brick.battery().motorAmps)},
    0x09: {...string('GET_HW_VERS'), run: (brick, [n], ret) => ret.string(brick.versions().hardware, n)},
    0x0a: {...string('GET_FW_VERS'), run: (brick, [n], ret) => ret.string(brick.versions().firmware, n)},
    0x0b: {...string('GET_FW_BUILD'), run: (brick, [n], ret) => ret.string(brick.versions().build, n)},
    0x0c: {...string('GET_OS_BUILD'), run: (brick, [n], ret) => ret.string(brick.versions().osBuild, n)},
    0x12: {name: 'GET_LBATT', args: outs(T8), run: (brick, a, ret) => ret(brick.battery().percent)},
    0x1a: {...string('GET_VERSION'), run: (brick, [n], ret) => ret.string(brick.versions().firmware, n)},
    0x1d: {name: 'GET_SDCARD', args: outs(T8, T32, T32), run: (brick, a, ret) => ret(0, 0, 0)},
    0x1e: {name: 'GET_USBSTICK', args: outs(T8, T32, T32), run: (brick, a, ret) => ret(0, 0, 0)}
});
const record = (kind, names) => (brick, a) => brick.event(kind, Object.fromEntries(names.map((n, i) => [n, a[i]])));
defSub(OP.UI_WRITE, 'opUI_WRITE', {
    0x01: {name: 'WRITE_FLUSH', args: [], run: () => {}},
    0x02: {name: 'FLOATVALUE', args: ins(TF, T8, T8), run: record('write', ['value'])},
    0x08: {name: 'PUT_STRING', args: ins(TS), run: record('write', ['text'])},
    0x09: {name: 'VALUE8', args: ins(T8), run: record('write', ['value'])},
    0x0a: {name: 'VALUE16', args: ins(T16), run: record('write', ['value'])},
    0x0b: {name: 'VALUE32', args: ins(T32), run: record('write', ['value'])},
    0x0c: {name: 'VALUEF', args: ins(TF), run: record('write', ['value'])},
    0x0f: {name: 'DOWNLOAD_END', args: [], run: () => {}},
    0x10: {name: 'SCREEN_BLOCK', args: ins(T8), run: () => {}},
    0x16: {name: 'SET_BUSY', args: ins(T8), run: () => {}},
    0x19: {name: 'INIT_RUN', args: [], run: () => {}},
    0x1b: {name: 'LED', args: ins(T8), run: (brick, [pattern]) => brick.setLed(pattern)},
    0x1d: {name: 'POWER', args: ins(T8), run: () => {}},
    0x1f: {name: 'TERMINAL', args: ins(T8), run: () => {}}
});
const button = name => ({name, args: [['in', T8], ['out', T8]], run: (brick, [b], ret) => ret(brick.button(b, name) ? 1 : 0)});
defSub(OP.UI_BUTTON, 'opUI_BUTTON', {
    0x01: button('SHORTPRESS'),
    0x02: button('LONGPRESS'),
    // "Wait for press": the reply waits until a button is pressed (the Lab has none to press yet).
    0x03: {name: 'WAIT_FOR_PRESS', args: [], run: brick => (brick.anyButton() ? undefined : {block: true})},
    0x04: {name: 'FLUSH', args: [], run: brick => brick.flushButtons()},
    0x05: {name: 'PRESS', args: ins(T8), run: (brick, [b]) => brick.pressButton(b, true)},
    0x06: {name: 'RELEASE', args: ins(T8), run: (brick, [b]) => brick.pressButton(b, false)},
    0x07: {name: 'GET_HORZ', args: outs(T16), run: (brick, a, ret) => ret(0)},
    0x08: {name: 'GET_VERT', args: outs(T16), run: (brick, a, ret) => ret(0)},
    0x09: button('PRESSED'),
    0x0a: {name: 'SET_BACK_BLOCK', args: ins(T8), run: () => {}},
    0x0b: {name: 'GET_BACK_BLOCK', args: outs(T8), run: (brick, a, ret) => ret(0)},
    0x0c: button('TESTSHORTPRESS'),
    0x0d: button('TESTLONGPRESS'),
    0x0e: button('GET_BUMBED'),
    0x0f: {name: 'GET_CLICK', args: outs(T8), run: (brick, a, ret) => ret(0)}
});
const draw = (name, types, fields) => ({name, args: ins(...types), run: (brick, a) => brick.draw(name, Object.fromEntries(fields.map((f, i) => [f, a[i]])))});
defSub(OP.UI_DRAW, 'opUI_DRAW', {
    0x00: draw('UPDATE', [], []),
    0x01: draw('CLEAN', [], []),
    0x02: draw('PIXEL', [T8, T16, T16], ['color', 'x', 'y']),
    0x03: draw('LINE', [T8, T16, T16, T16, T16], ['color', 'x0', 'y0', 'x1', 'y1']),
    0x04: draw('CIRCLE', [T8, T16, T16, T16], ['color', 'x', 'y', 'r']),
    0x05: draw('TEXT', [T8, T16, T16, TS], ['color', 'x', 'y', 'text']),
    0x06: draw('ICON', [T8, T16, T16, T8, T8], ['color', 'x', 'y', 'type', 'no']),
    0x08: draw('VALUE', [T8, T16, T16, TF, T8, T8], ['color', 'x', 'y', 'value', 'figures', 'decimals']),
    0x09: draw('FILLRECT', [T8, T16, T16, T16, T16], ['color', 'x', 'y', 'w', 'h']),
    0x0a: draw('RECT', [T8, T16, T16, T16, T16], ['color', 'x', 'y', 'w', 'h']),
    0x10: draw('INVERSERECT', [T16, T16, T16, T16], ['x', 'y', 'w', 'h']),
    0x11: draw('SELECT_FONT', [T8], ['font']),
    0x12: draw('TOPLINE', [T8], ['enable']),
    0x13: draw('FILLWINDOW', [T8, T16, T16], ['color', 'y0', 'y1']),
    0x15: draw('DOTLINE', [T8, T16, T16, T16, T16, T16, T16], ['color', 'x0', 'y0', 'x1', 'y1', 'on', 'off']),
    0x16: draw('VIEW_VALUE', [T8, T16, T16, TF, T8, T8], ['color', 'x', 'y', 'value', 'figures', 'decimals']),
    0x18: draw('FILLCIRCLE', [T8, T16, T16, T16], ['color', 'x', 'y', 'r']),
    0x19: draw('STORE', [T8], ['no']),
    0x1a: draw('RESTORE', [T8], ['no']),
    0x1c: draw('BMPFILE', [T8, T16, T16, TS], ['color', 'x', 'y', 'name'])
});

// ---- timers [FDK §4.11] --------------------------------------------------------------------------
def(OP.TIMER_WAIT, 'opTIMER_WAIT', [['in', T32], ['out', T32]], (brick, [ms], ret) => ret(brick.nowMs() + ms));
def(OP.TIMER_READY, 'opTIMER_READY', ins(T32), (brick, [until]) => (brick.nowMs() >= until ? undefined : {block: true}));
def(OP.TIMER_READ, 'opTIMER_READ', outs(T32), (brick, a, ret) => ret(brick.nowMs()));
def(OP.TIMER_READ_US, 'opTIMER_READ_US', outs(T32), (brick, a, ret) => ret(Math.round(brick.nowMs() * 1000)));

// ---- sound [FDK §4.10] --------------------------------------------------------------------------
defSub(OP.SOUND, 'opSOUND', {
    0x00: {name: 'BREAK', args: [], run: brick => brick.soundBreak()},
    0x01: {name: 'TONE', args: ins(T8, T16, T16), run: (brick, [volume, frequency, duration]) => brick.tone(volume, frequency, duration)},
    0x02: {name: 'PLAY', args: ins(T8, TS), run: (brick, [volume, name]) => brick.playFile(volume, name, false)},
    0x03: {name: 'REPEAT', args: ins(T8, TS), run: (brick, [volume, name]) => brick.playFile(volume, name, true)},
    0x04: {name: 'SERVICE', args: [], run: () => {}}
});
def(OP.SOUND_TEST, 'opSOUND_TEST', outs(T8), (brick, a, ret) => ret(brick.soundBusy() ? 1 : 0));
def(OP.SOUND_READY, 'opSOUND_READY', [], brick => (brick.soundBusy() ? {block: true} : undefined));

// ---- input ports [FDK §4.8] --------------------------------------------------------------------
def(OP.INPUT_DEVICE_LIST, 'opINPUT_DEVICE_LIST', [['in', T8], ['out', 'ARRAY'], ['out', T8]], (brick, [length], ret) => {
    ret.array(brick.deviceList().slice(0, Math.max(0, length)), length);
    ret.next(0);
});
const LAYER_NO = [T8, T8];
const readyValues = (name, type) => ({name, args: a => [...ins(...LAYER_NO, T8, T8, T8), ...outs(...Array(Math.max(0, a[4] ?? 1)).fill(type))],
    run: (brick, [layer, no, t, mode, values], ret) => {
        const read = brick.readInput(layer, no, t, mode, name);
        if (read && read.block) return read;
        ret(...Array.from({length: Math.max(0, values)}, (_, i) => (read.values[i] ?? 0)));
        return undefined;
    }});
defSub(OP.INPUT_DEVICE, 'opINPUT_DEVICE', {
    [INPUT_DEVICE.GET_FORMAT]: {name: 'GET_FORMAT', args: [...ins(...LAYER_NO), ...outs(T8, T8, T8, T8)],
        run: (brick, [layer, no], ret) => { const f = brick.inputFormat(layer, no); ret(f.datasets, f.format, f.modes, f.view); }},
    [INPUT_DEVICE.GET_TYPEMODE]: {name: 'GET_TYPEMODE', args: [...ins(...LAYER_NO), ...outs(T8, T8)],
        run: (brick, [layer, no], ret) => { const f = brick.inputTypeMode(layer, no); ret(f.type, f.mode); }},
    [INPUT_DEVICE.CLR_ALL]: {name: 'CLR_ALL', args: ins(T8), run: (brick, [layer]) => brick.clearInputs(layer)},
    [INPUT_DEVICE.GET_RAW]: {name: 'GET_RAW', args: [...ins(...LAYER_NO), ...outs(T32)],
        run: (brick, [layer, no], ret) => ret(brick.readInput(layer, no, 0, -1, 'READY_RAW').values[0] ?? 0)},
    [INPUT_DEVICE.STOP_ALL]: {name: 'STOP_ALL', args: ins(T8), run: () => {}},
    [INPUT_DEVICE.GET_NAME]: {name: 'GET_NAME', args: [...ins(...LAYER_NO, T8), ['out', TS]],
        run: (brick, [layer, no, n], ret) => ret.string(brick.inputName(layer, no), n)},
    [INPUT_DEVICE.GET_MODENAME]: {name: 'GET_MODENAME', args: [...ins(...LAYER_NO, T8, T8), ['out', TS]],
        run: (brick, [layer, no, mode, n], ret) => ret.string(brick.inputModeName(layer, no, mode), n)},
    [INPUT_DEVICE.GET_FIGURES]: {name: 'GET_FIGURES', args: [...ins(...LAYER_NO), ...outs(T8, T8)],
        run: (brick, a, ret) => ret(5, 1)},
    [INPUT_DEVICE.GET_CHANGES]: {name: 'GET_CHANGES', args: [...ins(...LAYER_NO), ...outs(TF)],
        run: (brick, [layer, no], ret) => ret(brick.inputChanges(layer, no))},
    [INPUT_DEVICE.CLR_CHANGES]: {name: 'CLR_CHANGES', args: ins(...LAYER_NO), run: (brick, [layer, no]) => brick.clearChanges(layer, no)},
    [INPUT_DEVICE.READY_PCT]: readyValues('READY_PCT', T8),
    [INPUT_DEVICE.READY_RAW]: readyValues('READY_RAW', T32),
    [INPUT_DEVICE.READY_SI]: readyValues('READY_SI', TF),
    [INPUT_DEVICE.GET_MINMAX]: {name: 'GET_MINMAX', args: [...ins(...LAYER_NO), ...outs(TF, TF)],
        run: (brick, [layer, no], ret) => { const m = brick.inputMinMax(layer, no); ret(m[0], m[1]); }},
    [INPUT_DEVICE.GET_BUMPS]: {name: 'GET_BUMPS', args: [...ins(...LAYER_NO), ...outs(TF)],
        run: (brick, [layer, no], ret) => ret(brick.inputBumps(layer, no))}
});
const readOne = (name, type) => (brick, [layer, no, t, mode], ret) => {
    const read = brick.readInput(layer, no, t, mode, name);
    if (read && read.block) return read;
    ret(read.values[0] ?? 0);
    return undefined;
};
def(OP.INPUT_READ, 'opINPUT_READ', [...ins(T8, T8, T8, T8), ...outs(T8)], readOne('READY_PCT', T8));
def(OP.INPUT_READSI, 'opINPUT_READSI', [...ins(T8, T8, T8, T8), ...outs(TF)], readOne('READY_SI', TF));
def(OP.INPUT_TEST, 'opINPUT_TEST', [...ins(T8, T8), ...outs(T8)], (brick, a, ret) => ret(0));
def(OP.INPUT_READY, 'opINPUT_READY', ins(T8, T8), () => {});
/** READEXT FORMAT: 0 = PCT (Data8), 1 = RAW (Data32), 2 = SI (DataF) — the order of the READY_* subcommands. */
const EXT_FORMATS = [['READY_PCT', T8], ['READY_RAW', T32], ['READY_SI', TF]];
def(OP.INPUT_READEXT, 'opINPUT_READEXT', a => {
    const [, type] = EXT_FORMATS[a[4]] || EXT_FORMATS[2];
    return [...ins(T8, T8, T8, T8, T8, T8), ...outs(...Array(Math.max(0, a[5] ?? 1)).fill(type))];
}, (brick, [layer, no, t, mode, format, values], ret) => {
    const [name] = EXT_FORMATS[format] || EXT_FORMATS[2];
    const read = brick.readInput(layer, no, t, mode, name);
    if (read && read.block) return read;
    ret(...Array.from({length: Math.max(0, values)}, (_, i) => (read.values[i] ?? 0)));
    return undefined;
});
def(OP.INPUT_WRITE, 'opINPUT_WRITE', ins(T8, T8, T8, T8), () => {});

// ---- output ports [FDK §4.9] -------------------------------------------------------------------
def(OP.OUTPUT_GET_TYPE, 'opOUTPUT_GET_TYPE', [...ins(T8, T8), ...outs(T8)], (brick, [layer, no], ret) => ret(brick.outputType(layer, no)));
def(OP.OUTPUT_SET_TYPE, 'opOUTPUT_SET_TYPE', ins(T8, T8, T8), () => {});
def(OP.OUTPUT_RESET, 'opOUTPUT_RESET', ins(T8, T8), (brick, [layer, nos]) => brick.outputReset(layer, nos));
def(OP.OUTPUT_STOP, 'opOUTPUT_STOP', ins(T8, T8, T8), (brick, [layer, nos, br]) => brick.outputStop(layer, nos, br !== 0));
def(OP.OUTPUT_POWER, 'opOUTPUT_POWER', ins(T8, T8, T8), (brick, [layer, nos, p]) => brick.outputSet(layer, nos, 'power', p));
def(OP.OUTPUT_SPEED, 'opOUTPUT_SPEED', ins(T8, T8, T8), (brick, [layer, nos, s]) => brick.outputSet(layer, nos, 'speed', s));
def(OP.OUTPUT_START, 'opOUTPUT_START', ins(T8, T8), (brick, [layer, nos]) => brick.outputStart(layer, nos));
def(OP.OUTPUT_POLARITY, 'opOUTPUT_POLARITY', ins(T8, T8, T8), (brick, [layer, nos, pol]) => brick.outputPolarity(layer, nos, pol));
def(OP.OUTPUT_READ, 'opOUTPUT_READ', [...ins(T8, T8), ...outs(T8, T32)], (brick, [layer, no], ret) => {
    const r = brick.outputRead(layer, no);
    ret(r.speed, r.tacho);
});
def(OP.OUTPUT_TEST, 'opOUTPUT_TEST', [...ins(T8, T8), ...outs(T8)], (brick, [layer, nos], ret) => ret(brick.outputBusy(layer, nos) ? 1 : 0));
def(OP.OUTPUT_READY, 'opOUTPUT_READY', ins(T8, T8), (brick, [layer, nos]) => (brick.outputBusy(layer, nos) ? {block: true} : undefined));
const profile = (regulated, unit) => (brick, [layer, nos, value, s1, s2, s3, br]) =>
    brick.outputProfile(layer, nos, {regulated, unit, value, steps: [s1, s2, s3], brake: br !== 0});
def(OP.OUTPUT_STEP_POWER, 'opOUTPUT_STEP_POWER', ins(T8, T8, T8, T32, T32, T32, T8), profile(false, 'degrees'));
def(OP.OUTPUT_TIME_POWER, 'opOUTPUT_TIME_POWER', ins(T8, T8, T8, T32, T32, T32, T8), profile(false, 'ms'));
def(OP.OUTPUT_STEP_SPEED, 'opOUTPUT_STEP_SPEED', ins(T8, T8, T8, T32, T32, T32, T8), profile(true, 'degrees'));
def(OP.OUTPUT_TIME_SPEED, 'opOUTPUT_TIME_SPEED', ins(T8, T8, T8, T32, T32, T32, T8), profile(true, 'ms'));
const sync = unit => (brick, [layer, nos, speed, turn, amount, br]) => brick.outputSync(layer, nos, {speed, turn, unit, amount, brake: br !== 0});
def(OP.OUTPUT_STEP_SYNC, 'opOUTPUT_STEP_SYNC', ins(T8, T8, T8, T16, T32, T8), sync('degrees'));
def(OP.OUTPUT_TIME_SYNC, 'opOUTPUT_TIME_SYNC', ins(T8, T8, T8, T16, T32, T8), sync('ms'));
def(OP.OUTPUT_CLR_COUNT, 'opOUTPUT_CLR_COUNT', ins(T8, T8), (brick, [layer, nos]) => brick.outputClearCount(layer, nos));
// GET_COUNT's second argument is a port NUMBER, not a bit field (the stock Scratch EV3 extension says so
// beside its poll: "incorrectly specified as 'Output bit field' in LEGO docs"); a bit field naming one
// port is taken as that port.
def(OP.OUTPUT_GET_COUNT, 'opOUTPUT_GET_COUNT', [...ins(T8, T8), ...outs(T32)], (brick, [layer, no], ret) => ret(brick.outputCount(layer, no)));
def(OP.OUTPUT_PRG_STOP, 'opOUTPUT_PRG_STOP', [], brick => brick.outputStop(0, 0x0f, false));

/** The instruction's name for the log and the test (opcode → name, subcommand → name). */
export const instructionName = (op, sub = null) => {
    const entry = table.get(op);
    if (!entry) return null;
    if (sub === null || !entry[SUBS]) return entry.name;
    const s = entry[SUBS][sub];
    return s ? `${entry.name} ${s.name}` : null;
};

/**
 * Parses a direct command's frame [CDK §4]. `packet` starts at the length bytes.
 * @returns {{length: number, counter: number, type: number, globals: number, locals: number, code: Uint8Array}}
 */
export const parseFrame = packet => {
    const p = packet instanceof Uint8Array ? packet : Uint8Array.from(packet);
    if (p.length < 5) throw decodeError('a frame is at least length, counter and type');
    const length = p[0] | (p[1] << 8);
    if (p.length !== length + 2) throw decodeError(`the frame says ${length} bytes follow, ${p.length - 2} do`);
    const counter = p[2] | (p[3] << 8);
    const type = p[4];
    if (type !== DIRECT_COMMAND_REPLY && type !== DIRECT_COMMAND_NO_REPLY) return {length, counter, type, globals: 0, locals: 0, code: p.subarray(5)};
    if (p.length < 7) throw decodeError('a direct command carries a two-byte allocation');
    // Byte 5: globals' low 8 bits; byte 6: llllllgg [CDK §4].
    const globals = p[5] | ((p[6] & 0x03) << 8);
    const locals = p[6] >> 2;
    return {length, counter, type, globals, locals, code: p.subarray(7)};
};

/** A reply frame: length, the command's counter, the reply type, then the globals [CDK §4.1]. */
export const replyFrame = (counter, type, body) => {
    const out = new Uint8Array(5 + body.length);
    const length = 3 + body.length;
    out[0] = length & 0xff;
    out[1] = (length >> 8) & 0xff;
    out[2] = counter & 0xff;
    out[3] = (counter >> 8) & 0xff;
    out[4] = type;
    out.set(body, 5);
    return out;
};

/**
 * Starts a direct command. Returns a run context; step(ctx, brick) runs it until it ends or blocks.
 * @param {Uint8Array|number[]} packet one whole frame (with its two length bytes)
 */
export const startDirectCommand = packet => {
    const frame = parseFrame(packet);
    return {frame, pc: 0, memory: new Memory(frame.globals, frame.locals), trace: [], done: false, error: null};
};

/** Reads the inputs of an argument list from pc; returns {values, refs, pc}. */
const readArgs = (code, pc, args, memory) => {
    const values = [];
    const refs = [];
    let list = typeof args === 'function' ? null : args;
    // A function list depends on the inputs read so far: read inputs one at a time until it settles.
    if (!list) {
        const fixed = [];
        for (;;) {
            list = args(values);
            if (list.length <= fixed.length || list[fixed.length][0] !== 'in') break;
            const [, type] = list[fixed.length];
            const p = readParam(code, pc);
            pc = p.pc;
            values.push(valueOf(p, type, memory));
            fixed.push(list[fixed.length]);
        }
        list = args(values).slice(fixed.length);
    }
    for (const [dir, type] of list) {
        const p = readParam(code, pc);
        pc = p.pc;
        if (dir === 'in') values.push(valueOf(p, type, memory));
        else {
            if (p.kind !== 'var') throw decodeError(`an output parameter must name a variable (got a ${p.kind})`);
            refs.push({ref: p, type});
        }
    }
    return {values, refs, pc};
};

const valueOf = (p, type, memory) => {
    if (p.kind === 'const') return type === TS ? String(p.value) : p.value;
    if (p.kind === 'string') return p.text;
    return memory.read(p, type);
};

/** The `ret` the instructions write their outputs with. */
const writer = (refs, memory) => {
    let next = 0;
    const put = value => {
        const out = refs[next++];
        if (!out) return;
        if (out.type === 'ARRAY') throw decodeError('an array output takes ret.array');
        memory.write(out.ref, out.type, value);
    };
    const ret = (...values) => { for (const v of values) put(v); };
    ret.next = put;
    ret.string = (text, length) => {
        const out = refs[next++];
        if (out) memory.write(out.ref, TS, text, length);
    };
    ret.array = (bytes, length) => {
        const out = refs[next++];
        if (!out) return;
        for (let i = 0; i < length; i++) memory.write({...out.ref, index: out.ref.index + i}, T8, bytes[i] ?? 0);
    };
    return ret;
};

/**
 * Runs the command from ctx.pc until it ends, fails or blocks.
 * @returns {{done: true, reply: Uint8Array|null}|{done: false, blocked: string}}
 */
export const stepDirectCommand = (ctx, brick) => {
    const {frame, memory} = ctx;
    const code = frame.code;
    const wantsReply = frame.type === DIRECT_COMMAND_REPLY;
    const finish = (type, error = null) => {
        ctx.done = true;
        ctx.error = error;
        return {done: true, reply: wantsReply ? replyFrame(frame.counter, type, memory.globals) : null, error};
    };
    try {
        while (ctx.pc < code.length) {
            const start = ctx.pc;
            const op = code[ctx.pc];
            const entry = table.get(op);
            if (!entry) return finish(DIRECT_REPLY_ERROR, `unknown opcode 0x${op.toString(16)} at byte ${start}`);
            let pc = ctx.pc + 1;
            let spec = entry;
            let name = entry.name;
            if (entry[SUBS]) {
                const p = readParam(code, pc);
                pc = p.pc;
                const sub = p.kind === 'const' ? p.value : null;
                spec = sub === null ? null : entry[SUBS][sub & 0xff];
                if (!spec) return finish(DIRECT_REPLY_ERROR, `${entry.name}: subcommand ${sub} is not implemented`);
                name = `${entry.name} ${spec.name}`;
            }
            const {values, refs, pc: after} = readArgs(code, pc, spec.args, memory);
            const out = spec.run(brick, values, writer(refs, memory), ctx);
            if (out && out.block) return {done: false, blocked: name};
            ctx.trace.push({op: name, args: values});
            ctx.pc = after;
        }
    } catch (error) {
        if (!error.ev3) throw error;
        return finish(DIRECT_REPLY_ERROR, error.message);
    }
    return finish(DIRECT_REPLY);
};

/**
 * A system command [CDK §3] no brick serves: answered SYSTEM_REPLY_ERROR / UNKNOWN_SYSTEM_COMMAND when a
 * reply is asked. The Virtual EV3 serves its file commands in hubs/ev3/ev3-system-commands.js.
 */
export const systemCommandReply = frame => (frame.type === SYSTEM_COMMAND_REPLY ?
    Uint8Array.from([5, 0, frame.counter & 0xff, frame.counter >> 8, SYSTEM_REPLY_ERROR, frame.code[0] ?? 0, UNKNOWN_SYSTEM_COMMAND]) : null);
