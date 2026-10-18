// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A clean-room interpreter of the LEGO RCX standard-firmware bytecode — the
// Robot Lab's R5 route (docs/ROBOT-LAB-ARCHITECTURE.md §3.5, §7 R5): NQC
// source → the in-repo nqc-wasm → an `.rcx` image → this VM → ports.
//
// SOURCES. See rcx-bytecode.js: LEGO's RCX 2.0 SDK firmware command overview
// (from memory), the public NQC Programmer's Guide (from memory), and the
// in-repo NQC 3.2 r1's own `-L` listings of compiled programs (run, not
// read). No firmware image, no GPL emulator, no brickEmu/legOS code. Where a
// semantic below is a remembered figure rather than something the listings
// pin down, the comment says "(memory)", and docs/ROBOT-LAB-RCX.md lists it
// under "uncertain".
//
// WHAT THIS IS. A PURE route module: no DOM, no physics, no hub. It will sit
// behind an `RcxVirtualHub` (§5.1) that converts its outputs to `pwm` drives
// and device readings to the raw values it reads. It is step-driven and owns
// no clock: time moves only in `advance(ms, ports)`, which is what makes it
// usable inside the physics worker's step loop (§3.3) and rewindable (§6.4).
//
// THE PORT BOUNDARY (§3.6).
//   in:  ports.inputs[0..2]  — the raw 10-bit value the RCX's ADC would read
//        on inputs 1..3 (0..1023; an open input reads high). For a rotation
//        sensor pass `{raw, rotation}` where `rotation` is the sensor's
//        cumulative count (16 per axle turn) — decoding the rotation
//        sensor's analog phase levels into counts is the device model's job,
//        because the level table is not in any public LEGO document this
//        work had. Held constant for the whole `advance` (zero-order hold).
//   out: ports.outputs[0..2] = {mode: 'on'|'off'|'float', direction: ±1,
//        power: 0..7} for outputs A..C, written at the end of `advance`.
//   `inputConfig()` tells the device models which inputs are powered
//   (active: light, rotation) and how they are configured.
//
// TIME MODEL. The VM keeps integer microseconds, so it is bit-deterministic.
// Every instruction costs `instrUs` (default 250 µs: 4 instructions per
// simulated millisecond, ~4000 per second in total, shared round-robin by the
// running tasks, one instruction per turn). That figure is an ORDER OF
// MAGNITUDE, not a measurement: the RCX interprets bytecode from external RAM
// on a 16 MHz H8/300 and community timings of the standard firmware put it at
// a few thousand bytecodes per second (memory). It is a constructor option
// precisely because it is a guess; nothing in NQC semantics depends on it
// except how long a busy loop takes. A waiting task (Wait) costs nothing; an
// idle VM jumps straight to the next wake-up. An instruction runs only if it
// fits before the target time, so the VM never runs ahead of physics, and
// advance(a) + advance(b) executes exactly what advance(a + b) does.
//
// Timers count from their clear time: Timer(n) = elapsed / 100 ms, FastTimer
// (RCX2) = elapsed / 10 ms, both truncated and wrapped to int16 (memory).

import {
    OPCODES, SRC, SENSOR_TYPE, ACTIVE_SENSOR_TYPES, SENSOR_MODE, OUT_MODE_BITS, DIR_BITS,
    RELATIONS, OFFSET, int16
} from './rcx-bytecode.js';
import {loadRcxProgram, MAX_TASKS} from './rcx-program.js';

export const SNAPSHOT_FORMAT = 'rcx-vm/1';
export const DEFAULT_INSTR_US = 250;
export const GLOBAL_VARS = 32;
export const LOCAL_VARS = 16;          // RCX2: vars 32..47, one set per task
export const LOOP_STACK_DEPTH = 4;     // RCX 1 repeat counters (memory)

/** Boolean thresholds on the raw value (memory: SDK sensor chapter). */
export const BOOL_TRUE_BELOW = 460;
export const BOOL_FALSE_ABOVE = 562;

const US_PER_TICK_100MS = 100000;
const US_PER_TICK_10MS = 10000;
const MODE_NAMES = ['float', 'off', 'on'];

/**
 * @typedef {object} RcxOutput
 * @property {'on'|'off'|'float'} mode  'off' = brake (both motor leads shorted)
 * @property {1|-1} direction
 * @property {number} power             0..7
 */

