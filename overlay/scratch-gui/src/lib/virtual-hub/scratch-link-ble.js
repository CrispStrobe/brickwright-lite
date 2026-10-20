// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A Scratch Link BLE socket double (docs/ROBOT-LAB-HUBS-PLAN.md P0): the virtual
// peripherals of the Web Bluetooth registry (web-bluetooth-shim.js
// registerVirtualPeripheral) offered over the OTHER route the LEGO extensions use,
// Scratch Link's JSON-RPC 2.0 WebSocket at `/scratch/ble`. scratch-vm's own
// io/ble.js (stock boost, wedo2), and the CrispStrobe extensions' Scratch Link
// adapters (legopoweredup, legoboostunified, wedo2unified) speak this protocol:
//
//   page → Scratch Link   discover {filters, optionalServices}   (reply null at once; then the
//                                                               scan streams didDiscoverPeripheral)
//                         connect {peripheralId}
//                         read {serviceId, characteristicId, startNotifications?}  → {message, encoding}
//                         write {serviceId, characteristicId, message, encoding, withResponse?}
//                         startNotifications / stopNotifications {serviceId, characteristicId}
//                         getServices, ping
//   Scratch Link → page   didDiscoverPeripheral {peripheralId, name, rssi}
//                         characteristicDidChange {serviceId, characteristicId, message, encoding}
//
// (Scratch Link's network protocol, scratch-link's NETWORK-PROTOCOL.md, BSD-3-Clause, LLK; and
// scratch-vm src/io/ble.js, which is in this repository.) Bytes are base64.
//
// WHEN IT ANSWERS. Only while a host has installed a virtual chooser
// (`__brickwrightChooseVirtualBluetooth`, connectVirtualHub's, connect-virtual-hub.js) AND a
// virtual peripheral is registered: then a Scratch Link BLE URL opens this double instead of a
// socket. Any other time — no registry entry (a headless test), no chooser (the user clicked
// the extension's own Connect: their real Scratch Link) — the URL reaches the page's real
// WebSocket unchanged. BT-classic (`/scratch/bt`) is never touched here.

import {virtualFactories, matchesVirtual, chooseVirtual} from './web-bluetooth-shim.js';
import {canonicalUuid} from '../native-web-bluetooth.js';

const dispose = peripheral => peripheral && typeof peripheral.dispose === 'function' && peripheral.dispose();

/** Whether any virtual peripheral factory is registered (web-bluetooth-shim.js registerVirtualPeripheral). */
const hasVirtualPeripherals = () => virtualFactories.size > 0;

/**
 * One fresh peripheral per factory that matches `options` (Web Bluetooth's requestDevice filters;
 * Scratch Link's `discover` filters have the same shape: services, name, namePrefix). Factories
 * that answer null (a simulation switched off) offer nothing; a peripheral that does not match is
 * disposed at once.
 */
const virtualCandidates = options => {
    const created = [...virtualFactories].map(factory => factory()).filter(Boolean);
    const candidates = created.filter(p => matchesVirtual(p, options || {}));
    for (const peripheral of created) if (!candidates.includes(peripheral)) dispose(peripheral);
    return candidates;
};

/** Disposes every candidate but `keep` (the one a chooser picked). */
const disposeVirtualCandidates = (candidates, keep = null) => {
    for (const candidate of candidates) if (candidate !== keep) dispose(candidate);
};

/** The largest base64 message a write may carry (a GATT write is ≤ 512 bytes; generous). */
export const BLE_MESSAGE_MAX_BYTES = 4096;

const isScratchLinkBle = value => {
    let url;
    try { url = new URL(String(value)); } catch (_) { return false; }
    const host = ['127.0.0.1', 'localhost', '[::1]', 'device-manager.scratch.mit.edu'].includes(url.hostname);
    return host && ['ws:', 'wss:'].includes(url.protocol) && ['20110', '20111'].includes(url.port) &&
        (/^\/ble(?:\/|$)/.test(url.pathname) || /^\/scratch\/ble(?:\/|$)/.test(url.pathname));
};

const toBase64 = bytes => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

const fromBase64 = text => {
    if (typeof text !== 'string' || text.length > Math.ceil(BLE_MESSAGE_MAX_BYTES / 3) * 4) {
        throw new RangeError('virtual Scratch Link BLE message is too large');
    }
    return Uint8Array.from(atob(text), character => character.charCodeAt(0));
};

const decodeMessage = params => {
    const encoding = params.encoding || 'base64';
    if (encoding === 'base64') return fromBase64(params.message);
    if (encoding === 'utf8') return new TextEncoder().encode(String(params.message));
    throw new Error(`unsupported encoding ${encoding}`);
};

/** JSON-RPC error codes Scratch Link answers with. */
const RPC_ERROR = Object.freeze({invalidParams: -32602, methodNotFound: -32601, internal: -32603});

/**
 * A WebSocket-shaped Scratch Link BLE session over the virtual peripheral registry. One
 * instance is one socket: one discovery, at most one connected peripheral.
 */
