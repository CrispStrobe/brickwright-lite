// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The EV3 brick behind the Robot Lab's port boundary (hubs/hub-profile.js; docs/ROBOT-LAB-EV3-NXT.md):
// a VirtualHub whose "route" is the direct commands an EV3 extension sends over the Scratch Link
// BT-classic registry (hubs/ev3/ev3-peripheral.js → ev3-direct-commands.js → the BRICK methods
// below). Everything the brick knows is plain data in `this.s`, exported to the physics worker's
// mirror with the rest of the scene; a command that arrives while a worker batch is in flight
// redoes that batch (sim-session.js), as a SPIKE block's does.
//
//   advanceTo(t)   per output: the job (a power, a regulated speed, a step/time profile, a sync
//                  pair) decides the duty for the step ending at t (hubs/mindstorms-output.js);
//   readDrives()   those duties as `pwm` drives for the motors' DC models;
//   writeReadings  encoders → tacho counts; probes → the inputs' readings; the brick body's
//                  heading → the gyro.
//
// MOTOR JOBS (EV3 Firmware Developer Kit §4.9):
//   OUTPUT_POWER/SPEED set a level, OUTPUT_START runs it: open-loop power, or a regulated speed
//     (SPEED_FULL_SCALE_DPS: 100 % is the motor's no-load speed);
//   OUTPUT_STEP_*/TIME_* run "a full motor power cycle": STEP1 ramp up, STEP2 constant, STEP3
//     ramp down, in tacho counts (degrees) or milliseconds, then BRAKE or float. The level
//     follows a straight ramp over STEP1 and STEP3 (from/to MIN_RAMP of it, so a regulated
//     motor starts and arrives); the job ENDS when the TACHO has travelled STEP1+STEP2+STEP3
//     (or the time has passed) — the encoder decides, as the firmware's tacho-count cycle does —
//     and the port is busy until then (OUTPUT_TEST, OUTPUT_READY);
//   OUTPUT_STEP_SYNC/TIME_SYNC run two motors at one speed with a turn ratio (0: equal, 100:
//     the second stops, 200: it turns backwards at the same speed); the amount is the faster one's.
//   OUTPUT_STOP brakes or floats; OUTPUT_POLARITY flips a port's direction (1, -1; 0 toggles).
// Two counters per port: the TACHO count OUTPUT_READ reports and OUTPUT_RESET clears, and the
// sensor COUNT OUTPUT_GET_COUNT reports and OUTPUT_CLR_COUNT clears ("the tacho count used as
// sensor input"). One count per degree: the EV3 motors' encoders (devices/catalog.js).
//
// PROGRAMS (docs/EV3-RBF-VM.md): a `.rbf` downloaded with the system commands (ev3-system-commands.js
// into the file system, ev3-files.js) is loaded with opFILE LOAD_IMAGE and started with
// opPROGRAM_START in the user slot; it runs in the clean-room VM (routes/ev3-vm/ev3-vm.js) in 1 ms
// steps on the Lab's clock, on THIS brick: its instructions reach the same methods the direct commands
// do. When it ends (normally, PROGRAM_STOP, or an error) the brick's UI stops the outputs as LEGO's
// does (INPUT_DEVICE STOP_ALL → OUTPUT_PRG_STOP: a braked motor stays braked, the others float).

import {EV3_PROFILE, EV3_OUTPUTS, EV3_INPUTS} from './profile.js';
import {dcMotorFor} from '../../devices/dc-motors.js';
import {EV3_TYPE, EV3_DEVICE_TYPE, EV3_MODES, EV3_NAMES, ev3SensorSi, ev3SensorPct, ev3SensorRaw, ev3SensorMinMax} from '../../devices/ev3-sensors.js';
import {freshOutput, readEncoder, driveOpen, drivePassive, driveRegulated, copyOutput} from '../mindstorms-output.js';
import {OUTPUT_PORT_BASE} from './ev3-direct-commands.js';
import {Ev3Vm} from '../../routes/ev3-vm/ev3-vm.js';
import {SLOT, OBJSTAT, RESULT} from '../../routes/ev3-vm/ev3-bytecodes.js';
import * as files from './ev3-files.js';
import {serveSystemCommand} from './ev3-system-commands.js';