/**
 * @typedef {object} RcxVmOptions
 * @property {number} [instrUs=250]   simulated cost of one bytecode instruction
 * @property {number} [seed=1]        Random() seed (deterministic LCG)
 * @property {number} [programSlot=0] value of the Program() source
 * @property {number} [batteryMv=9000] value of the BatteryLevel() source
 */

const freshOutputs = () => [0, 1, 2].map(() => ({mode: 'float', direction: 1, power: 7}));

const freshSensors = () => [0, 1, 2].map(() => ({
    type: SENSOR_TYPE.NONE,
    modeByte: 0,
    raw: 1023,
    lastRaw: 1023,
    bool: 0,
    edges: 0,
    pulses: 0,
    rotation: 0,
    rotationBase: 0
}));

const freshTask = () => ({
    running: false,
    pc: 0,
    sub: -1,
    returnPc: 0,
    wakeUs: 0,
    priority: 0,
    locals: new Array(LOCAL_VARS).fill(0),
    loops: []
});

class RcxVmError extends Error {
    constructor (code, message) {
        super(message);
        this.code = code;
    }
}

/**
 * The VM. One per simulated RCX.
 */
export class RcxVm {
    /** @param {RcxVmOptions} [options] */
    constructor (options = {}) {
        this.options = {
            instrUs: Math.max(1, Math.round(options.instrUs ?? DEFAULT_INSTR_US)),
            seed: (options.seed ?? 1) >>> 0,
            programSlot: options.programSlot ?? 0,
            batteryMv: options.batteryMv ?? 9000
        };
        this.program = null;
        this.s = this._freshState();
    }

    _freshState () {
        return {
            status: 'idle',            // idle | running | stopped | error
            error: null,
            timeUs: 0,                 // host time reached by advance()
            cpuUs: 0,                  // when the interpreter may start its next instruction
            instrUs: this.options.instrUs,
            rr: MAX_TASKS - 1,         // last task that ran (round robin)
            vars: new Array(GLOBAL_VARS).fill(0),
            tasks: Array.from({length: MAX_TASKS}, freshTask),
            outputs: freshOutputs(),
            sensors: freshSensors(),
            timerBaseUs: [0, 0, 0, 0],
            watch: {minutes: 0, baseUs: 0},
            message: 0,
            rng: this.options.seed || 1,
            events: []
        };
    }

    /* ------------------------------------------------------------------ *
     * Program lifecycle
     * ------------------------------------------------------------------ */

    /**
     * Load an `.rcx` image (the bytes nqc-wasm returns). Resets the VM to
     * 'idle'; `run()` starts it.
     * @param {Uint8Array|ArrayBuffer} bytes
     * @returns {{ok: boolean, error?: string, detail?: string}}
     */
    load (bytes) {
        const out = loadRcxProgram(bytes);
        if (!out.ok) return out;
        this.program = out.program;
        this.s = this._freshState();
        return {ok: true};
    }

    /** Press Run: reset program state and start task 0 at the current time. */
    run () {
        if (!this.program) throw new Error('RcxVm.run: no program loaded');
        const {timeUs} = this.s;
        this.s = this._freshState();
        this.s.timeUs = this.s.cpuUs = timeUs;
        this.s.timerBaseUs = [timeUs, timeUs, timeUs, timeUs];
        this.s.watch.baseUs = timeUs;
        this.s.status = 'running';
        this._startTask(0);
    }

    get status () {
        return this.s.status;
    }

    /** @returns {null|{code, message, task, pc, opcode, subroutine}} */
    get error () {
        return this.s.error;
    }

    /** Simulated time, ms. */
    get nowMs () {
        return this.s.timeUs / 1000;
    }

    /** @returns {RcxOutput[]} copies of outputs A..C */
    get outputs () {
        return this.s.outputs.map(o => ({...o}));
    }

    /** Global variables 0..31 (copy). */
    get globals () {
        return this.s.vars.slice();
    }

    /** A global by its NQC name, via the image's symbol table. */
    getVariable (name) {
        const sym = this.program?.symbols.find(s => s.kind === 'variable' && s.name === name);
        if (!sym) throw new Error(`RcxVm.getVariable: no variable named "${name}"`);
        if (sym.index >= GLOBAL_VARS) throw new Error(`RcxVm.getVariable: "${name}" is a task local`);
        return this.s.vars[sym.index];
    }

    /** Which tasks are running (task numbers). */
    get runningTasks () {
        return this.s.tasks.flatMap((t, i) => (t.running ? [i] : []));
    }

