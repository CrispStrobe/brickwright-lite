// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// `lab-direct`: the Robot Lab's own "hub" for motors that no hub program owns
// (docs/ROBOT-LAB-HUBS-PLAN.md P0; the Robot Lab API, api/robot-lab-api.js).
// A model with no hub part — a motor bench, a crane on a stand — still has
// motorised hinges, and blocks, `lab` words and `_robotlab` calls turn them
// directly. They do it through THIS VirtualHub (hubs/hub-profile.js), never
// by touching the physics: the command is plain port data that the bridge
// reads on the next 5 ms step, so it runs on the one clock, is exported to
// the physics worker's mirror with the rest of the hub state, and a command
// that arrives while a worker batch is in flight redoes that batch from the
// checkpoint (sim-session.js `_receive`) exactly as a SPIKE block's does.
//
// WHICH MOTORS ARE OURS (the binding rule of hub-bridge.js, unchanged): a scene
// with a hub binds every motor to a hub, so lab-direct is added only to a
// scene WITHOUT one (sim-session.js sceneHubDefs) and then owns every motor and
// sensor of the model. A motor on a SPIKE hub's port stays the hub's: the API
// commands it through that hub's own controller (SpikeVirtualHub.directCommand)
// and refuses it on a hub whose program runs on the hub (an emulated firmware),
// docs/SIM-LAB.md "Steering the Lab".
//
// THE CONTROLLER is the SPIKE hub's structure, because it is the one the Lab
// already validates against the physics (hubs/spike/spike-motor-controller.js,
// test/bw-sim-dc-motor.test.mjs): a trajectory generator makes a reference
// angle θr and speed ωr, and the same PI + damping loop (`controlStep`) turns
// the tracking error into a PWM duty for the motor's DC model. Per command:
//
//   power   open loop: duty = power / 100 (the H-bridge brakes in the off phase),
//           as an unregulated hub (RCX, Power Functions) drives a motor;
//   speed   θr advances at ωr, ramped at ACCEL_DPS2 to the asked speed;
//   degrees / position
//           a trapezoid to the target: ωr ramps up at ACCEL_DPS2, never faster
//           than the speed asked nor than √(2·a·remaining) (so it can stop in
//           time), and stops on the target. The command COMPLETES when θr is
//           on the target and the measured shaft is within POSITION_TOLERANCE_DEG
//           of it and slower than SPEED_TOLERANCE_DPS — the encoder decides, never
//           a wall clock — then the port does what `then` says (brake, the default;
//           coast; or hold the target);
//   stop    brake / coast: the H-bridge's passive states; hold: the loop keeps
//           the angle the shaft had.
//
// A blocked shaft (duty saturated, slower than STALL_DPS for STALL_MS) ends a
// degrees/position command as 'stalled' and brakes, so a program never waits
// forever on a motor that cannot turn.
//
// The physics needs nothing from here but drives; the port speed limit and the
// DC numbers come from each motor's own DeviceModel (devices/dc-motors.js) at
// its nominal voltage: this hub has no battery of its own.

import {controlStep, freshPortState, STALL_DPS, STALL_MS} from '../spike/spike-motor-controller.js';
import {dcMotorFor} from '../../devices/dc-motors.js';
import {deviceModels} from '../../devices/catalog.js';

const DEG = 180 / Math.PI;

/** Trajectory acceleration and deceleration, °/s² (the SPIKE backend's default, spike-sim/independent-backend.js). */
export const ACCEL_DPS2 = 1500;
/** A degrees/position command ends when the shaft is this close to the target (°)... */
export const POSITION_TOLERANCE_DEG = 1;
/** ...and slower than this (°/s). */
export const SPEED_TOLERANCE_DPS = 10;
/** The fastest reference asked of a motor: this share of its no-load speed, so the loop keeps headroom. */
export const SPEED_LIMIT_SHARE = 0.9;
/** A servo motor's loop: full drive this far (°) or further from its target, proportionally less nearer. */
export const SERVO_BAND_DEG = 20;
/** The id this hub has in a scene (it is no placed part). */
export const LAB_DIRECT_ID = 'lab-direct';

