// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A virtual WebSocket bridge: the local relay an extension's "bridge" mode dials, served in the page
// by the Robot Lab's virtual bricks instead of a helper program on the user's machine.
//
// A relay forwards a brick's byte stream; each extension decides how the bytes ride the WebSocket,
// and an endpoint here is registered with that framing:
//   - 'binary': ev3comprehensive's BridgeBackend. ws://host:port (default localhost:8080, optional
//     ?token=), binaryType "arraybuffer", ws.send(Uint8Array) of EV3 command frames; replies are
//     ArrayBuffer messages handed to its reassembling _onMessage. Text messages are JSON it only
//     logs ({error}); its "test bridge" sends {"command":"status"} and accepts any JSON back.
//   - 'base64': legonxt's BridgeBackend. ws://localhost:8765 by default; each telegram with its two
//     length bytes is sent as ONE base64 text message, and every message received is base64 of
//     length-prefixed reply telegrams.
//   - 'text': spikeprime's BridgeLink (the 2.x REPL stream). ws://localhost:8081 by default; text
//     both ways (the hub's REPL is a text stream).
// The bytes are routed to a peripheral record ({id, name, available(), open(link) => {receive, close}}),
// the same records the BT-classic registry serves, so the brick behind the bridge is the scene's.

import {createHostPropertyLeases} from './host-property-lease.js';

const endpoints = [];
const acquireBridge = createHostPropertyLeases();

const removeEndpoint = entry => {
    if (!entry.active) return;
    entry.active = false;
    const i = endpoints.indexOf(entry);
    if (i >= 0) endpoints.splice(i, 1);
    const errors = [];
    for (const socket of [...entry.sockets]) {
        try { socket.close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'virtual bridge session cleanup failed');
};

const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);

/**
 * Registers a virtual bridge endpoint. Returns its removal.
 * @param {{port: number, host?: string, framing: 'binary'|'base64'|'text', peripheral: object,
 *          onStatus?: (request: object) => object|null}} endpoint host defaults to loopback
 */
export const registerVirtualBridge = endpoint => {
    if (!endpoint || !Number.isInteger(endpoint.port)) throw new TypeError('a virtual bridge needs a port');
    if (!['binary', 'base64', 'text'].includes(endpoint.framing)) throw new TypeError(`unknown bridge framing ${endpoint.framing}`);
    if (!endpoint.peripheral || typeof endpoint.peripheral.open !== 'function') throw new TypeError('a virtual bridge needs a peripheral');
    if (endpoint.matches !== undefined && typeof endpoint.matches !== 'function') throw new TypeError('a virtual bridge path matcher must be a function');
    const entry = {endpoint, active: true, sockets: new Set()};
    endpoints.push(entry);
    return () => removeEndpoint(entry);
};

export const clearVirtualBridgesForTest = () => {
    const errors = [];
    for (const entry of [...endpoints]) {
        try { removeEndpoint(entry); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'virtual bridge endpoint cleanup failed');
};

/** The endpoint a ws:// URL reaches, or null. */
const bridgeEntryFor = value => {
    let url;
    try { url = new URL(String(value)); } catch { return null; }
    if (!['ws:', 'wss:'].includes(url.protocol)) return null;
    const port = Number(url.port || (url.protocol === 'wss:' ? 443 : 80));
    return endpoints.find(({endpoint: e}) => e.port === port &&
        (e.host ? e.host === url.hostname : loopback(url.hostname)) &&
        (!e.matches || e.matches(url)) &&
        (e.claimUnavailable === true || typeof e.peripheral.available !== 'function' || e.peripheral.available())) || null;
};

export const bridgeEndpointFor = value => bridgeEntryFor(value)?.endpoint || null;

const toBytes = data => {
    if (data instanceof Uint8Array) return data.slice();
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    return null;
};

const base64Encode = bytes => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
};
const base64Decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