/**
 * Regulated speed at 100 %, °/s: the motor's no-load speed at 9 V (Philo, devices/catalog.js:
 * EV3 Large 175 rpm, Medium 260 rpm), which is also what ev3dev documents as the stock motors'
 * `max_speed` (1050 and 1560 tacho counts per second). A loaded motor cannot reach it.
 */
export const SPEED_FULL_SCALE_DPS = Object.freeze({[EV3_TYPE.largeMotor]: 1050, [EV3_TYPE.mediumMotor]: 1560});
/** A ramp starts from, and ends at, this share of the level (so a regulated motor sets off and arrives). */
export const MIN_RAMP = 0.1;
/** The sound a tone makes lasts its duration; files are not modelled (they last this long). */
export const FILE_SOUND_MS = 500;
/** How many recorded brick events (tones, drawing, LEDs) the hub keeps for the UI. */
const EVENT_LOG = 50;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toInt8 = v => (Math.trunc(v) << 24) >> 24;

/** The output ports a bit field names (A = 1 … D = 8), in order. */
export const portsOfMask = nos => EV3_OUTPUTS.map((p, i) => ((nos >> i) & 1 ? i : -1)).filter(i => i >= 0);
/** One output port named by a number 0–3, or by a bit field naming exactly one port. */
const portOfNumber = no => (no >= 0 && no <= 3 ? no : (no > 0 && (no & (no - 1)) === 0 && no <= 8 ? Math.log2(no) : -1));

const freshPort = () => ({
    ...freshOutput(),
    type: EV3_TYPE.none, device: null,
    polarity: 1, tachoZero: 0, countZero: 0,
    level: {kind: null, value: 0}, started: false,
    job: null, busy: false
});

const freshInput = () => ({type: EV3_TYPE.none, device: null, mode: 0, probe: null, pressed: false, bumps: 0, changes: 0, gyroZeroDeg: 0});

export class Ev3VirtualHub {
    constructor ({id = 'hub', vm: vmOptions = {}} = {}) {
        this.id = id;
        this.profile = EV3_PROFILE;
        this.s = {
            timeMs: 0,
            outputs: EV3_OUTPUTS.map(freshPort),
            inputs: EV3_INPUTS.map(freshInput),
            headingDeg: 0, rateDps: 0,
            volume: 100, sleepMinutes: 30, led: 0, toneEndMs: 0,
            buttons: [0, 0, 0, 0, 0, 0, 0],
            fs: files.freshFs(),
            program: null, lastProgram: null
        };
        /** The program VM (routes/ev3-vm), or null before the first PROGRAM_START. Options: {vm: {instrPerMs, seed}}. */
        this.vm = null;
        this.vmOptions = vmOptions;
        /** port index -> the motor's DC spec */
        this.specs = new Map();
        this.events = [];
        this.listeners = new Set();
        this.plugged = false;
    }

    /** Motors on A–D, sensors on 1–4; refuses ports the EV3 lacks and devices it cannot read. */
    plug (bindings) {
        const diagnostics = [];
        for (const b of bindings) {
            const spec = this.profile.ports.find(p => p.id === b.port);
            if (!spec) {
                diagnostics.push({severity: 'error', code: 'port-unknown',
                    message: `${this.profile.name.en} has no port '${b.port}' (ports ${this.profile.ports.map(p => p.id).join(', ')})`});
                continue;
            }
            const type = EV3_DEVICE_TYPE[b.device];
            if (b.class === 'motor') {
                const i = EV3_OUTPUTS.indexOf(b.port);
                if (i < 0 || (type !== EV3_TYPE.largeMotor && type !== EV3_TYPE.mediumMotor)) {
                    diagnostics.push({severity: 'error', code: 'port-refuses-device',
                        message: `${this.profile.name.en} ${spec.label.en} takes an EV3 motor, not ${b.device || 'this motor'}`});
                    continue;
                }
                const port = this.s.outputs[i];
                port.type = type;
                port.device = b.device;
                this.specs.set(i, (b.dcMotor || dcMotorFor({device: b.device, ids: {}})).motor);
            } else {
                const i = EV3_INPUTS.indexOf(b.port);
                if (i < 0 || type === undefined || type === EV3_TYPE.largeMotor || type === EV3_TYPE.mediumMotor) {
                    diagnostics.push({severity: 'error', code: 'port-refuses-device',
                        message: `${this.profile.name.en} ${spec.label.en} cannot read ${b.device || b.sensor}`});
                    continue;
                }
                Object.assign(this.s.inputs[i], {type, device: b.device});
            }
        }
        this.s.timeMs = 0;
        this.plugged = true;
        return diagnostics;
    }