    /** Input configuration for the device models (who is powered, how read). */
    inputConfig () {
        return this.s.sensors.map(x => ({
            type: x.type,
            mode: x.modeByte >> 5,
            slope: x.modeByte & 0x1f,
            active: ACTIVE_SENSOR_TYPES.includes(x.type)
        }));
    }

    /** The processed value the program reads as SENSOR_n (index 0..2). */
    sensorValue (index) {
        return this._sensorValue(this.s.sensors[index]);
    }

    /** An IR message arriving from outside (another RCX, a remote). 0..255. */
    receiveMessage (value) {
        this.s.message = value & 0xff;
    }

    /** Recorded sound/display/message/datalog/error events, removed from the VM. */
    drainEvents () {
        const out = this.s.events;
        this.s.events = [];
        return out;
    }

    /* ------------------------------------------------------------------ *
     * Snapshot / restore (§6.4)
     * ------------------------------------------------------------------ */

    /** Everything that changes while running, as plain JSON-safe data. */
    snapshot () {
        return {
            format: SNAPSHOT_FORMAT,
            program: this.program ? this.program.fingerprint : null,
            state: JSON.parse(JSON.stringify(this.s))
        };
    }

    restore (snap) {
        if (!snap || snap.format !== SNAPSHOT_FORMAT) {
            throw new Error(`RcxVm.restore: not an ${SNAPSHOT_FORMAT} snapshot`);
        }
        const mine = this.program ? this.program.fingerprint : null;
        if (snap.program !== mine) {
            throw new Error(`RcxVm.restore: snapshot is of program ${snap.program}, ` +
                `the VM holds ${mine}`);
        }
        this.s = JSON.parse(JSON.stringify(snap.state));
    }

    /* ------------------------------------------------------------------ *
     * Stepping
     * ------------------------------------------------------------------ */

    /**
     * Run until simulated time `now + ms`.
     * @param {number} ms
     * @param {{inputs?: Array<number|{raw?: number, rotation?: number}>,
     *          outputs?: RcxOutput[]}} [ports]
     * @returns {RcxOutput[]} the outputs at the end of the interval
     */
    advance (ms, ports = {}) {
        const s = this.s;
        const target = s.timeUs + Math.round(ms * 1000);
        if (ports.inputs) this._sampleInputs(ports.inputs);
        while (s.status === 'running') {
            const ti = this._pickTask();
            if (ti < 0) {
                const wake = this._nextWake();
                if (wake === Infinity) {
                    s.status = 'stopped';
                    break;
                }
                s.cpuUs = Math.max(s.cpuUs, Math.min(wake, target));
                if (wake > target) break;
                continue;
            }
            if (s.cpuUs + s.instrUs > target) break;
            this._execute(ti);
            s.cpuUs += s.instrUs;
            if (s.status === 'running' && !s.tasks.some(t => t.running)) s.status = 'stopped';
        }
        s.timeUs = target;
        if (s.status !== 'running') s.cpuUs = Math.max(s.cpuUs, target);
        const out = this.outputs;
        if (ports.outputs) {
            for (let i = 0; i < 3; i++) ports.outputs[i] = out[i];
        }
        return out;
    }

    _pickTask () {
        const {tasks, cpuUs} = this.s;
        for (let k = 1; k <= MAX_TASKS; k++) {
            const i = (this.s.rr + k) % MAX_TASKS;
            if (tasks[i].running && tasks[i].wakeUs <= cpuUs) return i;
        }
        return -1;
    }

    _nextWake () {
        let wake = Infinity;
        for (const t of this.s.tasks) if (t.running && t.wakeUs < wake) wake = t.wakeUs;
        return wake;
    }

    /* ------------------------------------------------------------------ *
     * Inputs
     * ------------------------------------------------------------------ */