export class VirtualScratchLinkBleSocket {
    constructor (url) {
        this.url = String(url);
        this.readyState = 0;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this._listeners = {};
        /** peripheralId → VirtualPeripheral offered by the last discover */
        this._offered = new Map();
        this._candidates = [];
        this.peripheral = null;
        /** The canonical service ids the last discover allowed (filters + optionalServices). */
        this._allowed = new Set();
        this._notifying = new Set();
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
        if (this.readyState !== 1) return;
        this._emit('message', {data: JSON.stringify(value)});
    }

    _reply (request, result = null) {
        if (Object.prototype.hasOwnProperty.call(request, 'id')) this._json({jsonrpc: '2.0', id: request.id, result});
    }

    _error (request, message, code = RPC_ERROR.internal) {
        if (Object.prototype.hasOwnProperty.call(request, 'id')) this._json({jsonrpc: '2.0', id: request.id, error: {code, message}});
    }

    _notify (method, params) {
        this._json({jsonrpc: '2.0', method, params});
    }

    send (frame) {
        if (this.readyState !== 1) throw new Error('virtual Scratch Link socket is not open');
        let request;
        try {
            request = JSON.parse(String(frame));
        } catch (_) {
            return;
        }
        // Each request is answered asynchronously, as over a real socket.
        Promise.resolve().then(() => this._handle(request)).catch(error => this._error(request, error.message));
    }

    async _handle (request) {
        const {method, params = {}} = request;
        switch (method) {
        case 'discover': return this._discover(request, params);
        case 'connect': return this._connect(request, params);
        case 'write': return this._write(request, params);
        case 'read': return this._read(request, params);
        case 'startNotifications': return this._startNotifications(request, params);
        case 'stopNotifications':
            this._notifying.delete(this._key(params));
            return this._reply(request);
        case 'getServices':
            return this._reply(request, this.peripheral ? this.peripheral.services.map(s => canonicalUuid(s.uuid)) : []);
        case 'ping': return this._reply(request, 42);
        case 'getVersion': return this._reply(request, {protocol: '1.3'});
        default: return this._error(request, `method ${method} is not offered by the virtual Scratch Link`, RPC_ERROR.methodNotFound);
        }
    }

    _discover (request, params) {
        const filters = Array.isArray(params.filters) ? params.filters : [];
        if (filters.length === 0) return this._error(request, 'discover needs filters', RPC_ERROR.invalidParams);
        disposeVirtualCandidates(this._candidates);
        // Scratch Link's filters carry manufacturerData as {companyId: {dataPrefix, mask}}; a
        // peripheral that advertises manufacturer data (LWP3 hubs: company 0x0397, docs §2) is
        // matched on it, one without is not offered to such a filter.
        const plain = filters.map(({manufacturerData, ...rest}) => rest);
        const candidates = virtualCandidates({filters: plain}).filter(p => filters.some(f => manufacturerMatches(p, f)));
        this._candidates = candidates;
        this._allowed = new Set([...filters.flatMap(f => f.services || []), ...(params.optionalServices || [])].map(canonicalUuid));
        this._reply(request);
        this._offered.clear();
        candidates.forEach((peripheral, index) => {
            const peripheralId = `brickwright-virtual-${index}-${peripheral.id}`;
            this._offered.set(peripheralId, peripheral);
            queueMicrotask(() => this._notify('didDiscoverPeripheral', {peripheralId, name: peripheral.name, rssi: -40}));
        });
    }

    async _connect (request, params) {
        const offered = this._offered.get(params.peripheralId);
        if (!offered) return this._error(request, `no peripheral ${params.peripheralId}`, RPC_ERROR.invalidParams);
        // The host's chooser decides (connectVirtualHub picks its hub); without one it is the one asked for.
        let selected = offered;
        if (typeof globalThis.__brickwrightChooseVirtualBluetooth === 'function') {
            selected = await chooseVirtual([offered], false);
            if (selected !== offered) return this._error(request, 'the virtual chooser refused this peripheral');
        }
        if (this.peripheral) this._disconnectPeripheral();
        disposeVirtualCandidates(this._candidates, selected);
        this._candidates = [selected];
        this.peripheral = selected;
        if (typeof selected.connect === 'function') await selected.connect();
        if (typeof selected.setNotificationSink === 'function') {
            selected.setNotificationSink((uuid, bytes) => this._onPeripheralNotify(uuid, bytes));
        }
        return this._reply(request);
    }

    _serviceOf (characteristicId) {
        const wanted = canonicalUuid(characteristicId);
        const service = this.peripheral.services.find(s => (s.characteristics || []).some(c => canonicalUuid(c.uuid) === wanted));
        return service ? canonicalUuid(service.uuid) : null;
    }