    // ---- the VirtualHub boundary ---------------------------------------------------------------

    advanceTo (tMs) {
        const dtMs = tMs - this.s.timeMs;
        if (!(dtMs > 0)) {
            this.s.timeMs = tMs;
            return;
        }
        // A running program first, millisecond by millisecond up to the end of the step (the brick's clock
        // follows it: atMs); its sensor reads hold the last step's readings.
        if (this.s.program && this.vm) {
            this.vm.advanceTo(tMs, this);
            if (this.vm.status !== 'running') this._programEnded(this.vm.s.ending);
        }
        this.s.timeMs = tMs;
        this.s.outputs.forEach((port, i) => {
            if (port.type === EV3_TYPE.none) return;
            this._drive(i, port, dtMs);
        });
    }

    readDrives () {
        const out = [];
        this.s.outputs.forEach((port, i) => {
            if (port.type !== EV3_TYPE.none) out.push({port: EV3_OUTPUTS[i], mode: 'pwm', duty: port.duty * port.polarity, decay: port.decay});
        });
        return out;
    }

    writeReadings (readings, pose = null) {
        for (const r of readings) {
            if (r.kind === 'encoder') {
                const i = EV3_OUTPUTS.indexOf(r.port);
                if (i < 0) continue;
                const port = this.s.outputs[i];
                // The motor turns the way its polarity drives it; the firmware counts in its own direction.
                readEncoder(port, {deltaRad: r.deltaRad * port.polarity, radPerSec: r.radPerSec * port.polarity});
            } else if (r.kind === 'probe') {
                const i = EV3_INPUTS.indexOf(r.port);
                if (i < 0) continue;
                const input = this.s.inputs[i];
                const before = JSON.stringify(input.probe);
                input.probe = {...r.raw, kind: r.device};
                if (input.type === EV3_TYPE.touch) {
                    const pressed = Boolean(r.raw && r.raw.pressed);
                    if (input.pressed && !pressed) input.bumps += 1;
                    input.pressed = pressed;
                }
                if (before !== JSON.stringify(input.probe)) input.changes += 1;
            }
        }
        if (pose) {
            this.s.headingDeg = pose.headingDeg;
            this.s.rateDps = pose.rateDegPerSec;
        }
    }

    publish () {
        this._drainProgram();
        this._changed();
    }

    /** The program's errors into the brick's log (its tones, writes and drawing are there already). */
    _drainProgram () {
        if (!this.vm) return;
        for (const {kind, t, ...rest} of this.vm.drainEvents()) {
            if (kind === 'error') this.event('program-error', {...rest, tick: t});
        }
    }