    _sampleInputs (inputs) {
        for (let i = 0; i < 3; i++) {
            const inp = inputs[i];
            if (inp === undefined || inp === null) continue;
            const x = this.s.sensors[i];
            const raw = typeof inp === 'number' ? inp : inp.raw;
            if (typeof inp === 'object' && Number.isFinite(inp.rotation)) {
                x.rotation = Math.trunc(inp.rotation);
            }
            if (!Number.isFinite(raw)) continue;
            const next = Math.min(1023, Math.max(0, Math.round(raw)));
            // An unchanged reading is the same held sample read again (the
            // host's zero-order hold), not a new one: it must not reset the
            // slope reference, or how advance() is chunked would leak into
            // the state.
            if (next === x.raw) continue;
            x.lastRaw = x.raw;
            x.raw = next;
            const before = x.bool;
            const slope = x.modeByte & 0x1f;
            if (slope === 0) {
                // Absolute thresholds with a dead band between them (memory).
                if (x.raw < BOOL_TRUE_BELOW) x.bool = 1;
                else if (x.raw > BOOL_FALSE_ABOVE) x.bool = 0;
            } else {
                // Slope mode: a fall faster than `slope` per sample is true, a
                // rise faster than it is false (memory; sampled per advance).
                const delta = x.raw - x.lastRaw;
                if (delta < -slope) x.bool = 1;
                else if (delta > slope) x.bool = 0;
            }
            if (x.bool !== before) {
                x.edges = int16(x.edges + 1);
                if (before === 1) x.pulses = int16(x.pulses + 1);
            }
        }
    }

    _sensorValue (x) {
        switch (x.modeByte >> 5) {
        case SENSOR_MODE.RAW: return x.raw;
        case SENSOR_MODE.BOOL: return x.bool;
        case SENSOR_MODE.EDGE: return x.edges;
        case SENSOR_MODE.PULSE: return x.pulses;
        case SENSOR_MODE.PERCENT:
            // Light-sensor percent scale (memory): 146 − raw/7, clamped.
            return Math.min(100, Math.max(0, 146 - Math.trunc(x.raw / 7)));
        case SENSOR_MODE.CELSIUS:
            // Tenths of a degree (NQC guide); (785 − raw)/8 °C (memory).
            return int16(Math.trunc(((785 - x.raw) * 10) / 8));
        case SENSOR_MODE.FAHRENHEIT:
            return int16(Math.trunc((((785 - x.raw) * 10) / 8) * 9 / 5) + 320);
        default: // ROTATION
            return int16(x.rotation - x.rotationBase);
        }
    }

    /* ------------------------------------------------------------------ *
     * The interpreter
     * ------------------------------------------------------------------ */

    _startTask (n) {
        const code = this.program.tasks[n];
        if (!code) throw new RcxVmError('NO_SUCH_TASK', `start of task ${n}, which the program does not have`);
        const t = this.s.tasks[n];
        // A start of a running task restarts it (memory); locals are not cleared.
        t.running = true;
        t.pc = 0;
        t.sub = -1;
        t.returnPc = 0;
        t.loops = [];
        t.wakeUs = this.s.cpuUs;
        this._settle(n);
    }

    /** Fall off the end of a subroutine (return) or of a task (it ends). */
    _settle (ti) {
        const t = this.s.tasks[ti];
        while (t.running) {
            const code = t.sub >= 0 ? this.program.subroutines[t.sub] : this.program.tasks[ti];
            if (t.pc < code.length) return;
            if (t.pc > code.length) {
                throw new RcxVmError('BAD_JUMP', `pc ${t.pc} is past the end (${code.length})`);
            }
            if (t.sub >= 0) {
                t.sub = -1;
                t.pc = t.returnPc;
            } else {
                t.running = false;
            }
        }
    }

    _execute (ti) {
        const s = this.s;
        const t = s.tasks[ti];
        s.rr = ti;
        const code = t.sub >= 0 ? this.program.subroutines[t.sub] : this.program.tasks[ti];
        const pc = t.pc;
        const op = code[pc];
        try {
            const info = OPCODES.get(op);
            if (!info) throw new RcxVmError('UNKNOWN_OPCODE', `unknown opcode 0x${hex(op)}`);
            if (info.unsupported) {
                throw new RcxVmError('UNSUPPORTED_OPCODE',
                    `${info.name} (${info.mnemonic}, 0x${hex(op)}) is a known RCX2 opcode ` +
                    'this VM does not implement yet');
            }
            if (pc + info.length > code.length) {
                throw new RcxVmError('TRUNCATED_INSTRUCTION',
                    `${info.mnemonic} needs ${info.length} bytes, ${code.length - pc} remain`);
            }
            t.pc = pc + info.length;
            this._dispatch(ti, t, op, code, pc);
            this._settle(ti);
        } catch (e) {
            if (!(e instanceof RcxVmError)) throw e;
            this._fail(e, ti, t, pc, op);
        }
    }

