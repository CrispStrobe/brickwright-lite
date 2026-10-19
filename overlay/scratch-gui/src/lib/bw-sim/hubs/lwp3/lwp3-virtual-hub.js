// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// An LWP3 hub (BOOST Move Hub, Powered Up City Hub, Technic Hub, SPIKE Essential) behind the
// Robot Lab's port boundary (hubs/hub-profile.js; docs/ROBOT-LAB-HUBS-PLAN.md P3). Two faces:
//
//   the VirtualHub   plug / advanceTo / readDrives / writeReadings / publish / export- and
//                    importState, as every hub family: per 5 ms step the port controllers
//                    (lwp3-controller.js) decide a PWM duty from the encoders;
//   the protocol     receive(bytes) takes what the host writes to the LEGO Hub Characteristic
//                    (0x1624) and answers through the sink the GATT peripheral installs
//                    (virtual-hub/lwp3-peripheral.js): the LEGO extensions talk to THIS, over
//                    Web Bluetooth or the Scratch Link BLE double, byte for byte as to a hub.
//
// Message coverage (LEGO Wireless Protocol 3.0.00 section numbers):
//   §3.5  Hub Properties    Request Update / Enable Updates of Advertising Name, Button, FW and
//                           HW Version, RSSI, Battery Voltage, Battery Type, Manufacturer Name,
//                           LWP Version, System Type ID, Primary MAC → Update (0x06)
//   §3.6  Hub Actions       Switch Off / Disconnect → "Hub Will Switch Off / Disconnect"; the
//                           motors float
//   §3.7  Hub Alerts        Enable/Disable/Request: no alert is ever raised (Request → status 0x00)
//   §3.8  Hub Attached I/O  every port with a device and every internal device, when the host
//                           enables notifications
//   §3.9  Generic Error     Command NOT recognized (0x05) for a message type this hub does not
//                           implement; Invalid use (0x06) for a command a port cannot take
//   §3.17 / §3.23           Port Input Format Setup (Single) → Port Input Format (Single) and the
//                           port's current value; then Port Value (Single) (§3.21) whenever the
//                           value moved by Delta Interval or more (published once per batch)
//   §3.26 / §3.27 / §3.32   Port Output Command: StartPower (as WriteDirectModeData mode 0),
//                           SetAccTime, SetDecTime, StartSpeed, StartSpeedForTime,
//                           StartSpeedForDegrees, GotoAbsolutePosition, PresetEncoder (mode 2,
//                           and 0x14 on one port), WriteDirectModeData to the hub LED; feedback per
//                           the §4 buffering state machine when the command asks for it
// Not implemented: Port Information (§3.15/3.19), Port Mode Information (§3.16/3.20), combined
// modes (§3.18/3.22/3.24), virtual ports and synchronised commands (§3.25, 0x02/0x08/0x0A/0x0C/
// 0x0E), H/W network and firmware update messages (§3.10–3.14).
//
// Everything that decides a drive is plain data in exportState (the worker's mirror steps the
// same controller); the protocol's own bookkeeping (port formats, values last sent, the sink)
// lives only on the main thread's hub, where the extension talks.

import {dcMotorFor} from '../../devices/dc-motors.js';
import {imuFromPose} from '../../sensors.js';
import {
    MSG, PROP, PROP_OP, ACTION, ALERT_OP, IO_TYPE, ERROR_CODE, SUB, FEEDBACK, STARTUP, COMPLETION, MODE_FORMATS, MOTOR_TYPES,
    TACHO_TYPES, parse, propertyUpdate, attachedIo, errorMessage, portInputFormat, portValue, outputFeedback, message,
    versionNumber, int8, readI16, readI32, readU32
} from './lwp3-protocol.js';
import {freshMotorState, startCommand, stepMotor, reportedDeg, reportedSpeedPct, fullSpeedDps} from './lwp3-controller.js';
import {LWP3_HUB_TYPES} from './profiles.js';

