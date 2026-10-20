// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The LEGO Education WeDo 2.0 Smart Hub (45301; LDraw 19071, "Electric Power Functions 2.0 Hub
// with Battery Box") behind the Robot Lab's port boundary (hubs/hub-profile.js;
// docs/ROBOT-LAB-HUBS-PLAN.md P3). Its radio protocol is its own GATT service, not LWP3
// (wedo2-protocol.js; docs/WEDO-HUB-PROTOCOL-NOTES.md), and it has NO motor controller: the
// WeDo 2.0 motor (45303) has no encoder, and the hub turns an Output Command's power straight
// into a PWM duty (0 float, 127 brake). The program — scratch-vm's wedo2 blocks or the
// wedo2unified extension, both unchanged — is the controller ("the Scratch VM is the
// controller", plan §Hub models). Sensors: the tilt sensor (45305) reports the sensor's pitch
// and roll, the motion sensor (45304) a distance from a short ray.
//
// Two faces, as the LWP3 hub (lwp3-virtual-hub.js): the VirtualHub step, and the protocol
// (onWrite / read / startNotifications) the GATT peripheral (virtual-hub/lab-ble-peripherals.js)
// forwards to. What decides a drive (each port's power) is exported to the worker's mirror; the
// protocol's bookkeeping stays on the main thread.

import {HUB_SUPPLY_VOLTS} from '../../devices/catalog.js';
import {
    CHAR, CONNECT_ID, WEDO_IO, OUTPUT, UNIT, MOTOR_BRAKE, MOTOR_FLOAT, attachedIo, inputValues, float32
} from './wedo2-protocol.js';

const label = (en, de) => Object.freeze({en, de});

const port = id => Object.freeze({
    id,
    label: label(`Port ${id}`, `Port ${id}`),
    kind: 'wedo2',
    accepts: Object.freeze(['motor', 'lamp', 'sensor-lpf2']),
    supplyVolts: HUB_SUPPLY_VOLTS.wedo2.volts,
    identifies: 'lpf2-id'
});

/** @type {import('../hub-profile.js').HubProfile} */
export const WEDO2_PROFILE = Object.freeze({
    id: 'wedo2',
    name: label('WeDo 2.0 Smart Hub', 'WeDo-2.0-Smart-Hub'),
    parts: Object.freeze(['19071.dat']),
    ports: Object.freeze([port('A'), port('B')]),
    internalDevices: Object.freeze([]),
    clock: Object.freeze({controllerStepMs: 5}),
    drive: 'pwm',
    routes: Object.freeze(['wedo2unified-extension', 'wedo2-extension', 'robot-lab-api'])
});

/** The advertised name (the SDK's default; the hub's name characteristic 1524). */
export const WEDO2_NAME = 'LPF2 Smart Hub';

/**
 * The motion sensor's detect value (mode 0) from the ray's distance: 0 (an object at the sensor)
 * … 10 (nothing within MOTION_RANGE_MM), one step per tenth of the range. The real sensor's curve
 * is not published: a straight line over a 15 cm range, estimated (docs/WEDO-HUB-PROTOCOL-NOTES.md).
 */
export const MOTION_RANGE_MM = 150;
export const motionDetect = distanceMm => (distanceMm < 0 ? 10 : Math.max(0, Math.min(10, Math.floor(distanceMm * 10 / MOTION_RANGE_MM))));

const CONNECT_OF = {A: CONNECT_ID.A, B: CONNECT_ID.B};
const PORT_OF = {[CONNECT_ID.A]: 'A', [CONNECT_ID.B]: 'B'};
/** Internal devices announced at connect (node-poweredup wedo2smarthub.ts portMap). */
const INTERNAL = [[CONNECT_ID.CURRENT, WEDO_IO.CURRENT], [CONNECT_ID.VOLTAGE, WEDO_IO.VOLTAGE],
    [CONNECT_ID.PIEZO, WEDO_IO.PIEZO], [CONNECT_ID.LED, WEDO_IO.RGB_LED]];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const int8 = v => (v << 24) >> 24;

export class Wedo2VirtualHub {
    constructor ({id = 'hub'} = {}) {
        this.id = id;
        this.profile = WEDO2_PROFILE;
        this.protocol = 'wedo2';
        this.timeMs = 0;
        /** port → {power} (−100..100, or 'float' / 'brake') */
        this.motors = new Map();
        /** port → {ioType} of a sensor */
        this.sensorPorts = new Map();
        /** port → its last probe */
        this.sensors = new Map();
        this.led = null;
        this.tones = [];
        this.plugged = false;
        this._sink = null;
        /** connectId → {mode, delta, unit, notify, last} */
        this._formats = new Map();
        this.log = [];
    }

