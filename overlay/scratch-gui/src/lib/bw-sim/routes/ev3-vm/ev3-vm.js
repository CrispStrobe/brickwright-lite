// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A clean-room interpreter of LEGO MINDSTORMS EV3 programs (`.rbf`): the Virtual EV3's program route
// (docs/EV3-RBF-VM.md; docs/ROBOT-LAB-EV3-NXT.md "L2"). lmsasm source → `.rbf` → downloaded with the
// system commands → opFILE LOAD_IMAGE + opPROGRAM_START → this VM → the brick's ports.
//
// SOURCES. LEGO's EV3 Firmware Developer Kit (§3 program structure and parameter encoding, §4 the
// byte codes) and LEGO's lms2012 source (mindboards/ev3sources, GPL-2) read as a FACT source — the
// scheduler, the object states, sub-call parameter passing, each byte code's arithmetic — re-expressed
// here in our own structure; no code, table or comment was copied. ev3dev/lmsasm (BSD-3) for how the
// assembler encodes what the fixtures use. Every fact is cited in docs/EV3-RBF-VM.md.
//
// WHAT THIS IS. A pure route module like the NXT VM (routes/nxt-vm/nxt-vm.js): no DOM, no physics, no
// hub. It runs in 1 ms steps on the Lab's clock and reaches the brick only through the `io` passed to
// advanceTo() — the Virtual EV3 (hubs/ev3/ev3-virtual-hub.js), the same BRICK the direct commands
// drive. The input, output, sound, user-interface and info instructions are the direct commands' own
// (hubs/ev3/ev3-direct-commands.js INSTRUCTIONS): one implementation of each, whichever thread sends
// it. Its whole state is plain JSON (snapshot/restore), so the physics worker's mirror can redo a batch.
//
// THE MACHINE (lms2012). A program is objects: VMTHREADs (object 1 starts; others by OBJECT_START),
// SUBCALLs (CALL copies the parameters into the sub's locals and halts the caller until RETURN copies
// the outputs back; a sub already running makes a second caller wait) and BLOCKs (started when
// OBJECT_TRIG has counted their triggers down; they run on their owner's locals). The scheduler runs
// the current object until it breaks (a blocking instruction rewinds and yields, OBJECT_END, SLEEP,
// …) or has run its slice of 200 byte codes, then the next RUNNING object in id order. The program
// ends when no object is RUNNING. Variables are bytes: globals, each object's locals, and arrays
// reached by handle (ARRAY CREATE*).
//
// TIME MODEL (ours). The brick runs byte codes as fast as it can; this VM gives every millisecond the
// same budget (`instrPerMs`, default 200 — an order-of-magnitude estimate, not a measurement). Waits,
// timers and sound durations are exact milliseconds.
//
// REFUSALS. An instruction the VM does not implement stops the program with a named error
// (UNIMPLEMENTED_OPCODE, UNIMPLEMENTED_SUBCOMMAND) — never a guess. What the firmware itself fails on
// (an array index outside the array, a call of an object that is not a sub, …) stops it as the
// firmware's FAILBREAK does, with the reason; a byte that is no opcode is ERR_INSTR.

import {parseRbf, CALLPAR} from './rbf-file.js';
import {
    OP, OPCODE_NAMES, PAR, MATH, STRINGS, ARRAY, PROGRAM_INFO, FILE, SLOT, OBJSTAT, RESULT, SLICE_INSTRUCTIONS, LIMITS
} from './ev3-bytecodes.js';
import {INSTRUCTIONS, SUBCOMMANDS} from '../../hubs/ev3/ev3-direct-commands.js';

export const SNAPSHOT_FORMAT = 'ev3-vm/1';
export const DEFAULT_INSTR_PER_MS = 200;
/** Array handles one program may hold (MAX_HANDLES). */
export const MAX_HANDLES = 250;

export class Ev3VmError extends Error {
    /** @param {string} code @param {string} message */
    constructor (code, message) {
        super(message);
        this.code = code;
    }
}
const fail = (code, message) => {
    throw new Ev3VmError(code, message);
};

// ---- scalars ---------------------------------------------------------------------------------------

const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);
const bitsToFloat = bits => {
    i32[0] = bits;
    return f32[0];
};
const floatToBits = f => {
    f32[0] = f;
    return i32[0];
};
const WIDTH = {8: 1, 16: 2, 32: 4, F: 4};
/** C's conversion of a value to an integer type: truncated to the type's width, two's complement. */
const wrap = (type, v) => {
    const n = Number.isFinite(v) ? Math.trunc(v) : 0;
    if (type === '8') return (n << 24) >> 24;
    if (type === '16') return (n << 16) >> 16;
    return n | 0;
};

// Object states (the firmware's OBJSTAT, by name in the snapshot).
const RUNNING = 'running';
const WAITING = 'waiting';
const STOPPED = 'stopped';
const HALTED = 'halted';

// What an instruction does to the dispatcher: continue, rewind and yield (BUSYBREAK), or yield (STOPBREAK/SLEEPBREAK).
const BUSY = 1;
const YIELD = 2;

/** The program VM. */
export class Ev3Vm {
    /**
     * @param {object} [options]
     * @param {number} [options.instrPerMs=200] byte codes per millisecond (our estimate)
     * @param {number} [options.seed=1] RANDOM's seed (a deterministic generator, ours)
     */
    constructor ({instrPerMs = DEFAULT_INSTR_PER_MS, seed = 1} = {}) {
        this.options = {instrPerMs: Math.max(1, Math.round(instrPerMs)), seed: (seed >>> 0) || 1};
        this.program = null;
        this.name = null;
        this.s = this._fresh(0);
    }

    _fresh (tick) {
        return {
            status: 'idle', ending: null, error: null, tick, startTick: tick,
            globals: [], locals: [null], objects: [null], current: 1, slice: SLICE_INSTRUCTIONS,
            handles: [], rng: this.options.seed, instructions: 0, events: []
        };
    }