    /** fn(hub) after each published batch and each command. Returns an unsubscribe. */
    onChange (fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _changed () {
        for (const fn of [...this.listeners]) fn(this);
    }

    exportState () {
        const s = this.s;
        return {...s, outputs: s.outputs.map(p => ({...copyOutput(p), level: {...p.level}, job: p.job ? JSON.parse(JSON.stringify(p.job)) : null})),
            inputs: s.inputs.map(i => ({...i, probe: i.probe ? {...i.probe} : null})), buttons: [...s.buttons],
            fs: JSON.parse(JSON.stringify(s.fs)), program: s.program ? JSON.parse(JSON.stringify(s.program)) : null,
            lastProgram: s.lastProgram ? JSON.parse(JSON.stringify(s.lastProgram)) : null,
            // The VM travels while a program runs (a finished one has nothing left to do, and its image may be gone).
            vm: this.vm && s.program ? this.vm.snapshot() : null};
    }

    importState (state) {
        const {vm, ...rest} = state;
        const copy = JSON.parse(JSON.stringify(rest));
        this.s = copy;
        if (!copy.fs) copy.fs = files.freshFs();
        if (copy.program === undefined) copy.program = null;
        if (!vm) this.vm = null;
        else {
            if (!this.vm) this.vm = new Ev3Vm(this.vmOptions);
            this.vm.restore(vm, copy.program ? copy.program.image : null);
        }
        // The worker's mirror is made with {id} only: its motors' DC specs come from the devices.
        copy.outputs.forEach((port, i) => {
            if (port.device && !this.specs.has(i)) this.specs.set(i, dcMotorFor({device: port.device, ids: {}}).motor);
        });
    }

    stateKey (state) {
        return JSON.stringify(state);
    }

    dispose () {
        this.plugged = false;
        this.listeners.clear();
    }

    /** What a port reports now (the Robot Lab API's readPort). */
    readPort (portId) {
        const o = EV3_OUTPUTS.indexOf(portId);
        if (o >= 0 && this.s.outputs[o].type !== EV3_TYPE.none) {
            const p = this.s.outputs[o];
            return {kind: 'motor', angleDeg: p.angleDeg, speedDps: p.measuredDps};
        }
        const i = EV3_INPUTS.indexOf(portId);
        if (i >= 0 && this.s.inputs[i].type !== EV3_TYPE.none) {
            const input = this.s.inputs[i];
            return {kind: input.device, si: ev3SensorSi(input.type, input.mode, this._sensorState(input))};
        }
        return null;
    }

    motorPortIds () {
        return EV3_OUTPUTS.filter((p, i) => this.s.outputs[i].type !== EV3_TYPE.none);
    }

    // ---- the motor jobs ------------------------------------------------------------------------

    _fullScale (port) {
        return SPEED_FULL_SCALE_DPS[port.type] || 1050;
    }

    _drive (i, port, dtMs) {
        const spec = this.specs.get(i);
        const job = port.job;
        if (!job) {
            const {kind, value} = port.level;
            if (port.started && kind === 'power') driveOpen(port, value);
            else if (port.started && kind === 'speed') driveRegulated(port, value / 100 * this._fullScale(port), spec, dtMs);
            else drivePassive(port, port.decay);
            return;
        }
        // A cycle or a sync: progress in degrees of tacho (|travel| from its start) or in ms.
        const master = job.kind === 'sync' ? this.s.outputs[job.master] : port;
        const progress = job.unit === 'ms' ? (this.s.timeMs - job.startMs) : Math.abs(master.angleDeg - (job.kind === 'sync' ? job.masterStartDeg : job.startDeg));
        const total = job.total;
        if (total > 0 && progress >= total) {
            this._endJob(i, port);
            return;
        }
        let share = 1;
        if (job.kind === 'cycle') {
            const [s1, s2, s3] = job.steps;
            if (progress < s1) share = MIN_RAMP + (1 - MIN_RAMP) * progress / s1;
            else if (progress >= s1 + s2 && s3 > 0) share = MIN_RAMP + (1 - MIN_RAMP) * Math.max(0, total - progress) / s3;
        }
        const level = job.value * share;
        if (job.regulated) driveRegulated(port, level / 100 * this._fullScale(port), spec, dtMs);
        else driveOpen(port, level);
    }

    _endJob (i, port) {
        const job = port.job;
        port.job = null;
        port.busy = false;
        port.started = false;
        port.level = {kind: null, value: 0};
        drivePassive(port, job.brake ? 'brake' : 'coast');
        // A sync ends both of its motors at once.
        if (job.kind === 'sync' && job.partner !== null) {
            const other = this.s.outputs[job.partner];
            if (other.job && other.job.kind === 'sync' && other.job.id === job.id) this._endJob(job.partner, other);
        }
    }

    // ---- the BRICK: what the direct commands call (ev3-direct-commands.js) ------------------------

    nowMs () { return this.s.timeMs; }

    /** The program VM's millisecond: the brick's clock while the program runs (tone ends, timed cycles). */
    atMs (t) { this.s.timeMs = t; }

    _outputs (layer, nos) {
        return layer === 0 ? portsOfMask(nos) : [];
    }

    outputType (layer, no) {
        const i = portOfNumber(no);
        return layer === 0 && i >= 0 ? this.s.outputs[i].type : EV3_TYPE.none;
    }

    outputReset (layer, nos) {
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.tachoZero = p.angleDeg;
        }
    }