const DEG = 180 / Math.PI;

/** The IO type a hub reports for a port's device when the part names none (an external Boost motor). */
const DEFAULT_MOTOR_TYPE = IO_TYPE.EXTERNAL_MOTOR_TACHO;

/** Firmware version this hub reports (§3.5.6); a made-up but well-formed number, flagged as virtual by its build. */
export const VIRTUAL_FW = Object.freeze(versionNumber(1, 0, 0, 9999));
/** LWP version (§3.5.7, BCD): 3.00. */
export const LWP_VERSION = Object.freeze([0x00, 0x03]);
/** Battery level reported (%): the Lab's battery does not drain. */
export const BATTERY_PERCENT = 100;

/** Colour index (vision sensor mode 0) for a sensors.js colour reading: −1 (nothing) → 255 "none". */
const colourIndex = reading => (reading && Number.isInteger(reading.color) && reading.color >= 0 ? reading.color : 255);

export class Lwp3VirtualHub {
    /**
     * @param {{id?: string, profile?: string}} [options] profile: an LWP3 hub type id (profiles.js)
     */
    constructor ({id = 'hub', profile = 'technic-hub'} = {}) {
        const type = LWP3_HUB_TYPES.get(profile);
        if (!type) throw new Error(`no LWP3 hub type '${profile}'`);
        this.id = id;
        this.type = type;
        this.profile = type.profile;
        /** The VirtualHub that the protocol peripheral looks for (virtual-hub/lwp3-peripheral.js). */
        this.protocol = 'lwp3';
        this.timeMs = 0;
        /** profile port id → motor state (lwp3-controller.js) */
        this.motors = new Map();
        /** profile port id → the motor's DC spec */
        this.specs = new Map();
        /** profile port id → {ioType, sensor} of a sensor */
        this.sensorPorts = new Map();
        /** profile port id → its last probe */
        this.sensors = new Map();
        /** the hub's tilt, degrees, from its body's pose */
        this.tilt = {rollDeg: 0, pitchDeg: 0, yawDeg: 0};
        /** profile port id → IO type of its device */
        this.ioTypes = new Map();
        /** LED colour the host set ({r, g, b} or a colour number), for the UI */
        this.led = null;
        this.plugged = false;
        // ---- protocol, main thread only ----
        this._sink = null;
        /** LWP3 port id → {mode, delta, notify, last} */
        this._formats = new Map();
        /** messages waiting for publish(): feedback of commands that completed during steps */
        this._events = [];
        /** port → {seq, resolve}: a Robot Lab API degrees/position command someone waits on */
        this.waiters = new Map();
        this._seq = new Map();
        this.log = [];
    }

    // ---- ports ------------------------------------------------------------------------------

    /** LWP3 port id of a profile port ('A' → 0x00), or of an internal device. */
    portIdOf (port) {
        return this.type.portIds[port];
    }

    /** The profile port of an LWP3 port id, or null. */
    portOfId (portId) {
        const entry = Object.entries(this.type.portIds).find(([, id]) => id === portId);
        return entry ? entry[0] : null;
    }

    plug (bindings) {
        const diagnostics = [];
        const ids = this.profile.ports.map(p => p.id);
        for (const b of bindings) {
            if (!ids.includes(b.port)) {
                diagnostics.push({severity: 'error', code: 'port-unknown',
                    message: `${this.profile.name.en} has no port '${b.port}' (ports ${ids.join(', ')})`});
                continue;
            }
            if (b.class === 'motor') {
                if (this.motors.has(b.port)) {
                    diagnostics.push({severity: 'error', code: 'port-twice', message: `two motors on port ${b.port}`});
                    continue;
                }
                const ioType = Number.isInteger(b.ids?.lpf2) ? b.ids.lpf2 : DEFAULT_MOTOR_TYPE;
                this.ioTypes.set(b.port, ioType);
                this.motors.set(b.port, freshMotorState({tacho: TACHO_TYPES.has(ioType)}));
                this.specs.set(b.port, (b.dcMotor || dcMotorFor({device: b.device ?? null, ids: b.ids || {}})).motor);
            } else if (b.class === 'sensor') {
                const ioType = Number.isInteger(b.ids?.lpf2) ? b.ids.lpf2 : IO_TYPE.VISION_SENSOR;
                this.ioTypes.set(b.port, ioType);
                this.sensorPorts.set(b.port, {ioType, sensor: b.sensor});
            }
        }
        this.timeMs = 0;
        this.plugged = true;
        return diagnostics;
    }

