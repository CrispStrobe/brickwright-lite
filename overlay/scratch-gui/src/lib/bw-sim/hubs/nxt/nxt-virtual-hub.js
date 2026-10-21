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
// MOTOR_SYNC, as the firmware's output driver runs it (docs/NXT-PROTOCOL-FACTS.md §Sync; docs/ROBOT-LAB-EV3-NXT.md):
//   - two ports with MOTORON, REGULATED and regulation MOTOR_SYNC pair up, the lower letter first
//     (A+B, else A+C, else B+C); a port synchronised alone runs unregulated;
//   - the pair runs on power (PWM), not on the speed loop: every 100 ms the error — the first's block
//     tacho count minus the second's, plus a turn term that grows by 2·(turn ratio · power / 100)
//     counts per period (the turn ratio itself before either has moved), limited to ±500 — goes
//     through a PID (P 3, I 1 on the sum limited to ±900, D 1; the sum over 4) whose correction slows
//     the first and speeds the second; with a turn ratio each is capped at its own power;
//   - turning on synchronisation clears the error state; with a tacho limit and a turn ratio the move
//     ends for both when the motor the ratio's sign and the power's direction select reaches its
//     limit, without a turn ratio when either does.
//
// The firmware's other control loops are not modelled; the rest is OUR MODEL
// (docs/ROBOT-LAB-EV3-NXT.md "Motor control (both bricks): our model"):
//   - MOTORON off, or run state IDLE: the port is off — braked with the BRAKE bit, else floating;
//   - unregulated: duty = power / 100, the off phase braked (BRAKE) or floating;
//   - MOTOR_SPEED: a regulated speed, power % of the motor's no-load speed (FULL_SCALE_DPS), by
//     the Lab's speed loop (hubs/mindstorms-output.js); MOTOR_SYNC: above;
//   - a tacho limit: the move ends when the port has turned that far since the command; a
//     regulated move decelerates onto it (ACCEL_DPS2) and ends on the encoder within
//     END_TOLERANCE_DEG, an unregulated one at the count. Then the run state is IDLE and the motor
//     brakes (BRAKE) or floats — a regulated move with BRAKE holds the count it ended on (the speed
//     loop keeps the shaft there) until the next command.
//
// BUTTONS: the brick's four (0 exit, the dark grey one; 1 right; 2 left; 3 enter, the orange one),
// pressed and released from outside (pressButton: the Lab's UI and API). As the firmware's button
// module counts them: a release after more than 2 s is a long release, else a short one; ReadButton
// reports the button held and the releases (short + long, a byte), optionally clearing them.
//
// INPUTS: SETINPUTMODE's type and mode; GETINPUTVALUES's raw / normalized / scaled values from
// devices/nxt-sensors.js; the ultrasonic sensor as an I2C device (LSWRITE / LSGETSTATUS / LSREAD).
//
// PROGRAMS (docs/NXT-RXE-VM.md): a `.rxe` downloaded with the system commands (hubs/nxt/nxt-files.js)
// runs on STARTPROGRAM in the clean-room VM (routes/nxt-vm/nxt-vm.js), in 1 ms ticks on the Lab's clock
// inside advanceTo(); it reaches the ports through the same brick state the direct commands use
// (`_programIo`: its output updates go through setOutputState, its sensor reads through getInputValues).
// A program's end — normal, STOPPROGRAM, or an error — resets the devices as the brick does: every output
// off and floating with its counters cleared, every input unconfigured. A running program's state (the
// VM's snapshot, plain data) travels with exportState() to the physics worker's mirror.

import {NXT_PROFILE, NXT_OUTPUTS, NXT_INPUTS} from './profile.js';
import {dcMotorFor} from '../../devices/dc-motors.js';
import {freshOutput, readEncoder, driveOpen, drivePassive, driveRegulated, driveHold} from '../mindstorms-output.js';
import {MODE, REGULATION, RUN_STATE, STATUS} from './nxt-direct-commands.js';
import {NXT_SENSOR_TYPE, nxtAnalog, nxtScaled, usRead, usWrite, usFreshState, US_I2C_ADDRESS} from '../../devices/nxt-sensors.js';
import {NxtVm} from '../../routes/nxt-vm/nxt-vm.js';
import {UPDATE} from '../../routes/nxt-vm/nxt-bytecodes.js';
import * as files from './nxt-files.js';

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