    _fail (e, ti, t, pc, op) {
        const s = this.s;
        s.error = {code: e.code, message: e.message, task: ti, subroutine: t.sub, pc, opcode: op};
        s.status = 'error';
        for (const task of s.tasks) task.running = false;
        // A halted program must not leave motors driving into a wall: float them.
        for (const o of s.outputs) o.mode = 'float';
        s.events.push({tUs: s.cpuUs, task: ti, kind: 'error', ...s.error});
    }

    _event (ti, kind, fields) {
        this.s.events.push({tUs: this.s.cpuUs, task: ti, kind, ...fields});
    }

    _dispatch (ti, t, op, code, pc) {
        const s = this.s;
        const u16 = at => code[at] | (code[at + 1] << 8);
        const jump = target => {
            if (target < 0 || target > code.length) {
                throw new RcxVmError('BAD_JUMP', `branch target ${target} outside 0..${code.length}`);
            }
            t.pc = target;
        };
        switch (op) {
        case 0x13: { // SetPower list, src, val8
            const p = Math.min(7, Math.max(0, this._source(ti, code[pc + 2], code[pc + 3])));
            this._forOutputs(code[pc + 1], o => {
                o.power = p;
            });
            break;
        }
        case 0xe1: { // SetDirection
            const how = code[pc + 1] >> 6;
            this._forOutputs(code[pc + 1], o => {
                if (how === DIR_BITS.FWD) o.direction = 1;
                else if (how === DIR_BITS.REV) o.direction = -1;
                else if (how === DIR_BITS.FLIP) o.direction = -o.direction;
                else throw new RcxVmError('BAD_OPERAND', `direction bits 0b11 in 0x${hex(code[pc + 1])}`);
            });
            break;
        }
        case 0x21: { // SetOutputMode
            const how = code[pc + 1] >> 6;
            if (how > OUT_MODE_BITS.ON) {
                throw new RcxVmError('BAD_OPERAND', `output mode bits 0b11 in 0x${hex(code[pc + 1])}`);
            }
            this._forOutputs(code[pc + 1], o => {
                o.mode = MODE_NAMES[how];
            });
            break;
        }
        case 0x32: { // SetSensorType
            const x = this._sensor(code[pc + 1]);
            if (code[pc + 2] > SENSOR_TYPE.ROTATION) {
                throw new RcxVmError('BAD_OPERAND', `sensor type ${code[pc + 2]}`);
            }
            x.type = code[pc + 2];
            break;
        }
        case 0x42: // SetSensorMode
            this._sensor(code[pc + 1]).modeByte = code[pc + 2];
            break;
        case 0xd1: { // ClearSensor
            const x = this._sensor(code[pc + 1]);
            x.edges = 0;
            x.pulses = 0;
            x.rotationBase = x.rotation;
            break;
        }
        case 0x43: { // Wait src, val16 — in 10 ms ticks
            const ticks = Math.max(0, this._source(ti, code[pc + 1], u16(pc + 2)));
            t.wakeUs = s.cpuUs + (ticks * US_PER_TICK_10MS);
            break;
        }
        case 0xa1: // ClearTimer
            s.timerBaseUs[this._timerIndex(code[pc + 1])] = s.cpuUs;
            break;
        case 0x14: case 0x24: case 0x34: case 0x44: case 0x54:
        case 0x64: case 0x74: case 0x84: case 0x94:
            this._varOp(ti, op, code[pc + 1], this._source(ti, code[pc + 2], u16(pc + 3)));
            break;
        case 0x05: { // Set dstType, dstVal, srcType, srcVal16
            const value = this._source(ti, code[pc + 3], u16(pc + 4));
            const [dstType, dst] = [code[pc + 1], code[pc + 2]];
            if (dstType === SRC.VAR) this._setVar(ti, dst, value);
            else if (dstType === SRC.TIMER) s.timerBaseUs[this._timerIndex(dst)] = s.cpuUs - (value * US_PER_TICK_100MS);
            else throw new RcxVmError('UNSUPPORTED_OPERAND', `Set to destination type ${dstType}`);
            break;
        }
        case 0x85: case 0x95: { // CheckBranch
            const rel = code[pc + 1] >> 6;
            const a = this._source(ti, code[pc + 1] & 0x3f, u16(pc + 3));
            const b = this._source(ti, code[pc + 2], code[pc + 5]);
            if (RELATIONS[rel](a, b)) {
                jump(op === 0x85 ? OFFSET.nearU8(code, pc + 6) : OFFSET.farS16(code, pc + 6));
            }
            break;
        }
        case 0x27:
            jump(OFFSET.near7(code, pc + 1));
            break;
        case 0x72:
            jump(OFFSET.far15(code, pc + 1));
            break;
        case 0xf2: case 0xf3: { // decrement var, branch if it went negative
            const v = int16(this._getVar(ti, code[pc + 1]) - 1);
            this._setVar(ti, code[pc + 1], v);
            if (v < 0) jump(op === 0xf2 ? OFFSET.near7(code, pc + 2) : OFFSET.far15(code, pc + 2));
            break;
        }
        case 0x82: { // SetLoopCounter (RCX 1 repeat)
            if (t.loops.length >= LOOP_STACK_DEPTH) {
                throw new RcxVmError('LOOP_STACK_OVERFLOW', `more than ${LOOP_STACK_DEPTH} nested repeat counters`);
            }
            t.loops.push(this._source(ti, code[pc + 1], code[pc + 2]));
            break;
        }
        case 0x37: { // DecLoopCounter: same shape as decvjn, pops on exit
            if (!t.loops.length) throw new RcxVmError('LOOP_STACK_UNDERFLOW', 'loopc with no counter set');
            const v = t.loops[t.loops.length - 1] - 1;
            t.loops[t.loops.length - 1] = v;
            if (v < 0) {
                t.loops.pop();
                jump(OFFSET.nearU8(code, pc + 1));
            }
            break;
        }
        case 0x17: { // CallSub
            const n = code[pc + 1];
            if (t.sub >= 0) throw new RcxVmError('NESTED_CALL', `subroutine ${t.sub} calls subroutine ${n}`);
            if (!this.program.subroutines[n]) throw new RcxVmError('NO_SUCH_SUBROUTINE', `call of subroutine ${n}`);
            t.returnPc = t.pc;
            t.sub = n;
            t.pc = 0;
            break;
        }
        case 0x71:
            this._startTask(this._taskIndex(code[pc + 1]));
            break;
        case 0x81:
            s.tasks[this._taskIndex(code[pc + 1])].running = false;
            break;
        case 0x50: // StopAllTasks. Outputs are left as they are.
            for (const task of s.tasks) task.running = false;
            break;
        case 0xd7: // SetPriority: recorded; it orders resource access (acquire), not scheduling
            t.priority = code[pc + 1];
            break;
        case 0x51:
            this._event(ti, 'sound', {sound: code[pc + 1]});
            break;
        case 0x23:
            this._event(ti, 'tone', {frequency: u16(pc + 1), durationMs: code[pc + 3] * 10});
            break;
        case 0x33:
            this._event(ti, 'display', {select: this._source(ti, code[pc + 1], u16(pc + 2))});
            break;
        case 0xe5:
            this._event(ti, 'user-display', {precision: code[pc + 2], source: code[pc + 3],
                value: u16(pc + 4), shown: this._source(ti, code[pc + 3], u16(pc + 4))});
            break;
        case 0xb2:
            this._event(ti, 'send-message', {value: this._source(ti, code[pc + 1], code[pc + 2]) & 0xff});
            break;
        case 0x90:
            s.message = 0;
            break;
        case 0x52:
            this._event(ti, 'datalog-create', {size: u16(pc + 1)});
            break;
        case 0x62:
            this._event(ti, 'datalog', {value: this._source(ti, code[pc + 1], code[pc + 2])});
            break;
        case 0x22:
            s.watch = {minutes: (code[pc + 1] * 60) + code[pc + 2], baseUs: s.cpuUs};
            break;
        case 0xb1:
            this._event(ti, 'sleep-time', {minutes: code[pc + 1]});
            break;
        case 0x31:
            this._event(ti, 'tx-power', {level: code[pc + 1]});
            break;
        default:
            throw new RcxVmError('UNKNOWN_OPCODE', `opcode 0x${hex(op)} has no handler`);
        }
    }

