// SPDX-License-Identifier: Apache-2.0
// Framing is shared with Brickwright SPIKE Firmware's independently authored
// protocol/js/spike-codec.js and its Apache-2.0 conformance fixtures.
import {registerVirtualPeripheral} from './web-bluetooth-shim.js';
import VirtualSpikeHubState from './spike-hub-state.js';

export const SPIKE_SERVICE = '0000fd02-0000-1000-8000-00805f9b34fb';
export const SPIKE_RX = '0000fd02-0001-1000-8000-00805f9b34fb';
export const SPIKE_TX = '0000fd02-0002-1000-8000-00805f9b34fb';

const END = 0x02;
const XOR = 0x03;
const BLOCK_MAX = 84;

const cobsEncode = input => {
    const output = [0xff];
    let codeIndex = 0;
    let block = 1;
    for (const byte of input) {
        if (byte <= 2) {
            output[codeIndex] = block + 2 + (byte * BLOCK_MAX);
            codeIndex = output.length;
            output.push(0xff);
            block = 1;
        } else {
            output.push(byte);
            block++;
            if (block > BLOCK_MAX) {
                codeIndex = output.length;
                output.push(0xff);
                block = 1;
            }
        }
    }
    output[codeIndex] = block + 2;
    return Uint8Array.from(output);
};

const cobsDecode = input => {
    if (!input.length) throw new Error('empty COBS payload');
    const output = [];
    for (let offset = 0; offset < input.length;) {
        const code = input[offset++];
        if (code <= 2) throw new Error('reserved COBS code');
        const adjusted = code === 0xff ? null : code - 3;
        const delimiter = adjusted === null ? null : Math.floor(adjusted / BLOCK_MAX);
        const block = adjusted === null ? BLOCK_MAX : adjusted % BLOCK_MAX;
        if (delimiter !== null && delimiter > 2) throw new Error('invalid COBS delimiter');
        if (offset + block > input.length) throw new Error('truncated COBS block');
        for (let i = 0; i < block; i++) output.push(input[offset++]);
        if (delimiter !== null && offset < input.length) output.push(delimiter);
    }
    return Uint8Array.from(output);
};

export const packSpikeFrame = payload => {
    const encoded = cobsEncode(payload);
    return Uint8Array.from([...encoded].map(byte => byte ^ XOR).concat(END));
};

export const unpackSpikeFrame = frame => {
    const start = frame[0] === 1 ? 1 : 0;
    if (frame.length - start < 2 || frame[frame.length - 1] !== END) throw new Error('unterminated frame');
    const encoded = frame.slice(start, -1);
    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] >= 1 && encoded[i] <= 3) throw new Error('unescaped control byte');
        encoded[i] ^= XOR;
    }
    return cobsDecode(encoded);
};

const clampInt = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, Math.round(Number(value) || 0)));

const writeInt16 = (target, offset, value) =>
    new DataView(target.buffer, target.byteOffset, target.byteLength).setInt16(offset, clampInt(value, -32768, 32767), true);

const writeInt32 = (target, offset, value) =>
    new DataView(target.buffer, target.byteOffset, target.byteLength)
        .setInt32(offset, clampInt(value, -2147483648, 2147483647), true);

export class VirtualSpikePrimePeripheral {
    constructor ({id = 'brickwright-virtual-spike-prime', name = 'Brickwright Virtual SPIKE Prime',
        hubState = new VirtualSpikeHubState()} = {}) {
        this.id = id;
        this.name = name;
        this.services = [{
            uuid: SPIKE_SERVICE,
            characteristics: [
                {uuid: SPIKE_RX, properties: {write: true, writeWithoutResponse: true}},
                {uuid: SPIKE_TX, properties: {notify: true}}
            ]
        }];
        if (hubState.data.firmwareTarget === 'legacy-v2') this.services = [];
        this.hubState = hubState;
        this.state = hubState.data;
        this._unsubscribe = null;
        this._unregisterTransport = null;
        this._frame = [];
        this._sink = null;
    }