    /** The checks Scratch Link makes before touching a characteristic. */
    _resolve (params) {
        if (!this.peripheral) throw new Error('not connected');
        const serviceId = canonicalUuid(params.serviceId);
        const characteristicId = canonicalUuid(params.characteristicId);
        if (!this._allowed.has(serviceId)) throw new Error(`attempt to access unexpected service: ${params.serviceId}`);
        const service = this.peripheral.services.find(s => canonicalUuid(s.uuid) === serviceId);
        if (!service || !(service.characteristics || []).some(c => canonicalUuid(c.uuid) === characteristicId)) {
            throw new Error(`no characteristic ${params.characteristicId} on service ${params.serviceId}`);
        }
        return {serviceId, characteristicId};
    }

    _key ({serviceId, characteristicId}) {
        return `${canonicalUuid(serviceId)}/${canonicalUuid(characteristicId)}`;
    }

    async _write (request, params) {
        const {characteristicId} = this._resolve(params);
        const bytes = decodeMessage(params);
        if (bytes.length > BLE_MESSAGE_MAX_BYTES) throw new RangeError('write too large');
        await this.peripheral.onWrite(characteristicId, bytes, params.withResponse === true);
        return this._reply(request, bytes.length);
    }

    async _read (request, params) {
        const {serviceId, characteristicId} = this._resolve(params);
        if (typeof this.peripheral.read !== 'function') throw new Error(`characteristic ${characteristicId} is not readable`);
        const bytes = Uint8Array.from(await this.peripheral.read(characteristicId));
        this._reply(request, {serviceId, characteristicId, message: toBase64(bytes), encoding: 'base64'});
        if (params.startNotifications) this._subscribed(serviceId, characteristicId);
    }

    _startNotifications (request, params) {
        const {serviceId, characteristicId} = this._resolve(params);
        this._reply(request);
        this._subscribed(serviceId, characteristicId);
    }

    /** A subscription is in place: the peripheral may speak (web-bluetooth-shim.js onStartNotifications). */
    _subscribed (serviceId, characteristicId) {
        this._notifying.add(this._key({serviceId, characteristicId}));
        if (this.peripheral && typeof this.peripheral.onStartNotifications === 'function') {
            this.peripheral.onStartNotifications(characteristicId);
        }
    }

    _onPeripheralNotify (uuid, bytes) {
        const characteristicId = canonicalUuid(uuid);
        const serviceId = this._serviceOf(characteristicId);
        if (!serviceId || !this._notifying.has(`${serviceId}/${characteristicId}`)) return;
        this._notify('characteristicDidChange', {serviceId, characteristicId, message: toBase64(bytes), encoding: 'base64'});
    }

    _disconnectPeripheral () {
        const p = this.peripheral;
        this.peripheral = null;
        this._notifying.clear();
        if (!p) return;
        if (typeof p.setNotificationSink === 'function') p.setNotificationSink(null);
        if (typeof p.disconnect === 'function') p.disconnect();
    }

    close () {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this._disconnectPeripheral();
        disposeVirtualCandidates(this._candidates);
        this._candidates = [];
        this._emit('close', {code: 1000, wasClean: true});
    }
}

/**
 * Whether a peripheral passes a Scratch Link filter's manufacturerData: every company id named
 * must be advertised with bytes that equal dataPrefix under mask. A filter without it passes.
 */
export const manufacturerMatches = (peripheral, filter) => {
    const wanted = filter && filter.manufacturerData;
    if (!wanted || typeof wanted !== 'object') return true;
    const advertised = peripheral.manufacturerData || {};
    return Object.entries(wanted).every(([company, {dataPrefix = [], mask = []} = {}]) => {
        const data = advertised[Number(company)];
        if (!data) return false;
        return dataPrefix.every((byte, i) => {
            const m = mask[i] === undefined ? 0xff : mask[i];
            return (data[i] & m) === (byte & m);
        });
    });
};

/** Whether a Scratch Link BLE socket opened now would reach the double (see the header). */
export const virtualScratchLinkActive = () =>
    typeof globalThis.__brickwrightChooseVirtualBluetooth === 'function' && hasVirtualPeripherals();

/**
 * Wrap the page's WebSocket so Scratch Link BLE URLs reach the double while it is active.
 * Additive and idempotent: every other URL, and these when inactive, open the WebSocket that
 * was installed before (the native Scratch Link bridge's fallback, the browser's own).
 */
export default function installVirtualScratchLinkBle (win = typeof window === 'undefined' ? null : window) {
    if (!win || typeof win.WebSocket !== 'function') return 'unavailable';
    if (win.WebSocket.__brickwrightVirtualScratchLinkBle) return 'already installed';
    const Previous = win.WebSocket;
    const Wrapped = function WebSocket (url, protocols) {
        if (isScratchLinkBle(url) && virtualScratchLinkActive()) return new VirtualScratchLinkBleSocket(url);
        return protocols === undefined ? new Previous(url) : new Previous(url, protocols);
    };
    Wrapped.prototype = Previous.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[key] = Previous[key];
    Wrapped.__brickwrightVirtualScratchLinkBle = true;
    win.WebSocket = Wrapped;
    return 'installed';
}

export {isScratchLinkBle};
