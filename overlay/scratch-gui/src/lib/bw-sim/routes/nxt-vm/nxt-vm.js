// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A clean-room interpreter of LEGO MINDSTORMS NXT executables (`.rxe`): the Virtual NXT's program
// route (docs/NXT-RXE-VM.md; docs/ROBOT-LAB-EV3-NXT.md "L2"). NXC → NBC → `.rxe` → downloaded to the
// brick (system commands) → STARTPROGRAM → this VM → the brick's ports.
//
// SOURCES. Facts read from LEGO's open-source NXT firmware 1.29 (`lego-1.29` tag of
// schodet/nxt-firmware; LEGO's open-source licence) — the command module's interpreter, scheduler,
// dataspace and system-call wrappers — and checked on NBC-compiled fixtures. The behaviour below is
// re-expressed in our own structure (plain-data state, JS arrays for queues and array storage);
// no code, table or comment was copied. Every fact is cited in docs/NXT-RXE-VM.md.
//
// WHAT THIS IS. A pure route module like the RCX VM (routes/rcx-vm/rcx-vm.js): no DOM, no physics,
// no hub. It runs in 1 ms ticks, as the brick's command module does, and reaches the brick only
// through the `io` object passed to advanceTo() (the Virtual NXT implements it:
// hubs/nxt/nxt-virtual-hub.js). Its whole state is plain JSON data (snapshot/restore), so the
// physics worker's mirror can redo a batch exactly.
//
// THE MACHINE.
//   Program: clumps (code fragments) with fire counts and dependents; a dataspace described by a
//   table of contents (TOC) of typed entries; dope vectors for arrays.
//   Dataspace: the static part is a byte array (`s.mem`); each array's storage is its own byte array
//   (`s.arrays[dope-vector index]`) — the firmware keeps them in one pool and compacts it, which no
//   program can observe except through running out of memory (counted here against the same 32 KB).
//   A place in the dataspace is (TOC entry, storage, base): a static entry is (id, 0, 0); an element
//   of an array is its element template's entries, in that array's storage, at element × size.
//   Scheduler: a run queue and a rest queue of clumps. Each ms: clumps whose wait is over rejoin the
//   run queue; then the head of the queue runs up to 20 instructions before the next one gets a
//   turn, until the ms's instruction budget (`instrPerMs`) is spent; then the output module applies
//   the program's output updates and the input module refreshes its validity flags.
//   The program ends when no clump is queued or resting (or on STOP, an error, STOPPROGRAM).
//
// TIME MODEL. The real brick runs instructions until the millisecond is over, so its speed depends on
// the instructions; this VM gives every millisecond the same instruction budget (default 20 — ORDER
// OF MAGNITUDE, our estimate, a constructor option). Nothing in NXC semantics depends on it except
// how long a busy loop takes. Waits, ticks and sleep times are exact milliseconds.
//
// REFUSALS. An opcode or system call this VM does not implement stops the program with a named error
// (`UNIMPLEMENTED_OPCODE`, `UNIMPLEMENTED_SYSCALL`) — never a guess. Errors the firmware itself
// raises (ERR_INSTR, ERR_ARG, ERR_MEM, …) stop it with their firmware names.

import {
    TC, TC_SIZE, TC_LAST_INT, TC_NAMES, isAggregate, NOT_A_DS_ID, VM_STATUS, parseRxe, nextEntry, elementSize,
    POOL_BYTES, CLUMP_RECORD_BYTES, DOPE_VECTOR_BYTES
} from './rxe-file.js';
import {
    OP, OP_NAMES, SHORT_OPS, CC, VARIABLE_SIZE, SLICE_INSTRUCTIONS, RUN, IN_FIELD, IN_FIELDS_PER_PORT, INPUT_PORTS,
    OUT_FIELD, OUT_FIELDS_PER_PORT, OUTPUT_PORTS, UPDATE, DEFAULT_PID, INVALID_PASSES, INVALID_PASSES_SOUND
} from './nxt-bytecodes.js';
import {SYSCALLS} from './nxt-syscalls.js';

export const SNAPSHOT_FORMAT = 'nxt-vm/1';
export const DEFAULT_INSTR_PER_MS = 20;

/** Output IO-map field types (what a GETOUT reads as, what a SETOUT stores as). */
const OUT_TYPES = [TC.UBYTE, TC.UBYTE, TC.SBYTE, TC.SBYTE, TC.SLONG, TC.ULONG, TC.UBYTE, TC.SBYTE, TC.UBYTE, TC.UBYTE,
    TC.UBYTE, TC.UBYTE, TC.UBYTE, TC.SLONG, TC.SLONG];
const IN_TYPES = [TC.UBYTE, TC.UBYTE, TC.UWORD, TC.UWORD, TC.SWORD, TC.UBYTE];
const SOUND_TYPES = new Set([0x07, 0x08]);

export class NxtVmError extends Error {
    /**
     * @param {string} code a firmware status name (ERR_INSTR, …) or ours (UNIMPLEMENTED_OPCODE, …)
     * @param {string} message
     */
    constructor (code, message) {
        super(message);
        this.code = code;
    }
}
const fail = (code, message) => {
    throw new NxtVmError(code, message);
};

// ---- scalars ---------------------------------------------------------------------------------------

const f32 = new Float32Array(1);
const f32Bytes = new Uint8Array(f32.buffer);
const readF32 = (b, at) => {
    for (let k = 0; k < 4; k++) f32Bytes[k] = b[at + k] ?? 0;
    return f32[0];
};
const writeF32 = (b, at, v) => {
    f32[0] = v;
    for (let k = 0; k < 4; k++) b[at + k] = f32Bytes[k];
};
const u32 = v => v >>> 0;
const s32 = v => v | 0;
/** Unsigned type codes are the odd ones (UBYTE, UWORD, ULONG — and ARRAY, MUTEX, which hold no number). */
const unsignedType = t => (t & 1) === 1;
const signedType = t => t === TC.SBYTE || t === TC.SWORD || t === TC.SLONG;

/** A value as the firmware's 32-bit register holds it (sign-extended for signed types), as uint32. */
const getRaw = (type, b, at) => {
    switch (type) {
    case TC.UBYTE: return b[at];
    case TC.SBYTE: return u32((b[at] << 24) >> 24);
    case TC.UWORD: return b[at] | (b[at + 1] << 8);
    case TC.SWORD: return u32(((b[at] | (b[at + 1] << 8)) << 16) >> 16);
    case TC.ULONG: case TC.SLONG: return u32(b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24));
    case TC.FLOAT: {
        // Rounded half away from zero (the firmware's float-to-integer read).
        const f = readF32(b, at);
        return u32(Math.trunc(f >= 0 ? f + 0.5 : f - 0.5));
    }
    default: return 0;
    }
};
const setRaw = (type, b, at, v) => {
    switch (type) {
    case TC.UBYTE: case TC.SBYTE: b[at] = v & 0xff; break;
    case TC.UWORD: case TC.SWORD: b[at] = v & 0xff; b[at + 1] = (v >>> 8) & 0xff; break;
    case TC.ULONG: case TC.SLONG:
        b[at] = v & 0xff; b[at + 1] = (v >>> 8) & 0xff; b[at + 2] = (v >>> 16) & 0xff; b[at + 3] = (v >>> 24) & 0xff; break;
    case TC.FLOAT: writeF32(b, at, s32(v)); break;
    default: break; // aggregates and mutexes take no number
    }
};
const getFloat = (type, b, at) => {
    switch (type) {
    case TC.FLOAT: return readF32(b, at);
    case TC.ULONG: case TC.UWORD: case TC.UBYTE: return getRaw(type, b, at);
    case TC.SLONG: case TC.SWORD: case TC.SBYTE: return s32(getRaw(type, b, at));
    default: return 0;
    }
};
const setFloat = (type, b, at, f) => {
    if (type === TC.FLOAT) { writeF32(b, at, f); return; }
    // A float stored into an integer: truncated toward zero, then cut to the type's width (ours: the
    // firmware's conversion of a negative float to an unsigned register is not defined by its source).
    const v = Number.isFinite(f) ? Math.trunc(f) : 0;
    setRaw(type, b, at, u32(v));
};