    // ---- the VirtualHub step ---------------------------------------------------------------

    advanceTo (tMs) {
        const dt = tMs - this.timeMs;
        this.timeMs = tMs;
        if (!(dt > 0)) return;
        for (const [port, st] of this.motors) {
            const result = stepMotor(st, this.specs.get(port), dt);
            if (result === 'completed') this._completed(port, st);
        }
    }

    /** A command completed during a step: its feedback (§4: Busy/Empty + Done → Idle + completed), a buffered one starts. */
    _completed (port, st) {
        const portId = this.portIdOf(port);
        const next = st.buffered;
        st.buffered = null;
        if (next) {
            const r = startCommand(st, next.command);
            if (next.feedback) this._events.push(outputFeedback(portId, FEEDBACK.COMPLETED | (r.completes ? FEEDBACK.IN_PROGRESS : FEEDBACK.IDLE)));
            else if (st.feedback) this._events.push(outputFeedback(portId, FEEDBACK.IDLE | FEEDBACK.COMPLETED));
            st.feedback = next.feedback;
        } else if (st.feedback) {
            this._events.push(outputFeedback(portId, FEEDBACK.IDLE | FEEDBACK.COMPLETED));
        }
        this._resolve(port, 'completed');
    }

    readDrives () {
        const out = [];
        for (const [port, st] of this.motors) out.push({port, mode: 'pwm', duty: st.duty, decay: st.decay});
        return out;
    }

    writeReadings (readings, pose = null) {
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
        if (pose && pose.quat) {
            const {pitch, roll} = imuFromPose(pose.quat, pose.angVel || [0, 0, 0], pose.linAcc || [0, 0, 0], pose.gravity || [0, -9.81, 0]);
            this.tilt = {rollDeg: roll, pitchDeg: pitch, yawDeg: pose.headingDeg};
        }
    }

    /** One batch's notifications: completed commands' feedback, then every subscribed value that moved. */
    publish () {
        const events = this._events;
        this._events = [];
        if (!this._sink) return;
        for (const e of events) this._send(e);
        for (const [portId, f] of this._formats) {
            if (!f.notify) continue;
            const value = this._value(portId, f.mode);
            if (!value) continue;
            if (f.last && !moved(f.last.numbers, value.numbers, f.delta)) continue;
            f.last = value;
            this._send(portValue(portId, value.bytes));
        }
    }

    exportState () {
        return {timeMs: this.timeMs,
            motors: [...this.motors].map(([port, st]) => [port, {...st, ctl: {...st.ctl}, buffered: st.buffered && structuredClone(st.buffered)}])};
    }

    importState (state) {
        this.timeMs = state.timeMs;
        for (const [port, st] of state.motors) this.motors.set(port, {...st, ctl: {...st.ctl}, buffered: st.buffered && structuredClone(st.buffered)});
    }

    stateKey (state) {
        return JSON.stringify(state);
    }

    dispose () {
        for (const port of [...this.waiters.keys()]) this._resolve(port, 'interrupted');
        this.plugged = false;
    }

    // ---- the Robot Lab API ------------------------------------------------------------------