    outputClearCount (layer, nos) {
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.countZero = p.angleDeg;
        }
    }

    outputStop (layer, nos, brake) {
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.job = null;
            p.busy = false;
            p.started = false;
            drivePassive(p, brake ? 'brake' : 'coast');
        }
        this._changed();
    }

    outputSet (layer, nos, kind, value) {
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.level = {kind, value: clamp(value, -100, 100)};
            // A level changes a running motor at once; a cycle in progress keeps its own level.
            if (p.job) p.job = null;
        }
        this._changed();
    }

    outputStart (layer, nos) {
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.started = true;
            p.job = null;
            p.busy = false;
        }
        this._changed();
    }

    outputPolarity (layer, nos, pol) {
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.polarity = pol === 0 ? -p.polarity : (pol < 0 ? -1 : 1);
        }
    }

    _tacho (p) { return Math.trunc(p.angleDeg - p.tachoZero); }

    outputRead (layer, no) {
        const i = portOfNumber(no);
        if (layer !== 0 || i < 0) return {speed: 0, tacho: 0};
        const p = this.s.outputs[i];
        return {speed: toInt8(clamp(Math.round(p.measuredDps / this._fullScale(p) * 100), -100, 100)), tacho: this._tacho(p)};
    }

    outputCount (layer, no) {
        const i = portOfNumber(no);
        if (layer !== 0 || i < 0) return 0;
        const p = this.s.outputs[i];
        return Math.trunc(p.angleDeg - p.countZero);
    }

    outputBusy (layer, nos) {
        return this._outputs(layer, nos).some(i => this.s.outputs[i].busy);
    }

    outputProfile (layer, nos, {regulated, unit, value, steps, brake}) {
        const s = steps.map(v => Math.abs(v));
        // A negative step count runs the other way (the stock Scratch EV3 extension turns
        // counter-clockwise this way); the level's sign and the steps' sign multiply.
        const sign = Math.sign(value || 1) * (steps.some(v => v < 0) ? -1 : 1);
        for (const i of this._outputs(layer, nos)) {
            const p = this.s.outputs[i];
            p.job = {kind: 'cycle', regulated, unit, value: sign * Math.abs(clamp(value, -100, 100)), steps: s,
                total: s[0] + s[1] + s[2], brake, startDeg: p.angleDeg, startMs: this.s.timeMs};
            p.busy = true;
            p.started = false;
        }
        this._changed();
    }

    outputSync (layer, nos, {speed, turn, unit, amount, brake}) {
        const ports = this._outputs(layer, nos);
        if (ports.length !== 2) {
            // One port (or more than two): the firmware synchronises a pair; one port runs alone.
            for (const i of ports) this.outputProfile(layer, 1 << i, {regulated: true, unit, value: speed, steps: [0, amount, 0], brake});
            return;
        }
        const t = clamp(turn, -200, 200);
        const second = (100 - Math.abs(t)) / 100;
        const [a, b] = ports;
        const speeds = t >= 0 ? [speed, speed * second] : [speed * second, speed];
        const master = t >= 0 ? a : b;
        const id = `${this.s.timeMs}:${a}${b}`;
        ports.forEach((i, k) => {
            const p = this.s.outputs[i];
            p.job = {kind: 'sync', id, regulated: true, unit, value: speeds[k], total: Math.abs(amount), brake,
                master, masterStartDeg: this.s.outputs[master].angleDeg, startMs: this.s.timeMs, partner: ports[1 - k]};
            p.busy = true;
            p.started = false;
        });
        this._changed();
    }

    // ---- inputs --------------------------------------------------------------------------------

    _sensorState (input) {
        return {probe: input.probe, bumps: input.bumps, gyroZeroDeg: input.gyroZeroDeg, headingDeg: this.s.headingDeg, rateDps: this.s.rateDps};
    }

    /** INPUT_DEVICE_LIST: the types on inputs 0–3 and, from 16, outputs A–D [FDK §4.8]. */
    deviceList () {
        const list = Array(32).fill(EV3_TYPE.none);
        this.s.inputs.forEach((input, i) => { list[i] = input.type; });
        this.s.outputs.forEach((p, i) => { list[OUTPUT_PORT_BASE + i] = p.type; });
        return list;
    }

    _input (layer, no) {
        if (layer !== 0) return null;
        if (no >= 0 && no < 4) return {input: this.s.inputs[no]};
        if (no >= OUTPUT_PORT_BASE && no < OUTPUT_PORT_BASE + 4) return {output: this.s.outputs[no - OUTPUT_PORT_BASE]};
        return null;
    }

    /** One read of a port in a format ('READY_SI' | 'READY_PCT' | 'READY_RAW'). type 0: as plugged; mode −1: as set. */
    readInput (layer, no, type, mode, format) {
        const at = this._input(layer, no);
        if (!at) return {values: [0]};
        if (at.output) {
            const p = at.output;
            if (p.type === EV3_TYPE.none) return {values: [0]};
            const m = mode < 0 ? 0 : mode;
            const deg = this._tacho(p);
            const v = m === 1 ? deg / 360 : m === 2 ? Math.round(p.measuredDps / this._fullScale(p) * 100) : deg;
            return {values: [format === 'READY_SI' ? v : Math.round(v)]};
        }
        const input = at.input;
        if (input.type === EV3_TYPE.none) return {values: [0]};
        if (mode >= 0 && mode !== input.mode) {
            // A gyro reads its angle from zero again when its mode changes (as a real one does).
            if (input.type === EV3_TYPE.gyro) input.gyroZeroDeg = this.s.headingDeg;
            input.mode = mode;
        }
        const state = this._sensorState(input);
        const fn = format === 'READY_PCT' ? ev3SensorPct : format === 'READY_RAW' ? ev3SensorRaw : ev3SensorSi;
        return {values: fn(input.type, input.mode, state)};
    }

    inputFormat (layer, no) {
        const at = this._input(layer, no);
        const type = at ? (at.input ? at.input.type : at.output.type) : EV3_TYPE.none;
        const modes = (EV3_MODES[type] || []).length;
        return {datasets: type === EV3_TYPE.color && at?.input?.mode === 4 ? 3 : 1, format: 3, modes: modes || 1, view: modes || 1};
    }

    inputTypeMode (layer, no) {
        const at = this._input(layer, no);
        if (!at) return {type: EV3_TYPE.none, mode: 0};
        return at.input ? {type: at.input.type, mode: at.input.mode} : {type: at.output.type, mode: 0};
    }

    inputName (layer, no) {
        const {type} = this.inputTypeMode(layer, no);
        return EV3_NAMES[type] || 'NONE';
    }

    inputModeName (layer, no, mode) {
        const {type} = this.inputTypeMode(layer, no);
        return (EV3_MODES[type] || [])[mode] || '';
    }

    inputChanges (layer, no) {
        const at = this._input(layer, no);
        return at && at.input ? at.input.changes : 0;
    }

    /** CLR_CHANGES: the changes counter — and a gyro's angle, which is how LEGO's EV3 software resets one. */
    clearChanges (layer, no) {
        const at = this._input(layer, no);
        if (!at || !at.input) return;
        at.input.changes = 0;
        if (at.input.type === EV3_TYPE.gyro) at.input.gyroZeroDeg = this.s.headingDeg;
    }

    clearInputs (layer) {
        if (layer !== 0 && layer !== -1) return;
        for (const input of this.s.inputs) {
            input.bumps = 0;
            input.changes = 0;
            if (input.type === EV3_TYPE.gyro) input.gyroZeroDeg = this.s.headingDeg;
        }
    }

    inputMinMax (layer, no) {
        const {type, mode} = this.inputTypeMode(layer, no);
        return ev3SensorMinMax(type, mode);
    }

    inputBumps (layer, no) {
        const at = this._input(layer, no);
        return at && at.input ? at.input.bumps : 0;
    }

    // ---- sound, screen, LEDs, buttons, battery -------------------------------------------------

    event (kind, detail) {
        this.events.push({t: this.s.timeMs, kind, ...detail});
        if (this.events.length > EVENT_LOG) this.events.splice(0, this.events.length - EVENT_LOG);
    }

    tone (volume, frequency, duration) {
        this.s.toneEndMs = this.s.timeMs + Math.max(0, duration);
        this.event('tone', {volume, frequency, duration});
    }

    playFile (volume, name, repeat) {
        this.s.toneEndMs = repeat ? Number.MAX_SAFE_INTEGER : this.s.timeMs + FILE_SOUND_MS;
        this.event('sound', {volume, name, repeat});
    }

    soundBreak () {
        this.s.toneEndMs = 0;
        this.event('sound-stop', {});
    }

    soundBusy () { return this.s.timeMs < this.s.toneEndMs; }

    draw (name, fields) { this.event('draw', {op: name, ...fields}); }

    setLed (pattern) {
        this.s.led = pattern;
        this.event('led', {pattern});
    }

    volume () { return this.s.volume; }

    setVolume (v) { this.s.volume = clamp(v, 0, 100); }

    sleepMinutes () { return this.s.sleepMinutes; }

    setSleepMinutes (v) { this.s.sleepMinutes = clamp(v, 0, 120); }

    /** Buttons by the number UI_BUTTON names them with (FDK §4.15); none is pressed in the Lab. */
    button (b) { return Boolean(this.s.buttons[b]); }

    anyButton () { return this.s.buttons.some(Boolean); }

    flushButtons () {}

    pressButton (b, down) { if (b >= 0 && b < this.s.buttons.length) this.s.buttons[b] = down ? 1 : 0; }

    /** 6 AA cells at 9 V (devices/catalog.js HUB_SUPPLY_VOLTS.ev3), full; currents estimated. */
    battery () {
        const motors = this.s.outputs.reduce((sum, p) => sum + Math.abs(p.duty), 0);
        return {volts: 9, amps: 0.1 + 0.3 * motors, motorAmps: 0.3 * motors, percent: 100};
    }

    versions () {
        return {os: 'Brickwright Robot Lab', hardware: 'V0.60', firmware: 'BW-LAB 1.0', build: 'robotlab', osBuild: 'robotlab'};
    }

    // ---- files and programs (docs/EV3-RBF-VM.md) ---------------------------------------------------------

    /** A system command [CDK §3] on this brick's file system; the reply frame, or null. */
    systemCommand (frame) {
        return serveSystemCommand(frame, this.s.fs);
    }

    /** Puts a file straight into the file system (a host's completed download; tests). Returns a status. */
    putFile (path, bytes) { return files.putFile(this.s.fs, path, bytes); }

    readFile (path) { return files.readFile(this.s.fs, path); }

    /**
     * opFILE LOAD_IMAGE: reads a program into the user slot's memory. A name without a folder is looked
     * for in "ui/", one without an extension gets ".rbf" (the firmware's defaults). The user slot busy, or
     * a name the brick refuses: null (the outputs keep their values). No such file: size 0, address 0.
     */
    loadImage (slot, name) {
        if (slot !== SLOT.USER || this.s.program) return null;
        let text = String(name);
        if (!text.includes('/')) text = `ui/${text}`;
        if (!/\.[^/.]*$/.test(text)) text += '.rbf';
        const path = files.resolvePath(text);
        if (!path) return null;
        const bytes = this.s.fs.files[path];
        if (!bytes) return {size: 0, ip: 0};
        // One loaded image at a time (ours): its "address" is a token PROGRAM_START hands back.
        const ip = this.s.fs.nextImage++;
        this.s.fs.images = {[ip]: {path, image: bytes.slice()}};
        return {size: bytes.length, ip};
    }

    /**
     * opPROGRAM_START: runs the image LOAD_IMAGE loaded, in the user slot. Ignored (as on the brick)
     * when the slot is busy or the address names no image; an image the VM refuses never runs (the
     * refusal is in `lastProgram` and the events). Before it runs, every output stops and floats and
     * the polarities return to normal (the firmware's OutputReset and its PWM driver's program start).
     */
    programStart (slot, size, ip) {
        if (slot !== SLOT.USER || this.s.program) return;
        const loaded = this.s.fs.images[ip];
        if (!loaded) return;
        delete this.s.fs.images[ip];
        if (!this.vm) this.vm = new Ev3Vm(this.vmOptions);
        const r = this.vm.start(loaded.image, {name: loaded.path, tick: Math.floor(this.s.timeMs)});
        if (!r.ok) {
            this.s.lastProgram = {path: loaded.path, how: 'error', error: this.vm.error};
            this.event('program-refused', {path: loaded.path, status: r.status, detail: r.detail});
            this._changed();
            return;
        }
        this.s.outputs.forEach(p => {
            p.job = null;
            p.busy = false;
            p.started = false;
            p.polarity = 1;
            drivePassive(p, 'coast');
        });
        this.s.program = {path: loaded.path, image: loaded.image};
        this.event('program-start', {path: loaded.path});
        this._changed();
    }

    /** opPROGRAM_STOP: USER_SLOT, or GUI_SLOT ("all programs"), stops the running program. */
    programStop (slot) {
        if ((slot !== SLOT.USER && slot !== SLOT.GUI) || !this.s.program) return;
        this.vm.abort();
        this._programEnded('abort');
    }

    /** opPROGRAM_INFO GET_STATUS: the user slot's state; the UI and the direct commands' slot always run. */
    programStatus (slot) {
        if (slot === SLOT.USER) return this.s.program ? OBJSTAT.RUNNING : OBJSTAT.STOPPED;
        return slot === SLOT.GUI || slot === SLOT.CMD ? OBJSTAT.RUNNING : OBJSTAT.STOPPED;
    }

    /** opPROGRAM_INFO GET_PRGRESULT: BUSY while it runs, FAIL after an error, OK otherwise. */
    programResult (slot) {
        if (slot !== SLOT.USER) return RESULT.OK;
        if (this.s.program) return RESULT.BUSY;
        return this.s.lastProgram && this.s.lastProgram.how === 'error' ? RESULT.FAIL : RESULT.OK;
    }

    currentProgram () { return this.s.program ? this.s.program.path : null; }

    /** The program is over: the brick's UI stops the outputs (a braked motor stays braked, the others float). */
    _programEnded (how) {
        const path = this.s.program ? this.s.program.path : null;
        this.s.lastProgram = {path, how, error: this.vm ? this.vm.error : null};
        this.s.program = null;
        this.s.outputs.forEach(p => {
            const braked = !p.job && !p.started && p.decay === 'brake';
            p.job = null;
            p.busy = false;
            p.started = false;
            drivePassive(p, braked ? 'brake' : 'coast');
        });
        this._drainProgram();
        this.event('program-end', {path, how, error: this.vm ? this.vm.error : null});
        this._changed();
    }
}

/** The hub registry's entry for the EV3 (registry/hubs.js). */
export const ev3Hub = Object.freeze({
    profile: EV3_PROFILE,
    createVirtualHub: ({id, vm} = {}) => new Ev3VirtualHub({id, vm})
});

