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
// From LEGO's open-source firmware (its output driver; docs/NXT-PROTOCOL-FACTS.md "Outputs"):
//   - no direct command resets TachoCount: it counts from power-on (only the program-side
//     reset-count flag clears it), so it is NOT restarted by SETOUTPUTSTATE;
//   - a tacho limit is added to the previous move's target (in TachoCount units), in the direction
//     of the power's sign — consecutive moves do not accumulate their overshoot; while a port runs
//     without a limit the target follows the count, so the next limited move starts from there;
//   - the power is stored as sent and the drive limited to ±100.
//
// The firmware's control loops themselves are not modelled; the rest is OUR MODEL
// (docs/ROBOT-LAB-EV3-NXT.md "NXT motor model"):
//   - MOTORON off, or run state IDLE: the port is off — braked with the BRAKE bit, else floating;
//   - unregulated: duty = power / 100, the off phase braked (BRAKE) or floating;
//   - MOTOR_SPEED: a regulated speed, power % of the motor's no-load speed (FULL_SCALE_DPS), by
//     the Lab's speed loop (hubs/mindstorms-output.js); MOTOR_SYNC: the same, the second of two
//     synchronised ports scaled by the turn ratio;
//   - a tacho limit: the move ends when the port has turned that far since the command; a
//     regulated move decelerates onto it (ACCEL_DPS2) and ends on the encoder within
//     END_TOLERANCE_DEG, an unregulated one at the count. Then the run state is IDLE and the motor
//     brakes (BRAKE) or floats — a regulated move with BRAKE holds the count it ended on (the speed
//     loop keeps the shaft there) until the next command.
//
// INPUTS: SETINPUTMODE's type and mode; GETINPUTVALUES's raw / normalized / scaled values from
// devices/nxt-sensors.js; the ultrasonic sensor as an I2C device (LSWRITE / LSGETSTATUS / LSREAD).

import {NXT_PROFILE, NXT_OUTPUTS, NXT_INPUTS} from './profile.js';
import {dcMotorFor} from '../../devices/dc-motors.js';
import {freshOutput, readEncoder, driveOpen, drivePassive, driveRegulated, driveHold} from '../mindstorms-output.js';
import {MODE, REGULATION, RUN_STATE, STATUS} from './nxt-direct-commands.js';
import {NXT_SENSOR_TYPE, nxtAnalog, nxtScaled, usRead, usWrite, usFreshState, US_I2C_ADDRESS} from '../../devices/nxt-sensors.js';

/** Regulated speed at power 100, °/s: the NXT motor's no-load speed at 9 V (Philo: 170 rpm). */
export const FULL_SCALE_DPS = 1020;
/** A regulated move with a tacho limit approaches it at this deceleration (°/s², our model). */
export const ACCEL_DPS2 = 1500;
/** ...and ends when the shaft is this close to the limit (°) and slower than END_SPEED_DPS. */
export const END_TOLERANCE_DEG = 1;
export const END_SPEED_DPS = 30;
/** ...or, once the reference is on the limit, this close: the hold after the move finishes it (°). */
export const END_HOLD_DEG = 4;
/** A regulated move that cannot reach its limit (blocked) ends after this long without progress. */
export const STALL_MS = 1000;
const EVENT_LOG = 50;

const NXT_DEVICES = Object.freeze({'nxt-touch': 'touch', 'nxt-light': 'light', 'nxt-sound': 'sound', 'nxt-ultrasonic': 'ultrasonic'});

const freshPort = () => ({
    ...freshOutput(), device: null,
    power: 0, mode: 0, regulation: 0, turnRatio: 0, runState: RUN_STATE.IDLE, tachoLimit: 0,
    tachoZero: 0, blockZero: 0, rotationZero: 0, moveStartDeg: 0, targetDeg: 0, stalledMs: 0, lastProgressDeg: 0,
    holdDeg: null
});

const freshInput = () => ({device: null, type: NXT_SENSOR_TYPE.none, mode: 0, probe: null, valid: false,
    memory: {bool: false, transitions: 0}, i2c: [], lsError: false, us: usFreshState()});

