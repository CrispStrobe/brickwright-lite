// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Scratch Link Bluetooth-Classic (RFCOMM) virtual peripheral registry
// (docs/ROBOT-LAB-HUBS-PLAN.md P0; docs/ROBOT-LAB-EV3-NXT.md "The transport").
//
// Scratch Link's BT endpoint (ws://127.0.0.1:20111/scratch/bt and the older
// wss://device-manager.scratch.mit.edu:20110/scratch/bt) speaks JSON-RPC 2.0:
//
//   → discover {majorDeviceClass, minorDeviceClass}   ← result; then didDiscoverPeripheral {peripheralId, name, rssi}
//   → connect {peripheralId, pin}                     ← result (or an error)
//   → send {message: base64, encoding: 'base64'}      ← result; the brick's bytes come back as
//                                                        didReceiveMessage {message: base64, encoding: 'base64'}
//
// That is what every BT-classic extension the app ships uses (the stock `ev3`, `ev3comprehensive`,
// `legonxt`, SPIKE's 2.x REPL route), so swapping the SOCKET underneath them is how the Robot Lab
// tests the real extensions: an extension dials Scratch Link, finds "Virtual EV3", and its direct
// command bytes reach the simulated brick unchanged.
//
// A peripheral is registered with
//   {id, name, majorDeviceClass?, minorDeviceClass?, available(): boolean, open(link) => session}
// where link = {send(bytes), close()} carries the brick's replies back, and the session takes
//   receive(bytes) per `send` and close() when the socket goes.
// It is announced to a `discover` whose device class matches (an absent class on either side
// matches anything) while available() is true. With nothing available, a Scratch Link URL falls
// through to the real WebSocket: a real Scratch Link and a real brick keep working.
//
// This module is the Robot Lab's (its chunk, bw-sim-lab), never the first load's: the URL test,
// base64 and the WebSocket wrapper it serves through are the boot hook's
// (scratch-link-classic-hook.js), and the registry's claim joins that wrapper, after SPIKE's, when
// this module loads.
//
// Replies are delivered on a later macrotask, after the JSON-RPC result of the `send` that caused
// them: the stock and NXT extensions only start waiting for a reply once their `send` resolved, so a
// reply that overtook the result would be dropped, as it never is on the real link.

import {CLASSIC_MESSAGE_MAX_BYTES, isClassicScratchLink, encodeBase64, decodeBase64, addClassicSocketClaim,
    installVirtualClassicScratchLink} from './scratch-link-classic-hook.js';

export {CLASSIC_MESSAGE_MAX_BYTES, isClassicScratchLink, encodeBase64, decodeBase64, addClassicSocketClaim,
    installVirtualClassicScratchLink};

/** Registered peripherals by id. One registry per page (the Robot Lab chunk and the app share it). */
const peripherals = new Map();

/**
 * Registers a virtual BT-classic peripheral. Returns an unregister function.
 * @param {{id: string, name: string, majorDeviceClass?: number, minorDeviceClass?: number,
 *          available?: () => boolean, open: (link: {send: Function, close: Function}) => {receive: Function, close?: Function}}} peripheral
 */
export const registerVirtualClassicPeripheral = peripheral => {
    if (!peripheral || typeof peripheral.id !== 'string' || !peripheral.id) throw new TypeError('a virtual peripheral needs an id');
    if (typeof peripheral.open !== 'function') throw new TypeError(`virtual peripheral ${peripheral.id} needs open(link)`);
    if (peripherals.has(peripheral.id)) throw new Error(`virtual peripheral ${peripheral.id} is registered twice`);
    peripherals.set(peripheral.id, peripheral);
    return () => { if (peripherals.get(peripheral.id) === peripheral) peripherals.delete(peripheral.id); };
};

const isAvailable = p => (typeof p.available === 'function' ? Boolean(p.available()) : true);

/** The registered peripherals a discover would find now. */
export const availableClassicPeripherals = () => [...peripherals.values()].filter(isAvailable);

/** Tests: forget every registration. */
export const clearVirtualClassicPeripheralsForTest = () => peripherals.clear();

const classMatches = (peripheral, params) => ['majorDeviceClass', 'minorDeviceClass'].every(key =>
    params[key] === undefined || peripheral[key] === undefined || Number(params[key]) === Number(peripheral[key]));

/** Runs fn on a later macrotask (the browser's own timer: replies are transport, not program time). */
const later = fn => {
    const timer = (typeof window !== 'undefined' && window.setTimeout) ? window.setTimeout.bind(window) : setTimeout;
    timer(fn, 0);
};

/**
 * A WebSocket-shaped Scratch Link BT socket served by the registry. `peripherals` (default: the
 * registry's available ones at each discover) is what a discover announces.
 */
export class VirtualClassicSocket {
    constructor (url, {peripherals: fixed = null} = {}) {
        this.url = String(url);
        this.readyState = 0;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this._listeners = {};
        this._fixed = fixed;
        this._known = new Map();
        this.peripheral = null;
        this.session = null;
        queueMicrotask(() => {
            if (this.readyState !== 0) return;
            this.readyState = 1;
            this._emit('open', {type: 'open'});
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
        if (this.readyState !== 1) return;
        this._emit('message', {data: JSON.stringify(value)});
    }

    _result (request, result = null) {
        if (Object.prototype.hasOwnProperty.call(request, 'id')) this._json({jsonrpc: '2.0', id: request.id, result});
    }

    _error (request, message) {
        if (Object.prototype.hasOwnProperty.call(request, 'id')) {
            this._json({jsonrpc: '2.0', id: request.id, error: {code: -32000, message}});
        }
    }

    _candidates () {
        return this._fixed ? this._fixed.filter(isAvailable) : availableClassicPeripherals();
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
            const found = this._candidates().filter(p => classMatches(p, params));
            queueMicrotask(() => {
                for (const p of found) {
                    this._known.set(p.id, p);
                    this._json({jsonrpc: '2.0', method: 'didDiscoverPeripheral',
                        params: {peripheralId: p.id, name: p.name, rssi: -30}});
                }
            });
        } else if (method === 'connect') {
            const p = this._known.get(params.peripheralId) || this._candidates().find(c => c.id === params.peripheralId);
            if (!p || !isAvailable(p)) {
                this._error(request, `no virtual peripheral ${params.peripheralId}`);
                return;
            }
            if (this.session) this._closeSession();
            this.peripheral = p;
            this.session = p.open({
                send: bytes => later(() => this._json({jsonrpc: '2.0', method: 'didReceiveMessage',
                    params: {message: encodeBase64(bytes), encoding: 'base64'}})),
                close: () => this.close()
            });
            this._result(request);
        } else if (method === 'send') {
            if (!this.session) {
                this._error(request, 'not connected');
                return;
            }
            if (params.encoding !== 'base64' || typeof params.message !== 'string') {
                this._error(request, 'virtual Classic transport requires base64 bytes');
                return;
            }
            const bytes = decodeBase64(params.message);
            this._result(request);
            this.session.receive(bytes);
        } else if (method === 'ping') {
            this._result(request, 42);
        } else {
            this._result(request);
        }
    }

    _closeSession () {
        const session = this.session;
        this.session = null;
        this.peripheral = null;
        if (session && typeof session.close === 'function') session.close();
    }

    close () {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this._closeSession();
        this._emit('close', {code: 1000, wasClean: true});
    }
}

/** The registry's own claim: a VirtualClassicSocket while any registered peripheral is available. */
const registryClaim = url => (availableClassicPeripherals().length ? new VirtualClassicSocket(url) : null);
addClassicSocketClaim(registryClaim, {fallback: true});
