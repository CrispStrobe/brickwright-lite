// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A virtual Web Serial port (a `navigator.serial` double) in front of the Robot Lab's virtual bricks.
//
// What it has to speak is set by the extensions that use Web Serial, not by this file:
//   - ev3comprehensive's SerialBackend: navigator.serial.getPorts() (a port already granted, for its
//     `auto` probe) or requestPort(); port.open({baudRate: 115200, flowControl: "none"});
//     port.writable.getWriter().write(Uint8Array); port.readable.getReader().read() in a loop;
//     reader.cancel(), writer.releaseLock(), port.close(). The bytes are EV3 direct/system command
//     frames, each led by its two length bytes, exactly as over Bluetooth (EV3 CDK §4).
//   - legonxt's SerialBackend ("direct" mode): requestPort(); port.open({baudRate: 9600, dataBits: 8,
//     stopBits: 1, parity: "none"}); the same reader/writer calls. The bytes are NXT telegrams with
//     their two Bluetooth length bytes (NXT BDK Appendix 1).
// Both are the byte streams the bricks' existing sessions already cut into frames
// (hubs/ev3/ev3-peripheral.js createEv3Session, hubs/nxt/nxt-peripheral.js createNxtSession), so a
// port here is only a pipe: what is written goes to session.receive(bytes), what the session sends
// is handed to the next read(). Baud rate and line settings are recorded and not judged: a virtual
// pipe has no line.
//
// The ports are the same peripheral records the BT-classic registry holds ({id, name, available(),
// open(link)}), so the registry's virtual EV3 and NXT are the ports a chooser offers by default.

import {availableClassicPeripherals} from '../../virtual-hub/bt-classic-registry.js';

const copy = bytes => (bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes));

/** One virtual port: a SerialPort-shaped object over a peripheral record. */
export class VirtualSerialPort {
    constructor (peripheral, {current = null} = {}) {
        this.peripheral = peripheral;
        this.readable = null;
        this.writable = null;
        this.session = null;
        this.openOptions = null;
        this._controller = null;
        this.onconnect = null;
        this.ondisconnect = null;
        this._disposed = false;
        this._opening = null;
        this._activeToken = null;
        this._identity = typeof peripheral.identity === 'function' ? peripheral.identity() : peripheral;
        this._ownerCurrent = current;
    }

    isCurrent () {
        return !this._disposed &&
            (!this._ownerCurrent || this._ownerCurrent()) &&
            (typeof this.peripheral.identity !== 'function' || this.peripheral.identity() === this._identity) &&
            (typeof this.peripheral.available !== 'function' || this.peripheral.available());
    }

    getInfo () {
        // A USB-serial adapter would report its vendor/product; a virtual one has none.
        return {virtual: true, peripheralId: this.peripheral.id, name: this.peripheral.name};
    }

    async open (options = {}) {
        if (this.session || this._opening) throw new DOMException('The port is already open.', 'InvalidStateError');
        if (!options || !Number.isFinite(Number(options.baudRate)) || Number(options.baudRate) <= 0) {
            // Web Serial requires a baud rate: open() without one is a TypeError there too.
            throw new TypeError('open() needs a baudRate');
        }
        if (!this.isCurrent()) {
            throw new DOMException('The virtual brick is not in the scene.', 'NetworkError');
        }
        const opening = {};
        this._opening = opening;
        this._activeToken = opening;
        this.openOptions = {...options};
        let controller = null;
        this.readable = new ReadableStream({
            start: value => { controller = value; this._controller = value; },
            cancel: () => {
                if (this._activeToken === opening && this._controller === controller) this._controller = null;
            }
        });
        this.writable = new WritableStream({
            write: async chunk => {
                if (this._activeToken !== opening) throw new DOMException('The port is closed.', 'InvalidStateError');
                if (!this.isCurrent()) {
                    await this.close();
                    throw new DOMException('The virtual brick is not in the scene.', 'NetworkError');
                }
                if (!this.session) throw new DOMException('The port is closed.', 'InvalidStateError');
                this.session.receive(copy(chunk));
            }
        });
        let session;
        try {
            session = this.peripheral.open({
                send: bytes => {
                    // A reply lands on a later macrotask, as bytes off a wire do.
                    const packet = copy(bytes);
                    setTimeout(() => {
                        if (this._activeToken === opening && this._controller === controller && this.session === session && this.isCurrent()) {
                            controller.enqueue(packet);
                        }
                    }, 0);
                },
                close: () => this._activeToken === opening ? this.close() : undefined
            });
            if (this._opening !== opening || !this.isCurrent()) {
                if (session && typeof session.close === 'function') session.close();
                throw new DOMException('The virtual brick connection was closed.', 'NetworkError');
            }
            if (!session || typeof session.receive !== 'function') throw new TypeError('a virtual serial session needs receive()');
            this.session = session;
        } catch (error) {
            if (this._activeToken === opening) await this.close();
            throw error;
        } finally {
            if (this._opening === opening) this._opening = null;
        }
    }