    /**
     * Loads and starts a program at `tick` (what PROGRAM_START does with the image LOAD_IMAGE read).
     * @param {Uint8Array|number[]} bytes the `.rbf`
     * @param {{name?: string, tick?: number}} [options]
     * @returns {{ok: boolean, status?: string, detail?: string}}
     */
    start (bytes, {name = 'program.rbf', tick = 0} = {}) {
        const parsed = parseRbf(bytes);
        if (!parsed.ok) {
            this.program = null;
            this.s = this._fresh(tick);
            this.s.status = 'error';
            this.s.error = {code: parsed.status, message: parsed.detail, object: null, pc: null, opcode: null};
            return parsed;
        }
        this.program = parsed.program;
        this.name = name;
        const s = this._fresh(tick);
        const objects = parsed.program.objects;
        s.globals = new Array(parsed.program.globalBytes).fill(0);
        for (let id = 1; id < objects.length; id++) {
            const h = objects[id];
            s.locals.push(h.owner === 0 ? new Array(h.localBytes).fill(0) : null);
            // Object 1 runs if it has no trigger to wait for; every other object waits to be started.
            s.objects.push({status: id === 1 && h.trigger === 0 ? RUNNING : STOPPED, ip: h.offset, trigger: h.trigger, caller: 0, callSite: 0, blocked: false});
        }
        s.status = 'running';
        this.s = s;
        return {ok: true};
    }

    get status () { return this.s.status; }

    get error () { return this.s.error; }

    /** Recorded events (program end, errors), removed from the VM. */
    drainEvents () {
        const out = this.s.events;
        this.s.events = [];
        return out;
    }

    /** PROGRAM_STOP from outside: the program ends now. */
    abort () {
        if (this.s.status !== 'running') return false;
        this._end('abort');
        return true;
    }

    // ---- snapshot ----------------------------------------------------------------------------------

    snapshot () {
        return {format: SNAPSHOT_FORMAT, program: this.program ? this.program.fingerprint : null, name: this.name,
            options: {...this.options}, state: JSON.parse(JSON.stringify(this.s))};
    }

    /** @param {object} snap @param {Uint8Array|number[]|null} bytes the program's `.rbf` (to rebuild another program) */
    restore (snap, bytes = null) {
        if (!snap || snap.format !== SNAPSHOT_FORMAT) throw new Error(`Ev3Vm.restore: not an ${SNAPSHOT_FORMAT} snapshot`);
        const mine = this.program ? this.program.fingerprint : null;
        if (snap.program !== mine) {
            if (snap.program === null) this.program = null;
            else {
                const parsed = bytes ? parseRbf(bytes) : null;
                if (!parsed || !parsed.ok || parsed.program.fingerprint !== snap.program) {
                    throw new Error(`Ev3Vm.restore: snapshot is of program ${snap.program}; give its bytes`);
                }
                this.program = parsed.program;
            }
        }
        this.name = snap.name;
        this.options = {...snap.options};
        this.s = JSON.parse(JSON.stringify(snap.state));
    }

    // ---- time ----------------------------------------------------------------------------------------

    /**
     * Runs every whole millisecond up to `ms` on the brick's clock.
     * @param {number} ms
     * @param {object} io the brick (hubs/ev3/ev3-virtual-hub.js): the direct commands' BRICK methods,
     *        plus `atMs(t)` (the brick's clock follows the VM's milliseconds while it runs)
     */
    advanceTo (ms, io) {
        const end = Math.floor(ms);
        while (this.s.tick < end && this.s.status === 'running') {
            this.s.tick += 1;
            if (io && typeof io.atMs === 'function') io.atMs(this.s.tick);
            this._millisecond(io);
        }
        if (this.s.tick < end) this.s.tick = end;
    }

    _millisecond (io) {
        const s = this.s;
        let budget = this.options.instrPerMs;
        while (s.status === 'running' && budget > 0) {
            if (s.objects[s.current].status !== RUNNING && !this._next()) {
                this._end('ok');
                break;
            }
            const id = s.current;
            const outcome = this._step(id, io);
            budget -= 1;
            s.instructions += 1;
            if (s.status !== 'running') break;
            s.slice -= 1;
            if (outcome === BUSY || outcome === YIELD || s.slice <= 0) {
                s.slice = SLICE_INSTRUCTIONS;
                if (!this._next()) this._end('ok');
            }
        }
    }

    /** The next RUNNING object after the current one, in id order (the firmware's round robin); false if none. */
    _next () {
        const s = this.s;
        const n = s.objects.length - 1;
        for (let k = 1; k <= n; k++) {
            const id = ((s.current - 1 + k) % n) + 1;
            if (s.objects[id].status === RUNNING) {
                s.current = id;
                return true;
            }
        }
        return false;
    }

    /** Executes the instruction at object `id`'s ip. */
    _step (id, io) {
        const o = this.s.objects[id];
        const pc = o.ip;
        const code = this.program.code;
        if (pc >= code.length) {
            this._failWith(new Ev3VmError('ERR_INSTR', `object ${id} ran past the end of the image (byte ${pc})`), id, pc);
            return YIELD;
        }
        const op = code[pc];
        const c = new Cursor(this, id, pc + 1);
        try {
            const handler = VM_OPS.get(op);
            let outcome;
            if (handler) outcome = handler(this, c, io, id);
            else if (INSTRUCTIONS.has(op)) outcome = this._io(op, c, io);
            else if (OPCODE_NAMES[op] !== undefined) fail('UNIMPLEMENTED_OPCODE', `op${OPCODE_NAMES[op]} (0x${op.toString(16).padStart(2, '0')}) is not implemented by the Virtual EV3`);
            else fail('ERR_INSTR', `0x${op.toString(16).padStart(2, '0')} is not an EV3 opcode`);
            if (outcome === BUSY) {
                o.ip = pc;
                return BUSY;
            }
            // A CALL / RETURN moved execution to another object and set the ips itself.
            if (outcome && outcome.switched) return outcome.yield ? YIELD : undefined;
            if (this.s.objects[id] === o && o.status !== STOPPED) o.ip = c.pc;
            return outcome;
        } catch (e) {
            if (!(e instanceof Ev3VmError)) throw e;
            this._failWith(e, id, pc);
            return YIELD;
        }
    }

    _failWith (e, id, pc) {
        const op = this.program && this.program.code[pc];
        this.s.error = {code: e.code, message: e.message, object: id, pc,
            opcode: op === undefined ? null : (OPCODE_NAMES[op] ?? `0x${op.toString(16)}`)};
        this.s.events.push({t: this.s.tick, kind: 'error', ...this.s.error});
        this._end('error');
    }