    connect () {
        if (!this.state.simulationEnabled || this.state.firmwareTarget === 'legacy-v2') {
            throw new Error('virtual SPIKE BLE is not enabled for this firmware profile');
        }
        this.state.connected = true;
        this._unsubscribe ||= this.hubState.subscribe(() => this.emitDeviceNotification());
        this._unregisterTransport ||= this.hubState.registerTransport('ble', () => this.disconnect(false));
    }

    disconnect (stop = true) {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        if (this._unregisterTransport) { this._unregisterTransport(); this._unregisterTransport = null; }
        this.state.connected = false;
        if (stop) this.hubState.stopAll();
        this._frame = [];
    }

    dispose () { this.disconnect(); this._sink = null; }

    setNotificationSink (sink) {
        this._sink = sink;
    }

    onWrite (uuid, bytes) {
        if (uuid !== SPIKE_RX) throw new Error(`unexpected SPIKE write characteristic: ${uuid}`);
        for (const byte of bytes) {
            if (byte === 1) this._frame = [byte];
            else this._frame.push(byte);
            if (byte === END) {
                try {
                    const payload = unpackSpikeFrame(Uint8Array.from(this._frame));
                    this._frame = [];
                    this._handleMessage(payload);
                } catch (error) {
                    this._frame = [];
                    throw error;
                }
            }
            if (this._frame.length > 4096) {
                this._frame = [];
                throw new Error('SPIKE frame too large');
            }
        }
    }

    _notify (payload) {
        if (this._sink) this._sink(SPIKE_TX, packSpikeFrame(payload));
    }

    setBattery (percent) {
        this.hubState.setBattery(percent);
    }

    setImu (values) {
        const imu = this.state.imu;
        for (const key of ['faceUp', 'yaw', 'pitch', 'roll']) {
            if (Object.prototype.hasOwnProperty.call(values, key)) imu[key] = Number(values[key]) || 0;
        }
        for (const vector of ['acceleration', 'angularVelocity']) {
            if (!values[vector]) continue;
            for (const axis of ['x', 'y', 'z']) {
                if (Object.prototype.hasOwnProperty.call(values[vector], axis)) {
                    imu[vector][axis] = Number(values[vector][axis]) || 0;
                }
            }
        }
        this.hubState.changed();
    }

    setPort (port, kind, value = {}) {
        const index = typeof port === 'string' ? 'ABCDEF'.indexOf(port.toUpperCase()) : Number(port);
        if (!Number.isInteger(index) || index < 0 || index > 5) throw new RangeError('SPIKE port must be A-F or 0-5');
        const allowed = new Set(['motor', 'color', 'distance', 'force', 'matrix3', 'none']);
        if (!allowed.has(kind)) throw new TypeError(`unsupported virtual SPIKE port kind: ${kind}`);
        this.hubState.setPort(index, kind, value);
    }

    _deviceRecords () {
        const records = [Uint8Array.of(0x00, this.state.battery)];
        const imu = new Uint8Array(21);
        imu[0] = 0x01;
        imu[1] = clampInt(this.state.imu.faceUp, 0, 5);
        writeInt16(imu, 3, this.state.imu.yaw);
        writeInt16(imu, 5, this.state.imu.pitch);
        writeInt16(imu, 7, this.state.imu.roll);
        writeInt16(imu, 9, this.state.imu.acceleration.x);
        writeInt16(imu, 11, this.state.imu.acceleration.y);
        writeInt16(imu, 13, this.state.imu.acceleration.z);
        writeInt16(imu, 15, this.state.imu.angularVelocity.x);
        writeInt16(imu, 17, this.state.imu.angularVelocity.y);
        writeInt16(imu, 19, this.state.imu.angularVelocity.z);
        records.push(imu);

        this.state.sensors.forEach((sensor, port) => {
            if (!sensor) return;
            if (sensor.kind === 'motor') {
                const motor = this.state.motors[port];
                const record = new Uint8Array(12);
                record[0] = 0x0a;
                record[1] = port;
                record[7] = clampInt(motor.speed, -100, 100) & 0xff;
                writeInt32(record, 8, motor.position);
                records.push(record);
            } else if (sensor.kind === 'color') {
                const record = new Uint8Array(9);
                record.set([0x0c, port, clampInt(sensor.color, -1, 10) & 0xff]);
                const view = new DataView(record.buffer);
                view.setUint16(3, clampInt(sensor.red, 0, 1024), true);
                view.setUint16(5, clampInt(sensor.green, 0, 1024), true);
                view.setUint16(7, clampInt(sensor.blue, 0, 1024), true);
                records.push(record);
            } else if (sensor.kind === 'distance') {
                const record = Uint8Array.of(0x0d, port, 0, 0);
                writeInt16(record, 2, sensor.distance === undefined ? -1 : sensor.distance);
                records.push(record);
            } else if (sensor.kind === 'force') {
                records.push(Uint8Array.of(0x0b, port, clampInt(sensor.force, 0, 100), sensor.pressed ? 1 : 0));
            } else if (sensor.kind === 'matrix3') {
                const pixels = Array.from(sensor.pixels || []).slice(0, 9);
                while (pixels.length < 9) pixels.push(0);
                records.push(Uint8Array.of(0x0e, port, ...pixels.map(value => clampInt(value, 0, 255))));
            }
        });
        return records;
    }