    _varOp (ti, op, index, value) {
        const cur = this._getVar(ti, index);
        let next;
        switch (op) {
        case 0x14: next = value; break;
        case 0x24: next = cur + value; break;
        case 0x34: next = cur - value; break;
        // Truncating division; division by zero leaves the variable as it
        // was (uncertain: the remembered spec does not say).
        case 0x44: next = value === 0 ? cur : Math.trunc(cur / value); break;
        case 0x54: next = Math.imul(cur, value); break;
        case 0x64: next = Math.sign(value); break;
        case 0x74: next = Math.abs(value); break;
        case 0x84: next = cur & value; break;
        default: next = cur | value; break; // 0x94
        }
        this._setVar(ti, index, int16(next));
    }

    _getVar (ti, index) {
        if (index < GLOBAL_VARS) return this.s.vars[index];
        if (index < GLOBAL_VARS + LOCAL_VARS) return this.s.tasks[ti].locals[index - GLOBAL_VARS];
        throw new RcxVmError('BAD_OPERAND', `variable ${index} (RCX2 has 0..47)`);
    }

    _setVar (ti, index, value) {
        if (index < GLOBAL_VARS) this.s.vars[index] = int16(value);
        else if (index < GLOBAL_VARS + LOCAL_VARS) this.s.tasks[ti].locals[index - GLOBAL_VARS] = int16(value);
        else throw new RcxVmError('BAD_OPERAND', `variable ${index} (RCX2 has 0..47)`);
    }

