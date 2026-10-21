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
    constructor (peripheral) {
        this.peripheral = peripheral;
        this.readable = null;
        this.writable = null;
        this.session = null;
        this.openOptions = null;
        this._controller = null;
        this.onconnect = null;
        this.ondisconnect = null;
    }

    getInfo () {
        // A USB-serial adapter would report its vendor/product; a virtual one has none.
        return {virtual: true, peripheralId: this.peripheral.id, name: this.peripheral.name};
    }

    async open (options = {}) {
        if (this.session) throw new DOMException('The port is already open.', 'InvalidStateError');
        if (!options || !Number.isFinite(Number(options.baudRate)) || Number(options.baudRate) <= 0) {
            // Web Serial requires a baud rate: open() without one is a TypeError there too.
            throw new TypeError('open() needs a baudRate');
        }
        if (typeof this.peripheral.available === 'function' && !this.peripheral.available()) {
            throw new DOMException('The virtual brick is not in the scene.', 'NetworkError');
        }
        this.openOptions = {...options};
        this.readable = new ReadableStream({
            start: controller => { this._controller = controller; },
            cancel: () => { this._controller = null; }
        });
        this.writable = new WritableStream({
            write: chunk => {
                if (!this.session) throw new DOMException('The port is closed.', 'InvalidStateError');
                this.session.receive(copy(chunk));
            }
        });
        this.session = this.peripheral.open({
            send: bytes => {
                // A reply lands on a later macrotask, as bytes off a wire do.
                setTimeout(() => {
                    if (this._controller) this._controller.enqueue(copy(bytes));
                }, 0);
            },
            close: () => { this.close(); }
        });
    }

    async close () {
        const session = this.session;
        this.session = null;
        if (session && typeof session.close === 'function') session.close();
        if (this._controller) {
            try { this._controller.close(); } catch { /* already closed or cancelled */ }
            this._controller = null;
        }
        this.readable = null;
        this.writable = null;
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
    const portOf = peripheral => {
        if (!ports.has(peripheral.id)) ports.set(peripheral.id, new VirtualSerialPort(peripheral));
        return ports.get(peripheral.id);
    };
    const offered = () => peripherals().map(portOf);
    return {
        __brickwrightVirtualSerial: true,
        async getPorts () {
            return offered().filter(port => granted || authorised.has(port));
        },
        async requestPort () {
            const port = choose(offered());
            // Web Serial rejects with NotFoundError when the chooser closes with nothing picked.
            if (!port) throw new DOMException('No port selected by the user.', 'NotFoundError');
            authorised.add(port);
            return port;
        },
        addEventListener () {},
        removeEventListener () {}
    };
};

/**
 * Puts a virtual `navigator.serial` on `host` (window.navigator in the app). Returns a restore function.
 * A real Web Serial, when the browser has one, is replaced only while the double is installed.
 */
export const installVirtualSerial = ({host = typeof navigator === 'undefined' ? null : navigator, ...options} = {}) => {
    if (!host) return () => {};
    const had = Object.prototype.hasOwnProperty.call(host, 'serial');
    const before = host.serial;
    const serial = createVirtualSerial(options);
    Object.defineProperty(host, 'serial', {value: serial, configurable: true, writable: true});
    return () => {
        if (had) Object.defineProperty(host, 'serial', {value: before, configurable: true, writable: true});
        else delete host.serial;
    };
};