    /** The program is over: every object stopped; the brick stops its outputs (hub side, via `ending`). */
    _end (how) {
        const s = this.s;
        s.status = how === 'error' ? 'error' : 'stopped';
        s.ending = how;
        for (let id = 1; id < s.objects.length; id++) s.objects[id].status = STOPPED;
        s.events.push({t: s.tick, kind: 'program-end', how});
    }

    // ---- the direct commands' instructions, run by a program ---------------------------------------------

    _io (op, c, io) {
        const entry = INSTRUCTIONS.get(op);
        let spec = entry;
        if (entry[SUBCOMMANDS]) {
            const sub = c.num('8') & 0xff;
            spec = entry[SUBCOMMANDS][sub];
            if (!spec) fail('UNIMPLEMENTED_SUBCOMMAND', `${entry.name} subcommand ${sub} is not implemented by the Virtual EV3`);
        }
        const values = [];
        const refs = [];
        let list = spec.args;
        if (typeof list === 'function') {
            // The list depends on the inputs read so far (VALUES-many outputs): read inputs until it settles.
            let fixed = 0;
            for (;;) {
                const now = list(values);
                if (now.length <= fixed || now[fixed][0] !== 'in') {
                    list = now.slice(fixed);
                    break;
                }
                values.push(c.value(now[fixed][1]));
                fixed += 1;
            }
        }
        for (const [dir, type] of list) {
            if (dir === 'in') values.push(c.value(type));
            else refs.push({ref: c.ref(), type});
        }
        const out = spec.run(io, values, this._writer(refs), {vm: this});
        return out && out.block ? BUSY : undefined;
    }

    /** The `ret` the shared instructions write their outputs with, into this VM's variables. */
    _writer (refs) {
        let next = 0;
        const put = value => {
            const out = refs[next++];
            if (!out) return;
            if (out.type === 'S') this.putString(out.ref, String(value), -1);
            else this.put(out.ref, out.type, value);
        };
        const ret = (...values) => { for (const v of values) put(v); };
        ret.next = put;
        ret.string = (text, length) => {
            const out = refs[next++];
            if (out) this.putString(out.ref, text, length === null || length === undefined ? -1 : length);
        };
        ret.array = (bytes, length) => {
            const out = refs[next++];
            if (!out) return;
            for (let i = 0; i < length; i++) this.put({...out.ref, off: out.ref.off + i}, '8', bytes[i] ?? 0);
        };
        return ret;
    }

    // ---- variables ------------------------------------------------------------------------------------

    _area (ref) {
        switch (ref.a) {
        case 'g': return this.s.globals;
        case 'l': return this.s.locals[ref.o];
        case 'h': {
            const h = this.s.handles[ref.h];
            if (!h) fail('FAILBREAK', `handle ${ref.h} names no array`);
            return h.data;
        }
        case 'c': return this.program.code;
        default: return null;
        }
    }

    _bounds (area, ref, width) {
        if (!area) fail('FAILBREAK', 'a variable outside the program\'s memory');
        if (ref.off < 0 || ref.off + width > area.length) {
            const where = ref.a === 'g' ? 'globals' : ref.a === 'l' ? `object ${ref.o}'s locals` : ref.a === 'h' ? `array ${ref.h}` : 'the image';
            fail('FAILBREAK', `${width} byte(s) at ${ref.off} are outside ${where} (${area.length} bytes)`);
        }
    }

    /** Reads a number of type '8' | '16' | '32' | 'F' at a reference. */
    get (ref, type) {
        if (ref.a === 'k') return constAs(ref.raw, type);
        const width = WIDTH[type];
        const area = this._area(ref);
        this._bounds(area, ref, width);
        const b = area;
        const at = ref.off;
        if (width === 1) return (b[at] << 24) >> 24;
        if (width === 2) return ((b[at] | (b[at + 1] << 8)) << 16) >> 16;
        const bits = b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);
        return type === 'F' ? bitsToFloat(bits) : bits;
    }

    /** Writes a number (C conversion to the type: truncation for integers, single precision for floats). */
    put (ref, type, value) {
        if (ref.a === 'k') return; // a constant as an output: the firmware writes its scratch value
        if (ref.a === 'c') fail('FAILBREAK', 'a write into the program image');
        const width = WIDTH[type];
        const area = this._area(ref);
        this._bounds(area, ref, width);
        const v = type === 'F' ? floatToBits(Number(value)) : wrap(type, value);
        for (let k = 0; k < width; k++) area[ref.off + k] = (v >>> (8 * k)) & 0xff;
    }

    /** A zero-terminated string at a reference. */
    getString (ref) {
        if (ref.a === 'k') {
            let text = '';
            for (let k = 0; k < 4; k++) {
                const ch = (ref.raw >>> (8 * k)) & 0xff;
                if (!ch) break;
                text += String.fromCharCode(ch);
            }
            return text;
        }
        const area = this._area(ref);
        this._bounds(area, ref, 1);
        let text = '';
        for (let i = ref.off; i < area.length && area[i] !== 0; i++) text += String.fromCharCode(area[i]);
        return text;
    }

    /**
     * Writes a zero-terminated string. `max` (≥ 1) bounds it with its terminator; -1: unbounded. An
     * array destination (passed by handle) is resized to fit, as the firmware's string operations do.
     */
    putString (ref, text, max = -1) {
        if (ref.a === 'k') return;
        if (ref.a === 'c') fail('FAILBREAK', 'a write into the program image');
        const room = max < 0 ? text.length + 1 : max;
        if (room <= 0) return;
        const bytes = [...text.slice(0, room - 1)].map(ch => ch.charCodeAt(0) & 0xff);
        bytes.push(0);
        if (ref.a === 'h' && ref.resize) this._resize(ref.h, bytes.length);
        const area = this._area(ref);
        this._bounds(area, ref, bytes.length);
        for (let k = 0; k < bytes.length; k++) area[ref.off + k] = bytes[k];
    }

    // ---- arrays (handles) -----------------------------------------------------------------------------

    _create (type, elements) {
        const s = this.s;
        let h = s.handles.findIndex(x => !x);
        if (h < 0) h = s.handles.length;
        if (h >= MAX_HANDLES) fail('FAILBREAK', `no more than ${MAX_HANDLES} array handles`);
        const size = WIDTH[type];
        s.handles[h] = {type, size, count: Math.max(0, elements), data: new Array(Math.max(0, elements) * size).fill(0)};
        return h;
    }

    _array (h) {
        const a = this.s.handles[h];
        if (!a) fail('FAILBREAK', `handle ${h} names no array`);
        return a;
    }

    /** Resizes an array to `elements` (new elements are zero: ours, the firmware's realloc leaves them undefined). */
    _resize (h, elements) {
        const a = this._array(h);
        const n = Math.max(0, elements);
        if (n * a.size > a.data.length) a.data.push(...new Array(n * a.size - a.data.length).fill(0));
        else a.data.length = n * a.size;
        a.count = n;
    }

    _random () {
        // xorshift32 (ours: the brick uses its C library's rand()), giving 0..32767.
        let x = this.s.rng;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.s.rng = x >>> 0;
        return this.s.rng & 0x7fff;
    }
}