/** The firmware's message queues: 20 of 5 messages; 0–9 a program's inboxes, 10–19 what it sends its master. */
const MESSAGE_QUEUES = 20;
const MESSAGES_PER_QUEUE = 5;

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
            queues: Array.from({length: MESSAGE_QUEUES}, () => [])
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
        if (!on && port.holdDeg !== null) { driveHold(port, port.holdDeg, this.specs.get(i), dtMs); return; }
        if (!on) { off(); return; }
        const regulated = (port.mode & MODE.REGULATED) && port.regulation !== REGULATION.IDLE;
        const spec = this.specs.get(i);
        const level = clamp(port.power, -100, 100) * (regulated ? this._sync(i) : 1);
        const limit = port.tachoLimit;
        // Running without a limit: the firmware's target follows the count.
        if (!(limit > 0) && port.power !== 0) port.targetDeg = port.angleDeg;
        if (limit > 0) {
            const dir = Math.sign(port.power) || 1;
            const travelled = (port.angleDeg - port.moveStartDeg) * dir;
            const remaining = limit - travelled;
            if (!regulated) {
                if (remaining <= 0) { this._endMove(port); return; }
                driveOpen(port, level, port.mode & MODE.BRAKE ? 'brake' : 'coast');
                return;
            }
            // Regulated: a reference that decelerates onto the limit; the encoder decides the end.
            // The reference is on the limit and the shaft (nearly) there and slow: the move is over, and
            // the hold that follows pulls the shaft onto the count.
            const arrived = port.regulating && Math.abs(port.refDeg - (port.moveStartDeg + dir * limit)) < 1e-6;
            if (Math.abs(remaining) <= (arrived ? END_HOLD_DEG : END_TOLERANCE_DEG) && Math.abs(port.measuredDps) <= END_SPEED_DPS) {
                this._endMove(port, port.moveStartDeg + dir * limit);
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

    /** The move is over: run state IDLE; braked, floating, or (a regulated move with BRAKE) holding `holdDeg`. */
    _endMove (port, holdDeg = null) {
        port.runState = RUN_STATE.IDLE;
        port.power = 0;
        port.holdDeg = holdDeg !== null && (port.mode & MODE.BRAKE) ? holdDeg : null;
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
        p.holdDeg = null;
        if (tachoLimit > 0) {
            // The new target is the previous one plus the limit, in the power's direction (firmware
            // output driver); TachoCount is not reset.
            const dir = Math.sign(power) || 1;
            p.moveStartDeg = p.targetDeg ?? p.angleDeg;
            p.targetDeg = p.moveStartDeg + dir * tachoLimit;
            p.lastProgressDeg = (p.angleDeg - p.moveStartDeg) * dir;
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
        input.lsError = false;
    }

    getInputValues (i) {
        const input = this.s.inputs[i];
        const unconfigured = input.type === NXT_SENSOR_TYPE.none;
        const lowspeed = input.type === NXT_SENSOR_TYPE.lowspeed || input.type === NXT_SENSOR_TYPE.lowspeed9v;
        // A digital (I2C) sensor has no analog value; an empty input reads full scale.
        const {raw, normalized} = input.device && !lowspeed ? nxtAnalog(input.device, input.probe, input.type) : {raw: 1023, normalized: 1023};
        const scaled = unconfigured || lowspeed ? 0 : nxtScaled(input.mode, normalized, input.memory);
        // "Calibrated?" is always FALSE and the calibrated field carries the normalized value (firmware;
        // the BDK calls the field "currently unused").
        return {valid: input.valid, calibrated: false, type: input.type, mode: input.mode, raw, normalized, scaled, calibratedValue: normalized};
    }

    resetInputScaledValue (i) {
        this.s.inputs[i].memory.transitions = 0;
    }

    // The low-speed (I2C) channel, as the firmware reports it: a port not set to LOWSPEED / LOWSPEED_9V is
    // CHANNEL_NOT_READY; LSWRITE only starts a transaction, so an address nobody answers shows up later,
    // as BUS_ERROR from LSGETSTATUS / LSREAD. The transaction itself completes at once here.

    _lowspeed (input) {
        return input.type === NXT_SENSOR_TYPE.lowspeed || input.type === NXT_SENSOR_TYPE.lowspeed9v;
    }

    lsGetStatus (i) {
        const input = this.s.inputs[i];
        if (!this._lowspeed(input)) return {status: STATUS.CHANNEL_NOT_READY, bytesReady: 0};
        if (input.lsError) return {status: STATUS.BUS_ERROR, bytesReady: 0};
        return {status: STATUS.SUCCESS, bytesReady: input.i2c.length};
    }

    /** An I2C transaction: [address, register, data…] written, then rxLength bytes read from the register file. */
    lsWrite (i, tx, rxLength) {
        const input = this.s.inputs[i];
        if (!this._lowspeed(input)) return STATUS.CHANNEL_NOT_READY;
        input.i2c = [];
        // Nothing acknowledges an address no device on the port answers to.
        input.lsError = input.device !== 'nxt-ultrasonic' || tx[0] !== US_I2C_ADDRESS;
        if (input.lsError) return STATUS.SUCCESS;
        if (!input.us) input.us = usFreshState();
        const register = tx[1] ?? 0;
        if (tx.length > 2) usWrite(input.us, register, tx.slice(2), input.probe);
        input.i2c = usRead(register, rxLength, input.probe, input.us);
        return STATUS.SUCCESS;
    }

    lsRead (i) {
        const input = this.s.inputs[i];
        if (!this._lowspeed(input)) return {status: STATUS.CHANNEL_NOT_READY, data: []};
        if (input.lsError) return {status: STATUS.BUS_ERROR, data: []};
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

    /**
     * No .rxe programs run on this brick yet (L2: docs/ROBOT-LAB-EV3-NXT.md): every program file is
     * missing, which the firmware answers with OUT_OF_RANGE (the BDK's list suggests FILE_NOT_FOUND).
     */
    startProgram () { return STATUS.OUT_OF_RANGE; }

    stopProgram () { return STATUS.NO_PROGRAM; }

    currentProgramName () { return null; }

    /**
     * The mailboxes, as the firmware keeps them: they exist only while a program runs (else NO_PROGRAM);
     * a full queue drops its oldest message.
     */
    messageWrite (queue, bytes) {
        if (!(queue < MESSAGE_QUEUES)) return STATUS.BAD_QUEUE;
        if (!this.currentProgramName()) return STATUS.NO_PROGRAM;
        const box = this.s.queues[queue];
        box.push(bytes);
        if (box.length > MESSAGES_PER_QUEUE) box.shift();
        return STATUS.SUCCESS;
    }

    messageRead (queue, remove) {
        if (!this.currentProgramName()) return {status: STATUS.NO_PROGRAM};
        if (!(queue < MESSAGE_QUEUES)) return {status: STATUS.BAD_QUEUE};
        const box = this.s.queues[queue];
        if (!box.length) return {status: STATUS.MAILBOX_EMPTY};
        return {status: STATUS.SUCCESS, message: remove ? box.shift() : box[0]};
    }

    /** Six AA cells, full (estimated, devices/catalog.js HUB_SUPPLY_VOLTS.nxt). */
    batteryMillivolts () { return 9000; }

    /** KEEPALIVE: the current sleep time limit, ms (the firmware's default sleep setting, 10 minutes). */
    keepAlive () {
        this.s.keepAliveMs = this.s.timeMs;
        return 10 * 60 * 1000;
    }

    /**
     * What GET FIRMWARE VERSION reports: [major, minor] — protocol 1.124 and firmware 1.29, the numbers of
     * LEGO's open-source firmware release this protocol was verified against; no firmware of LEGO's runs here.
     */
    versions () { return {protocol: [1, 124], firmware: [1, 29]}; }

    deviceInfo () { return {name: 'Virtual NXT', address: [0, 0, 0, 0, 0, 0], signal: 0, freeFlash: 65536}; }
}

export const nxtHub = Object.freeze({
    profile: NXT_PROFILE,
    createVirtualHub: ({id} = {}) => new NxtVirtualHub({id})
});