const compare = (cc, a, b, ta, tb) => {
    let x = a;
    let y = b;
    if (!(unsignedType(ta) || unsignedType(tb))) { x = s32(a); y = s32(b); }
    switch (cc) {
    case CC.LT: return x < y ? 1 : 0;
    case CC.GT: return x > y ? 1 : 0;
    case CC.LTEQ: return x <= y ? 1 : 0;
    case CC.GTEQ: return x >= y ? 1 : 0;
    case CC.EQ: return x === y ? 1 : 0;
    case CC.NEQ: return x !== y ? 1 : 0;
    default: return 0;
    }
};
const compareFloat = (cc, x, y) => {
    switch (cc) {
    case CC.LT: return x < y ? 1 : 0;
    case CC.GT: return x > y ? 1 : 0;
    case CC.LTEQ: return x <= y ? 1 : 0;
    case CC.GTEQ: return x >= y ? 1 : 0;
    case CC.EQ: return x === y ? 1 : 0;
    case CC.NEQ: return x !== y ? 1 : 0;
    default: return 0;
    }
};

const binop = (op, cc, a, b, ta, tb) => {
    switch (op) {
    case OP.ADD: return u32(a + b);
    case OP.SUB: return u32(a - b);
    case OP.MUL: return u32(Math.imul(a, b));
    case OP.DIV:
        // x / 0 is 0 on the brick; signed only where the operand is of a signed type.
        if (b === 0) return 0;
        return u32(Math.trunc((signedType(ta) ? s32(a) : a) / (signedType(tb) ? s32(b) : b)));
    case OP.MOD: {
        if (b === 0) return a;
        const x = signedType(ta) ? s32(a) : a;
        const y = signedType(tb) ? s32(b) : b;
        return u32(x % y);
    }
    case OP.AND: return u32(a & b);
    case OP.OR: return u32(a | b);
    case OP.XOR: return u32(a ^ b);
    case OP.CMP: return compare(cc, a, b, ta, tb);
    default: return fail('ERR_INSTR', `${OP_NAMES[op] || op} is not a two-operand arithmetic instruction`);
    }
};
const binopFloat = (op, cc, x, y) => {
    switch (op) {
    case OP.ADD: return Math.fround(x + y);
    case OP.SUB: return Math.fround(x - y);
    case OP.MUL: return Math.fround(x * y);
    case OP.DIV: return y === 0 ? 0 : Math.fround(x / y);
    case OP.MOD: return y === 0 ? x : Math.trunc(x) % Math.trunc(y);
    case OP.AND: return Math.trunc(x) & Math.trunc(y);
    case OP.OR: return Math.trunc(x) | Math.trunc(y);
    case OP.XOR: return Math.trunc(x) ^ Math.trunc(y);
    case OP.CMP: return compareFloat(cc, x, y);
    default: return fail('ERR_INSTR', `${OP_NAMES[op] || op} is not a two-operand arithmetic instruction`);
    }
};
const unop = (op, cc, v, t) => {
    switch (op) {
    case OP.MOV: return v;
    case OP.NEG: return u32(-s32(v));
    // NOT is logical on the brick (booleans are UBYTEs).
    case OP.NOT: return v === 0 ? 1 : 0;
    case OP.TST: return compare(cc, v, 0, t, t);
    case OP.ABS: return u32(Math.abs(s32(v)));
    // The firmware's integer path has no square root: it yields 0 (its float path takes the root).
    case OP.SQRT: return 0;
    default: return fail('ERR_INSTR', `${OP_NAMES[op] || op} is not a one-operand instruction`);
    }
};
const unopFloat = (op, cc, x) => {
    switch (op) {
    case OP.MOV: return x;
    case OP.NEG: return -x;
    case OP.NOT: return x === 0 ? 1 : 0;
    case OP.TST: return compareFloat(cc, x, 0);
    case OP.ABS: return Math.abs(x);
    case OP.SQRT: return Math.fround(Math.sqrt(x));
    default: return fail('ERR_INSTR', `${OP_NAMES[op] || op} is not a one-operand instruction`);
    }
};

// ---- the VM ------------------------------------------------------------------------------------------

const freshOut = () => ({flags: 0, mode: 0, power: 0, tachoLimit: 0, runState: 0, turnRatio: 0, regMode: 0,
    p: DEFAULT_PID.p, i: DEFAULT_PID.i, d: DEFAULT_PID.d});
const freshIn = () => ({type: 0, mode: 0, invalid: 1, oldType: 0, passes: 0});

/**
 * @typedef {object} NxtIo  what the brick provides (hubs/nxt/nxt-virtual-hub.js)
 * @property {(port: number) => {runState: number, tachoCount: number, blockTachoCount: number,
 *           rotationCount: number, actualSpeed: number}} outputStatus
 * @property {(port: number, out: object, flags: number) => void} applyOutput  the output module
 * @property {(port: number) => {raw: number, normalized: number, scaled: number}} inputValues
 * @property {(port: number, type: number, mode: number) => void} setInputMode
 * @property {(port: number) => void} resetInputScaled
 * @property {Function} [playTone] (frequency, ms, loop, volume)
 * @property {Function} [playFile] (name, loop, volume)
 * @property {Function} [soundState] () => {state, flags}
 * @property {Function} [stopSound]
 * @property {Function} [display] (event) a drawing call
 * @property {Function} [lsWrite] (port, bytes, rxLength) => status byte
 * @property {Function} [lsStatus] (port) => {status, bytesReady}
 * @property {Function} [lsRead] (port, length) => {status, data}
 * @property {Function} [messageWrite] (queue, bytes) => status byte
 * @property {Function} [messageRead] (queue, remove) => {status, message}
 * @property {Function} [keepAlive] () => ms
 */

export class NxtVm {
    /**
     * @param {object} [options]
     * @param {number} [options.instrPerMs=20] instructions the VM runs per millisecond (our estimate)
     * @param {number} [options.seed=1] Random()'s seed (a deterministic generator, ours)
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
            mem: [], arrays: [null], clumps: [], runQ: [], restQ: [], mutexes: {},
            out: Array.from({length: OUTPUT_PORTS}, freshOut), in: Array.from({length: INPUT_PORTS}, freshIn),
            rng: this.options.seed, instructions: 0, events: []
        };
    }

    /**
     * Loads a program (what the brick does when a program is started) and starts it at `tick`.
     * @param {Uint8Array|number[]} bytes the `.rxe`
     * @param {{name?: string, tick?: number}} [options]
     * @returns {{ok: boolean, status?: string, code?: number, detail?: string}} a refusal names the
     *          firmware status (ERR_VER, ERR_FILE, ERR_INSTR) and says why
     */
    start (bytes, {name = 'program.rxe', tick = 0} = {}) {
        const parsed = parseRxe(bytes);
        if (!parsed.ok) {
            this.program = null;
            this.s = this._fresh(tick);
            this.s.status = 'error';
            this.s.error = {code: parsed.status, status: parsed.code, message: parsed.detail, clump: null, pc: null, opcode: null};
            return parsed;
        }
        this.program = parsed.program;
        this.name = name;
        this._program(parsed.program, tick);
        return {ok: true};
    }

