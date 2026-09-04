// SPDX-License-Identifier: Apache-2.0

const isClassicScratchLink = url => /:(20110|20111)\//.test(String(url)) && /\/bt\b|\/scratch\/bt/.test(String(url));
const encodeBase64 = bytes => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};
const decodeBase64 = text => {
    const binary = atob(text);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const initialClassicState = () => ({
    connected: false,
    battery: 100,
    ports: Array.from({length: 6}, () => [0, []]),
    imu: {yaw: 0, pitch: 0, roll: 0},
    buttons: {left: false, center: false, right: false},
    lastCommand: null,
    lastPython: null
});

export class VirtualSpikeClassicSocket {
    constructor (url) {
        this.url = String(url);
        this.readyState = 0;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this._listeners = {};
        this._input = '';
        this.state = initialClassicState();
        queueMicrotask(() => {
            if (this.readyState !== 0) return;
            this.readyState = 1;
            this._emit('open', new Event('open'));
        });
    }

    addEventListener (type, callback) {
        (this._listeners[type] = this._listeners[type] || []).push(callback);
    }

    removeEventListener (type, callback) {
        this._listeners[type] = (this._listeners[type] || []).filter(item => item !== callback);
    }

    _emit (type, event) {
        if (typeof this[`on${type}`] === 'function') this[`on${type}`](event);
        for (const callback of this._listeners[type] || []) callback(event);
    }

    _json (value) {
        this._emit('message', {data: JSON.stringify(value)});
    }

    _result (request, result = null) {
        if (Object.prototype.hasOwnProperty.call(request, 'id')) {
            this._json({jsonrpc: '2.0', id: request.id, result});
        }
    }

    send (frame) {
        if (this.readyState !== 1) throw new Error('virtual Scratch Link socket is not open');
        let request;
        try {
            request = JSON.parse(String(frame));
        } catch (_) {
            return;
        }
        const {method, params = {}} = request;
        if (method === 'discover') {
            this._result(request);
            queueMicrotask(() => this._json({
                jsonrpc: '2.0',
                method: 'didDiscoverPeripheral',
                params: {
                    peripheralId: 'brickwright-virtual-spike-classic',
                    name: 'Brickwright Virtual SPIKE Prime (Classic)',
                    rssi: -30
                }
            }));
        } else if (method === 'connect') {
            this.state.connected = true;
            this._result(request);
        } else if (method === 'send') {
            this._receiveRfcomm(params);
            this._result(request);
        } else if (method === 'ping') {
            this._result(request, 42);
        } else {
            this._result(request);
        }
    }

    _receiveRfcomm (params) {
        if (params.encoding !== 'base64' || typeof params.message !== 'string') {
            throw new Error('virtual Classic transport requires base64 bytes');
        }
        const text = new TextDecoder().decode(decodeBase64(params.message));
        if (text.includes('\x03')) this._input = '';
        this._input += text.replaceAll('\x03', '');
        const records = this._input.split(/\r\n|\r|\n/);
        this._input = records.pop();
        for (const record of records) {
            const trimmed = record.trim();
            if (trimmed) this._handleRecord(trimmed);
        }
    }

    _sendRfcomm (text) {
        const message = encodeBase64(new TextEncoder().encode(text));
        this._json({jsonrpc: '2.0', method: 'didReceiveMessage', params: {message, encoding: 'base64'}});
    }

    _handleRecord (record) {
        let command;
        try {
            command = JSON.parse(record);
        } catch (_) {
            this.state.lastPython = record;
            if (/print\(["']PYTHON_AVAILABLE["']\)/.test(record)) this._sendRfcomm('PYTHON_AVAILABLE\r\n');
            else this._translatePython(record);
            return;
        }
        this.state.lastCommand = command;
        if (command.m === 'trigger_current_state') this.emitCurrentState();
        if (command.m === 'motor' && command.p) {
            const port = Number(command.p.port);
            if (Number.isInteger(port) && port >= 0 && port < 6) {
                this.state.ports[port] = [48, [Number(command.p.speed) || 0, 0, 0, 0]];
            }
        }
        if (command.i !== undefined) this._sendRfcomm(`${JSON.stringify({i: command.i, r: null})}\r\n`);
    }

    _translatePython (text) {
        const pwm = /hub\.port\.([A-F])\.motor\.pwm\((-?\d+(?:\.\d+)?)\)/.exec(text);
        if (pwm) {
            const port = 'ABCDEF'.indexOf(pwm[1]);
            this.state.ports[port] = [48, [Number(pwm[2]), 0, 0, Number(pwm[2])]];
            return true;
        }
        const stop = /hub\.port\.([A-F])\.motor\.stop\(\)/.exec(text);
        if (stop) {
            const port = 'ABCDEF'.indexOf(stop[1]);
            this.state.ports[port] = [48, [0, 0, 0, 0]];
            return true;
        }
        return false;
    }

    emitCurrentState () {
        const ports = this.state.ports.map(port => [port[0], [...port[1]]]);
        const payload = [...ports, [], [], [this.state.imu.yaw, this.state.imu.pitch, this.state.imu.roll]];
        this._sendRfcomm(`${JSON.stringify({m: 0, p: payload})}\r\n`);
    }

    close () {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.state.connected = false;
        for (const port of this.state.ports) if (port[0] === 48 || port[0] === 49) port[1][0] = 0;
        this._emit('close', {code: 1000, wasClean: true});
    }
}

export default function installVirtualSpikeClassicScratchLink () {
    if (typeof window === 'undefined' || typeof window.WebSocket !== 'function') return 'unavailable';
    if (window.WebSocket.__brickwrightVirtualSpikeClassic) return 'already installed';
    const NativeWebSocket = window.WebSocket;
    const Wrapped = function WebSocket (url, protocols) {
        if (globalThis.__brickwrightUseVirtualSpike === true && isClassicScratchLink(url)) {
            return new VirtualSpikeClassicSocket(url);
        }
        return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    };
    Wrapped.prototype = NativeWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[key] = NativeWebSocket[key];
    Wrapped.__brickwrightVirtualSpikeClassic = true;
    window.WebSocket = Wrapped;
    return 'installed';
}

export {isClassicScratchLink};