    plug (bindings) {
        const diagnostics = [];
        for (const b of bindings) {
            if (!CONNECT_OF[b.port]) {
                diagnostics.push({severity: 'error', code: 'port-unknown', message: `the WeDo 2.0 hub has no port '${b.port}' (ports A, B)`});
                continue;
            }
            if (this.motors.has(b.port) || this.sensorPorts.has(b.port)) {
                diagnostics.push({severity: 'error', code: 'port-twice', message: `two devices on port ${b.port}`});
                continue;
            }
            if (b.class === 'motor') this.motors.set(b.port, {state: 'float', power: 0});
            else this.sensorPorts.set(b.port, {ioType: Number.isInteger(b.ids?.lpf2) ? b.ids.lpf2 : WEDO_IO.MOTION});
        }
        this.timeMs = 0;
        this.plugged = true;
        return diagnostics;
    }

    advanceTo (tMs) {
        this.timeMs = tMs;
    }

    readDrives () {
        const out = [];
        for (const [p, m] of this.motors) {
            if (m.state === 'float') out.push({port: p, mode: 'pwm', duty: 0, decay: 'coast'});
            else if (m.state === 'brake') out.push({port: p, mode: 'pwm', duty: 0, decay: 'brake'});
            else out.push({port: p, mode: 'pwm', duty: m.power / 100, decay: 'brake'});
        }
        return out;
    }

    writeReadings (readings) {
        for (const r of readings) if (r.kind === 'probe') this.sensors.set(r.port, {kind: r.device, ...r.raw});
    }

    publish () {
        if (!this._sink) return;
        for (const [connectId, f] of this._formats) {
            if (!f.notify || !f.subscribed) continue;
            const v = this._value(connectId, f);
            if (!v) continue;
            if (f.last && !v.numbers.some((n, i) => Math.abs(n - f.last.numbers[i]) >= Math.max(1, f.delta))) continue;
            f.last = v;
            this._send(CHAR.INPUT_VALUES, inputValues(connectId, v.bytes));
        }
    }

    exportState () {
        return {timeMs: this.timeMs, motors: [...this.motors].map(([p, m]) => [p, {...m}])};
    }

    importState (state) {
        this.timeMs = state.timeMs;
        for (const [p, m] of state.motors) this.motors.set(p, {...m});
    }

    stateKey (state) {
        return JSON.stringify(state);
    }

    dispose () {
        this.plugged = false;
    }

    /** The Robot Lab API: power and stop only (no encoder, so no degrees or positions). */
    directCommand (p, command = {}) {
        const m = this.motors.get(p);
        if (!m) return {ok: false, code: 'no-motor', message: `there is no motor on port ${p}`};
        if (command.stop !== undefined) {
            if (command.stop === 'hold') return {ok: false, code: 'refused', message: 'the WeDo 2.0 motor has no encoder to hold a position'};
            this._setPower(p, command.stop === 'coast' ? MOTOR_FLOAT : MOTOR_BRAKE);
            return {ok: true};
        }
        if (typeof command.power === 'number' && Number.isFinite(command.power)) {
            this._setPower(p, Math.round(clamp(command.power, -100, 100)) || MOTOR_FLOAT);
            return {ok: true};
        }
        return {ok: false, code: 'refused', message: 'the WeDo 2.0 motor takes power and stop only (it has no encoder)'};
    }

    readPort (p) {
        const m = this.motors.get(p);
        if (m) return {kind: 'motor', power: m.state === 'run' ? m.power : 0, state: m.state};
        const s = this.sensors.get(p);
        return s ? {...s} : null;
    }

    motorPortIds () { return [...this.motors.keys()]; }

    _setPower (p, byte) {
        const m = this.motors.get(p);
        if (!m) return;
        if (byte === MOTOR_FLOAT) Object.assign(m, {state: 'float', power: 0});
        else if (byte === MOTOR_BRAKE) Object.assign(m, {state: 'brake', power: 0});
        else Object.assign(m, {state: 'run', power: clamp(int8(byte), -100, 100)});
    }

    // ---- the protocol (main thread) ---------------------------------------------------------

    setSink (sink) {
        this._sink = typeof sink === 'function' ? sink : null;
        if (!this._sink) this._formats.clear();
    }

    _send (uuid, bytes) {
        this.log.push({dir: 'up', uuid, bytes: [...bytes]});
        if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
        if (this._sink) this._sink(uuid, bytes);
    }