    _program (program, tick) {
        const s = this._fresh(tick);
        s.mem = program.staticDefaults.slice();
        s.arrays = program.arrays.map(a => (a ? {elemSize: a.elemSize, count: a.elemSize ? a.data.length / a.elemSize : 0, data: a.data.slice()} : null));
        s.clumps = program.clumps.map(c => ({pc: c.codeStart, fire: c.fireCount, wake: 0}));
        program.clumps.forEach((c, i) => { if (c.fireCount === 0) s.runQ.push(i); });
        // Mutexes: owner from the defaults (a free one is 0xFF), no one waiting.
        program.toc.forEach((e, id) => {
            if (e.type === TC.MUTEX && e.offset < s.mem.length) s.mutexes[id] = {owner: s.mem[e.offset], waiting: []};
        });
        // The brick resets its devices before a program runs: every output idle with all counters reset,
        // every input unconfigured.
        s.out.forEach(o => { o.flags = UPDATE.MODE | UPDATE.SPEED | UPDATE.TACHO_LIMIT | UPDATE.RESET_COUNT | UPDATE.RESET_BLOCK_COUNT | UPDATE.RESET_ROTATION_COUNT; });
        s.inputsReset = true;
        s.status = 'running';
        this.s = s;
    }

    get status () { return this.s.status; }

    get error () { return this.s.error; }

    /** Recorded events (display, sound, messages, errors), removed from the VM. */
    drainEvents () {
        const out = this.s.events;
        this.s.events = [];
        return out;
    }

    /** STOPPROGRAM / the cancel button: the program ends now. */
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