/** A constant parameter read as a type: its low byte(s) sign-extended, or its 32 bits as a float. */
const constAs = (raw, type) => {
    if (type === '8') return (raw << 24) >> 24;
    if (type === '16') return (raw << 16) >> 16;
    if (type === 'F') return bitsToFloat(raw | 0);
    return raw | 0;
};

/**
 * Walks an instruction's parameters [FDK §3.4]:
 *   0 0 s v v v v v   short constant (6-bit two's complement)
 *   0 1 g i i i i i   short variable, local / global index 0..31
 *   1 0 l - - b b b   long constant: label flag; 1/2/4 bytes follow, or a zero-terminated string
 *   1 1 g h a b b b   long variable: global, handle, address flags; its index in 1/2/4 bytes
 */
class Cursor {
    constructor (vm, id, pc) {
        this.vm = vm;
        this.code = vm.program.code;
        this.pc = pc;
        const h = vm.program.objects[id];
        // A BLOCK runs on its owner's locals.
        this.localsOf = h.owner || id;
    }

    /** The next parameter as a reference: {a: 'k', raw} a constant, else where its bytes are. */
    next () {
        const code = this.code;
        if (this.pc >= code.length) fail('ERR_INSTR', `a parameter is expected at byte ${this.pc}, past the image`);
        const b = code[this.pc++];
        if ((b & PAR.LONG) === 0) {
            if ((b & PAR.VARIABLE) === 0) {
                const v = b & PAR.VALUE;
                return {a: 'k', raw: v & PAR.CONST_SIGN ? v - 0x40 : v};
            }
            return (b & PAR.GLOBAL) ? {a: 'g', off: b & PAR.INDEX} : {a: 'l', o: this.localsOf, off: b & PAR.INDEX};
        }
        const size = b & PAR.BYTES;
        if ((b & PAR.VARIABLE) === 0) {
            if (b & PAR.LABEL) fail('UNIMPLEMENTED_ENCODING', `a label parameter (0x${b.toString(16)}) at byte ${this.pc - 1}: opLABEL tables are not implemented`);
            if (size === 0 || size === 4) {
                const at = this.pc;
                while (this.pc < code.length && code[this.pc] !== 0) this.pc++;
                this.pc++;
                return {a: 'c', off: at};
            }
        }
        const n = {1: 1, 2: 2, 3: 4}[size];
        if (!n) fail('ERR_INSTR', `parameter encoding 0x${b.toString(16)} at byte ${this.pc - 1}`);
        let raw = 0;
        for (let k = 0; k < n; k++) raw |= code[this.pc++] << (8 * k);
        if ((b & PAR.VARIABLE) === 0) {
            return {a: 'k', raw: n === 1 ? (raw << 24) >> 24 : n === 2 ? (raw << 16) >> 16 : raw | 0};
        }
        const index = n === 4 ? raw >>> 0 : raw;
        const ref = (b & PAR.GLOBAL) ? {a: 'g', off: index} : {a: 'l', o: this.localsOf, off: index};
        if (b & PAR.HANDLE) {
            // The variable holds a handle: the parameter is that array's data.
            return {a: 'h', h: this.vm.get(ref, '16'), off: 0, resize: true};
        }
        if (b & PAR.ADDR) fail('UNIMPLEMENTED_ENCODING', `an address parameter (0x${b.toString(16)}) at byte ${this.pc - n - 1}`);
        return ref;
    }

    /** Skips a parameter (a branch not taken). */
    skip () { this.next(); }

    /** A reference for an output (a constant there is accepted and written nowhere, as on the brick). */
    ref () { return this.next(); }

    num (type) { return this.vm.get(this.next(), type); }

    str () { return this.vm.getString(this.next()); }

    /** An input of a direct-command argument type ('8' '16' '32' 'F' 'S'). */
    value (type) {
        if (type === 'S') return this.str();
        return this.num(type);
    }
}

// ---- the VM's own instructions --------------------------------------------------------------------

const VM_OPS = new Map();
const op = (code, fn) => VM_OPS.set(code, fn);
const TYPES = ['8', '16', '32', 'F'];

// General: ERROR (0x00) ends the program as the firmware's "INSTRBREAK".
op(OP.ERROR, () => fail('ERR_INSTR', 'opERROR'));
op(OP.NOP, () => undefined);

// ---- programs and objects ---------------------------------------------------------------------------

const objectOf = (vm, id, what) => {
    const o = vm.s.objects[id];
    if (!o || id < 1) fail('FAILBREAK', `${what}: object ${id} is not in the program (1..${vm.s.objects.length - 1})`);
    return o;
};
const enqueue = (vm, id) => {
    const o = vm.s.objects[id];
    const h = vm.program.objects[id];
    o.status = RUNNING;
    o.ip = h.offset;
    o.trigger = h.trigger;
};
const ownSlot = slot => slot === SLOT.USER || slot === SLOT.CURRENT || slot === SLOT.GUI;

