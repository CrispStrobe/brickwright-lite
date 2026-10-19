// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The NXT brick behind the Robot Lab's port boundary (hubs/hub-profile.js;
// docs/ROBOT-LAB-EV3-NXT.md): a VirtualHub driven by the direct-command telegrams the legonxt
// extension sends over the Scratch Link BT-classic registry (hubs/nxt/nxt-peripheral.js →
// nxt-direct-commands.js → the BRICK methods below). All state is plain data in `this.s`
// (exported to the physics worker's mirror).
//
// OUTPUTS (Bluetooth Developer Kit Appendix 2, SETOUTPUTSTATE / GETOUTPUTSTATE): a port has a
// power (-100..100), mode bits (MOTORON, BRAKE, REGULATED), a regulation mode (IDLE, MOTOR_SPEED,
// MOTOR_SYNC), a turn ratio, a run state and a tacho limit (0 = run forever), and three counters:
// TachoCount ("number of counts since last reset of the motor counter"), BlockTachoCount
// ("current position relative to last programmed movement") and RotationCount ("current position
// relative to last reset of the rotation sensor for this motor"); RESETMOTORPOSITION resets the
// block count (relative = TRUE) or the rotation count (FALSE). One count per degree (the NXT
// motor's encoder: devices/catalog.js).
//
// What the firmware does with them is not published beyond those field descriptions, so the
// rest is OUR MODEL (docs/ROBOT-LAB-EV3-NXT.md "NXT motor model"):
//   - MOTORON off, or run state IDLE: the port is off — braked with the BRAKE bit, else floating;
//   - unregulated: duty = power / 100, the off phase braked (BRAKE) or floating;
//   - MOTOR_SPEED: a regulated speed, power % of the motor's no-load speed (FULL_SCALE_DPS), by
//     the Lab's speed loop (hubs/mindstorms-output.js); MOTOR_SYNC: the same, the second of two
//     synchronised ports scaled by the turn ratio;
//   - a tacho limit: the move ends when the port has turned that far since the command; a
//     regulated move decelerates onto it (ACCEL_DPS2) and ends on the encoder within
//     END_TOLERANCE_DEG, an unregulated one at the count. Then the run state is IDLE and the motor
//     brakes (BRAKE) or floats. TachoCount restarts at each command with a tacho limit.
//
// INPUTS: SETINPUTMODE's type and mode; GETINPUTVALUES's raw / normalized / scaled values from
// devices/nxt-sensors.js; the ultrasonic sensor as an I2C device (LSWRITE / LSGETSTATUS / LSREAD).

import {NXT_PROFILE, NXT_OUTPUTS, NXT_INPUTS} from './profile.js';
import {dcMotorFor} from '../../devices/dc-motors.js';
import {freshOutput, readEncoder, driveOpen, drivePassive, driveRegulated, copyOutput} from '../mindstorms-output.js';
import {MODE, REGULATION, RUN_STATE, STATUS} from './nxt-direct-commands.js';
import {NXT_SENSOR_TYPE, nxtAnalog, nxtScaled, usRegister, US_I2C_ADDRESS} from '../../devices/nxt-sensors.js';

/** Regulated speed at power 100, °/s: the NXT motor's no-load speed at 9 V (Philo: 170 rpm). */
export const FULL_SCALE_DPS = 1020;
/** A regulated move with a tacho limit approaches it at this deceleration (°/s², our model). */
export const ACCEL_DPS2 = 1500;
/** ...and ends when the shaft is this close to the limit (°) and slower than END_SPEED_DPS. */
export const END_TOLERANCE_DEG = 1;
export const END_SPEED_DPS = 30;
/** A regulated move that cannot reach its limit (blocked) ends after this long without progress. */
export const STALL_MS = 1000;
const EVENT_LOG = 50;

const NXT_DEVICES = Object.freeze({'nxt-touch': 'touch', 'nxt-light': 'light', 'nxt-sound': 'sound', 'nxt-ultrasonic': 'ultrasonic'});

const freshPort = () => ({
    ...freshOutput(), device: null,
    power: 0, mode: 0, regulation: 0, turnRatio: 0, runState: RUN_STATE.IDLE, tachoLimit: 0,
    tachoZero: 0, blockZero: 0, rotationZero: 0, moveStartDeg: 0, stalledMs: 0, lastProgressDeg: 0
});