const STOP_ACTIONS = ['brake', 'coast', 'hold'];

/**
 * The profile. `ports` is one wildcard: lab-direct takes whatever port name the model gives a
 * motor ('A', '1', 'arm'…), so the bridge finds no PortSpec for it and drives the motor at its
 * own nominal voltage (hub-bridge.js: `supplyVolts` undefined); the 9 V below is never read.
 * @type {import('../hub-profile.js').HubProfile}
 */
export const LAB_DIRECT_PROFILE = Object.freeze({
    id: 'lab-direct',
    name: Object.freeze({en: 'Robot Lab direct control', de: 'Robot-Lab-Direktsteuerung'}),
    parts: Object.freeze([]),
    ports: Object.freeze([Object.freeze({
        id: '*',
        label: Object.freeze({en: 'Any motor or sensor of the model', de: 'Jeder Motor oder Sensor des Modells'}),
        kind: 'lab-direct',
        accepts: Object.freeze(['motor', 'sensor-lpf2', 'sensor-passive', 'sensor-active', 'sensor-digital']),
        supplyVolts: 9,
        identifies: 'none'
    })]),
    internalDevices: Object.freeze([]),
    clock: Object.freeze({controllerStepMs: 5}),
    drive: 'pwm',
    routes: Object.freeze(['robot-lab-api'])
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = v => typeof v === 'number' && Number.isFinite(v);

/** A port's state: plain data, everything advanceTo reads (exported to the worker's mirror). */
const freshMotor = () => ({
    kind: 'motor',
    mode: 'brake',            // 'power' | 'speed' | 'position' | 'hold' | 'brake' | 'coast' | 'servo'
    power: 0, speedDps: 0, targetDeg: 0, then: 'brake',
    refDeg: 0, refDps: 0, arrived: false,
    angleDeg: 0, measuredDps: 0,
    duty: 0, decay: 'brake',
    ctl: freshPortState(), stallMs: 0,
    seq: 0, result: null
});

export class LabDirectHub {
    /** @param {{id?: string}} [options] */
    constructor ({id = LAB_DIRECT_ID} = {}) {
        this.id = id;
        this.profile = LAB_DIRECT_PROFILE;
        this.timeMs = 0;
        /** port -> freshMotor() state */
        this.motors = new Map();
        /** port -> the motor's DC spec ({noLoadRadPerSec, stallTorqueNm, …}) */
        this.specs = new Map();
        /** port -> {rangeDeg}: a servo motor (device class 'servo-motor', the PF servo 88004) */
        this.servos = new Map();
        /** port -> {kind, …raw}: the last probe of each sensor */
        this.sensors = new Map();
        /** port -> {seq, resolve}: a degrees/position command someone waits on (main thread only) */
        this.waiters = new Map();
        this.plugged = false;
    }

    /** Takes every motor and sensor the bridge binds (all of the model's: this hub only runs hubless scenes). */
    plug (bindings) {
        for (const b of bindings) {
            if (b.class === 'motor') {
                if (this.motors.has(b.port)) {
                    return [{severity: 'error', code: 'port-twice', message: `two motors on port ${b.port}`}];
                }
                this.motors.set(b.port, freshMotor());
                this.specs.set(b.port, (b.dcMotor || dcMotorFor({device: b.device ?? null, ids: b.ids || {}})).motor);
                const model = typeof b.device === 'string' ? deviceModels.get(b.device) : null;
                if (model && model.class === 'servo-motor') this.servos.set(b.port, {rangeDeg: (model.servo && model.servo.rangeDeg) || 90});
            } else if (b.class === 'sensor') {
                this.sensors.set(b.port, {kind: b.sensor || 'sensor'});
            }
        }
        this.timeMs = 0;
        this.plugged = true;
        return [];
    }

    /** The fastest reference speed a port's motor is asked for, °/s. */
    speedLimit (port) {
        const spec = this.specs.get(port);
        return spec ? SPEED_LIMIT_SHARE * spec.noLoadRadPerSec * DEG : 0;
    }

    /**
     * A direct command (the Robot Lab API): {power} | {speedDps} | {degrees, speedDps} |
     * {position, speedDps} (absolute, degrees) | {stop: 'brake'|'coast'|'hold'}; degrees and
     * position take `then` (the stop action on arrival, default 'brake').
     * @returns {{ok: true, done?: Promise<'completed'|'interrupted'|'stalled'>} | {ok: false, code: string, message: string}}
     */
    directCommand (port, command = {}) {
        if (!this.motors.has(port)) return {ok: false, code: 'no-motor', message: `there is no motor on port ${port}`};
        const servo = this.servos.get(port);
        return servo ? this._servoCommand(port, servo, command) : this._motorCommand(port, command);
    }

    /** A motor's command (directCommand), as the controller runs it. */
    _motorCommand (port, command = {}) {
        const st = this.motors.get(port);
        const c = command;
        const limit = this.speedLimit(port);
        const start = mode => {
            this._interrupt(port);
            st.seq += 1;
            st.result = null;
            st.mode = mode;
            st.arrived = false;
            st.stallMs = 0;
            st.ctl = freshPortState();
            // A command starts from the shaft as it is: the reference picks it up where it stands.
            st.refDeg = st.angleDeg;
            st.refDps = mode === 'hold' ? 0 : st.measuredDps;
        };
        if (c.stop !== undefined) {
            if (!STOP_ACTIONS.includes(c.stop)) return {ok: false, code: 'bad-command', message: `stop takes ${STOP_ACTIONS.join(', ')}`};
            start(c.stop);
            if (c.stop === 'hold') st.targetDeg = st.angleDeg;
            return {ok: true};
        }
        if (c.power !== undefined) {
            if (!finite(c.power)) return {ok: false, code: 'bad-command', message: 'power is a number from -100 to 100'};
            start('power');
            st.power = clamp(c.power, -100, 100);
            return {ok: true};
        }
        const speed = c.speedDps === undefined ? null : c.speedDps;
        if (speed !== null && !finite(speed)) return {ok: false, code: 'bad-command', message: 'speed is a number of degrees per second'};
        if (c.degrees !== undefined || c.position !== undefined) {
            const amount = c.degrees !== undefined ? c.degrees : c.position;
            if (!finite(amount)) return {ok: false, code: 'bad-command', message: 'degrees is a number'};
            const then = c.then === undefined ? 'brake' : c.then;
            if (!STOP_ACTIONS.includes(then)) return {ok: false, code: 'bad-command', message: `then takes ${STOP_ACTIONS.join(', ')}`};
            const cruise = Math.min(limit, Math.abs(speed === null ? limit / 2 : speed));
            if (cruise === 0 && amount !== (c.degrees !== undefined ? 0 : st.angleDeg)) {
                return {ok: false, code: 'bad-command', message: 'a move needs a speed other than 0'};
            }
            start('position');
            // SPIKE's sign rule for run-for-degrees: a negative speed turns the other way.
            st.targetDeg = c.degrees !== undefined ? st.angleDeg + c.degrees * Math.sign(speed === null ? 1 : speed || 1) : c.position;
            st.speedDps = cruise;
            st.then = then;
            const seq = st.seq;
            const done = new Promise(resolve => this.waiters.set(port, {seq, resolve}));
            return {ok: true, done};
        }
        if (speed !== null) {
            start('speed');
            st.speedDps = clamp(speed, -limit, limit);
            return {ok: true};
        }
        return {ok: false, code: 'bad-command', message: 'a motor command is {power}, {speedDps}, {degrees, speedDps}, {position, speedDps} or {stop}'};
    }

    /**
     * A servo motor (the PF servo 88004) is not driven at a speed: what a PF receiver or battery box
     * sends it as a speed step, it takes as an ANGLE — full speed one way is its end, 90° that way;
     * no signal brings it back to the centre (LEGO's product page). So {power} and {speedDps} turn it
     * to that share of its range and hold it there, {stop: 'brake'|'coast'} centres it, {stop: 'hold'}
     * keeps it where it is, and {degrees} / {position} move it as on any motor, within its range.
     * The servo's own loop (mode 'servo', advanceTo) is proportional, as a hobby servo's is: full drive
     * SERVO_BAND_DEG or more from the target, less as it closes in.
     */
    _servoCommand (port, servo, c) {
        const st = this.motors.get(port);
        const limit = this.speedLimit(port);
        const range = servo.rangeDeg;
        const to = targetDeg => {
            this._interrupt(port);
            st.seq += 1;
            st.result = null;
            st.mode = 'servo';
            st.targetDeg = clamp(targetDeg, -range, range);
            st.ctl = freshPortState();
            return {ok: true};
        };
        if (c.stop !== undefined) {
            if (!STOP_ACTIONS.includes(c.stop)) return {ok: false, code: 'bad-command', message: `stop takes ${STOP_ACTIONS.join(', ')}`};
            return to(c.stop === 'hold' ? st.angleDeg : 0);
        }
        if (c.power !== undefined) {
            if (!finite(c.power)) return {ok: false, code: 'bad-command', message: 'power is a number from -100 to 100'};
            return to(range * clamp(c.power, -100, 100) / 100);
        }
        const speed = c.speedDps === undefined ? null : c.speedDps;
        if (speed !== null && !finite(speed)) return {ok: false, code: 'bad-command', message: 'speed is a number of degrees per second'};
        if (c.degrees !== undefined || c.position !== undefined) {
            const amount = c.degrees !== undefined ? c.degrees : c.position;
            if (!finite(amount)) return {ok: false, code: 'bad-command', message: 'degrees is a number'};
            return to(c.degrees !== undefined ? st.angleDeg + amount * (Math.sign(speed === null ? 1 : speed) || 1) : amount);
        }
        if (speed !== null) return to(limit > 0 ? range * clamp(speed / limit, -1, 1) : 0);
        return {ok: false, code: 'bad-command', message: 'a motor command is {power}, {speedDps}, {degrees, speedDps}, {position, speedDps} or {stop}'};
    }

    _interrupt (port) {
        this._finish(port, 'interrupted');
    }

    /** Resolves the waiter of the port's current command, once. */
    _finish (port, result) {
        const st = this.motors.get(port);
        const w = this.waiters.get(port);
        if (st && result !== 'interrupted') st.result = result;
        if (!w || (st && w.seq !== st.seq && result !== 'interrupted')) return;
        this.waiters.delete(port);
        w.resolve(result);
    }

    /** One controller step per port, deciding the drive for the step that ends at tMs. */
    advanceTo (tMs) {
        const dtMs = tMs - this.timeMs;
        this.timeMs = tMs;
        if (!(dtMs > 0)) return;
        const dt = dtMs / 1000;
        for (const [port, st] of this.motors) {
            const spec = this.specs.get(port);
            // A finished degrees/position command: the encoder is on the target, slow enough.
            if (st.mode === 'position' && st.arrived && Math.abs(st.angleDeg - st.targetDeg) <= POSITION_TOLERANCE_DEG &&
                Math.abs(st.measuredDps) <= SPEED_TOLERANCE_DPS) {
                const target = st.targetDeg;
                st.mode = st.then;
                st.ctl = freshPortState();
                st.refDeg = target;
                st.refDps = 0;
                this._finish(port, 'completed');
            }
            if (st.mode === 'servo') {
                st.duty = clamp((st.targetDeg - st.angleDeg) / SERVO_BAND_DEG, -1, 1);
                st.decay = 'brake';
                continue;
            }
            if (st.mode === 'power') {
                st.duty = st.power / 100;
                st.decay = 'brake';
                continue;
            }
            if (st.mode === 'brake' || st.mode === 'coast') {
                st.duty = 0;
                st.decay = st.mode;
                st.refDeg = st.angleDeg;
                continue;
            }
            const step = ACCEL_DPS2 * dt;
            if (st.mode === 'speed') {
                st.refDps += clamp(st.speedDps - st.refDps, -step, step);
                st.refDeg += st.refDps * dt;
            } else if (st.mode === 'position') {
                const rem = st.targetDeg - st.refDeg;
                if (!st.arrived) {
                    const dir = Math.sign(rem);
                    const desired = dir * Math.min(st.speedDps, Math.sqrt(2 * ACCEL_DPS2 * Math.abs(rem)));
                    st.refDps += clamp(desired - st.refDps, -step, step);
                    const move = st.refDps * dt;
                    if (rem === 0 || (Math.sign(move) === dir && Math.abs(move) >= Math.abs(rem))) {
                        st.refDeg = st.targetDeg;
                        st.refDps = 0;
                        st.arrived = true;
                    } else st.refDeg += move;
                }
            } else {
                // hold: the reference stays where the stop (or the arrival) left it.
                st.refDps = 0;
                if (st.mode === 'hold' && st.targetDeg !== undefined && st.refDeg !== st.targetDeg) st.refDeg = st.targetDeg;
            }
            const out = controlStep(st.ctl, {refDeg: st.refDeg, refDps: st.refDps, posDeg: st.angleDeg, speedDps: st.measuredDps}, spec, dtMs);
            st.refDeg = out.refDeg;
            st.duty = out.duty;
            st.decay = 'brake';
            if (st.mode === 'position') {
                if (out.saturated && Math.abs(st.measuredDps) < STALL_DPS) st.stallMs += dtMs;
                else st.stallMs = 0;
                if (st.stallMs >= STALL_MS) {
                    st.mode = 'brake';
                    st.duty = 0;
                    st.refDeg = st.angleDeg;
                    this._finish(port, 'stalled');
                }
            }
        }
    }

    readDrives () {
        const out = [];
        for (const [port, st] of this.motors) out.push({port, mode: 'pwm', duty: st.duty, decay: st.decay});
        return out;
    }

    writeReadings (readings) {
        for (const r of readings) {
            if (r.kind === 'encoder') {
                const st = this.motors.get(r.port);
                if (!st) continue;
                st.angleDeg += r.deltaRad * DEG;
                st.measuredDps = r.radPerSec * DEG;
            } else if (r.kind === 'probe') {
                this.sensors.set(r.port, {kind: r.device, ...r.raw});
            }
        }
    }

    /** What a port reports now: a motor's angle and speed, or a sensor's last probe; null for an unknown port. */
    readPort (port) {
        const st = this.motors.get(port);
        if (st) return {kind: 'motor', angleDeg: st.angleDeg, speedDps: st.measuredDps, mode: st.mode};
        const s = this.sensors.get(port);
        return s ? {...s} : null;
    }

    /** The ports with a motor, in the model's order. */
    motorPortIds () { return [...this.motors.keys()]; }

    publish () {}

    exportState () {
        return {timeMs: this.timeMs, motors: [...this.motors].map(([port, st]) => [port, {...st, ctl: {...st.ctl}}]),
            sensors: [...this.sensors].map(([port, s]) => [port, {...s}])};
    }

    importState (state) {
        this.timeMs = state.timeMs;
        for (const [port, st] of state.motors) this.motors.set(port, {...st, ctl: {...st.ctl}});
        for (const [port, s] of state.sensors || []) this.sensors.set(port, {...s});
    }

    stateKey (state) {
        return JSON.stringify(state);
    }

    /** A waiting program is told its command will not finish (the scene is going away). */
    dispose () {
        for (const port of [...this.waiters.keys()]) this._interrupt(port);
        this.plugged = false;
    }
}

/** The hub registry's entry (registry/hubs.js). The mirror in the worker is made with {id} only. */
export const labDirectHub = Object.freeze({
    profile: LAB_DIRECT_PROFILE,
    createVirtualHub: options => new LabDirectHub({id: options && options.id})
});