op(OP.PROGRAM_STOP, (vm, c) => {
    // GUI_SLOT stops every program; CURRENT_SLOT and USER_SLOT this one.
    if (ownSlot(c.num('16'))) {
        vm._end('stop');
        return YIELD;
    }
    return undefined;
});
// The user slot is this program, so it is not STOPPED: PROGRAM_START does nothing, and LOAD_IMAGE leaves
// its outputs (other slots are not modelled).
op(OP.PROGRAM_START, (vm, c) => {
    c.num('16');
    c.num('32');
    c.num('32');
    c.num('8');
});
op(OP.OBJECT_STOP, (vm, c, io, id) => {
    const target = c.num('16');
    const o = objectOf(vm, target, 'OBJECT_STOP');
    o.status = STOPPED;
    if (target === id) o.ip = c.pc;
    return YIELD;
});
op(OP.OBJECT_START, (vm, c) => {
    const target = c.num('16');
    objectOf(vm, target, 'OBJECT_START');
    enqueue(vm, target);
});
op(OP.OBJECT_TRIG, (vm, c) => {
    const target = c.num('16');
    const o = objectOf(vm, target, 'OBJECT_TRIG');
    o.status = WAITING;
    if (o.trigger > 0) {
        o.trigger -= 1;
        if (o.trigger === 0) enqueue(vm, target);
    }
});
op(OP.OBJECT_WAIT, (vm, c) => (objectOf(vm, c.num('16'), 'OBJECT_WAIT').status !== STOPPED ? BUSY : undefined));
op(OP.OBJECT_END, (vm, c, io, id) => {
    const o = vm.s.objects[id];
    o.ip = vm.program.objects[id].offset;
    o.status = STOPPED;
    return YIELD;
});
op(OP.SLEEP, () => YIELD);

/** Sub-call parameter types → variable types, and the alignment the firmware gives them in the locals. */
const PAR_TYPE = {[CALLPAR.DATA8]: '8', [CALLPAR.DATA16]: '16', [CALLPAR.DATA32]: '32', [CALLPAR.DATAF]: 'F'};
const align = (off, width) => (width > 1 ? Math.ceil(off / width) * width : off);

op(OP.CALL, (vm, c, io, id) => {
    const target = c.num('16');
    const callee = objectOf(vm, target, 'CALL');
    const header = vm.program.objects[target];
    if (header.kind !== 'subcall') fail('FAILBREAK', `CALL of object ${target}, a ${header.kind}, not a subcall`);
    if (callee.status !== STOPPED) {
        // A sub in use by another caller: this one waits (and the sub yields when it returns).
        callee.blocked = true;
        return BUSY;
    }
    c.num('8'); // the number of parameters (the sub's own list says what they are)
    const callSite = c.pc;
    const locals = vm.s.locals[target];
    let off = 0;
    for (const par of header.params) {
        const src = c.next();
        if (par.type === CALLPAR.STRING) {
            if (par.in) {
                const text = vm.getString(src).slice(0, par.size - 1);
                for (let k = 0; k < par.size; k++) locals[off + k] = k < text.length ? text.charCodeAt(k) & 0xff : 0;
            }
            off += par.size;
            continue;
        }
        const type = PAR_TYPE[par.type];
        off = align(off, WIDTH[type]);
        if (par.in) vm.put({a: 'l', o: target, off}, type, vm.get(src, type));
        off += WIDTH[type];
    }
    const caller = vm.s.objects[id];
    caller.ip = callSite;
    caller.status = HALTED;
    callee.ip = header.entry;
    callee.caller = id;
    callee.status = RUNNING;
    vm.s.current = target;
    return {switched: true};
});

op(OP.RETURN, (vm, c, io, id) => {
    const callee = vm.s.objects[id];
    const header = vm.program.objects[id];
    const callerId = callee.caller;
    const caller = objectOf(vm, callerId, 'RETURN');
    // Walk the caller's parameters again, writing the outputs back.
    const back = new Cursor(vm, callerId, caller.ip);
    let off = 0;
    for (const par of header.params || []) {
        const dst = back.next();
        if (par.type === CALLPAR.STRING) {
            if (par.out) vm.putString(dst, vm.getString({a: 'l', o: id, off}).slice(0, par.size - 1), par.size);
            off += par.size;
            continue;
        }
        const type = PAR_TYPE[par.type];
        off = align(off, WIDTH[type]);
        if (par.out) vm.put(dst, type, vm.get({a: 'l', o: id, off}, type));
        off += WIDTH[type];
    }
    caller.ip = back.pc;
    callee.status = STOPPED;
    callee.ip = c.pc;
    const yieldNow = callee.blocked;
    callee.blocked = false;
    caller.status = RUNNING;
    vm.s.current = callerId;
    return {switched: true, yield: yieldNow};
});

op(OP.PROGRAM_INFO, (vm, c, io, id) => {
    const sub = c.num('8');
    const slot = c.num('16');
    const mine = ownSlot(slot) && slot !== SLOT.GUI;
    switch (sub) {
    case PROGRAM_INFO.OBJ_STOP: {
        const target = c.num('16');
        if (mine && vm.s.objects[target] && target > 0) vm.s.objects[target].status = STOPPED;
        if (mine && target === id) return YIELD;
        return undefined;
    }
    case PROGRAM_INFO.OBJ_START: {
        const target = c.num('16');
        if (mine && vm.s.objects[target] && target > 0) enqueue(vm, target);
        return undefined;
    }
    case PROGRAM_INFO.GET_STATUS: vm.put(c.ref(), '8', mine ? OBJSTAT.RUNNING : OBJSTAT.STOPPED); return undefined;
    case PROGRAM_INFO.GET_SPEED: vm.put(c.ref(), '32', mine ? vm.options.instrPerMs * 1000 : 0); return undefined;
    case PROGRAM_INFO.GET_PRGRESULT: vm.put(c.ref(), '8', mine ? RESULT.BUSY : RESULT.OK); return undefined;
    case PROGRAM_INFO.SET_INSTR: {
        const n = c.num('16');
        if (n >= 0 && n <= SLICE_INSTRUCTIONS) vm.s.slice = n + 1;
        return undefined;
    }
    default: return fail('FAILBREAK', `PROGRAM_INFO subcommand ${sub}`);
    }
});

// opLABEL defines a label for long label parameters, which this VM refuses where they are used.
op(OP.LABEL, (vm, c) => { c.next(); });

// ---- arithmetic [FDK §4.2, §4.3] --------------------------------------------------------------------

