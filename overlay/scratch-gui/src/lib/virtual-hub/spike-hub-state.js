// SPDX-License-Identifier: Apache-2.0
// The hub contract (who writes what, units, the clock) is docs/SPIKE-ARENA.md.
import SpikeMotorModel from './spike-motor-model.js';

const makeData = () => ({
    connected: false, simulationEnabled: false, notificationIntervalMs: null, battery: 100,
    firmwareTarget: 'official-v3',
    display: Array(25).fill(0),
    motors: Array.from({length: 6}, () => ({speed: 0, position: 0})),
    sensors: Array.from({length: 6}, () => null),
    classicPorts: Array.from({length: 6}, () => [0, []]),
    imu: {faceUp: 0, yaw: 0, pitch: 0, roll: 0,
        acceleration: {x: 0, y: 0, z: 1000}, angularVelocity: {x: 0, y: 0, z: 0}},
    buttons: {left: false, center: false, right: false}, lastCommand: null, lastPython: null
});
const wrap180 = degrees => {
    const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
    return wrapped === -180 ? 180 : wrapped;
};
const indexOf = port => {
    const index = typeof port === 'string' ? 'ABCDEF'.indexOf(port.toUpperCase()) : Number(port);
    if (!Number.isInteger(index) || index < 0 || index > 5) throw new RangeError('SPIKE port must be A-F or 0-5');
    return index;
};
export default class VirtualSpikeHubState {
    constructor () {
        this.data = makeData(); this.listeners = new Set(); this.transports = new Set();
        // What a motor does with a command: see spike-motor-model.js. Positions
        // advance only when the world's owner calls stepMotors().
        this.motors = new SpikeMotorModel(this);
        // The movement pair `motors.*` commands address: [left, right]. The left
        // motor is mounted mirrored, as on the SPIKE driving base.
        this.movementPair = ['A', 'B'];
        this._heading = 0;
        this._yawZero = 0;
    }
    /** Advances every commanded motor by dtMs of simulated time; returns whether any moved. */
    stepMotors (dtMs) { return this.motors.step(dtMs); }
    /** The world's heading of the hub, degrees, clockwise positive seen from above. Sets imu.yaw. */
    setHeading (degrees, {rate = 0} = {}) {
        this._heading = Number(degrees) || 0;
        this.data.imu.yaw = wrap180(this._heading - this._yawZero);
        this.data.imu.angularVelocity.z = Number(rate) || 0;
    }
    /** hub.motion.reset_yaw / preset_yaw: from now on yaw reads `value` at the current heading. */
    resetYaw (value = 0) {
        this._yawZero = this._heading - (Number(value) || 0);
        this.data.imu.yaw = wrap180(this._heading - this._yawZero);
        this.changed();
    }
    /** Forgets any heading and yaw offset (a fresh hub). */
    resetHeading (degrees = 0) { this._heading = Number(degrees) || 0; this._yawZero = this._heading; this.data.imu.yaw = 0; }
    subscribe (listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    registerTransport (kind, disconnect) {
        if (!['ble', 'classic'].includes(kind) || typeof disconnect !== 'function') {
            throw new TypeError('virtual SPIKE transport registration is invalid');
        }
        const entry = {kind, disconnect};
        this.transports.add(entry);
        return () => this.transports.delete(entry);
    }
    _disconnectWhere (predicate) {
        for (const entry of [...this.transports]) if (predicate(entry.kind)) entry.disconnect();
    }
    changed () { for (const listener of this.listeners) listener(this.data); }
    setBattery (value) { this.data.battery = Math.max(0, Math.min(100, Math.round(Number(value) || 0))); this.changed(); }
    setFirmwareTarget (target) {
        if (!['legacy-v2', 'official-v3', 'brickwright'].includes(target)) throw new TypeError('unknown SPIKE firmware target');
        this.data.firmwareTarget = target;
        this._stopAllSilent();
        this._disconnectWhere(kind => (target === 'legacy-v2' && kind === 'ble') ||
            (target === 'official-v3' && kind === 'classic'));
        this.changed();
    }
    setSimulationEnabled (enabled) {
        const next = enabled === true;
        if (this.data.simulationEnabled === next) return;
        this.data.simulationEnabled = next;
        this._stopAllSilent();
        if (!next) this._disconnectWhere(() => true);
        this.changed();
    }
    setImu (value) { Object.assign(this.data.imu, value); this.changed(); }
    /** Writes a sensor port's value WITHOUT notifying listeners, for a caller
     *  that batches (the arena writes every sensor, then calls changed() once). */
    updateSensor (port, kind, value = {}) {
        if (kind === 'motor') throw new TypeError('updateSensor is for sensors; motors are commanded');
        this._applySensor(indexOf(port), kind, value);
    }
    _applySensor (index, kind, value) {
        this.data.sensors[index] = kind === 'none' ? null : {kind, ...value};
        if (kind === 'distance') this.data.classicPorts[index] = [62, [value.distance ?? -1]];
        else if (kind === 'color') this.data.classicPorts[index] = [61, [value.color ?? -1, value.reflection ?? 0,
            value.ambient ?? 0, value.red ?? 0, value.green ?? 0, value.blue ?? 0]];
        else if (kind === 'force') this.data.classicPorts[index] = [63, [value.force ?? 0, value.pressed ? 1 : 0]];
        else if (kind === 'boostMotor' || kind === 'boostColorDistance') {
            this.data.classicPorts[index] = [value.deviceId || 0, []];
        }
        else if (kind === 'none') this.data.classicPorts[index] = [0, []];
    }
    setPort (port, kind, value = {}) {
        const index = indexOf(port);
        if (kind === 'motor') {
            this.data.sensors[index] = {kind, ...value};
            Object.assign(this.data.motors[index], value);
            this.setMotorSpeed(index, value.speed || 0);
        } else this._applySensor(index, kind, value);
        this.changed();
    }
    setMotorSpeed (port, value) {
        const index = indexOf(port);
        const speed = Math.max(-100, Math.min(100, Number(value) || 0));
        this.data.sensors[index] = {...this.data.sensors[index], kind: 'motor'};
        // Percent of this motor's full speed, run until told otherwise.
        if (speed === 0) this.motors.stop(index);
        else this.motors.runAtSpeed(index, this.motors.percentToDps(index, speed));
        this.data.motors[index].speed = speed;
        this.changed();
    }
    setDisplay (pixels) { this.data.display = Array.from(pixels).slice(0, 25); while (this.data.display.length < 25) this.data.display.push(0); this.changed(); }
    _stopAllSilent () {
        this.motors.stopAll();
        this.data.motors.forEach((motor, index) => {
            motor.speed = 0;
            if ([48, 49].includes(this.data.classicPorts[index][0])) this.data.classicPorts[index][1][0] = 0;
        });
    }
    stopAll () { this._stopAllSilent(); this.changed(); }
    snapshot () { return JSON.parse(JSON.stringify(this.data)); }
}