/** The WebSocket-shaped end of a virtual relay. */
export class VirtualBridgeSocket {
    constructor (url, endpoint, owner = null) {
        this.url = String(url);
        this.endpoint = endpoint;
        this.readyState = 0;
        this.binaryType = 'blob';
        this.protocol = '';
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        this._listeners = {};
        this.session = null;
        this._decoder = new TextDecoder();
        this._encoder = new TextEncoder();
        this._owner = owner;
        if (owner) owner.sockets.add(this);
        setTimeout(() => {
            if (this.readyState !== 0) return;
            if (owner && !owner.active) { this.close(); return; }
            try {
                const session = endpoint.peripheral.open({
                    send: bytes => {
                        const packet = new Uint8Array(bytes);
                        setTimeout(() => this._deliver(packet), 0);
                    },
                    close: () => this.close()
                });
                // An open callback may synchronously close or unregister itself.
                if (this.readyState !== 0 || (owner && !owner.active)) {
                    if (session && typeof session.close === 'function') session.close();
                    this.close();
                    return;
                }
                if (!session || typeof session.receive !== 'function') throw new TypeError('a virtual bridge session needs receive()');
                this.session = session;
                this.readyState = 1;
            } catch (error) {
                try { this._emit('error', {type: 'error', error}); }
                finally { this.close(1006, 'Virtual brick unavailable'); }
                return;
            }
            this._emit('open', {type: 'open'});
        }, 0);
    }

    addEventListener (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }

    removeEventListener (type, fn) { this._listeners[type] = (this._listeners[type] || []).filter(x => x !== fn); }

    _emit (type, event) {
        if (typeof this[`on${type}`] === 'function') this[`on${type}`](event);
        for (const fn of (this._listeners[type] || []).slice()) fn(event);
    }

    _deliver (bytes) {
        if (this.readyState !== 1) return;
        const framing = this.endpoint.framing;
        let data;
        if (framing === 'binary') {
            const copy = new Uint8Array(bytes);
            data = this.binaryType === 'arraybuffer' ? copy.buffer : copy;
        } else if (framing === 'base64') data = base64Encode(bytes);
        else data = this._decoder.decode(bytes, {stream: true});
        this._emit('message', {type: 'message', data});
    }

    send (data) {
        if (this.readyState !== 1) throw new DOMException('WebSocket is not open', 'InvalidStateError');
        const framing = this.endpoint.framing;
        let bytes;
        if (typeof data === 'string') {
            if (framing === 'base64') bytes = base64Decode(data);
            else if (framing === 'text') bytes = this._encoder.encode(data);
            else {
                // A text message on a binary relay is a control request (ev3comprehensive's status).
                let request = null;
                try { request = JSON.parse(data); } catch { /* not JSON: a relay ignores it */ }
                const reply = request && this.endpoint.onStatus ? this.endpoint.onStatus(request) : null;
                if (reply) setTimeout(() => this.readyState === 1 && this._emit('message', {type: 'message', data: JSON.stringify(reply)}), 0);
                return;
            }
        } else {
            bytes = toBytes(data);
            if (!bytes) throw new TypeError('the virtual bridge takes strings and binary data');
            if (framing !== 'binary') bytes = framing === 'base64' ? base64Decode(this._decoder.decode(bytes)) : bytes;
        }
        if (this.session) this.session.receive(bytes);
    }

    close (code = 1000, reason = '') {
        if (this.readyState === 3) return;
        const opened = this.readyState === 1;
        this.readyState = 3;
        const session = this.session;
        this.session = null;
        if (this._owner) this._owner.sockets.delete(this);
        try {
            if (session && typeof session.close === 'function') session.close();
        } finally {
            setTimeout(() => this._emit('close', {type: 'close', code, reason, wasClean: opened}), 0);
        }
    }
}

/**
 * Wraps host.WebSocket: a URL a registered endpoint serves gets a VirtualBridgeSocket, every other
 * URL the WebSocket that was there before (which may itself be the Scratch Link wrapper). Returns a restore.
 */
export const installVirtualBridge = ({host = typeof window === 'undefined' ? globalThis : window} = {}) => {
    return acquireBridge(host, 'WebSocket', (Before, active) => {
        const Wrapped = function WebSocket (url, protocols) {
            const entry = active() ? bridgeEntryFor(url) : null;
            if (entry) return new VirtualBridgeSocket(url, entry.endpoint, entry);
            if (typeof Before !== 'function') throw new Error('no WebSocket');
            return protocols === undefined ? new Before(url) : new Before(url, protocols);
        };
        if (Before) {
            Wrapped.prototype = Before.prototype;
            Object.setPrototypeOf(Wrapped, Before);
        }
        for (const [key, value] of Object.entries({CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, __brickwrightVirtualBridge: true})) {
            Object.defineProperty(Wrapped, key, {value, configurable: true, writable: true, enumerable: true});
        }
        return Wrapped;
    });
};