const INT_RANGE = {8: LIMITS[8], 16: LIMITS[16], 32: LIMITS[32]};
const binary = (base, types, fn) => types.forEach((type, k) => op(base + k, (vm, c) => {
    if (type === null) return fail('UNIMPLEMENTED_OPCODE', `0x${(base + k).toString(16)}`);
    const a = c.num(type);
    const b = c.num(type);
    vm.put(c.ref(), type, fn(a, b, type));
    return undefined;
}));
const fround = Math.fround;
binary(OP.ADD8, TYPES, (a, b, t) => (t === 'F' ? fround(a + b) : a + b));
binary(OP.SUB8, TYPES, (a, b, t) => (t === 'F' ? fround(a - b) : a - b));
binary(OP.MUL8, TYPES, (a, b, t) => (t === 'F' ? fround(a * b) : (t === '32' ? Math.imul(a, b) : a * b)));
binary(OP.DIV8, TYPES, (a, b, t) => {
    if (t === 'F') return fround(a / b);
    // Integer division by zero: the type's max for a positive dividend, its min for a negative one, 0 for 0.
    if (b === 0) return a > 0 ? INT_RANGE[t].max : a < 0 ? INT_RANGE[t].min : 0;
    return Math.trunc(a / b);
});
binary(OP.OR8, ['8', '16', '32'], (a, b) => a | b);
binary(OP.AND8, ['8', '16', '32'], (a, b) => a & b);
binary(OP.XOR8, ['8', '16', '32'], (a, b) => a ^ b);
binary(OP.RL8, ['8', '16', '32'], (a, b) => a << (b & 31));

op(OP.INIT_BYTES, (vm, c) => {
    const dest = c.ref();
    const n = c.num('32');
    for (let k = 0; k < n; k++) vm.put({...dest, off: dest.off + k}, '8', c.num('8'));
});

// ---- moves [FDK §4.4]: widening keeps "not a number"; narrowing saturates to the type's range ---------

const isNan = (type, v) => (type === 'F' ? Number.isNaN(v) : v === LIMITS[type].nan);
const nanOf = type => (type === 'F' ? NaN : LIMITS[type].nan);
TYPES.forEach((from, i) => TYPES.forEach((to, j) => op(OP.MOVE8_8 + i * 4 + j, (vm, c) => {
    const v = c.num(from);
    const dest = c.ref();
    if (from === to) { vm.put(dest, to, v); return; }
    if (isNan(from, v)) { vm.put(dest, to, nanOf(to)); return; }
    if (to === 'F') { vm.put(dest, to, v); return; }
    const {min, max} = LIMITS[to];
    vm.put(dest, to, Math.trunc(Math.max(min, Math.min(max, v))));
})));

// ---- branches and comparisons [FDK §4.5, §4.6, §4.7] -----------------------------------------------

/** A branch's offset is relative to the byte after it. */
const jump = (c, taken) => {
    if (!taken) { c.skip(); return; }
    const offset = c.num('32');
    c.pc += offset;
};
op(OP.JR, (vm, c) => jump(c, true));
op(OP.JR_FALSE, (vm, c) => jump(c, c.num('8') === 0));
op(OP.JR_TRUE, (vm, c) => jump(c, c.num('8') !== 0));
op(OP.JR_NAN, (vm, c) => jump(c, Number.isNaN(c.num('F'))));
const CMP = {LT: (a, b) => a < b, GT: (a, b) => a > b, EQ: (a, b) => a === b, NEQ: (a, b) => a !== b, LTEQ: (a, b) => a <= b, GTEQ: (a, b) => a >= b};
for (const [name, fn] of Object.entries(CMP)) {
    TYPES.forEach((type, k) => {
        op(OP[`CP_${name}8`] + k, (vm, c) => {
            const a = c.num(type);
            const b = c.num(type);
            vm.put(c.ref(), '8', fn(a, b) ? 1 : 0);
        });
        op(OP[`JR_${name}8`] + k, (vm, c) => {
            const a = c.num(type);
            const b = c.num(type);
            jump(c, fn(a, b));
        });
    });
}
TYPES.forEach((type, k) => op(OP.SELECT8 + k, (vm, c) => {
    const flag = c.num('8');
    const a = c.num(type);
    const b = c.num(type);
    vm.put(c.ref(), type, flag ? a : b);
}));

// ---- math [FDK §4.2 opMATH], RANDOM ------------------------------------------------------------------

const DEG = Math.PI / 180;
const fmod = (x, y) => x % y;
const round = x => (x < 0 ? Math.ceil(x - 0.5) : Math.floor(x + 0.5));
const unaryF = {
    [MATH.EXP]: Math.exp, [MATH.FLOOR]: Math.floor, [MATH.CEIL]: Math.ceil, [MATH.ROUND]: round, [MATH.ABS]: Math.abs,
    [MATH.NEGATE]: x => 0 - x, [MATH.SQRT]: Math.sqrt, [MATH.LOG]: Math.log10, [MATH.LN]: Math.log,
    [MATH.SIN]: x => Math.sin(x * DEG), [MATH.COS]: x => Math.cos(x * DEG), [MATH.TAN]: x => Math.tan(x * DEG),
    [MATH.ASIN]: x => Math.asin(x) / DEG, [MATH.ACOS]: x => Math.acos(x) / DEG, [MATH.ATAN]: x => Math.atan(x) / DEG
};
op(OP.MATH, (vm, c) => {
    const sub = c.num('8');
    if (unaryF[sub]) {
        const x = c.num('F');
        vm.put(c.ref(), 'F', unaryF[sub](x));
        return;
    }
    switch (sub) {
    case MATH.MOD: case MATH.POW: {
        const x = c.num('F');
        const y = c.num('F');
        vm.put(c.ref(), 'F', sub === MATH.MOD ? fmod(x, y) : Math.pow(x, y));
        return;
    }
    case MATH.MOD8: case MATH.MOD16: case MATH.MOD32: {
        const type = ['8', '16', '32'][sub - MATH.MOD8];
        const x = c.num(type);
        const y = c.num(type);
        // x % 0 is undefined in C; ours: 0.
        vm.put(c.ref(), type, y === 0 ? 0 : x % y);
        return;
    }
    case MATH.TRUNC: {
        const x = c.num('F');
        const n = Math.max(0, Math.min(9, c.num('8')));
        const p = 10 ** n;
        vm.put(c.ref(), 'F', Math.trunc(fround(x) * p) / p);
        return;
    }
    default: fail('UNIMPLEMENTED_SUBCOMMAND', `opMATH subcommand ${sub}`);
    }
});
op(OP.RANDOM, (vm, c) => {
    const min = c.num('16');
    const max = c.num('16');
    // The firmware's scaling of a 0..32767 number into min..max.
    const r = vm._random();
    vm.put(c.ref(), '16', Math.trunc(((r * (max - min)) + 16383) / 32767) + min);
});

