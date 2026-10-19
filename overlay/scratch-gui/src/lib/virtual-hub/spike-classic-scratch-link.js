// SPDX-License-Identifier: Apache-2.0
import VirtualSpikeHubState from './spike-hub-state.js';
import {applyHubPython, applyScratchVerb} from './spike-hub-commands.js';

import {CLASSIC_MESSAGE_MAX_BYTES, isClassicScratchLink, encodeBase64, decodeBase64,
    addClassicSocketClaim, installVirtualClassicScratchLink} from './scratch-link-classic-hook.js';

// The Scratch Link BT plumbing (URL test, base64, the WebSocket wrapper) is the boot hook's
// (scratch-link-classic-hook.js); this module is SPIKE 2.x's REPL served over it, and claims the
// socket first while the virtual SPIKE's Classic simulation is enabled — at boot, without the Robot
// Lab. The Lab's registry (bt-classic-registry.js, lazy) claims after it once that chunk loads.
export {CLASSIC_MESSAGE_MAX_BYTES};
export const CLASSIC_INPUT_MAX_BYTES = 4096;

export class VirtualSpikeClassicSocket {
    constructor (url, {hubState = new VirtualSpikeHubState()} = {}) {
        this.url = String(url);
        this.readyState = 0;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this._listeners = {};
        this._input = '';
        this.hubState = hubState;
        this.state = hubState.data;
        this._unregisterTransport = this.hubState.registerTransport('classic', () => this.close(false));
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
        const next = this._input + text.replaceAll('\x03', '');
        if (new TextEncoder().encode(next).length > CLASSIC_INPUT_MAX_BYTES) {
            this._input = '';
            throw new RangeError('virtual Classic command buffer is too large');
        }
        this._input = next;
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
                this.hubState.setMotorSpeed(port, command.p.speed);
            }
        }
        // Motion verbs go through the hub's motor model. A SPIKE 2 hub answers
        // a motion request when the motion ENDS, which is what lets the Scratch
        // blocks that send one wait for it; this hub does the same.
        const motion = typeof command.m === 'string' ? applyScratchVerb(this.hubState, command.m, command.p || {}) : null;
        if (!motion && command.m === 'scratch.display_clear') {
            this.hubState.setDisplay(Array(25).fill(0));
        } else if (!motion && command.m === 'scratch.display_image' && command.p) {
            this.hubState.setDisplay(String(command.p.image || '').replaceAll(':', '').split('').map(Number));
        } else if (!motion && command.m === 'scratch.display_set_pixel' && command.p) {
            const pixels = [...this.state.display];
            const index = Number(command.p.y) * 5 + Number(command.p.x);
            if (index >= 0 && index < 25) pixels[index] = Number(command.p.brightness) || 0;
            this.hubState.setDisplay(pixels);
        }
        if (command.i === undefined) return;
        const reply = () => { if (this.readyState === 1) this._sendRfcomm(`${JSON.stringify({i: command.i, r: null})}\r\n`); };
        if (motion && motion.done) motion.done.then(reply);
        else reply();
    }

    _translatePython (text) {
        return applyHubPython(this.hubState, text).recognised > 0;
    }

    emitCurrentState () {
        const ports = this.state.classicPorts.map(port => [port[0], [...port[1]]]);
        const payload = [...ports, [], [], [this.state.imu.yaw, this.state.imu.pitch, this.state.imu.roll]];
        this._sendRfcomm(`${JSON.stringify({m: 0, p: payload})}\r\n`);
    }

    close (stop = true) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        if (this._unregisterTransport) { this._unregisterTransport(); this._unregisterTransport = null; }
        this.state.connected = false;
        if (stop) this.hubState.stopAll();
        this._emit('close', {code: 1000, wasClean: true});
    }
}

/**
 * The SPIKE claim on Scratch Link BT sockets (inert unless the virtual SPIKE's simulation is on and
 * its firmware target is not official 3.x), and the one WebSocket wrapper that serves every claim.
 */
export default function installVirtualSpikeClassicScratchLink (hubState = new VirtualSpikeHubState(), options = {}) {
    if (typeof window === 'undefined' && !options.host) return 'unavailable';
    const host = options.host || window;
    if (host.__brickwrightVirtualSpikeClassicClaim) return 'already installed';
    host.__brickwrightVirtualSpikeClassicClaim = addClassicSocketClaim(url => (
        hubState.data.simulationEnabled && hubState.data.firmwareTarget !== 'official-v3' ?
            new VirtualSpikeClassicSocket(url, {hubState}) : null));
    return installVirtualClassicScratchLink({host, ...options});
}

export {isClassicScratchLink};