    emitDeviceNotification () {
        if (this.state.notificationIntervalMs === null) return;
        const records = this._deviceRecords();
        const size = records.reduce((total, record) => total + record.length, 0);
        const payload = new Uint8Array(3 + size);
        payload.set([0x3c, size & 0xff, size >> 8]);
        let offset = 3;
        for (const record of records) {
            payload.set(record, offset);
            offset += record.length;
        }
        this._notify(payload);
    }

    _handleMessage (payload) {
        if (!payload.length) return;
        if (payload[0] === 0x00) {
            const response = new Uint8Array(15);
            response[0] = 0x01;
            new DataView(response.buffer).setUint16(9, 20, true);
            new DataView(response.buffer).setUint16(13, 100, true);
            this._notify(response);
            return;
        }
        if (payload[0] === 0x28 && payload.length >= 3) {
            this.state.notificationIntervalMs = payload[1] | (payload[2] << 8);
            this._notify(Uint8Array.of(0x29));
            this.emitDeviceNotification();
            return;
        }
        if (payload[0] === 0x32 && payload.length >= 3) {
            const size = payload[1] | (payload[2] << 8);
            if (size !== payload.length - 3) throw new Error('invalid tunnel payload length');
            this._handleTunnel(new TextDecoder().decode(payload.slice(3)));
        }
    }

    _handleTunnel (text) {
        let command;
        try {
            command = JSON.parse(text);
        } catch (_) {
            this.state.lastPythonTunnel = text;
            this._translatePythonTunnel(text);
            return;
        }
        if (command && command.m === 'motor') {
            const port = Number(command.p && command.p.port);
            if (Number.isInteger(port) && port >= 0 && port < 6) {
                this.hubState.setMotorSpeed(port, command.p.speed);
            }
        }
        this.state.lastTunnelCommand = command;
    }

    _translatePythonTunnel (text) {
        // Deliberately a tiny parser for extension-generated calls. Never eval.
        const run = /\bmotor\.run\(port\.([A-F]),\s*(-?\d+(?:\.\d+)?)\)/.exec(text);
        if (run) {
            const port = 'ABCDEF'.indexOf(run[1]);
            this.hubState.setMotorSpeed(port, clampInt(run[2], -1000, 1000) / 10);
            return true;
        }
        const stop = /\bmotor\.stop\(port\.([A-F])\)/.exec(text);
        if (stop) {
            this.hubState.setMotorSpeed(stop[1], 0);
            return true;
        }
        this.state.lastUnsupportedPythonTunnel = text;
        return false;
    }
}

export const registerVirtualSpikePrime = options => {
    const hubState = options?.hubState || new VirtualSpikeHubState();
    let lastPeripheral = null;
    const removeFactory = registerVirtualPeripheral(() => {
        if (!hubState.data.simulationEnabled || hubState.data.firmwareTarget === 'legacy-v2') return null;
        lastPeripheral = new VirtualSpikePrimePeripheral({...options, hubState});
        return lastPeripheral;
    });
    const unregister = () => {
        removeFactory();
        lastPeripheral?.dispose();
        lastPeripheral = null;
    };
    return {unregister, get peripheral () { return lastPeripheral; }};
};