/** The output driver's regulation period, ms (firmware: 100 one-millisecond ticks). */
export const SYNC_PERIOD_MS = 100;
/** The sync PID's gains (the firmware's defaults 96, 32, 32 over its divisor 32) and limits. */
export const SYNC_GAINS = Object.freeze({p: 3, i: 1, d: 1, divisor: 4, errorMax: 500, sumMax: 900});
/** A button held longer than this (ms) is a long press (firmware: 1000 counts of its 2 ms button tick). */
export const BUTTON_LONG_MS = 2000;
/** The brick's buttons, as ReadButton numbers them. */
export const NXT_BUTTON = Object.freeze({exit: 0, right: 1, left: 2, enter: 3});

const freshSync = () => ({turnSum: 0, errorSum: 0, lastError: 0, correction: 0, clockMs: 0});
const freshButton = () => ({down: false, downMs: 0, shortReleases: 0, longReleases: 0});

const NXT_DEVICES = Object.freeze({'nxt-touch': 'touch', 'nxt-light': 'light', 'nxt-sound': 'sound', 'nxt-ultrasonic': 'ultrasonic'});

const freshPort = () => ({
    ...freshOutput(), device: null,
    power: 0, mode: 0, regulation: 0, turnRatio: 0, runState: RUN_STATE.IDLE, tachoLimit: 0,
    tachoZero: 0, blockZero: 0, rotationZero: 0, moveStartDeg: 0, targetDeg: 0, stalledMs: 0, lastProgressDeg: 0,
    holdDeg: null, zeroHoldDeg: null
});

const freshInput = () => ({device: null, type: NXT_SENSOR_TYPE.none, mode: 0, probe: null, valid: false,
    memory: {bool: false, transitions: 0}, i2c: [], lsError: false, us: usFreshState()});

/** The firmware's message queues: 20 of 5 messages; 0–9 a program's inboxes, 10–19 what it sends its master. */
const MESSAGE_QUEUES = 20;
const MESSAGES_PER_QUEUE = 5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The speed (°/s) a direct command's speedDps takes as power 100 (an NXT motor's regulated top speed). */
const NXT_FULL_SCALE_DPS = 900;

export class NxtVirtualHub {
    constructor ({id = 'hub', vm: vmOptions = {}} = {}) {
        this.id = id;
        this.profile = NXT_PROFILE;
        this.s = {
            timeMs: 0,
            outputs: NXT_OUTPUTS.map(freshPort),
            inputs: NXT_INPUTS.map(freshInput),
            toneEndMs: 0, keepAliveMs: 0,
            queues: Array.from({length: MESSAGE_QUEUES}, () => []),
            sync: freshSync(),
            buttons: Array.from({length: 4}, freshButton),
            ...files.freshFiles(),
            program: null, lastProgram: null
        };
        /** The program VM (routes/nxt-vm), or null before the first STARTPROGRAM. Options: {vm: {instrPerMs, seed}}. */
        this.vm = null;
        this.vmOptions = vmOptions;
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
        // A running program first, up to the end of the step (its sensor reads hold the last step's readings).
        if (this.s.program && this.vm) {
            this.vm.advanceTo(tMs, this._programIo());
            if (this.vm.status !== 'running') this._programEnded(this.vm.s.ending);
        }
        this._syncLevels = this._syncStep(dtMs);
        this.s.outputs.forEach((port, i) => {
            if (port.device) this._drive(i, port, dtMs);
        });
    }

    // ---- MOTOR_SYNC (the firmware's output driver; see the header) -------------------------------

    _synced (k) {
        const p = this.s.outputs[k];
        return Boolean(p.device) && (p.mode & MODE.MOTORON) && (p.mode & MODE.REGULATED) && p.regulation === REGULATION.MOTOR_SYNC
            && p.runState !== RUN_STATE.IDLE;
    }

    /** The synchronised pair [first, second], or null: A+B, else A+C, else B+C. */
    syncPair () {
        if (this._synced(0)) {
            if (this._synced(1)) return [0, 1];
            if (this._synced(2)) return [0, 2];
            return null;
        }
        return this._synced(1) && this._synced(2) ? [1, 2] : null;
    }

