// SPDX-License-Identifier: Apache-2.0
export const SPIKE_FIRMWARE_TARGETS = Object.freeze({
    'legacy-v2': Object.freeze({label: 'LEGO SPIKE legacy firmware v2', classic: true, legoBle: false,
        summary: 'Classic RFCOMM through Scratch Link'}),
    'official-v3': Object.freeze({label: 'LEGO SPIKE official firmware v3', classic: false, legoBle: true,
        summary: 'LEGO SPIKE BLE protocol'}),
    brickwright: Object.freeze({label: 'Brickwright firmware', classic: true, legoBle: true,
        summary: 'Brickwright Classic and LEGO-v3-compatible BLE adapters'}),
    pybricks: Object.freeze({label: 'Pybricks firmware', classic: false, legoBle: false,
        summary: 'hardware image/reference target; Pybricks BLE transport is not implemented'})
});

export const spikeFirmwareTarget = target => {
    const profile = SPIKE_FIRMWARE_TARGETS[target];
    if (!profile) throw new TypeError('unknown SPIKE firmware target');
    return profile;
};

const makeData = () => ({
    connected: false, notificationIntervalMs: null, battery: 100,
    firmwareTarget: 'official-v3',
    display: Array(25).fill(0),
    motors: Array.from({length: 6}, () => ({speed: 0, position: 0})),
    sensors: Array.from({length: 6}, () => null),
    classicPorts: Array.from({length: 6}, () => [0, []]),
    imu: {faceUp: 0, yaw: 0, pitch: 0, roll: 0,
        acceleration: {x: 0, y: 0, z: 1000}, angularVelocity: {x: 0, y: 0, z: 0}},
    buttons: {left: false, center: false, right: false}, lastCommand: null, lastPython: null
});
const indexOf = port => {
    const index = typeof port === 'string' ? 'ABCDEF'.indexOf(port.toUpperCase()) : Number(port);
    if (!Number.isInteger(index) || index < 0 || index > 5) throw new RangeError('SPIKE port must be A-F or 0-5');
    return index;
};
export default class VirtualSpikeHubState {
    constructor () { this.data = makeData(); this.listeners = new Set(); }
    subscribe (listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    changed () { for (const listener of this.listeners) listener(this.data); }
    setBattery (value) { this.data.battery = Math.max(0, Math.min(100, Math.round(Number(value) || 0))); this.changed(); }
    setFirmwareTarget (target) {
        const profile = spikeFirmwareTarget(target);
        this.stopAll();
        this.data.firmwareTarget = target;
        globalThis.__brickwrightUseVirtualSpike = profile.classic;
        this.changed();
    }
    setImu (value) { Object.assign(this.data.imu, value); this.changed(); }
    setPort (port, kind, value = {}) {
        const index = indexOf(port);
        this.data.sensors[index] = kind === 'none' ? null : {kind, ...value};
        if (kind === 'motor') {
            Object.assign(this.data.motors[index], value);
            this.setMotorSpeed(index, value.speed || 0);
        }
        else if (kind === 'distance') this.data.classicPorts[index] = [62, [value.distance ?? -1]];
        else if (kind === 'color') this.data.classicPorts[index] = [61, [value.color ?? -1, value.reflection ?? 0,
            value.ambient ?? 0, value.red ?? 0, value.green ?? 0, value.blue ?? 0]];
        else if (kind === 'force') this.data.classicPorts[index] = [63, [value.force ?? 0, value.pressed ? 1 : 0]];
        else if (kind === 'none') this.data.classicPorts[index] = [0, []];
        this.changed();
    }
    setMotorSpeed (port, value) {
        const index = indexOf(port);
        const speed = Math.max(-100, Math.min(100, Number(value) || 0));
        this.data.motors[index].speed = speed;
        this.data.sensors[index] = {kind: 'motor'};
        this.data.classicPorts[index] = [48, [speed, this.data.motors[index].position, 0, speed]];
        this.changed();
    }
    setDisplay (pixels) { this.data.display = Array.from(pixels).slice(0, 25); while (this.data.display.length < 25) this.data.display.push(0); this.changed(); }
    stopAll () { this.data.motors.forEach((motor, index) => {
        motor.speed = 0;
        if ([48, 49].includes(this.data.classicPorts[index][0])) this.data.classicPorts[index][1][0] = 0;
    }); this.changed(); }
    snapshot () { return JSON.parse(JSON.stringify(this.data)); }
}