    /**
     * A direct command from the Robot Lab API (api/robot-lab-api.js), through the hub's own
     * controller as a protocol command would be: {power} | {speedDps} | {degrees, speedDps} |
     * {position, speedDps} | {stop}.
     */
    directCommand (port, command = {}) {
        const st = this.motors.get(port);
        if (!st) return {ok: false, code: 'no-motor', message: `there is no motor on port ${port}`};
        const c = command;
        const finite = v => typeof v === 'number' && Number.isFinite(v);
        const pct = dps => Math.max(-100, Math.min(100, Math.round(100 * dps / fullSpeedDps(this.specs.get(port)))));
        let cmd;
        if (c.stop !== undefined) {
            if (!['brake', 'coast', 'hold'].includes(c.stop)) return {ok: false, code: 'bad-command', message: 'stop takes brake, coast, hold'};
            cmd = c.stop === 'hold' ? {kind: 'speed', speedPct: 0} : {kind: 'power', power: c.stop === 'coast' ? 0 : 127};
        } else if (c.power !== undefined) {
            if (!finite(c.power)) return {ok: false, code: 'bad-command', message: 'power is a number from -100 to 100'};
            cmd = {kind: 'power', power: Math.round(Math.max(-100, Math.min(100, c.power))) || 0};
            if (cmd.power === 0) cmd.power = 127;
        } else if (c.degrees !== undefined || c.position !== undefined) {
            const speed = c.speedDps === undefined ? fullSpeedDps(this.specs.get(port)) / 2 : c.speedDps;
            if (!finite(speed) || !finite(c.degrees ?? c.position)) return {ok: false, code: 'bad-command', message: 'degrees and speed are numbers'};
            const endState = {brake: 127, coast: 0, hold: 126}[c.then || 'brake'];
            cmd = c.degrees !== undefined ?
                {kind: 'degrees', degrees: Math.abs(c.degrees), speedPct: pct(speed) * Math.sign(c.degrees || 1), maxPower: 100, endState} :
                {kind: 'goto', absDeg: c.position, speedPct: Math.abs(pct(speed)), maxPower: 100, endState};
        } else if (c.speedDps !== undefined) {
            if (!finite(c.speedDps)) return {ok: false, code: 'bad-command', message: 'speed is a number of degrees per second'};
            cmd = {kind: 'speed', speedPct: pct(c.speedDps), maxPower: 100};
        } else {
            return {ok: false, code: 'bad-command', message: 'a motor command is {power}, {speedDps}, {degrees, speedDps}, {position, speedDps} or {stop}'};
        }
        this._resolve(port, 'interrupted');
        const r = startCommand(st, cmd);
        if (!r.ok) return {ok: false, code: 'refused', message: `the motor on port ${port} cannot take that command (${r.code})`};
        st.feedback = false;
        if (!r.completes) return {ok: true};
        const seq = (this._seq.get(port) || 0) + 1;
        this._seq.set(port, seq);
        return {ok: true, done: new Promise(resolve => this.waiters.set(port, {seq, resolve}))};
    }

    _resolve (port, result) {
        const w = this.waiters.get(port);
        if (!w) return;
        this.waiters.delete(port);
        w.resolve(result);
    }

    readPort (port) {
        const st = this.motors.get(port);
        if (st) return {kind: 'motor', angleDeg: reportedDeg(st), speedDps: st.measuredDps, mode: st.mode};
        const s = this.sensors.get(port);
        return s ? {...s} : null;
    }

    motorPortIds () { return [...this.motors.keys()]; }

    // ---- the protocol (main thread) ---------------------------------------------------------

    /** The GATT peripheral's notification path; null on disconnect. */
    setSink (sink) {
        this._sink = typeof sink === 'function' ? sink : null;
        if (!this._sink) this._formats.clear();
    }

    _send (bytes) {
        this.log.push({dir: 'up', bytes: [...bytes]});
        if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
        if (this._sink) this._sink(bytes);
    }