const freshInput = () => ({device: null, type: NXT_SENSOR_TYPE.none, mode: 0, probe: null, valid: false,
    memory: {bool: false, transitions: 0}, i2c: []});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class NxtVirtualHub {
    constructor ({id = 'hub'} = {}) {
        this.id = id;
        this.profile = NXT_PROFILE;
        this.s = {
            timeMs: 0,
            outputs: NXT_OUTPUTS.map(freshPort),
            inputs: NXT_INPUTS.map(freshInput),
            toneEndMs: 0, keepAliveMs: 0,
            inboxes: Array.from({length: 10}, () => []),
            outboxes: Array.from({length: 10}, () => [])
        };
        this.specs = new Map();
        this.events = [];
        this.listeners = new Set();
        this.plugged = false;
    }

    plug (bindings) {
        const diagnostics = [];
        for (const b of bindings) {
            const spec = this.profile.ports.find(p => p.id === b.port);
            if (!spec) {
                diagnostics.push({severity: 'error', code: 'port-unknown',
                    message: `${this.profile.name.en} has no port '${b.port}' (ports ${this.profile.ports.map(p => p.id).join(', ')})`});
                continue;
            }
            if (b.class === 'motor') {
                const i = NXT_OUTPUTS.indexOf(b.port);
                if (i < 0 || b.device !== 'nxt-motor') {
                    diagnostics.push({severity: 'error', code: 'port-refuses-device',
                        message: `${this.profile.name.en} ${spec.label.en} takes an NXT motor, not ${b.device || 'this motor'}`});
                    continue;
                }
                this.s.outputs[i].device = b.device;
                this.specs.set(i, (b.dcMotor || dcMotorFor({device: b.device, ids: {}})).motor);
            } else {
                const i = NXT_INPUTS.indexOf(b.port);
                if (i < 0 || !NXT_DEVICES[b.device]) {
                    diagnostics.push({severity: 'error', code: 'port-refuses-device',
                        message: `${this.profile.name.en} ${spec.label.en} cannot read ${b.device || b.sensor}`});
                    continue;
                }
                this.s.inputs[i].device = b.device;
            }
        }
        this.s.timeMs = 0;
        this.plugged = true;
        return diagnostics;
    }

    // ---- the VirtualHub boundary ---------------------------------------------------------------

    advanceTo (tMs) {
        const dtMs = tMs - this.s.timeMs;
        this.s.timeMs = tMs;
        if (!(dtMs > 0)) return;
        this.s.outputs.forEach((port, i) => {
            if (port.device) this._drive(i, port, dtMs);
        });
    }

    _sync (i) {
        // MOTOR_SYNC pairs two ports: the turn ratio slows the second (our model of "turn ratio":
        // 0 equal, 50 the second stopped, 100 it turns back at the same speed).
        const synced = this.s.outputs.map((p, k) => (p.regulation === REGULATION.MOTOR_SYNC && (p.mode & MODE.MOTORON) ? k : -1)).filter(k => k >= 0);
        if (synced.length !== 2 || synced[1] !== i) return 1;
        const t = this.s.outputs[synced[0]].turnRatio;
        return clamp(1 - Math.abs(t) / 50, -1, 1);
    }

    _drive (i, port, dtMs) {
        const on = (port.mode & MODE.MOTORON) && port.runState !== RUN_STATE.IDLE;
        const off = () => drivePassive(port, port.mode & MODE.BRAKE ? 'brake' : 'coast');
        if (!on) { off(); return; }
        const regulated = (port.mode & MODE.REGULATED) && port.regulation !== REGULATION.IDLE;
        const spec = this.specs.get(i);
        const level = port.power * (regulated ? this._sync(i) : 1);
        const limit = port.tachoLimit;
        if (limit > 0) {
            const dir = Math.sign(level) || 1;
            const travelled = (port.angleDeg - port.moveStartDeg) * dir;
            const remaining = limit - travelled;
            if (!regulated) {
                if (remaining <= 0) { this._endMove(port); return; }
                driveOpen(port, level, port.mode & MODE.BRAKE ? 'brake' : 'coast');
                return;
            }
            // Regulated: a reference that decelerates onto the limit; the encoder decides the end.
            if (Math.abs(remaining) <= END_TOLERANCE_DEG && Math.abs(port.measuredDps) <= END_SPEED_DPS) {
                this._endMove(port);
                return;
            }
            if (travelled > port.lastProgressDeg + 0.5) { port.lastProgressDeg = travelled; port.stalledMs = 0; }
            else port.stalledMs += dtMs;
            if (port.stalledMs >= STALL_MS) { this._endMove(port); return; }
            const cruise = Math.abs(level) / 100 * FULL_SCALE_DPS;
            const refRemaining = limit - (port.regulating ? (port.refDeg - port.moveStartDeg) * dir : travelled);
            const target = dir * Math.min(cruise, Math.sqrt(2 * ACCEL_DPS2 * Math.max(0, refRemaining)));
            driveRegulated(port, target, spec, dtMs, ACCEL_DPS2);
            // The reference stops on the limit.
            if ((port.refDeg - port.moveStartDeg) * dir >= limit) {
                port.refDeg = port.moveStartDeg + dir * limit;
                port.refDps = 0;
            }
            return;
        }
        if (regulated) driveRegulated(port, level / 100 * FULL_SCALE_DPS, spec, dtMs, ACCEL_DPS2);
        else driveOpen(port, level, port.mode & MODE.BRAKE ? 'brake' : 'coast');
    }

    _endMove (port) {
        port.runState = RUN_STATE.IDLE;
        port.power = 0;
        drivePassive(port, port.mode & MODE.BRAKE ? 'brake' : 'coast');
        this._changed();
    }

    readDrives () {
        const out = [];
        this.s.outputs.forEach((p, i) => { if (p.device) out.push({port: NXT_OUTPUTS[i], mode: 'pwm', duty: p.duty, decay: p.decay}); });
        return out;
    }

    writeReadings (readings) {
        for (const r of readings) {
            if (r.kind === 'encoder') {
                const i = NXT_OUTPUTS.indexOf(r.port);
                if (i >= 0) readEncoder(this.s.outputs[i], r);
            } else if (r.kind === 'probe') {
                const i = NXT_INPUTS.indexOf(r.port);
                if (i >= 0) this.s.inputs[i].probe = {...r.raw, kind: r.device};
            }
        }
    }

    publish () { this._changed(); }

    onChange (fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _changed () { for (const fn of [...this.listeners]) fn(this); }

    exportState () { return JSON.parse(JSON.stringify(this.s)); }

    importState (state) {
        this.s = JSON.parse(JSON.stringify(state));
        this.s.outputs.forEach((port, i) => {
            if (port.device && !this.specs.has(i)) this.specs.set(i, dcMotorFor({device: port.device, ids: {}}).motor);
        });
    }

    stateKey (state) { return JSON.stringify(state); }

    dispose () {
        this.plugged = false;
        this.listeners.clear();
    }

    readPort (portId) {
        const o = NXT_OUTPUTS.indexOf(portId);
        if (o >= 0 && this.s.outputs[o].device) {
            const p = this.s.outputs[o];
            return {kind: 'motor', angleDeg: p.angleDeg, speedDps: p.measuredDps};
        }
        const i = NXT_INPUTS.indexOf(portId);
        if (i >= 0 && this.s.inputs[i].device) return {kind: this.s.inputs[i].device, ...this.getInputValues(i)};
        return null;
    }

    motorPortIds () { return NXT_OUTPUTS.filter((p, i) => this.s.outputs[i].device); }

    // ---- the BRICK: what the telegrams call (nxt-direct-commands.js) ------------------------------

    nowMs () { return this.s.timeMs; }

    setOutputState (i, {power, mode, regulation, turnRatio, runState, tachoLimit}) {
        const p = this.s.outputs[i];
        Object.assign(p, {power, mode, regulation, turnRatio, runState, tachoLimit});
        if (tachoLimit > 0) {
            p.moveStartDeg = p.angleDeg;
            p.tachoZero = p.angleDeg;
            p.lastProgressDeg = 0;
            p.stalledMs = 0;
            p.regulating = false;
        }
        this._changed();
    }

    getOutputState (i) {
        const p = this.s.outputs[i];
        const count = zero => Math.trunc(p.angleDeg - zero);
        return {power: p.power, mode: p.mode, regulation: p.regulation, turnRatio: p.turnRatio, runState: p.runState,
            tachoLimit: p.tachoLimit, tachoCount: count(p.tachoZero), blockTachoCount: count(p.blockZero), rotationCount: count(p.rotationZero)};
    }

    resetMotorPosition (i, relative) {
        const p = this.s.outputs[i];
        if (relative) p.blockZero = p.angleDeg;
        else p.rotationZero = p.angleDeg;
    }

    setInputMode (i, type, mode) {
        const input = this.s.inputs[i];
        input.type = type;
        input.mode = mode;
        input.valid = true;
        input.memory = {bool: false, transitions: 0};
        input.i2c = [];
    }

    getInputValues (i) {
        const input = this.s.inputs[i];
        const unconfigured = input.type === NXT_SENSOR_TYPE.none;
        const lowspeed = input.type === NXT_SENSOR_TYPE.lowspeed || input.type === NXT_SENSOR_TYPE.lowspeed9v;
        // A digital (I2C) sensor has no analog value; an empty input reads full scale.
        const {raw, normalized} = input.device && !lowspeed ? nxtAnalog(input.device, input.probe, input.type) : {raw: 1023, normalized: 1023};
        const scaled = unconfigured || lowspeed ? 0 : nxtScaled(input.mode, normalized, input.memory);
        return {valid: input.valid, calibrated: false, type: input.type, mode: input.mode, raw, normalized, scaled, calibratedValue: 0};
    }

    resetInputScaledValue (i) {
        this.s.inputs[i].memory.transitions = 0;
    }

    lsGetStatus (i) {
        const input = this.s.inputs[i];
        if (!input) return {status: STATUS.BAD_PORT};
        if (input.type !== NXT_SENSOR_TYPE.lowspeed && input.type !== NXT_SENSOR_TYPE.lowspeed9v) return {status: STATUS.BUS_ERROR};
        return {status: STATUS.SUCCESS, bytesReady: input.i2c.length};
    }

    /** An I2C write: [address, register, …]; the reply's rxLength bytes come from the register file. */
    lsWrite (i, tx, rxLength) {
        const input = this.s.inputs[i];
        if (!input) return STATUS.BAD_PORT;
        if (input.type !== NXT_SENSOR_TYPE.lowspeed && input.type !== NXT_SENSOR_TYPE.lowspeed9v) return STATUS.BUS_ERROR;
        // Nothing acknowledges an address no device on the port answers to.
        if (input.device !== 'nxt-ultrasonic' || tx[0] !== US_I2C_ADDRESS) {
            input.i2c = [];
            return STATUS.BUS_ERROR;
        }
        const register = tx[1] ?? 0;
        input.i2c = Array.from({length: rxLength}, (_, k) => usRegister(register + k, input.probe));
        return STATUS.SUCCESS;
    }

    lsRead (i) {
        const input = this.s.inputs[i];
        if (!input) return {status: STATUS.BAD_PORT};
        if (!input.i2c.length) return {status: STATUS.BUS_ERROR};
        const data = input.i2c;
        input.i2c = [];
        return {status: STATUS.SUCCESS, data};
    }

    event (kind, detail) {
        this.events.push({t: this.s.timeMs, kind, ...detail});
        if (this.events.length > EVENT_LOG) this.events.splice(0, this.events.length - EVENT_LOG);
    }

    playTone (frequency, duration) {
        this.s.toneEndMs = this.s.timeMs + duration;
        this.event('tone', {frequency, duration});
    }

    playSoundFile (loop, name) {
        this.event('sound', {name, loop});
    }

    stopSound () {
        this.s.toneEndMs = 0;
        this.event('sound-stop', {});
    }

    /** No .rxe programs run on this brick yet (L2: docs/ROBOT-LAB-EV3-NXT.md). */
    startProgram () { return STATUS.FILE_NOT_FOUND; }

    stopProgram () { return STATUS.NO_PROGRAM; }

    currentProgramName () { return null; }

    messageWrite (inbox, bytes) {
        const box = this.s.inboxes[inbox % 10];
        box.push(bytes);
        if (box.length > 5) box.shift();
    }

    messageRead (inbox, remove) {
        const box = this.s.outboxes[inbox % 10];
        if (!box || !box.length) return null;
        return remove ? box.shift() : box[0];
    }

    /** Six AA cells, full (estimated, devices/catalog.js HUB_SUPPLY_VOLTS.nxt). */
    batteryMillivolts () { return 9000; }

    /** KEEPALIVE: the current sleep time limit, ms (the NXT's default sleep setting, 10 minutes; estimated). */
    keepAlive () {
        this.s.keepAliveMs = this.s.timeMs;
        return 10 * 60 * 1000;
    }

    /** What GET FIRMWARE VERSION reports: [major, minor] — the protocol and firmware numbers of LEGO's last NXT firmware (1.31), which this protocol follows; no firmware of LEGO's runs here. */
    versions () { return {protocol: [1, 124], firmware: [1, 31]}; }

    deviceInfo () { return {name: 'Virtual NXT', address: [0, 0, 0, 0, 0, 0], signal: 0, freeFlash: 65536}; }
}

export const nxtHub = Object.freeze({
    profile: NXT_PROFILE,
    createVirtualHub: ({id} = {}) => new NxtVirtualHub({id})
});