    /** Evaluate a (source type, value) operand to an int16. */
    _source (ti, type, value) {
        const s = this.s;
        switch (type) {
        case SRC.VAR: return this._getVar(ti, value);
        case SRC.TIMER:
            return int16(Math.trunc((s.cpuUs - s.timerBaseUs[this._timerIndex(value)]) / US_PER_TICK_100MS));
        case SRC.FAST_TIMER:
            return int16(Math.trunc((s.cpuUs - s.timerBaseUs[this._timerIndex(value)]) / US_PER_TICK_10MS));
        case SRC.CONST: return int16(value);
        case SRC.OUTPUT_STATUS: {
            // Bits (memory): 0..2 power, 3 forward, 6 brake, 7 on.
            const o = s.outputs[this._outputIndex(value)];
            return o.power | (o.direction > 0 ? 0x08 : 0) |
                (o.mode === 'off' ? 0x40 : 0) | (o.mode === 'on' ? 0x80 : 0);
        }
        case SRC.RANDOM: {
            s.rng = (Math.imul(s.rng, 1103515245) + 12345) >>> 0;
            return value <= 0 ? 0 : (s.rng >>> 16) % (value + 1);
        }
        case SRC.PROGRAM: return this.options.programSlot;
        case SRC.SENSOR_VALUE: return this._sensorValue(this._sensor(value));
        case SRC.SENSOR_TYPE: return this._sensor(value).type;
        case SRC.SENSOR_MODE: return this._sensor(value).modeByte;
        case SRC.SENSOR_RAW: return this._sensor(value).raw;
        case SRC.SENSOR_BOOL: return this._sensor(value).bool;
        case SRC.WATCH:
            return (s.watch.minutes + Math.trunc((s.cpuUs - s.watch.baseUs) / 60e6)) % 1440;
        case SRC.MESSAGE: return s.message;
        case SRC.BATTERY: return int16(this.options.batteryMv);
        default:
            throw new RcxVmError('UNSUPPORTED_SOURCE', `operand source type ${type} (value ${value})`);
        }
    }

    _forOutputs (byte, fn) {
        for (let i = 0; i < 3; i++) if (byte & (1 << i)) fn(this.s.outputs[i]);
    }

    _sensor (i) {
        if (i > 2) throw new RcxVmError('BAD_OPERAND', `sensor ${i} (the RCX has 0..2)`);
        return this.s.sensors[i];
    }

    _timerIndex (i) {
        if (i > 3) throw new RcxVmError('BAD_OPERAND', `timer ${i} (the RCX has 0..3)`);
        return i;
    }

    _outputIndex (i) {
        if (i > 2) throw new RcxVmError('BAD_OPERAND', `output ${i} (the RCX has 0..2)`);
        return i;
    }

    _taskIndex (i) {
        if (i >= MAX_TASKS) throw new RcxVmError('NO_SUCH_TASK', `task ${i} (the RCX has 0..9)`);
        return i;
    }
}

const hex = n => (n ?? 0).toString(16).padStart(2, '0');

/**
 * Convenience: a VM with `bytes` loaded and running.
 * @param {Uint8Array} bytes
 * @param {RcxVmOptions} [options]
 */
export function createRcxVm (bytes, options) {
    const vm = new RcxVm(options);
    const out = vm.load(bytes);
    if (!out.ok) throw new Error(`createRcxVm: ${out.error}: ${out.detail}`);
    vm.run();
    return vm;
}