    /** §3.8: Hub Attached I/O for every port with a device, then the internal devices. */
    announce () {
        for (const port of this.profile.ports.map(p => p.id)) {
            const ioType = this.ioTypes.get(port);
            if (ioType !== undefined) this._send(attachedIo(this.portIdOf(port), ioType));
        }
        for (const d of this.type.internal) this._send(attachedIo(d.port, d.type));
    }

    /** The host writes one message to the LEGO Hub Characteristic. */
    receive (bytes) {
        this.log.push({dir: 'down', bytes: [...bytes]});
        let m;
        try {
            m = parse(bytes);
        } catch (_) {
            this._send(errorMessage(bytes[2] || 0, ERROR_CODE.INVALID_USE));
            return;
        }
        const p = m.payload;
        switch (m.type) {
        case MSG.HUB_PROPERTIES: return this._property(p);
        case MSG.HUB_ACTIONS: return this._action(p);
        case MSG.HUB_ALERTS: return this._alert(p);
        case MSG.PORT_INPUT_FORMAT_SETUP_SINGLE: return this._inputFormat(p);
        case MSG.PORT_OUTPUT_COMMAND: return this._output(p);
        default:
            this._send(errorMessage(m.type, ERROR_CODE.COMMAND_NOT_RECOGNIZED));
        }
    }

    _property ([property, op, ...data]) {
        if (op === PROP_OP.SET || op === PROP_OP.RESET || op === PROP_OP.DISABLE_UPDATES) return;
        if (op !== PROP_OP.REQUEST_UPDATE && op !== PROP_OP.ENABLE_UPDATES) {
            this._send(errorMessage(MSG.HUB_PROPERTIES, ERROR_CODE.INVALID_USE));
            return;
        }
        const ascii = s => [...s].map(c => c.charCodeAt(0) & 0x7f);
        const payload = {
            [PROP.ADVERTISING_NAME]: () => ascii(this.type.advertisedName),
            [PROP.BUTTON]: () => [0x00],
            [PROP.FW_VERSION]: () => VIRTUAL_FW,
            [PROP.HW_VERSION]: () => versionNumber(0, 4, 0, 0),
            [PROP.RSSI]: () => [int8(-40) & 0xff],
            [PROP.BATTERY_VOLTAGE]: () => [BATTERY_PERCENT],
            [PROP.BATTERY_TYPE]: () => [0x00],
            [PROP.MANUFACTURER_NAME]: () => ascii('LEGO System A/S'),
            [PROP.LWP_VERSION]: () => LWP_VERSION,
            [PROP.SYSTEM_TYPE_ID]: () => [this.type.systemType],
            [PROP.PRIMARY_MAC]: () => [0x90, 0x84, 0x2b, 0x00, 0x00, 0x01]
        }[property];
        if (!payload) {
            this._send(errorMessage(MSG.HUB_PROPERTIES, ERROR_CODE.INVALID_USE));
            return;
        }
        this._send(propertyUpdate(property, payload()));
    }

    _action ([action]) {
        if (action === ACTION.SWITCH_OFF || action === ACTION.DISCONNECT) {
            for (const st of this.motors.values()) startCommand(st, {kind: 'power', power: 0});
            this._send(message(MSG.HUB_ACTIONS, [action === ACTION.SWITCH_OFF ? ACTION.HUB_WILL_SWITCH_OFF : ACTION.HUB_WILL_DISCONNECT]));
        }
    }

    _alert ([alert, op]) {
        if (op === ALERT_OP.REQUEST_UPDATES) this._send(message(MSG.HUB_ALERTS, [alert, ALERT_OP.UPDATE, 0x00]));
    }

    _inputFormat ([portId, mode, ...rest]) {
        const delta = readU32(rest, 0);
        const notify = rest[4] === 1;
        if (!this._deviceOn(portId)) {
            this._send(errorMessage(MSG.PORT_INPUT_FORMAT_SETUP_SINGLE, ERROR_CODE.INVALID_USE));
            return;
        }
        this._formats.set(portId, {mode, delta, notify, last: null});
        this._send(portInputFormat(portId, mode, delta, notify));
        // The value in the new mode follows at once (the next publish would send it too).
        const value = this._value(portId, mode);
        if (notify && value) {
            this._formats.get(portId).last = value;
            this._send(portValue(portId, value.bytes));
        }
    }