// ---- timers [FDK §4.11]: on the VM's milliseconds ---------------------------------------------------

op(OP.TIMER_WAIT, (vm, c) => {
    const ms = c.num('32');
    vm.put(c.ref(), '32', vm.s.tick + ms);
});
op(OP.TIMER_READY, (vm, c) => ((c.num('32') >>> 0) <= vm.s.tick ? undefined : BUSY));
// TIMER_READ: milliseconds since the program started.
op(OP.TIMER_READ, (vm, c) => vm.put(c.ref(), '32', vm.s.tick - vm.s.startTick));
op(OP.TIMER_READ_US, (vm, c) => vm.put(c.ref(), '32', vm.s.tick * 1000));
op(OP.KEEP_ALIVE, (vm, c, io) => vm.put(c.ref(), '8', io && io.sleepMinutes ? io.sleepMinutes() : 30));

// ---- byte arrays in variables (READx / WRITEx) and arrays by handle (ARRAY*) [FDK §4.4, §4.14] --------

TYPES.forEach((type, k) => {
    op(OP.READ8 + k, (vm, c) => {
        const src = c.ref();
        const index = c.num('8');
        vm.put(c.ref(), type, vm.get({...src, off: src.off + index * WIDTH[type]}, type));
    });
    op(OP.WRITE8 + k, (vm, c) => {
        const v = c.num(type);
        const index = c.num('8');
        const dest = c.ref();
        vm.put({...dest, off: dest.off + index * WIDTH[type]}, type, v);
    });
});

const ELEMENT = {[ARRAY.CREATE8]: '8', [ARRAY.CREATE16]: '16', [ARRAY.CREATE32]: '32', [ARRAY.CREATEF]: 'F'};
op(OP.ARRAY, (vm, c) => {
    const sub = c.num('8');
    switch (sub) {
    case ARRAY.CREATE8: case ARRAY.CREATE16: case ARRAY.CREATE32: case ARRAY.CREATEF: {
        const n = c.num('32');
        vm.put(c.ref(), '16', vm._create(ELEMENT[sub], n));
        return;
    }
    case ARRAY.DELETE: {
        const h = c.num('16');
        if (vm.s.handles[h]) vm.s.handles[h] = null;
        return;
    }
    case ARRAY.SIZE: {
        const h = c.num('16');
        const a = vm.s.handles[h];
        vm.put(c.ref(), '32', a ? a.count : 0);
        return;
    }
    case ARRAY.RESIZE: {
        const h = c.num('16');
        vm._resize(h, c.num('32'));
        return;
    }
    case ARRAY.FILL: {
        const h = c.num('16');
        const a = vm._array(h);
        const v = c.num(a.type);
        for (let i = 0; i < a.count; i++) vm.put({a: 'h', h, off: i * a.size}, a.type, v);
        return;
    }
    case ARRAY.COPY: {
        const hs = c.num('16');
        const hd = c.num('16');
        const src = vm._array(hs);
        const dst = vm._array(hd);
        if (src.type !== dst.type) fail('FAILBREAK', `ARRAY COPY between a DATA${src.type} and a DATA${dst.type} array`);
        dst.data = src.data.slice();
        dst.count = src.count;
        return;
    }
    case ARRAY.INIT8: case ARRAY.INIT16: case ARRAY.INIT32: case ARRAY.INITF: {
        const type = ['8', '16', '32', 'F'][sub - ARRAY.INIT8];
        const h = c.num('16');
        const index = c.num('32');
        const n = c.num('32');
        const a = vm._array(h);
        if (index < 0 || index + n > a.count) fail('FAILBREAK', `ARRAY INIT of ${n} at ${index} outside ${a.count} elements`);
        for (let k = 0; k < n; k++) vm.put({a: 'h', h, off: (index + k) * a.size}, a.type, c.num(type));
        return;
    }
    case ARRAY.READ_CONTENT: case ARRAY.WRITE_CONTENT: {
        c.num('16'); // the program slot: this one
        const h = c.num('16');
        const index = c.num('32');
        const bytes = c.num('32');
        const dest = c.ref();
        const a = vm._array(h);
        if (index < 0) fail('FAILBREAK', `ARRAY ${sub === ARRAY.READ_CONTENT ? 'READ' : 'WRITE'}_CONTENT at ${index}`);
        if (sub === ARRAY.READ_CONTENT) {
            if (dest.a === 'h' && dest.resize) vm._resize(dest.h, bytes);
            for (let k = 0; k < bytes; k++) vm.put({...dest, off: dest.off + k}, '8', index + k < a.data.length ? a.data[index + k] : 0);
        } else {
            vm._resize(h, Math.ceil((index + bytes) / a.size));
            for (let k = 0; k < bytes; k++) a.data[index + k] = vm.get({...dest, off: dest.off + k}, '8') & 0xff;
        }
        return;
    }
    case ARRAY.READ_SIZE: {
        c.num('16');
        const a = vm.s.handles[c.num('16')];
        vm.put(c.ref(), '32', a ? a.count * a.size : 0);
        return;
    }
    default: fail('UNIMPLEMENTED_SUBCOMMAND', `opARRAY subcommand ${sub}`);
    }
});
op(OP.ARRAY_WRITE, (vm, c) => {
    const h = c.num('16');
    const index = c.num('32');
    const value = c.ref();
    const a = vm._array(h);
    if (index < 0) fail('FAILBREAK', `ARRAY_WRITE at index ${index}`);
    // Writing past the end grows the array.
    if (index + 1 > a.count) vm._resize(h, index + 1);
    vm.put({a: 'h', h, off: index * a.size}, a.type, vm.get(value, a.type));
});
op(OP.ARRAY_READ, (vm, c) => {
    const h = c.num('16');
    const index = c.num('32');
    const a = vm._array(h);
    if (index < 0 || index >= a.count) fail('FAILBREAK', `ARRAY_READ index ${index} outside the array's ${a.count} elements`);
    vm.put(c.ref(), a.type, vm.get({a: 'h', h, off: index * a.size}, a.type));
});
op(OP.ARRAY_APPEND, (vm, c) => {
    const h = c.num('16');
    const value = c.ref();
    const a = vm._array(h);
    const index = a.count;
    vm._resize(h, index + 1);
    vm.put({a: 'h', h, off: index * a.size}, a.type, vm.get(value, a.type));
});
op(OP.MEMORY_USAGE, (vm, c) => {
    // Ours: the user memory as kB, total and free (the program's arrays counted against 6 MB).
    const used = vm.s.handles.reduce((n, a) => n + (a ? a.data.length : 0), 0);
    vm.put(c.ref(), '32', 6144);
    vm.put(c.ref(), '32', Math.max(0, 6144 - Math.ceil(used / 1024)));
});