    /** A host subscribed to a characteristic: Attached IO announces the devices; Input Values (re)sends values. */
    startNotifications (uuid) {
        if (uuid === CHAR.ATTACHED_IO) {
            for (const [p, connectId] of Object.entries(CONNECT_OF)) {
                const ioType = this.motors.has(p) ? WEDO_IO.MOTOR : this.sensorPorts.get(p)?.ioType;
                if (ioType !== undefined) this._send(CHAR.ATTACHED_IO, attachedIo(connectId, ioType));
            }
            for (const [connectId, ioType] of INTERNAL) this._send(CHAR.ATTACHED_IO, attachedIo(connectId, ioType));
        } else if (uuid === CHAR.INPUT_VALUES) {
            this._inputValuesSubscribed = true;
            for (const f of this._formats.values()) {
                f.subscribed = true;
                f.last = null;
            }
        }
    }

    read (uuid) {
        if (uuid === CHAR.BATTERY_LEVEL) return Uint8Array.from([100]);
        if (uuid === CHAR.LOW_VOLTAGE) return Uint8Array.from([0]);
        if (uuid === CHAR.BUTTON) return Uint8Array.from([0]);
        if (uuid === CHAR.NAME) return Uint8Array.from([...WEDO2_NAME].map(c => c.charCodeAt(0)));
        throw new Error(`characteristic ${uuid} is not readable`);
    }

    onWrite (uuid, bytes) {
        this.log.push({dir: 'down', uuid, bytes: [...bytes]});
        if (uuid === CHAR.OUTPUT_COMMAND) this._output(bytes);
        else if (uuid === CHAR.INPUT_COMMAND) this._inputCommand(bytes);
        else if (uuid === CHAR.DISCONNECT) {
            for (const p of this.motors.keys()) this._setPower(p, MOTOR_FLOAT);
            if (this.onDisconnectRequest) this.onDisconnectRequest();
        }
    }

    _output ([connectId, command, length, ...payload]) {
        if (command === OUTPUT.MOTOR_POWER && length >= 1) {
            const p = PORT_OF[connectId];
            if (p && this.motors.has(p)) this._setPower(p, payload[0]);
        } else if (command === OUTPUT.WRITE_RGB && connectId === CONNECT_ID.LED) {
            this.led = length >= 3 ? {r: payload[0], g: payload[1], b: payload[2]} : {colour: payload[0]};
        } else if (command === OUTPUT.PLAY_TONE && connectId === CONNECT_ID.PIEZO && length >= 4) {
            this.tones.push({hz: payload[0] | (payload[1] << 8), ms: payload[2] | (payload[3] << 8), atMs: this.timeMs});
            if (this.tones.length > 50) this.tones.shift();
        }
    }

    _inputCommand ([commandId, type, connectId, ioType, mode, d0, d1, d2, d3, unit, notify]) {
        if (commandId !== 1 || type !== 2) return;
        const delta = (d0 | (d1 << 8) | (d2 << 16) | (d3 << 24)) >>> 0;
        const f = {ioType, mode, delta, unit, notify: notify === 1, last: null, subscribed: Boolean(this._inputValuesSubscribed)};
        this._formats.set(connectId, f);
        // The value in the new format follows (when the host listens for input values).
        const v = this._value(connectId, f);
        if (v && f.notify && f.subscribed) {
            f.last = v;
            this._send(CHAR.INPUT_VALUES, inputValues(connectId, v.bytes));
        }
    }

    /** {bytes, numbers} of a sensor port's value in its format, or null. */
    _value (connectId, f) {
        const p = PORT_OF[connectId];
        const sensor = p && this.sensorPorts.get(p);
        if (!sensor || sensor.ioType !== f.ioType || f.mode !== 0) return null;
        const r = this.sensors.get(p) || {};
        if (sensor.ioType === WEDO_IO.MOTION) {
            const detect = motionDetect(r.distanceMm ?? -1);
            if (f.unit === UNIT.SI) return {bytes: float32(detect), numbers: [detect]};
            const n = f.unit === UNIT.PERCENT ? detect * 10 : detect;
            return {bytes: [n], numbers: [n]};
        }
        if (sensor.ioType === WEDO_IO.TILT) {
            // Mode 0 (angle): x and y, degrees, ±45. scratch-vm's wedo2 reads y > 0 as tilted down
            // (nose down) and x > 0 as tilted left.
            const x = Math.round(clamp(-(r.rollDeg || 0), -45, 45));
            const y = Math.round(clamp(-(r.pitchDeg || 0), -45, 45));
            if (f.unit === UNIT.SI) return {bytes: [...float32(x), ...float32(y)], numbers: [x, y]};
            return {bytes: [x & 0xff, y & 0xff], numbers: [x, y]};
        }
        return null;
    }
}

/** The hub registry's entry (registry/hubs.js). */
export const wedo2Hub = Object.freeze({
    profile: WEDO2_PROFILE,
    createVirtualHub: options => new Wedo2VirtualHub({id: options && options.id})
});