    /** Turning synchronisation on clears the controller (firmware: on every mode update that enables it). */
    _syncEnabled (state) {
        if ((state.mode & MODE.MOTORON) && (state.mode & MODE.REGULATED) && state.regulation === REGULATION.MOTOR_SYNC) {
            this.s.sync = {...freshSync(), clockMs: this.s.sync ? this.s.sync.clockMs : 0};
        }
    }

    /** One regulation period of the pair: the new correction. */
    _syncRegulate ([a, b]) {
        const one = this.s.outputs[a];
        const two = this.s.outputs[b];
        const sync = this.s.sync;
        const g = SYNC_GAINS;
        const block = p => Math.trunc(p.angleDeg - p.blockZero);
        let turn = 0;
        if (one.turnRatio !== 0) {
            if (block(one) !== 0 || block(two) !== 0) {
                // The ratio scaled by the power; which port's pair of numbers depends on the ratio's sign and the direction.
                const [p, sign] = one.power >= 0 ? (one.turnRatio > 0 ? [two, 1] : [one, 1]) : (one.turnRatio > 0 ? [one, -1] : [two, -1]);
                turn = Math.trunc(p.turnRatio * sign * p.power / 100);
            } else turn = one.turnRatio;
        }
        sync.turnSum += turn * 2;
        const error = clamp(block(one) - block(two) + sync.turnSum, -g.errorMax, g.errorMax);
        const derivative = error - sync.lastError;
        sync.lastError = error;
        sync.errorSum = clamp(sync.errorSum + error, -g.sumMax, g.sumMax);
        sync.correction = Math.trunc((g.p * error + g.i * sync.errorSum + g.d * derivative) / g.divisor);
    }

    /** The step's synchronised levels (port → power), with the pair's tacho limit; null without a pair. */
    _syncStep (dtMs) {
        if (!this.s.sync) this.s.sync = freshSync();
        const pair = this.syncPair();
        if (!pair) { this.s.sync.clockMs = 0; return null; }
        const sync = this.s.sync;
        sync.clockMs += dtMs;
        while (sync.clockMs >= SYNC_PERIOD_MS) {
            sync.clockMs -= SYNC_PERIOD_MS;
            this._syncRegulate(pair);
        }
        const [one, two] = pair.map(k => this.s.outputs[k]);
        if (this._syncLimitReached(one, two)) {
            this._endMove(one);
            this._endMove(two);
            return null;
        }
        const level = (p, delta) => {
            const v = clamp(p.power, -100, 100);
            const out = clamp(v + delta, -100, 100);
            return one.turnRatio !== 0 ? clamp(out, -Math.abs(v), Math.abs(v)) : out;
        };
        return new Map([[pair[0], level(one, -sync.correction)], [pair[1], level(two, sync.correction)]]);
    }

    _syncLimitReached (one, two) {
        const reached = p => {
            if (!(p.tachoLimit > 0)) return false;
            const dir = Math.sign(p.power) || 1;
            return (p.angleDeg - p.moveStartDeg) * dir >= p.tachoLimit;
        };
        if (one.turnRatio === 0) return reached(one) || reached(two);
        const forward = one.turnRatio > 0 ? two.power >= 0 : one.power >= 0;
        return reached(one.turnRatio > 0 === forward ? two : one);
    }