    /** The IO type on an LWP3 port id (a profile port's device, or an internal device), or undefined. */
    _deviceOn (portId) {
        const port = this.portOfId(portId);
        if (port !== null && this.ioTypes.has(port)) return this.ioTypes.get(port);
        const internal = this.type.internal.find(d => d.port === portId);
        return internal ? internal.type : undefined;
    }

    /** {bytes, numbers} of a port's value in a mode (MODE_FORMATS), or null. */
    _value (portId, mode) {
        const ioType = this._deviceOn(portId);
        const format = MODE_FORMATS[ioType] && MODE_FORMATS[ioType][mode];
        if (!format) return null;
        const port = this.portOfId(portId);
        const st = port !== null && this.motors.get(port);
        let v;
        if (st) {
            const positionDeg = reportedDeg(st);
            v = {speedPct: reportedSpeedPct(st, this.specs.get(port)), positionDeg};
            const numbers = mode === 1 ? [v.speedPct] : [Math.round(positionDeg)];
            return {bytes: format(v), numbers};
        }
        if (ioType === IO_TYPE.INTERNAL_TILT || ioType === IO_TYPE.TECHNIC_HUB_TILT) {
            v = {rollDeg: Math.round(this.tilt.rollDeg), pitchDeg: Math.round(this.tilt.pitchDeg), yawDeg: Math.round(this.tilt.yawDeg)};
            return {bytes: format(v), numbers: [v.rollDeg, v.pitchDeg, v.yawDeg]};
        }
        if (ioType === IO_TYPE.VISION_SENSOR) {
            const r = this.sensors.get(port) || {};
            // Proximity (mode 1, 0..10): only "something within the colour probe's reach" is modelled.
            v = {colorIndex: colourIndex(r), reflection: Math.round(r.reflection || 0), proximity: r.color >= 0 ? 0 : 10};
            const numbers = mode === 0 ? [v.colorIndex] : mode === 1 ? [v.proximity] : [v.reflection];
            return {bytes: format(v), numbers};
        }
        return null;
    }

    _output ([portId, startup, sub, ...p]) {
        const feedback = (startup & 0x0f) === COMPLETION.COMMAND_FEEDBACK;
        const immediate = (startup & 0xf0) === STARTUP.EXECUTE_IMMEDIATELY;
        const port = this.portOfId(portId);
        const ioType = this._deviceOn(portId);
        // The hub LED (and any other internal device): WriteDirectModeData only.
        if (ioType === IO_TYPE.RGB_LIGHT && sub === SUB.WRITE_DIRECT_MODE_DATA) {
            this.led = p[0] === 0x01 ? {r: p[1], g: p[2], b: p[3]} : {colour: p[1]};
            if (feedback) this._send(outputFeedback(portId, FEEDBACK.IDLE | FEEDBACK.COMPLETED));
            return;
        }
        const st = port !== null && this.motors.get(port);
        if (!st || !MOTOR_TYPES.has(ioType)) {
            this._send(errorMessage(MSG.PORT_OUTPUT_COMMAND, ERROR_CODE.INVALID_USE));
            return;
        }
        const command = decodeMotorCommand(sub, p);
        if (command === null) {
            this._send(errorMessage(MSG.PORT_OUTPUT_COMMAND, ERROR_CODE.COMMAND_NOT_RECOGNIZED));
            return;
        }
        if (command.kind === 'profile') {
            if (command.acc !== undefined) st.accMs = command.acc;
            if (command.dec !== undefined) st.decMs = command.dec;
            if (feedback) this._send(outputFeedback(portId, FEEDBACK.IDLE | FEEDBACK.COMPLETED));
            return;
        }
        // §4: "buffer if necessary" while a command is in progress waits for it (one slot).
        if (!immediate && st.busy) {
            if (st.buffered) {
                this._send(errorMessage(MSG.PORT_OUTPUT_COMMAND, ERROR_CODE.BUFFER_OVERFLOW));
                return;
            }
            st.buffered = {command, feedback};
            if (feedback) this._send(outputFeedback(portId, FEEDBACK.BUSY_FULL));
            return;
        }
        const discardedBuffer = Boolean(st.buffered);
        st.buffered = null;
        const wasFeedback = st.feedback;
        const r = startCommand(st, command);
        if (!r.ok) {
            this._send(errorMessage(MSG.PORT_OUTPUT_COMMAND, ERROR_CODE.INVALID_USE));
            return;
        }
        if (r.discarded || discardedBuffer) this._resolve(port, 'interrupted');
        st.feedback = feedback;
        if (feedback || (wasFeedback && r.discarded)) {
            const discarded = (r.discarded || discardedBuffer) ? FEEDBACK.DISCARDED : 0;
            this._send(outputFeedback(portId, discarded | (r.completes ? FEEDBACK.IN_PROGRESS : FEEDBACK.IDLE | FEEDBACK.COMPLETED)));
        }
    }
}

