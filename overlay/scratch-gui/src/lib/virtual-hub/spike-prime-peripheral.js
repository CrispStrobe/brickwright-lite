// SPDX-License-Identifier: Apache-2.0
// Framing is shared with Brickwright SPIKE Firmware's independently authored
// protocol/js/spike-codec.js and its Apache-2.0 conformance fixtures.
import {registerVirtualPeripheral} from './web-bluetooth-shim.js';

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

const unpackSpikeFrame = frame => {
    const start = frame[0] === 1 ? 1 : 0;
    if (frame.length - start < 2 || frame[frame.length - 1] !== END) throw new Error('unterminated frame');
    const encoded = frame.slice(start, -1);
    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] >= 1 && encoded[i] <= 3) throw new Error('unescaped control byte');
        encoded[i] ^= XOR;
    }
    return cobsDecode(encoded);
};

const initialState = () => ({
    connected: false,
    notificationIntervalMs: null,
    motors: Array.from({length: 6}, () => ({speed: 0, position: 0})),
    sensors: Array.from({length: 6}, () => null),
    battery: 100
});

export class VirtualSpikePrimePeripheral {
    constructor ({id = 'brickwright-virtual-spike-prime', name = 'Brickwright Virtual SPIKE Prime'} = {}) {
        this.id = id;
        this.name = name;
        this.services = [{
            uuid: SPIKE_SERVICE,
            characteristics: [
                {uuid: SPIKE_RX, properties: {write: true, writeWithoutResponse: true}},
                {uuid: SPIKE_TX, properties: {notify: true}}
            ]
        }];
        this.state = initialState();
        this._frame = [];
        this._sink = null;
    }

    connect () {
        this.state.connected = true;
    }

    disconnect () {
        this.state.connected = false;
        this.state.motors.forEach(motor => { motor.speed = 0; });
        this._frame = [];
    }

    setNotificationSink (sink) {
        this._sink = sink;
    }

    onWrite (uuid, bytes) {
        if (uuid !== SPIKE_RX) throw new Error(`unexpected SPIKE write characteristic: ${uuid}`);
        for (const byte of bytes) {
            if (byte === 1) this._frame = [byte];
            else this._frame.push(byte);
            if (byte === END) {
                const payload = unpackSpikeFrame(Uint8Array.from(this._frame));
                this._frame = [];
                this._handleMessage(payload);
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
            // The second BLE extension sends a known Python subset. Its bounded
            // translator is a separate checkpoint; preserve the bytes for it.
            this.state.lastPythonTunnel = text;
            return;
        }
        if (command && command.m === 'motor') {
            const port = Number(command.p && command.p.port);
            if (Number.isInteger(port) && port >= 0 && port < 6) {
                this.state.motors[port].speed = Math.max(-100, Math.min(100, Number(command.p.speed) || 0));
            }
        }
        this.state.lastTunnelCommand = command;
    }
}

export const registerVirtualSpikePrime = options => {
    let lastPeripheral = null;
    const unregister = registerVirtualPeripheral(() => {
        lastPeripheral = new VirtualSpikePrimePeripheral(options);
        return lastPeripheral;
    });
    return {unregister, get peripheral () { return lastPeripheral; }};
};