    /** @param {object} snap @param {Uint8Array|number[]|null} bytes the program's `.rxe` (to rebuild a different program) */
    restore (snap, bytes = null) {
        if (!snap || snap.format !== SNAPSHOT_FORMAT) throw new Error(`NxtVm.restore: not an ${SNAPSHOT_FORMAT} snapshot`);
        const mine = this.program ? this.program.fingerprint : null;
        if (snap.program !== mine) {
            if (snap.program === null) this.program = null;
            else {
                const parsed = bytes ? parseRxe(bytes) : null;
                if (!parsed || !parsed.ok || parsed.program.fingerprint !== snap.program) {
                    throw new Error(`NxtVm.restore: snapshot is of program ${snap.program}; give its bytes`);
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
     * Runs every whole millisecond up to `ms` (the brick's tick count).
     * @param {number} ms
     * @param {NxtIo} io
     */
    advanceTo (ms, io) {
        const end = Math.floor(ms);
        while (this.s.tick < end) {
            this.s.tick += 1;
            this._millisecond(io);
        }
    }

    _millisecond (io) {
        const s = this.s;
        if (s.status !== 'running') return;
        if (s.inputsReset) {
            s.inputsReset = false;
            for (let p = 0; p < INPUT_PORTS; p++) io.setInputMode(p, 0, 0);
        }
        // Clumps whose wait is over rejoin the run queue, in rest-queue order.
        if (s.restQ.length) {
            const still = [];
            for (const c of s.restQ) {
                if (s.clumps[c].wake <= s.tick) s.runQ.push(c);
                else still.push(c);
            }
            s.restQ = still;
        }
        let budget = this.options.instrPerMs;
        while (s.status === 'running') {
            if (!s.runQ.length) {
                if (!s.restQ.length) this._end('ok');
                break;
            }
            if (budget <= 0) break;
            const r = this._runClump(s.runQ[0], budget, io);
            budget -= r.used;
            if (r.status === RUN.ROTATE_QUEUE || r.status === RUN.TIMES_UP) this._rotate();
            if (r.status === RUN.TIMES_UP) break;
            if (r.status === RUN.STOP_REQ) this._end('stop');
        }
        this._outputModule(io);
        this._inputModule();
    }

    _rotate () {
        const q = this.s.runQ;
        if (q.length > 1) q.push(q.shift());
    }

    _runClump (c, budget, io) {
        const s = this.s;
        const clump = s.clumps[c];
        const last = this.program.clumps[c].codeEnd;
        let slice = SLICE_INSTRUCTIONS;
        let used = 0;
        for (;;) {
            const pc = clump.pc;
            let r;
            try {
                r = this._execute(c, pc, io);
            } catch (e) {
                if (!(e instanceof NxtVmError)) throw e;
                this._failWith(e, c, pc);
                return {status: VM_STATUS.ERR_INSTR, used: used + 1};
            }
            used += 1;
            s.instructions += 1;
            const {status, delta} = r;
            if (status === RUN.CLUMP_DONE) {
                // A finished clump is re-armed: back to its start, its fire count restored.
                clump.pc = this.program.clumps[c].codeStart;
                clump.fire = this.program.clumps[c].fireCount;
                return {status, used};
            }
            if (status !== RUN.NO_ERR) {
                clump.pc = pc + delta;
                return {status, used};
            }
            clump.pc = pc + delta;
            if (clump.pc > last || clump.pc < this.program.clumps[c].codeStart) {
                this._failWith(new NxtVmError('ERR_INSTR', `clump ${c} ran to word ${clump.pc}, outside its code ${this.program.clumps[c].codeStart}..${last}`), c, pc);
                return {status: VM_STATUS.ERR_INSTR, used};
            }
            if (used >= budget) return {status: RUN.TIMES_UP, used};
            slice -= 1;
            if (slice <= 0) return {status: RUN.ROTATE_QUEUE, used};
        }
    }

    _failWith (e, clump, pc) {
        const word = this.program && this.program.code[pc];
        const opcode = word === undefined ? null : word & 0xff;
        this.s.error = {code: e.code, status: VM_STATUS[e.code] ?? null, message: e.message, clump, pc,
            opcode: word !== undefined && (word & 0x0800) ? `short ${SHORT_OPS[(word >> 8) & 7] || (word >> 8) & 7}` : (OP_NAMES[opcode] ?? opcode)};
        this.s.events.push({t: this.s.tick, kind: 'error', ...this.s.error});
        this._end('error');
    }

    /** The program is over: queues emptied; the brick resets its devices (hub side, via `ending`). */
    _end (how) {
        const s = this.s;
        s.status = how === 'error' ? 'error' : 'stopped';
        s.ending = how;
        s.runQ = [];
        s.restQ = [];
        s.events.push({t: s.tick, kind: 'program-end', how});
    }

    // ---- the output and input modules ---------------------------------------------------------------

    _outputModule (io) {
        for (let p = 0; p < OUTPUT_PORTS; p++) {
            const o = this.s.out[p];
            const flags = o.flags & ~UPDATE.PENDING;
            if (flags) {
                io.applyOutput(p, {...o}, flags);
                o.flags &= UPDATE.PENDING;
            }
            if (!(o.flags & UPDATE.PENDING)) o.runState = io.outputStatus(p).runState;
        }
    }

    _inputModule () {
        for (const x of this.s.in) {
            if (x.type !== x.oldType) {
                x.oldType = x.type;
                x.invalid = 1;
                x.passes = SOUND_TYPES.has(x.type) ? INVALID_PASSES_SOUND : INVALID_PASSES;
            } else if (x.passes > 0) {
                x.passes -= 1;
                if (x.passes === 0) x.invalid = 0;
            } else x.invalid = 0;
        }
    }

    // ---- dataspace -----------------------------------------------------------------------------------

    _entry (id) {
        const e = this.program.toc[id];
        if (!e) fail('ERR_INSTR', `dataspace entry ${id} does not exist (${this.program.toc.length} entries)`);
        return e;
    }

    _type (id) { return this._entry(id).type; }

    _store (dv) {
        if (dv === 0) return this.s.mem;
        const a = this.s.arrays[dv];
        if (!a) fail('ERR_BAD_PTR', `dope vector ${dv} is not allocated`);
        return a.data;
    }

    /** A scalar at (id, dv, base) as a 32-bit register value. */
    _get (id, dv = 0, base = 0) {
        const e = this._entry(id);
        return getRaw(e.type, this._store(dv), base + e.offset);
    }

    _set (id, v, dv = 0, base = 0) {
        const e = this._entry(id);
        setRaw(e.type, this._store(dv), base + e.offset, v);
    }

    _getF (id, dv = 0, base = 0) {
        const e = this._entry(id);
        return getFloat(e.type, this._store(dv), base + e.offset);
    }

    _setF (id, f, dv = 0, base = 0) {
        const e = this._entry(id);
        setFloat(e.type, this._store(dv), base + e.offset, f);
    }

    /** The dope vector an array entry at (id, dv, base) names. */
    _dvOf (id, dv = 0, base = 0) {
        const e = this._entry(id);
        if (e.type !== TC.ARRAY) fail('ERR_ARG', `entry ${id} is a ${TC_NAMES[e.type]}, not an array`);
        const b = this._store(dv);
        const at = base + e.offset;
        const index = b[at] | (b[at + 1] << 8);
        if (!this.s.arrays[index]) fail('ERR_BAD_PTR', `array entry ${id} names dope vector ${index}, which is not allocated`);
        return index;
    }

    _count (id, dv = 0, base = 0) { return this.s.arrays[this._dvOf(id, dv, base)].count; }

    _members (id) { return this._entry(id).offset; }

    _next (id) { return nextEntry(this.program.toc, id); }

    _poolUse () {
        let n = Math.ceil(this.program.clumps.length * CLUMP_RECORD_BYTES / 4) * 4 + this.program.staticSize;
        for (const a of this.s.arrays) n += DOPE_VECTOR_BYTES + (a ? a.data.length : 0);
        return n;
    }

    /** A new dope vector (count 0) for an array whose element template is `id + 1`. */
    _newArray (id) {
        const elemSize = elementSize(this.program.toc, id);
        let index = this.s.arrays.indexOf(null, 1);
        if (index < 0) index = this.s.arrays.length;
        this.s.arrays[index] = {elemSize, count: 0, data: []};
        if (this._poolUse() > POOL_BYTES) { this.s.arrays[index] = null; fail('ERR_MEM', 'the 32 KB memory pool is full'); }
        return index;
    }

    /** The arrays inside one element (of template `elem`, at (dv, base)): give each a fresh dope vector, or free them. */
    _subArrays (elem, dv, base, alloc) {
        const visit = id => {
            const e = this._entry(id);
            if (e.type === TC.ARRAY) {
                const b = this._store(dv);
                const at = base + e.offset;
                if (alloc) {
                    const index = this._newArray(id);
                    b[at] = index & 0xff;
                    b[at + 1] = index >> 8;
                } else this._free(b[at] | (b[at + 1] << 8), id);
            } else if (e.type === TC.CLUSTER) {
                let m = id + 1;
                for (let k = 0; k < e.offset; k++) { visit(m); m = this._next(m); }
            }
        };
        visit(elem);
    }

    _free (index, id) {
        const a = this.s.arrays[index];
        if (!a) return;
        if (isAggregate(this._type(id + 1))) {
            for (let k = 0; k < a.count; k++) this._subArrays(id + 1, index, k * a.elemSize, false);
        }
        this.s.arrays[index] = null;
    }

    /** Resizes the array at (id, dv, base) to `count` elements (new ones zero, with their own sub-arrays). */
    _resize (id, count, dv = 0, base = 0) {
        const index = this._dvOf(id, dv, base);
        this._resizeDv(index, id, count);
        return index;
    }

    _resizeDv (index, id, count) {
        const a = this.s.arrays[index];
        const old = a.count;
        if (old === count) return;
        if (count > 0xffff) fail('ERR_MEM', `an array of ${count} elements`);
        const aggregate = id !== null && isAggregate(this._type(id + 1));
        if (count < old) {
            if (aggregate) for (let k = count; k < old; k++) this._subArrays(id + 1, index, k * a.elemSize, false);
            a.data.length = count * a.elemSize;
            a.count = count;
            return;
        }
        const grow = (count - old) * a.elemSize;
        for (let k = 0; k < grow; k++) a.data.push(0);
        a.count = count;
        if (this._poolUse() > POOL_BYTES) {
            a.data.length = old * a.elemSize;
            a.count = old;
            fail('ERR_MEM', 'the 32 KB memory pool is full');
        }
        if (aggregate) for (let k = old; k < count; k++) this._subArrays(id + 1, index, k * a.elemSize, true);
    }

    /** A string (UBYTE array, NUL-terminated) at an array entry, as text. */
    _string (id, dv = 0, base = 0) {
        const a = this.s.arrays[this._dvOf(id, dv, base)];
        let out = '';
        for (let k = 0; k < a.count && a.data[k] !== 0; k++) out += String.fromCharCode(a.data[k]);
        return out;
    }

    _bytes (id) {
        const a = this.s.arrays[this._dvOf(id)];
        return a.data.slice(0, a.count * a.elemSize);
    }

    _setBytes (id, bytes) {
        const index = this._resize(id, bytes.length);
        const a = this.s.arrays[index];
        for (let k = 0; k < bytes.length; k++) a.data[k] = bytes[k] & 0xff;
    }

    _setString (id, text) {
        const bytes = [];
        for (let k = 0; k < text.length; k++) bytes.push(text.charCodeAt(k) & 0xff);
        bytes.push(0);
        this._setBytes(id, bytes);
    }

    /** Structural equality of two entries' types (ARRBUILD: is a source the whole array or one element?). */
    _sameType (a, b) {
        const ta = this._type(a);
        if (ta !== this._type(b)) return false;
        if (ta === TC.CLUSTER) {
            if (this._members(a) !== this._members(b)) return false;
            let x = a + 1;
            let y = b + 1;
            for (let k = 0; k < this._members(a); k++) {
                if (!this._sameType(x, y)) return false;
                x = this._next(x);
                y = this._next(y);
            }
        } else if (ta === TC.ARRAY) return this._sameType(a + 1, b + 1);
        return true;
    }

    // ---- polymorphic data operations (scalars, arrays element by element, clusters member by member) --

    /** One-operand operation (MOV, NEG, NOT, TST, ABS, SQRT) from (id2, …) into (id1, …). */
    _poly1 (op, cc, id1, dv1, base1, id2, dv2, base2) {
        const t1 = this._type(id1);
        const t2 = this._type(id2);
        if (!isAggregate(t2)) {
            if (isAggregate(t1)) return; // nothing to store a number into
            if (t1 === TC.FLOAT || t2 === TC.FLOAT) this._setF(id1, unopFloat(op, cc, this._getF(id2, dv2, base2)), dv1, base1);
            else this._set(id1, unop(op, cc, this._get(id2, dv2, base2), t2), dv1, base1);
            return;
        }
        if (t1 === TC.ARRAY && t2 === TC.ARRAY) {
            const e1 = this._type(id1 + 1);
            if (e1 <= TC_LAST_INT && e1 === this._type(id2 + 1) && op === OP.MOV) {
                // Arrays of the same integer type: a straight copy.
                const src = this.s.arrays[this._dvOf(id2, dv2, base2)];
                const dst = this.s.arrays[this._resize(id1, src.count, dv1, base1)];
                for (let k = 0; k < src.count * src.elemSize; k++) dst.data[k] = src.data[k];
                return;
            }
        }
        let count2 = 0;
        let step2 = 0;
        let count1 = 0;
        let step1 = 0;
        if (t2 === TC.ARRAY) {
            const index = this._dvOf(id2, dv2, base2);
            count2 = this.s.arrays[index].count;
            step2 = this.s.arrays[index].elemSize;
            dv2 = index;
            base2 = 0;
        } else count2 = this._members(id2);
        let byMember = false;
        if (t1 === TC.ARRAY) {
            if (t2 !== TC.ARRAY) fail('ERR_ARG', `an array (entry ${id1}) from a ${TC_NAMES[t2]} (entry ${id2})`);
            const index = this._resize(id1, count2, dv1, base1);
            count1 = count2;
            step1 = this.s.arrays[index].elemSize;
            dv1 = index;
            base1 = 0;
        } else if (t1 === TC.CLUSTER) {
            count1 = this._members(id1);
            byMember = true;
        } else fail('ERR_ARG', `a ${TC_NAMES[t1]} (entry ${id1}) from a ${TC_NAMES[t2]} (entry ${id2})`);
        id1 += 1;
        id2 += 1;
        for (let k = 0; k < count1; k++) {
            this._poly1(op, cc, id1, dv1, base1, id2, dv2, base2);
            if (t1 === TC.ARRAY) base1 += step1;
            else if (byMember) id1 = this._next(id1);
            if (t2 === TC.ARRAY) base2 += step2;
            else if (byMember) id2 = this._next(id2);
        }
    }

    /** Two-operand operation (ADD … XOR, CMP element-wise) of (id2, …) and (id3, …) into (id1, …). */
    _poly2 (op, cc, id1, dv1, base1, id2, dv2, base2, id3, dv3, base3) {
        const t1 = this._type(id1);
        const t2 = this._type(id2);
        const t3 = this._type(id3);
        if (!isAggregate(t2) && !isAggregate(t3)) {
            if (isAggregate(t1)) return;
            if (t1 === TC.FLOAT || t2 === TC.FLOAT || t3 === TC.FLOAT) {
                this._setF(id1, binopFloat(op, cc, this._getF(id2, dv2, base2), this._getF(id3, dv3, base3)), dv1, base1);
            } else this._set(id1, binop(op, cc, this._get(id2, dv2, base2), this._get(id3, dv3, base3), t2, t3), dv1, base1);
            return;
        }
        const side = (t, id, dv, base) => {
            if (t === TC.ARRAY) {
                const index = this._dvOf(id, dv, base);
                return {count: this.s.arrays[index].count, step: this.s.arrays[index].elemSize, dv: index, base: 0};
            }
            if (t === TC.CLUSTER) return {count: this._members(id), step: 0, dv, base};
            return {count: 0, step: 0, dv, base};
        };
        const a2 = side(t2, id2, dv2, base2);
        const a3 = side(t3, id3, dv3, base3);
        let count1;
        let step1 = 0;
        let byMember = false;
        if (t1 === TC.ARRAY) {
            let n;
            if (t2 === TC.ARRAY && t3 === TC.ARRAY) n = Math.min(a2.count, a3.count);
            else if (t2 === TC.ARRAY) n = a2.count;
            else if (t3 === TC.ARRAY) n = a3.count;
            else fail('ERR_ARG', `an array (entry ${id1}) from no array`);
            const index = this._resize(id1, n, dv1, base1);
            count1 = n;
            dv1 = index;
            base1 = 0;
            step1 = this.s.arrays[index].elemSize;
        } else if (t1 === TC.CLUSTER) {
            count1 = this._members(id1);
            byMember = true;
        } else fail('ERR_ARG', `a ${TC_NAMES[t1]} (entry ${id1}) from aggregates`);
        let [i1, i2, i3] = [id1 + 1, isAggregate(t2) ? id2 + 1 : id2, isAggregate(t3) ? id3 + 1 : id3];
        let [b2, b3] = [a2.base, a3.base];
        for (let k = 0; k < count1; k++) {
            this._poly2(op, cc, i1, dv1, base1, i2, a2.dv, b2, i3, a3.dv, b3);
            if (t1 === TC.ARRAY) base1 += step1;
            else if (byMember) i1 = this._next(i1);
            if (t2 === TC.ARRAY) b2 += a2.step;
            else if (t2 === TC.CLUSTER && byMember) i2 = this._next(i2);
            if (t3 === TC.ARRAY) b3 += a3.step;
            else if (t3 === TC.CLUSTER && byMember) i3 = this._next(i3);
        }
    }

    /** Compares two aggregates as wholes (element by element, then by count): one boolean. */
    _compareAggregates (cc, id2, id3) {
        const r = {done: false, value: 0};
        this._compareRec(cc, r, id2, 0, 0, id3, 0, 0);
        if (!r.done) r.value = cc === CC.EQ || cc === CC.GTEQ || cc === CC.LTEQ ? 1 : 0;
        return r.value;
    }

    _compareRec (cc, r, id2, dv2, base2, id3, dv3, base3) {
        const t2 = this._type(id2);
        const t3 = this._type(id3);
        if (isAggregate(t2) && t2 !== t3) fail('ERR_ARG', `comparing a ${TC_NAMES[t2]} with a ${TC_NAMES[t3]}`);
        if (!isAggregate(t2)) {
            const a = this._get(id2, dv2, base2);
            const b = this._get(id3, dv3, base3);
            if (compare(CC.NEQ, a, b, t2, t3)) { r.done = true; r.value = compare(cc, a, b, t2, t3); }
            return;
        }
        let count2;
        let count3;
        let step2 = 0;
        let step3 = 0;
        if (t2 === TC.ARRAY) {
            const x = this._dvOf(id2, dv2, base2);
            const y = this._dvOf(id3, dv3, base3);
            count2 = this.s.arrays[x].count; step2 = this.s.arrays[x].elemSize; dv2 = x; base2 = 0;
            count3 = this.s.arrays[y].count; step3 = this.s.arrays[y].elemSize; dv3 = y; base3 = 0;
        } else {
            count2 = this._members(id2);
            count3 = this._members(id3);
        }
        if (count2 !== count3 && (cc === CC.EQ || cc === CC.NEQ)) {
            r.done = true;
            r.value = cc === CC.NEQ ? 1 : 0;
            return;
        }
        let a = id2 + 1;
        let b = id3 + 1;
        for (let k = 0; k < Math.min(count2, count3); k++) {
            this._compareRec(cc, r, a, dv2, base2, b, dv3, base3);
            if (r.done) return;
            if (t2 === TC.ARRAY) { base2 += step2; base3 += step3; } else { a = this._next(a); b = this._next(b); }
        }
        if (count2 !== count3) { r.done = true; r.value = compare(cc, count2, count3, TC.UWORD, TC.UWORD); }
    }

    /** MOV: a straight copy for scalars and integer arrays, element by element otherwise. */
    _move (id1, id2) {
        const t1 = this._type(id1);
        const t2 = this._type(id2);
        if (t1 <= TC_LAST_INT && t2 <= TC_LAST_INT) { this._set(id1, this._get(id2)); return; }
        if (t1 === TC.FLOAT && t2 === TC.FLOAT) { this._setF(id1, this._getF(id2)); return; }
        this._poly1(OP.MOV, 0, id1, 0, 0, id2, 0, 0);
    }

    // ---- the scheduler's operations -------------------------------------------------------------------

    _current () { return this.s.runQ[0]; }

    _dequeue (q, c) {
        const at = q.indexOf(c);
        if (at >= 0) q.splice(at, 1);
    }

    _enqueue (c) {
        if (!this.s.runQ.includes(c)) this.s.runQ.push(c);
    }

    _clumpId (c) {
        if (!(c >= 0 && c < this.program.clumps.length)) fail('ERR_INSTR', `clump ${c} does not exist (${this.program.clumps.length} clumps)`);
        return c;
    }

    _schedule (c) {
        const clump = this.s.clumps[this._clumpId(c)];
        clump.fire -= 1;
        if (clump.fire === 0) this._enqueue(c);
    }

    _mutex (id) {
        if (this._type(id) !== TC.MUTEX) fail('ERR_INSTR', `entry ${id} is a ${TC_NAMES[this._type(id)]}, not a mutex`);
        if (!this.s.mutexes[id]) this.s.mutexes[id] = {owner: 0xff, waiting: []};
        return this.s.mutexes[id];
    }

    _acquire (id) {
        const m = this._mutex(id);
        const c = this._current();
        if (m.owner === 0xff) { m.owner = c; return RUN.NO_ERR; }
        this._dequeue(this.s.runQ, c);
        m.waiting.push(c);
        return RUN.CLUMP_SUSPEND;
    }

    _release (id) {
        const m = this._mutex(id);
        m.owner = m.waiting.length ? m.waiting.shift() : 0xff;
        if (m.owner !== 0xff) this._enqueue(m.owner);
        return RUN.NO_ERR;
    }

    _subcall (callee, returnVar) {
        const c = this._current();
        // The caller's number goes into the return variable (one byte).
        const e = this._entry(returnVar);
        this.s.mem[e.offset] = c;
        this._dequeue(this.s.runQ, c);
        this._enqueue(this._clumpId(callee));
        return RUN.CLUMP_SUSPEND;
    }

    // ---- the interpreter ---------------------------------------------------------------------------------

    /** Executes the instruction at word `pc` of clump `c`: {status, delta (words)}. */
    _execute (c, pc, io) {
        const code = this.program.code;
        const word = code[pc];
        if (word === undefined) fail('ERR_INSTR', `no instruction at word ${pc}`);
        const arg = k => {
            const v = code[pc + k];
            if (v === undefined) fail('ERR_INSTR', `instruction at word ${pc} runs past the end of the code`);
            return v;
        };
        const nibble = (word >> 8) & 0x0f;
        if (nibble > 7) {
            const which = nibble - 8;
            const small = ((word & 0xff) << 24) >> 24;
            switch (which) {
            case 0: { // MOV: destination = source + the signed byte
                const src = arg(1);
                this._move((src + small) & 0xffff, src);
                return {status: RUN.NO_ERR, delta: 2};
            }
            case 1: return {status: this._acquire(small & 0xffff), delta: 1};
            case 2: return {status: this._release(small & 0xffff), delta: 1};
            case 3: { const v = arg(1); return {status: this._subcall((v + small) & 0xffff, v), delta: 2}; }
            default: return fail('ERR_INSTR', `short op ${which} does not exist`);
            }
        }
        const op = word & 0xff;
        const cc = (word >> 8) & 0x07;
        let size = (word >> 12) & 0x0f;
        if (op >= 0x38) fail('ERR_INSTR', `opcode 0x${op.toString(16)} does not exist`);
        if (size === 4) return this._family1(op, arg(1));
        if (size === 6) return this._family2(op, cc, arg(1), arg(2), io);
        if (size === 8) return this._family3(op, cc, arg(1), arg(2), arg(3), io);
        if (size === 10 || size === 12 || size === VARIABLE_SIZE) {
            if (size === VARIABLE_SIZE) size = arg(1);
            if (size < 4 || size % 2) fail('ERR_INSTR', `${OP_NAMES[op]} of ${size} bytes`);
            return this._familyN(op, pc, size, io);
        }
        return fail('ERR_INSTR', `${OP_NAMES[op] || op} encoded with ${size} bytes`);
    }

    _family1 (op, a1) {
        switch (op) {
        case OP.JMP: return {status: RUN.NO_ERR, delta: (a1 << 16) >> 16};
        case OP.ACQUIRE: return {status: this._acquire(a1), delta: 2};
        case OP.RELEASE: return {status: this._release(a1), delta: 2};
        case OP.SUBRET: {
            const e = this._entry(a1);
            const caller = this.s.mem[e.offset];
            this._dequeue(this.s.runQ, this._current());
            this._enqueue(this._clumpId(caller));
            return {status: RUN.CLUMP_DONE, delta: 2};
        }
        case OP.FINCLUMPIMMED: {
            this._dequeue(this.s.runQ, this._current());
            this._schedule(a1);
            return {status: RUN.CLUMP_DONE, delta: 2};
        }
        case OP.GETTICK: this._set(a1, u32(this.s.tick)); return {status: RUN.NO_ERR, delta: 2};
        case OP.STOP: {
            const stop = a1 === NOT_A_DS_ID || this._get(a1) > 0;
            return {status: stop ? RUN.STOP_REQ : RUN.NO_ERR, delta: 2};
        }
        default: return this._unimplemented(op, 4);
        }
    }

    _family2 (op, cc, a1, a2, io) {
        const done = (status = RUN.NO_ERR) => ({status, delta: 3});
        switch (op) {
        case OP.NEG: case OP.NOT: case OP.TST: case OP.SQRT: case OP.ABS:
            this._poly1(op, cc, a1, 0, 0, a2, 0, 0);
            return done();
        case OP.MOV: this._move(a1, a2); return done();
        case OP.SET: this._set(a1, u32((a2 << 16) >> 16)); return done();
        case OP.BRTST: {
            let branch;
            if (a2 === NOT_A_DS_ID) branch = cc === CC.EQ || cc === CC.LTEQ || cc === CC.GTEQ;
            else branch = compare(cc, s32(this._get(a2)), 0, TC.SLONG, TC.SLONG) === 1;
            return {status: RUN.NO_ERR, delta: branch ? (a1 << 16) >> 16 : 3};
        }
        case OP.FINCLUMP: {
            const c = this._current();
            this._dequeue(this.s.runQ, c);
            const begin = (a1 << 16) >> 16;
            const end = (a2 << 16) >> 16;
            if (begin !== -1 || end !== -1) {
                const deps = this.program.clumps[c].dependents;
                for (let k = begin; k <= end; k++) {
                    if (deps[k] === undefined) fail('ERR_INSTR', `clump ${c} has no dependent ${k}`);
                    this._schedule(deps[k]);
                }
            }
            return done(RUN.CLUMP_DONE);
        }
        case OP.SUBCALL: return done(this._subcall(a1, a2));
        case OP.ARRSIZE: this._set(a1, this._count(a2)); return done();
        case OP.SYSCALL: return done(this._syscall(a1, a2, io));
        case OP.NUMTOSTRING: this._setString(a1, this._numberText(a2)); return done();
        case OP.STRTOBYTEARR: {
            const src = this.s.arrays[this._dvOf(a2)];
            if (src.count > 0) {
                const index = this._resize(a1, src.count - 1);
                const dst = this.s.arrays[index];
                for (let k = 0; k < src.count - 1; k++) dst.data[k] = src.data[k];
            }
            return done();
        }
        case OP.BYTEARRTOSTR: {
            const src = this.s.arrays[this._dvOf(a2)];
            const n = src.count;
            const bytes = src.data.slice(0, n);
            bytes.push(0);
            this._setBytes(a1, bytes);
            return done();
        }
        case OP.WAIT: {
            const ms = a2 === NOT_A_DS_ID ? 0 : this._get(a2);
            let status = RUN.ROTATE_QUEUE;
            if (ms !== 0) {
                // To the rest queue until the tick reaches now + ms.
                const c = this._current();
                this.s.clumps[c].wake = this.s.tick + ms;
                this._dequeue(this.s.runQ, c);
                this.s.restQ.push(c);
                status = RUN.CLUMP_SUSPEND;
            }
            if (a1 !== NOT_A_DS_ID) this._set(a1, u32(this.s.tick));
            return done(status);
        }
        default: return this._unimplemented(op, 6);
        }
    }

    _family3 (op, cc, a1, a2, a3, io) {
        const done = (status = RUN.NO_ERR) => ({status, delta: 4});
        if (op <= OP.XOR && op !== OP.NEG && op !== OP.NOT) {
            this._poly2(op, cc, a1, 0, 0, a2, 0, 0, a3, 0, 0);
            return done();
        }
        switch (op) {
        case OP.CMP: {
            const t2 = this._type(a2);
            const t3 = this._type(a3);
            if (t2 <= TC_LAST_INT && t3 <= TC_LAST_INT) this._set(a1, compare(cc, this._get(a2), this._get(a3), t2, t3));
            else if (isAggregate(t2) && isAggregate(t3) && !isAggregate(this._type(a1))) this._set(a1, this._compareAggregates(cc, a2, a3));
            else this._poly2(OP.CMP, cc, a1, 0, 0, a2, 0, 0, a3, 0, 0);
            return done();
        }
        case OP.BRCMP: {
            const t2 = this._type(a2);
            const t3 = this._type(a3);
            let yes;
            // Anything but two integers goes through the aggregate comparison — floats included, which the
            // firmware reads there as rounded integers.
            if (t2 <= TC_LAST_INT && t3 <= TC_LAST_INT) yes = compare(cc, this._get(a2), this._get(a3), t2, t3);
            else yes = this._compareAggregates(cc, a2, a3);
            return {status: RUN.NO_ERR, delta: yes ? (a1 << 16) >> 16 : 4};
        }
        case OP.INDEX: {
            const k = a3 === NOT_A_DS_ID ? 0 : this._get(a3);
            const index = this._dvOf(a2);
            const arr = this.s.arrays[index];
            if (k >= arr.count) fail('ERR_ARG', `index ${k} of an array of ${arr.count}`);
            this._poly1(OP.MOV, 0, a1, 0, 0, a2 + 1, index, k * arr.elemSize);
            return done();
        }
        case OP.ARRINIT: {
            const n = a3 === NOT_A_DS_ID ? 0 : this._get(a3);
            const index = this._resize(a1, n);
            const arr = this.s.arrays[index];
            const elem = a1 + 1;
            if (this._type(a2) <= TC_LAST_INT) {
                const v = this._get(a2);
                const t = this._type(elem);
                for (let k = 0; k < n; k++) setRaw(t, arr.data, k * arr.elemSize, v);
            } else {
                for (let k = 0; k < n; k++) this._poly1(OP.MOV, 0, elem, index, k * arr.elemSize, a2, 0, 0);
            }
            return done();
        }
        case OP.SETIN: case OP.GETIN: case OP.GETOUT:
            this._io(op, a1, a2, a3, io);
            return done();
        default: return this._unimplemented(op, 8);
        }
    }

    _familyN (op, pc, size, io) {
        const code = this.program.code;
        const words = size / 2;
        const at = k => {
            const v = code[pc + k];
            if (v === undefined) fail('ERR_INSTR', `instruction at word ${pc} runs past the end of the code`);
            return v;
        };
        const done = () => ({status: RUN.NO_ERR, delta: words});
        switch (op) {
        case OP.REPLACE: {
            const [a1, a2, a3, a4] = [at(1), at(2), at(3), at(4)];
            if (a1 !== a2) this._move(a1, a2);
            const index = this._dvOf(a1);
            const dst = this.s.arrays[index];
            const k = a3 === NOT_A_DS_ID ? 0 : this._get(a3);
            if (k >= dst.count) return done();
            if (this._type(a4) !== TC.ARRAY) this._poly1(OP.MOV, 0, a1 + 1, index, k * dst.elemSize, a4, 0, 0);
            else {
                const srcIndex = this._dvOf(a4);
                const src = this.s.arrays[srcIndex];
                const n = Math.min(dst.count - k, src.count);
                for (let j = 0; j < n; j++) this._poly1(OP.MOV, 0, a1 + 1, index, (k + j) * dst.elemSize, a4 + 1, srcIndex, j * src.elemSize);
            }
            return done();
        }
        case OP.ARRSUBSET: {
            const [a1, a2, a3, a4] = [at(1), at(2), at(3), at(4)];
            const srcIndex = this._dvOf(a2);
            const src = this.s.arrays[srcIndex];
            const from = a3 === NOT_A_DS_ID ? 0 : this._get(a3);
            if (from > src.count) { this._resize(a1, 0); return done(); }
            const rest = src.count - from;
            const length = a4 === NOT_A_DS_ID ? rest : this._get(a4);
            const n = Math.min(rest, length);
            const index = this._resize(a1, n);
            const dst = this.s.arrays[index];
            for (let j = 0; j < n; j++) this._poly1(OP.MOV, 0, a1 + 1, index, j * dst.elemSize, a2 + 1, srcIndex, (from + j) * src.elemSize);
            return done();
        }
        case OP.STRSUBSET: {
            const [a1, a2, a3, a4] = [at(1), at(2), at(3), at(4)];
            const src = this.s.arrays[this._dvOf(a2)];
            const chars = src.count - 1;
            const from = a3 === NOT_A_DS_ID ? 0 : this._get(a3);
            if (from > chars) { this._setBytes(a1, [0]); return done(); }
            const length = a4 === NOT_A_DS_ID ? chars - from : this._get(a4);
            const n = Math.min(chars - from, length);
            const bytes = src.data.slice(from, from + n);
            bytes.push(0);
            this._setBytes(a1, bytes);
            return done();
        }
        case OP.SETOUT: this._setOut(pc, words); return done();
        case OP.ARRBUILD: {
            const dst = at(2);
            const sources = [];
            for (let k = 3; k < words; k++) sources.push(at(k));
            let n = 0;
            for (const src of sources) n += this._sameType(dst, src) ? this._count(src) : 1;
            const index = this._resize(dst, n);
            const out = this.s.arrays[index];
            let k = 0;
            for (const src of sources) {
                if (this._sameType(dst, src)) {
                    const srcIndex = this._dvOf(src);
                    const s = this.s.arrays[srcIndex];
                    for (let j = 0; j < s.count; j++, k++) this._poly1(OP.MOV, 0, dst + 1, index, k * out.elemSize, src + 1, srcIndex, j * s.elemSize);
                } else {
                    this._poly1(OP.MOV, 0, dst + 1, index, k * out.elemSize, src, 0, 0);
                    k += 1;
                }
            }
            return done();
        }
        case OP.STRCAT: {
            const dst = at(2);
            const bytes = [];
            for (let k = 3; k < words; k++) {
                const src = at(k);
                if (this._type(src) !== TC.ARRAY || this._type(src + 1) !== TC.UBYTE) fail('ERR_ARG', `STRCAT of entry ${src}, not a string`);
                const s = this.s.arrays[this._dvOf(src)];
                for (let j = 0; j < s.count - 1; j++) bytes.push(s.data[j]);
            }
            bytes.push(0);
            this._setBytes(dst, bytes);
            return done();
        }
        case OP.STRINGTONUM: {
            const [a1, a2, a3, a4, a5] = [at(1), at(2), at(3), at(4), at(5)];
            const text = this._string(a3);
            const from = a4 === NOT_A_DS_ID ? 0 : this._get(a4);
            const fallback = a5 === NOT_A_DS_ID ? 0 : this._get(a5);
            const tail = text.slice(from);
            const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(tail);
            let value;
            let past;
            if (m) {
                value = Math.fround(parseFloat(m[0]));
                // Past the number: skip to its first digit, then over digits and at most one point.
                let i = from;
                while (i < text.length && !(text[i] >= '0' && text[i] <= '9')) i++;
                let point = false;
                while (i < text.length && ((text[i] >= '0' && text[i] <= '9') || (text[i] === '.' && !point))) {
                    if (text[i] === '.') point = true;
                    i++;
                }
                past = i;
            } else {
                value = s32(fallback);
                past = 0;
            }
            this._setF(a1, value);
            this._set(a2, past);
            return done();
        }
        default: return this._unimplemented(op, size);
        }
    }

    _unimplemented (op, size) {
        const known = op in OP_NAMES;
        // Opcodes the 1.29 firmware does not execute either are its own ERR_INSTR; the rest are ours to add.
        const firmwareRefuses = [OP.CMNT, OP.LSL, OP.LSR, OP.ASL, OP.ASR, OP.ROTL, OP.ROTR, OP.CMPSET, OP.TSTSET];
        if (!known || firmwareRefuses.includes(op)) return fail('ERR_INSTR', `${OP_NAMES[op] || `opcode 0x${op.toString(16)}`} (${size} bytes): the firmware does not execute it`);
        return fail('UNIMPLEMENTED_OPCODE', `${OP_NAMES[op]} (${size} bytes) is not implemented by this VM`);
    }

    /** NUMTOSTRING's text: integers as %d / %u, floats as %.2f with trailing zeros dropped (the firmware's format). */
    _numberText (id) {
        const t = this._type(id);
        if (t === TC.FLOAT) {
            const f = this._getF(id);
            if (f > 9999999999999.99 || f < -999999999999.99) return Number(f.toPrecision(6)).toString();
            const two = f.toFixed(2);
            if (two.endsWith('00')) return f.toFixed(0);
            if (two.endsWith('0')) return f.toFixed(1);
            return two;
        }
        const v = this._get(id);
        return signedType(t) ? String(s32(v)) : String(v);
    }

    // ---- IO maps ----------------------------------------------------------------------------------------

    _io (op, a1, a2, a3, io) {
        const port = this._get(a2);
        if (op === OP.GETOUT) {
            const index = port * OUT_FIELDS_PER_PORT + a3;
            const value = index < OUTPUT_PORTS * OUT_FIELDS_PER_PORT ? this._readOut(Math.floor(index / OUT_FIELDS_PER_PORT), index % OUT_FIELDS_PER_PORT, io) : 0;
            this._set(a1, value);
            return;
        }
        const index = port * IN_FIELDS_PER_PORT + a3;
        if (index >= INPUT_PORTS * IN_FIELDS_PER_PORT) return; // ours: outside the input map nothing is read or written
        const p = Math.floor(index / IN_FIELDS_PER_PORT);
        const field = index % IN_FIELDS_PER_PORT;
        if (op === OP.GETIN) { this._set(a1, this._readIn(p, field, io)); return; }
        const v = this._get(a1);
        const x = this.s.in[p];
        const typed = getRaw(IN_TYPES[field], [v & 0xff, (v >>> 8) & 0xff], 0);
        switch (field) {
        case IN_FIELD.TYPE: x.type = typed; io.setInputMode(p, x.type, x.mode); break;
        case IN_FIELD.MODE: x.mode = typed; io.setInputMode(p, x.type, x.mode); break;
        case IN_FIELD.SCALED: io.resetInputScaled(p); break;
        case IN_FIELD.INVALID: x.invalid = typed; break;
        default: break; // raw and normalized values are the input module's to write
        }
    }

    _readIn (p, field, io) {
        const x = this.s.in[p];
        if (field === IN_FIELD.TYPE) return x.type;
        if (field === IN_FIELD.MODE) return x.mode;
        if (field === IN_FIELD.INVALID) return x.invalid;
        const v = io.inputValues(p);
        if (field === IN_FIELD.RAW) return v.raw & 0xffff;
        if (field === IN_FIELD.NORMALIZED) return v.normalized & 0xffff;
        return u32(((v.scaled & 0xffff) << 16) >> 16);
    }

    _readOut (p, field, io) {
        const o = this.s.out[p];
        switch (field) {
        case OUT_FIELD.FLAGS: return o.flags;
        case OUT_FIELD.MODE: return o.mode;
        case OUT_FIELD.SPEED: return u32(o.power);
        case OUT_FIELD.TACHO_LIMIT: return u32(o.tachoLimit);
        case OUT_FIELD.RUN_STATE: return o.runState;
        case OUT_FIELD.TURN_RATIO: return u32(o.turnRatio);
        case OUT_FIELD.REG_MODE: return o.regMode;
        case OUT_FIELD.REG_P: return o.p;
        case OUT_FIELD.REG_I: return o.i;
        case OUT_FIELD.REG_D: return o.d;
        case OUT_FIELD.OVERLOAD: return 0;
        default: {
            const st = io.outputStatus(p);
            if (field === OUT_FIELD.ACTUAL_SPEED) return u32(st.actualSpeed);
            if (field === OUT_FIELD.TACHO_COUNT) return u32(st.tachoCount);
            if (field === OUT_FIELD.BLOCK_TACHO_COUNT) return u32(st.blockTachoCount);
            return u32(st.rotationCount);
        }
        }
    }

    _writeOut (p, field, v) {
        const o = this.s.out[p];
        const typed = s => (signedType(OUT_TYPES[field]) ? s32(s) : s);
        const t = OUT_TYPES[field];
        const b = [];
        setRaw(t, b, 0, v);
        const stored = typed(getRaw(t, b, 0));
        switch (field) {
        case OUT_FIELD.FLAGS: o.flags = stored; break;
        case OUT_FIELD.MODE: o.mode = stored; break;
        case OUT_FIELD.SPEED: o.power = stored; break;
        case OUT_FIELD.TACHO_LIMIT: o.tachoLimit = stored; break;
        case OUT_FIELD.RUN_STATE: o.runState = stored; break;
        case OUT_FIELD.TURN_RATIO: o.turnRatio = stored; break;
        case OUT_FIELD.REG_MODE: o.regMode = stored; break;
        case OUT_FIELD.REG_P: o.p = stored; break;
        case OUT_FIELD.REG_I: o.i = stored; break;
        case OUT_FIELD.REG_D: o.d = stored; break;
        default: break; // counts, actual speed and overload are the output module's to write
        }
    }

    /** SETOUT: size, port (or array of ports), then (field, source) pairs. */
    _setOut (pc, words) {
        const code = this.program.code;
        const portArg = code[pc + 2];
        let ports;
        if (this._type(portArg) === TC.ARRAY) {
            const index = this._dvOf(portArg);
            const a = this.s.arrays[index];
            const t = this._type(portArg + 1);
            ports = [];
            for (let k = 0; k < a.count; k++) ports.push(getRaw(t, a.data, k * a.elemSize + this._entry(portArg + 1).offset));
        } else ports = [this._get(portArg)];
        for (const p of ports) {
            if (!(p < OUTPUT_PORTS)) continue; // a port that does not exist is no operation
            for (let k = 3; k + 1 < words; k += 2) {
                const index = p * OUT_FIELDS_PER_PORT + code[pc + k];
                if (index >= OUTPUT_PORTS * OUT_FIELDS_PER_PORT) fail('ERR_INSTR', `SETOUT field ${code[pc + k]} of port ${p}`);
                this._writeOut(Math.floor(index / OUT_FIELDS_PER_PORT), index % OUT_FIELDS_PER_PORT, this._get(code[pc + k + 1]));
            }
        }
    }

    // ---- system calls ------------------------------------------------------------------------------------

    _syscall (id, cluster, io) {
        const call = SYSCALLS[id];
        if (this._type(cluster) !== TC.CLUSTER) fail('ERR_INSTR', `SYSCALL ${id} with entry ${cluster}, not a cluster of arguments`);
        const args = [];
        let m = cluster + 1;
        for (let k = 0; k < this._members(cluster); k++) { args.push(m); m = this._next(m); }
        if (args.length > 16) fail('ERR_INSTR', `SYSCALL ${id} with ${args.length} arguments`);
        if (!call) fail(id >= 48 ? 'ERR_INSTR' : 'UNIMPLEMENTED_SYSCALL', `system call ${id} ${id >= 48 ? 'does not exist' : 'is not implemented by this VM'}`);
        if (!call.run) fail('UNIMPLEMENTED_SYSCALL', `system call ${id} (${call.name}) is not implemented by this VM`);
        return call.run(this, args, io) ?? RUN.NO_ERR;
    }

    /** Random(): a deterministic 16-bit generator (ours; the brick uses its C library's). */
    _random () {
        let x = this.s.rng;
        x ^= x << 13; x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5; x >>>= 0;
        this.s.rng = x || 1;
        return (x >>> 8) & 0xffff;
    }

    _event (kind, detail) {
        this.s.events.push({t: this.s.tick, kind, ...detail});
    }
}

/** Convenience: a VM with `options`. */
export const createNxtVm = options => new NxtVm(options);

export {TC, VM_STATUS};