/** Whether any number moved by `delta` or more (delta 0: any change). */
const moved = (last, now, delta) => now.some((v, i) => Math.abs(v - last[i]) >= Math.max(1, delta));

/**
 * A Port Output Command's sub command and payload as a controller command (lwp3-controller.js
 * startCommand), or null for one this hub does not implement.
 */
export const decodeMotorCommand = (sub, p) => {
    switch (sub) {
    case SUB.SET_ACC_TIME: return {kind: 'profile', acc: readI16(p, 0)};
    case SUB.SET_DEC_TIME: return {kind: 'profile', dec: readI16(p, 0)};
    case SUB.START_SPEED: return {kind: 'speed', speedPct: int8(p[0]), maxPower: int8(p[1]), useProfile: p[2]};
    case SUB.START_SPEED_FOR_TIME:
        return {kind: 'time', timeMs: readI16(p, 0) & 0xffff, speedPct: int8(p[2]), maxPower: int8(p[3]), endState: p[4], useProfile: p[5]};
    case SUB.START_SPEED_FOR_DEGREES:
        return {kind: 'degrees', degrees: readI32(p, 0), speedPct: int8(p[4]), maxPower: int8(p[5]), endState: p[6], useProfile: p[7]};
    case SUB.GOTO_ABSOLUTE_POSITION:
        return {kind: 'goto', absDeg: readI32(p, 0), speedPct: int8(p[4]), maxPower: int8(p[5]), endState: p[6], useProfile: p[7]};
    // §3.27.14 is the synchronised form (Left, Right); on a single port with one Int32 it is taken
    // as §3.27.13's PresetEncoder(Position) — the form the LEGO extensions send.
    case SUB.PRESET_ENCODER_PAIR: return p.length >= 4 ? {kind: 'preset', positionDeg: readI32(p, 0)} : null;
    case SUB.WRITE_DIRECT_MODE_DATA:
        // §6.1: mode 0 StartPower(Power), mode 2 PresetEncoder(Position).
        if (p[0] === 0x00) return {kind: 'power', power: int8(p[1])};
        if (p[0] === 0x02) return {kind: 'preset', positionDeg: readI32(p, 1)};
        return null;
    default:
        return null;
    }
};

/** The hub registry's entries (registry/hubs.js), one per LWP3 hub type. The mirror is made with {id}. */
export const lwp3Hubs = Object.freeze([...LWP3_HUB_TYPES.values()].map(t => Object.freeze({
    profile: t.profile,
    createVirtualHub: options => new Lwp3VirtualHub({id: options && options.id, profile: t.profile.id})
})));