// ---- strings [FDK §4.14 opSTRINGS] -------------------------------------------------------------------

/** printf's %[flags][width][.precision]conversion for one number (VALUE_FORMATTED / NUMBER_FORMATTED). */
const printf1 = (format, value, integer) => format.replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?([diuxXfFeEgG%])/, (m, flags, width, prec, conv) => {
    if (conv === '%') return '%';
    let body;
    let v = value;
    switch (conv) {
    case 'd': case 'i': v = integer ? v | 0 : Math.trunc(v); body = String(Math.abs(v)); break;
    case 'u': body = String((integer ? v | 0 : Math.trunc(v)) >>> 0); v = 1; break;
    case 'x': body = ((v | 0) >>> 0).toString(16); v = 1; break;
    case 'X': body = ((v | 0) >>> 0).toString(16).toUpperCase(); v = 1; break;
    case 'e': case 'E': body = Math.abs(v).toExponential(prec === undefined ? 6 : Number(prec)).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') body = body.toUpperCase(); break;
    case 'g': case 'G': body = String(Number(Math.abs(v).toPrecision(prec === undefined ? 6 : Math.max(1, Number(prec))))); break;
    default: body = Math.abs(v).toFixed(prec === undefined ? 6 : Number(prec));
    }
    const sign = v < 0 || Object.is(v, -0) && conv === 'f' ? '-' : (flags.includes('+') ? '+' : (flags.includes(' ') ? ' ' : ''));
    const w = Number(width || 0);
    if (flags.includes('-')) return (sign + body).padEnd(w);
    if (flags.includes('0')) return sign + body.padStart(Math.max(0, w - sign.length), '0');
    return (sign + body).padStart(w);
});

op(OP.STRINGS, (vm, c) => {
    const sub = c.num('8');
    switch (sub) {
    case STRINGS.GET_SIZE: {
        const text = c.str();
        vm.put(c.ref(), '16', text.length);
        return;
    }
    case STRINGS.ADD: {
        const a = c.str();
        const b = c.str();
        vm.putString(c.ref(), a + b);
        return;
    }
    case STRINGS.COMPARE: {
        const a = c.str();
        const b = c.str();
        vm.put(c.ref(), '8', a === b ? 1 : 0);
        return;
    }
    case STRINGS.DUPLICATE: {
        const a = c.str();
        vm.putString(c.ref(), a);
        return;
    }
    case STRINGS.VALUE_TO_STRING: {
        const v = c.num('F');
        let figures = c.num('8');
        const decimals = c.num('8');
        const dest = c.ref();
        let text;
        if (Number.isNaN(v)) {
            // "----" right-aligned in the figures (or left-aligned for negative figures).
            const n = Math.abs(figures);
            text = figures < 0 ? '----'.slice(0, n).padEnd(n) : '----'.padStart(n).slice(-n);
        } else {
            const fixed = v.toFixed(Math.max(0, decimals));
            text = figures >= 0 ? fixed.padStart(figures).slice(0, figures || fixed.length) : fixed.slice(0, -figures);
            if (figures === 0) text = '';
            if (decimals && text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
        }
        figures = Math.abs(figures);
        vm.putString(dest, text, dest.a === 'h' ? -1 : figures + 1);
        return;
    }
    case STRINGS.STRING_TO_VALUE: {
        const text = c.str().replace(/,/g, '.');
        const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text);
        vm.put(c.ref(), 'F', m ? parseFloat(m[0]) : NaN);
        return;
    }
    case STRINGS.STRIP: {
        const a = c.str();
        vm.putString(c.ref(), a.replace(/ /g, ''));
        return;
    }
    case STRINGS.NUMBER_TO_STRING: {
        const v = c.num('16');
        const figures = c.num('8');
        const dest = c.ref();
        const digits = String(Math.abs(v));
        const sign = v < 0 ? '-' : '';
        const text = (sign + digits.padStart(Math.max(0, figures - sign.length), '0')).slice(0, Math.max(0, figures));
        vm.putString(dest, text, dest.a === 'h' ? -1 : Math.max(0, figures) + 1);
        return;
    }
    case STRINGS.SUB: {
        const a = c.str();
        const b = c.str();
        const at = a.indexOf(b);
        // The text after the first occurrence of the second string (ours: "" when it does not occur).
        vm.putString(c.ref(), at < 0 ? '' : a.slice(at + b.length));
        return;
    }
    case STRINGS.VALUE_FORMATTED: case STRINGS.NUMBER_FORMATTED: {
        const integer = sub === STRINGS.NUMBER_FORMATTED;
        const v = c.num(integer ? '32' : 'F');
        const format = c.str();
        const size = c.num('8');
        const dest = c.ref();
        const text = printf1(format, v, integer);
        vm.putString(dest, text, dest.a === 'h' ? -1 : size);
        return;
    }
    default: fail('UNIMPLEMENTED_SUBCOMMAND', `opSTRINGS subcommand ${sub}`);
    }
});

// ---- files: LOAD_IMAGE only (the user slot is this program, so it loads nothing) --------------------

op(OP.FILE, (vm, c) => {
    const sub = c.num('8');
    if (sub !== FILE.LOAD_IMAGE) fail('UNIMPLEMENTED_SUBCOMMAND', `opFILE subcommand ${sub} is not implemented by the Virtual EV3`);
    c.num('16');
    c.str();
    c.ref();
    c.ref();
});

export const createEv3Vm = options => new Ev3Vm(options);
export {OBJSTAT, RESULT, SLOT};