    _drive (i, port, dtMs) {
        const on = (port.mode & MODE.MOTORON) && port.runState !== RUN_STATE.IDLE;
        const off = () => drivePassive(port, port.mode & MODE.BRAKE ? 'brake' : 'coast');
        if (!on && port.holdDeg !== null) { driveHold(port, port.holdDeg, this.specs.get(i), dtMs); return; }
        if (!on) { off(); return; }
        if (this._syncLevels && this._syncLevels.has(i)) {
            driveOpen(port, this._syncLevels.get(i), port.mode & MODE.BRAKE ? 'brake' : 'coast');
            return;
        }
        // A port synchronised without a partner runs unregulated (firmware).
        const regulated = (port.mode & MODE.REGULATED) && port.regulation === REGULATION.MOTOR_SPEED;
        const spec = this.specs.get(i);
        const level = clamp(port.power, -100, 100);
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
        // Speed regulation to zero holds the shaft where the command found it (our model: the firmware's
        // speed loop at set speed 0, no ramp outside RAMPUP / RAMPDOWN) — how NXC's RotateMotor ends a move.
        if (regulated && level === 0) {
            if (port.zeroHoldDeg === null || port.zeroHoldDeg === undefined) port.zeroHoldDeg = port.angleDeg;
            driveHold(port, port.zeroHoldDeg, spec, dtMs);
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

    publish () {
        this._drainProgram();
        this._changed();
    }

    /** The program's display and error events into the brick's log (its tones and sounds are there already). */
    _drainProgram () {
        if (!this.vm) return;
        for (const {kind, t, ...rest} of this.vm.drainEvents()) {
            if (kind === 'tone' || kind === 'sound') continue;
            this.event(kind === 'display' ? 'display' : `program-${kind}`, {...rest, tick: t});
        }
    }

    onChange (fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _changed () { for (const fn of [...this.listeners]) fn(this); }

    exportState () {
        const out = JSON.parse(JSON.stringify(this.s));
        out.vm = this.vm ? this.vm.snapshot() : null;
        return out;
    }

    importState (state) {
        const {vm, ...rest} = state;
        this.s = JSON.parse(JSON.stringify(rest));
        if (!vm) this.vm = null;
        else {
            if (!this.vm) this.vm = new NxtVm(this.vmOptions);
            const image = this.s.program ? this.s.files[this.s.program.name] : null;
            this.vm.restore(vm, image);
        }
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

    /**
     * A motor command from the Robot Lab API (hubs/hub-profile.js directCommand): as a Bluetooth direct
     * command does it on the brick, through SETOUTPUTSTATE (regulated speed, braking when off), so the port
     * keeps one owner and a program running on the brick and the Lab take turns on it, the last one winning.
     * {power} | {speedDps} | {degrees, power|speedDps} (a tacho-limited move, `done` when it ends) |
     * {position, …} (degrees from where it is) | {stop: 'brake'|'coast'|'hold'}.
     */
    directCommand (port, c = {}) {
        const i = NXT_OUTPUTS.indexOf(port);
        if (i < 0 || !this.s.outputs[i].device) return {ok: false, code: 'no-motor', message: `no motor on output ${port}`};
        const finite = v => typeof v === 'number' && Number.isFinite(v);
        const on = MODE.MOTORON | MODE.BRAKE | MODE.REGULATED;
        const set = (power, tachoLimit = 0) => this.setOutputState(i, {power, mode: on, regulation: REGULATION.MOTOR_SPEED,
            turnRatio: 0, runState: RUN_STATE.RUNNING, tachoLimit});
        if (c.stop !== undefined) {
            if (!['brake', 'coast', 'hold'].includes(c.stop)) return {ok: false, code: 'bad-command', message: 'stop takes brake, coast, hold'};
            if (c.stop === 'coast') {
                this.setOutputState(i, {power: 0, mode: 0, regulation: REGULATION.IDLE, turnRatio: 0, runState: RUN_STATE.IDLE, tachoLimit: 0});
            } else set(0);
            return {ok: true};
        }
        let power = finite(c.power) ? c.power : finite(c.speedDps) ? c.speedDps / NXT_FULL_SCALE_DPS * 100 : null;
        const degrees = finite(c.degrees) ? c.degrees : finite(c.position) ? c.position - this.s.outputs[i].angleDeg : null;
        if (power === null && degrees !== null) power = 75;
        if (power === null) return {ok: false, code: 'bad-command', message: 'the NXT takes power, speedDps, degrees, position or stop'};
        power = Math.max(-100, Math.min(100, Math.round(power)));
        if (degrees === null) { set(power); return {ok: true}; }
        if (Math.round(Math.abs(degrees)) === 0) return {ok: true, done: Promise.resolve('done')};
        set(Math.sign(degrees) * Math.abs(power), Math.round(Math.abs(degrees)));
        return {ok: true, done: new Promise(resolve => {
            const off = this.onChange(() => { if (this.s.outputs[i].runState === RUN_STATE.IDLE) { off(); resolve('done'); } });
        })};
    }

    // ---- the BRICK: what the telegrams call (nxt-direct-commands.js) ------------------------------

    nowMs () { return this.s.timeMs; }

    setOutputState (i, {power, mode, regulation, turnRatio, runState, tachoLimit}) {
        const p = this.s.outputs[i];
        Object.assign(p, {power, mode, regulation, turnRatio, runState, tachoLimit});
        this._syncEnabled(p);
        p.holdDeg = null;
        p.zeroHoldDeg = null;
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
        this.events.push({...detail, t: this.s.timeMs, kind});
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

    // ---- programs (docs/NXT-RXE-VM.md) ----------------------------------------------------------------

    /**
     * STARTPROGRAM: a missing file is OUT_OF_RANGE (the firmware's answer; the BDK's list suggests
     * FILE_NOT_FOUND). A file that exists is accepted at once; a running program is stopped first. A file
     * the VM refuses (ERR_VER, ERR_FILE, …) never runs: like the brick, the command still succeeded — the
     * refusal is in `lastProgram` and the events.
     */
    startProgram (name) {
        const bytes = this.s.files[name];
        if (!bytes) return STATUS.OUT_OF_RANGE;
        if (this.s.program) {
            this.vm.abort();
            this._programEnded('abort');
        }
        if (!this.vm) this.vm = new NxtVm(this.vmOptions);
        this.s.queues = Array.from({length: MESSAGE_QUEUES}, () => []);
        const r = this.vm.start(bytes, {name, tick: Math.floor(this.s.timeMs)});
        if (!r.ok) {
            this.s.lastProgram = {name, how: 'error', error: this.vm.error};
            this.event('program-refused', {name, status: r.status, detail: r.detail});
        } else {
            this.s.program = {name};
            this.event('program-start', {name});
        }
        this._changed();
        return STATUS.SUCCESS;
    }

    stopProgram () {
        if (!this.s.program) return STATUS.NO_PROGRAM;
        this.vm.abort();
        this._programEnded('abort');
        return STATUS.SUCCESS;
    }

    currentProgramName () { return this.s.program ? this.s.program.name : null; }

    /** The program is over: the brick resets its devices (outputs off, floating, counters cleared; inputs unconfigured). */
    _programEnded (how) {
        const name = this.s.program ? this.s.program.name : null;
        this.s.lastProgram = {name, how, error: this.vm ? this.vm.error : null};
        this.s.program = null;
        this.s.queues = Array.from({length: MESSAGE_QUEUES}, () => []);
        this.s.outputs.forEach((p, i) => {
            this.setOutputState(i, {power: 0, mode: 0, regulation: 0, turnRatio: 0, runState: RUN_STATE.IDLE, tachoLimit: 0});
            p.tachoZero = p.blockZero = p.rotationZero = p.targetDeg = p.angleDeg;
        });
        this.s.inputs.forEach((x, i) => this.setInputMode(i, NXT_SENSOR_TYPE.none, 0));
        this._drainProgram();
        this.event('program-end', {name, how, error: this.vm ? this.vm.error : null});
        this._changed();
    }

    /** What the program VM reaches of the brick (routes/nxt-vm/nxt-vm.js NxtIo). */
    _programIo () {
        if (this._io) return this._io;
        this._io = {
            outputStatus: i => {
                const p = this.s.outputs[i];
                const o = this.getOutputState(i);
                return {runState: p.runState, tachoCount: o.tachoCount, blockTachoCount: o.blockTachoCount,
                    rotationCount: o.rotationCount, actualSpeed: clamp(Math.round((p.measuredDps || 0) / FULL_SCALE_DPS * 100), -100, 100)};
            },
            applyOutput: (i, o, flags) => this.applyProgramOutput(i, o, flags),
            inputValues: i => this.getInputValues(i),
            setInputMode: (i, type, mode) => this.setInputMode(i, type, mode),
            resetInputScaled: i => this.resetInputScaledValue(i),
            playTone: (frequency, ms) => this.playTone(frequency, ms),
            playFile: (name, loop) => this.playSoundFile(loop, name),
            stopSound: () => this.stopSound(),
            soundState: () => (this.s.toneEndMs > this.s.timeMs ? {state: 0x03, flags: 0x02} : {state: 0x00, flags: 0x00}),
            lsWrite: (i, bytes, rx) => this.lsWrite(i, bytes, rx),
            lsStatus: i => this.lsGetStatus(i),
            lsRead: i => this.lsRead(i),
            messageWrite: (q, bytes) => this.messageWrite(q, bytes),
            messageRead: (q, remove) => this.messageRead(q, remove),
            keepAlive: () => this.keepAlive(),
            readButton: (index, reset) => this.readButton(index, reset)
        };
        return this._io;
    }

    /**
     * The output module applying a program's updates (its FLAGS field; docs/NXT-RXE-VM.md §Outputs): the
     * counter resets, then mode / speed / tacho limit as one SETOUTPUTSTATE would set them — a new tacho
     * limit only with UPDATE_TACHO_LIMIT (it adds to the previous move's target).
     */
    applyProgramOutput (i, o, flags) {
        const p = this.s.outputs[i];
        if (flags & UPDATE.RESET_ROTATION_COUNT) p.rotationZero = p.angleDeg;
        if (flags & UPDATE.RESET_COUNT) {
            p.tachoZero = p.angleDeg;
            p.targetDeg = p.angleDeg;
        }
        if (flags & UPDATE.RESET_BLOCK_COUNT) p.blockZero = p.angleDeg;
        if (!(flags & (UPDATE.MODE | UPDATE.SPEED | UPDATE.TACHO_LIMIT))) return;
        const state = {power: o.power, mode: o.mode, regulation: o.regMode, turnRatio: o.turnRatio, runState: o.runState,
            tachoLimit: o.tachoLimit};
        if (flags & UPDATE.TACHO_LIMIT) this.setOutputState(i, state);
        else {
            Object.assign(p, {power: state.power, mode: state.mode, regulation: state.regulation, turnRatio: state.turnRatio,
                runState: state.runState});
            if (flags & UPDATE.MODE) this._syncEnabled(p);
            p.holdDeg = null;
            p.zeroHoldDeg = null;
            this._changed();
        }
    }

    // ---- flash files (system commands; hubs/nxt/nxt-files.js) -----------------------------------------

    fileOpenWrite (name, size) { return files.openWrite(this.s, name, size); }

    fileWrite (handle, bytes) { return files.write(this.s, handle, bytes); }

    fileClose (handle) { return files.close(this.s, handle); }

    fileDelete (name) { return files.remove(this.s, name, this.currentProgramName()); }

    fileOpenRead (name) { return files.openRead(this.s, name); }

    fileRead (handle, count) { return files.read(this.s, handle, count); }

    fileFindFirst (pattern) { return files.findFirst(this.s, pattern); }

    fileFindNext (handle) { return files.findNext(this.s, handle); }

    /** Puts a file straight into flash (a test's or a host's shortcut for a completed download). */
    putFile (name, bytes) {
        const r = files.openWrite(this.s, name, bytes.length);
        if (r.status !== files.LOADER.SUCCESS) return r.status;
        files.write(this.s, r.handle, Array.from(bytes));
        return files.close(this.s, r.handle).status;
    }

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

    // ---- buttons (see the header) ---------------------------------------------------------------------

    /** Presses (down) or releases a button at the brick's time; false for a button the brick has not. */
    pressButton (index, down) {
        if (!this.s.buttons) this.s.buttons = Array.from({length: 4}, freshButton);
        const b = this.s.buttons[index];
        if (!b) return false;
        if (down && !b.down) Object.assign(b, {down: true, downMs: this.s.timeMs});
        else if (!down && b.down) {
            b.down = false;
            if (this.s.timeMs - b.downMs > BUTTON_LONG_MS) b.longReleases = (b.longReleases + 1) & 0xff;
            else b.shortReleases = (b.shortReleases + 1) & 0xff;
        }
        this.event('button', {index, down: Boolean(down)});
        this._changed();
        return true;
    }

    /** ReadButton: {pressed, count} (count: short + long releases, a byte), clearing the counts with `reset`. */
    readButton (index, reset = false) {
        const b = this.s.buttons && this.s.buttons[index];
        if (!b) return null;
        const out = {pressed: b.down, count: (b.shortReleases + b.longReleases) & 0xff};
        if (reset) b.shortReleases = b.longReleases = 0;
        return out;
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

    deviceInfo () { return {name: 'Virtual NXT', address: [0, 0, 0, 0, 0, 0], signal: 0, freeFlash: files.freeFlash(this.s)}; }
}

export const nxtHub = Object.freeze({
    profile: NXT_PROFILE,
    createVirtualHub: ({id, vm} = {}) => new NxtVirtualHub({id, vm})
});