    async close () {
        const session = this.session;
        const controller = this._controller;
        this.session = null;
        this._opening = null;
        this._activeToken = null;
        this._controller = null;
        this.readable = null;
        this.writable = null;
        try {
            if (session && typeof session.close === 'function') session.close();
        } finally {
            if (controller) {
                try { controller.close(); } catch { /* already closed or cancelled */ }
            }
        }
    }

    dispose () {
        this._disposed = true;
        return this.close();
    }
}

/**
 * A `navigator.serial` double.
 * @param {object} [options]
 * @param {() => object[]} [options.peripherals] the peripheral records a chooser offers (default:
 *   the BT-classic registry's available ones)
 * @param {(ports: VirtualSerialPort[]) => VirtualSerialPort|null} [options.choose] what the user picks
 *   in requestPort()'s chooser (default: the first port); null is "cancelled"
 * @param {boolean} [options.granted] whether the ports count as already authorised for getPorts()
 */
export const createVirtualSerial = ({peripherals = availableClassicPeripherals, choose = ports => ports[0] || null,
    granted = false} = {}) => {
    const ports = new Map();
    const authorised = new Set();
    let disposed = false;
    const portOf = peripheral => {
        if (disposed || !peripherals().includes(peripheral)) return Promise.resolve(null);
        let slot = ports.get(peripheral.id);
        if (!slot || slot.port.peripheral !== peripheral || !slot.port.isCurrent()) {
            const previous = slot;
            const port = new VirtualSerialPort(peripheral, {current: () => !disposed &&
                ports.get(peripheral.id)?.port === port && peripherals().includes(peripheral)});
            slot = {port, pending: null};
            ports.set(peripheral.id, slot);
            const admitted = slot;
            slot.pending = (async () => {
                try {
                    if (previous) await previous.port.dispose();
                    if (disposed || ports.get(peripheral.id) !== admitted || !admitted.port.isCurrent()) {
                        await admitted.port.dispose();
                        return null;
                    }
                    return admitted.port;
                } catch (error) {
                    await admitted.port.dispose();
                    if (ports.get(peripheral.id) === admitted) ports.delete(peripheral.id);
                    throw error;
                }
            })();
        }
        return slot.pending;
    };
    const offered = async () => {
        if (disposed) return [];
        const current = peripherals();
        const removed = [];
        for (const [id, slot] of ports) {
            if (!current.includes(slot.port.peripheral) || !slot.port.isCurrent()) {
                ports.delete(id);
                removed.push(slot.port.dispose());
            }
        }
        await Promise.all(removed);
        const offeredPorts = await Promise.all(current.map(portOf));
        return disposed ? [] : offeredPorts.filter(port => port && port.isCurrent() && ports.get(port.peripheral.id)?.port === port);
    };
    return {
        __brickwrightVirtualSerial: true,
        async getPorts () {
            return (await offered()).filter(port => granted || authorised.has(port));
        },
        async requestPort () {
            const port = choose(await offered());
            // Web Serial rejects with NotFoundError when the chooser closes with nothing picked.
            if (!port || disposed || !port.isCurrent()) throw new DOMException('No port selected by the user.', 'NotFoundError');
            authorised.add(port);
            return port;
        },
        addEventListener () {},
        removeEventListener () {},
        dispose () {
            disposed = true;
            authorised.clear();
            const pending = [...ports.values()].map(slot => slot.port.dispose());
            ports.clear();
            return Promise.all(pending);
        }
    };
};

const installations = new WeakMap();

/**
 * Puts a virtual `navigator.serial` on `host` (window.navigator in the app). Returns a restore function.
 * A real Web Serial, when the browser has one, is replaced only while the double is installed.
 */
export const installVirtualSerial = ({host = typeof navigator === 'undefined' ? null : navigator, ...options} = {}) => {
    if (!host) return () => {};
    let record = installations.get(host);
    if (!record || host.serial !== record.facade) {
        const before = host.serial;
        const descriptor = Object.getOwnPropertyDescriptor(host, 'serial');
        const owners = [];
        const current = () => owners.length ? owners[owners.length - 1].serial : before;
        const facade = {
            __brickwrightVirtualSerial: true,
            getPorts (...args) { return current()?.getPorts?.(...args) || Promise.resolve([]); },
            requestPort (...args) {
                const serial = current();
                if (!serial || typeof serial.requestPort !== 'function') {
                    return Promise.reject(new DOMException('No serial port is available.', 'NotFoundError'));
                }
                return serial.requestPort(...args);
            },
            addEventListener (...args) { current()?.addEventListener?.(...args); },
            removeEventListener (...args) { current()?.removeEventListener?.(...args); }
        };
        record = {facade, descriptor, owners};
        Object.defineProperty(host, 'serial', {value: facade, configurable: true, writable: true,
            enumerable: descriptor ? descriptor.enumerable : true});
        installations.set(host, record);
    }
    const serial = createVirtualSerial(options);
    const owner = {serial};
    record.owners.push(owner);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const i = record.owners.indexOf(owner);
        if (i >= 0) record.owners.splice(i, 1);
        if (record.owners.length === 0) {
            if (installations.get(host) === record) installations.delete(host);
            if (host.serial === record.facade) {
                if (record.descriptor) Object.defineProperty(host, 'serial', record.descriptor);
                else delete host.serial;
            }
        }
        return serial.dispose();
    };
};
