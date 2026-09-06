/**
 * Additive in-memory Web Bluetooth devices for Brickwright's virtual lab.
 *
 * Real Web Bluetooth (or the native-app shim) remains the default delegate.
 * With an empty registry every call is forwarded with the original options and
 * return value. Virtual devices implement the same small GATT surface used by
 * the LEGO extensions, so protocol emulators do not depend on browser or Tauri
 * internals.
 *
 * A VirtualPeripheral factory returns:
 * - `id`, `name`, and `services`, where each service has `uuid` and
 *   `characteristics` (`uuid` plus optional Web Bluetooth properties);
 * - optional `connect()` and `disconnect()` lifecycle methods;
 * - optional `read(uuid)` returning bytes;
 * - `onWrite(uuid, bytes, withResponse)` accepting bytes;
 * - optional `setNotificationSink(fn)`, where `fn(uuid, bytes)` emits a GATT
 *   notification. The sink is removed by passing `null` on disconnect.
 */

import {canonicalUuid} from '../native-web-bluetooth.js';

const factories = new Set();

const asDataView = value => {
    if (value instanceof DataView) return value;
    if (ArrayBuffer.isView(value)) return new DataView(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new DataView(value);
    throw new TypeError('value must be an ArrayBuffer or typed array');
};

const copyBytes = value => {
    const view = asDataView(value);
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
};

const matches = (peripheral, options) => {
    const filters = options.acceptAllDevices ? [] : (options.filters || []);
    if (filters.length === 0) return !!options.acceptAllDevices;
    const services = new Set((peripheral.services || []).map(service => canonicalUuid(service.uuid)));
    return filters.some(filter => {
        if (filter.name && peripheral.name !== filter.name) return false;
        if (filter.namePrefix && !String(peripheral.name || '').startsWith(filter.namePrefix)) return false;
        return (filter.services || []).every(uuid => services.has(canonicalUuid(uuid)));
    });
};

class VirtualCharacteristic extends EventTarget {
    constructor (service, definition) {
        super();
        this.service = service;
        this.uuid = canonicalUuid(definition.uuid);
        this.properties = definition.properties || {
            read: true,
            write: true,
            writeWithoutResponse: true,
            notify: true
        };
        this.value = null;
        this._notifying = false;
    }

    async readValue () {
        const read = this.service._server._peripheral.read;
        if (typeof read !== 'function') throw new Error(`Characteristic ${this.uuid} is not readable.`);
        const bytes = copyBytes(await read.call(this.service._server._peripheral, this.uuid));
        this.value = new DataView(bytes.buffer);
        return this.value;
    }

    async _write (value, withResponse) {
        const write = this.service._server._peripheral.onWrite;
        if (typeof write !== 'function') throw new Error(`Characteristic ${this.uuid} is not writable.`);
        await write.call(this.service._server._peripheral, this.uuid, copyBytes(value), withResponse);
    }

    writeValue (value) {
        return this._write(value, false);
    }

    writeValueWithoutResponse (value) {
        return this._write(value, false);
    }

    writeValueWithResponse (value) {
        return this._write(value, true);
    }

    // eslint-disable-next-line require-await -- Web Bluetooth specifies a promise
    async startNotifications () {
        this._notifying = true;
        return this;
    }

    // eslint-disable-next-line require-await -- Web Bluetooth specifies a promise
    async stopNotifications () {
        this._notifying = false;
        return this;
    }

    _notify (bytes) {
        if (!this._notifying) return;
        const copy = copyBytes(bytes);
        this.value = new DataView(copy.buffer);
        this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
}

class VirtualService {
    constructor (server, definition) {
        this._server = server;
        this.device = server.device;
        this.uuid = canonicalUuid(definition.uuid);
        this.isPrimary = true;
        this._characteristics = new Map((definition.characteristics || []).map(characteristic => {
            const instance = new VirtualCharacteristic(this, characteristic);
            return [instance.uuid, instance];
        }));
    }

    async getCharacteristic (uuid) {
        const characteristic = this._characteristics.get(canonicalUuid(uuid));
        if (!characteristic) {
            const error = new Error(`No characteristic ${uuid} on service ${this.uuid}.`);
            error.name = 'NotFoundError';
            throw error;
        }
        return characteristic;
    }

    async getCharacteristics () {
        return [...this._characteristics.values()];
    }
}

class VirtualGattServer {
    constructor (device, peripheral) {
        this.device = device;
        this.connected = false;
        this._peripheral = peripheral;
        this._services = new Map((peripheral.services || []).map(service => {
            const instance = new VirtualService(this, service);
            return [instance.uuid, instance];
        }));
    }

    async connect () {
        if (typeof this._peripheral.connect === 'function') await this._peripheral.connect();
        this.connected = true;
        if (typeof this._peripheral.setNotificationSink === 'function') {
            this._peripheral.setNotificationSink((uuid, bytes) => this._notify(uuid, bytes));
        }
        return this;
    }

    disconnect () {
        if (!this.connected) return;
        this.connected = false;
        if (typeof this._peripheral.setNotificationSink === 'function') {
            this._peripheral.setNotificationSink(null);
        }
        if (typeof this._peripheral.disconnect === 'function') this._peripheral.disconnect();
        this.device.dispatchEvent(new Event('gattserverdisconnected'));
    }

    async getPrimaryService (uuid) {
        const service = this._services.get(canonicalUuid(uuid));
        if (!service) {
            const error = new Error(`No service ${uuid} on ${this.device.name}.`);
            error.name = 'NotFoundError';
            throw error;
        }
        return service;
    }

    async getPrimaryServices () {
        return [...this._services.values()];
    }

    _notify (uuid, bytes) {
        const canonical = canonicalUuid(uuid);
        for (const service of this._services.values()) {
            const characteristic = service._characteristics.get(canonical);
            if (characteristic) characteristic._notify(bytes);
        }
    }
}

class VirtualDevice extends EventTarget {
    constructor (peripheral) {
        super();
        this.id = peripheral.id;
        this.name = peripheral.name;
        this.gatt = new VirtualGattServer(this, peripheral);
    }
}

/**
 * Register a factory rather than a singleton so each selection starts with a
 * fresh protocol session.
 * @param {Function} factory no-argument VirtualPeripheral factory.
 * @returns {Function} unregister callback.
 */
export const registerVirtualPeripheral = factory => {
    if (typeof factory !== 'function') throw new TypeError('virtual peripheral factory must be a function');
    factories.add(factory);
    return () => factories.delete(factory);
};

export const clearVirtualPeripheralsForTest = () => factories.clear();

const chooseVirtual = async (candidates, hasReal) => {
    if (typeof globalThis.__brickwrightChooseVirtualBluetooth === 'function') {
        return globalThis.__brickwrightChooseVirtualBluetooth(candidates, hasReal);
    }
    if (!hasReal) return candidates[0];
    if (typeof globalThis.confirm === 'function' &&
        globalThis.confirm(`Connect to virtual Bluetooth device “${candidates[0].name}”?\n\n` +
            'Choose Cancel to open the real Bluetooth device picker.')) return candidates[0];
    return null;
};
const hasUnsupportedVirtualFilters = options => !!(options?.exclusionFilters?.length ||
    (options?.filters || []).some(filter => filter?.manufacturerData !== undefined ||
        filter?.serviceData !== undefined));
const dispose = peripheral => peripheral && typeof peripheral.dispose === 'function' && peripheral.dispose();

/**
 * Wrap the currently installed Web Bluetooth object. Safe to call repeatedly.
 * @returns {string} installation result for diagnostics.
 */
export default function installVirtualWebBluetooth () {
    if (typeof navigator === 'undefined') return 'unavailable';
    const current = navigator.bluetooth;
    if (current && current.__brickwrightVirtualShim) return 'already installed';
    const realRequest = current && typeof current.requestDevice === 'function' ?
        current.requestDevice.bind(current) : null;

    const shim = Object.create(current || null);
    Object.defineProperties(shim, {
        __brickwrightVirtualShim: {value: true},
        requestDevice: {
            value: async options => {
                if (hasUnsupportedVirtualFilters(options)) {
                    if (realRequest) return realRequest(options);
                    const error = new Error('No Bluetooth devices matched the requested filters.');
                    error.name = 'NotFoundError';
                    throw error;
                }
                const created = [...factories].map(factory => factory()).filter(Boolean);
                const candidates = created.filter(p => matches(p, options || {}));
                for (const peripheral of created) if (!candidates.includes(peripheral)) dispose(peripheral);
                if (candidates.length === 0) {
                    if (realRequest) return realRequest(options);
                    const error = new Error('No Bluetooth devices matched the requested filters.');
                    error.name = 'NotFoundError';
                    throw error;
                }
                let selected;
                try { selected = await chooseVirtual(candidates, !!realRequest); } catch (error) {
                    for (const candidate of candidates) dispose(candidate);
                    throw error;
                }
                for (const candidate of candidates) if (candidate !== selected) dispose(candidate);
                if (selected) return new VirtualDevice(selected);
                if (realRequest) return realRequest(options);
                const error = new Error('User cancelled the requestDevice() chooser.');
                error.name = 'NotFoundError';
                throw error;
            }
        },
        getAvailability: {
            value: async () => factories.size > 0 ||
                !!(current && current.getAvailability && await current.getAvailability())
        },
        getDevices: {
            value: async () => current && current.getDevices ? current.getDevices() : []
        }
    });
    Object.defineProperty(navigator, 'bluetooth', {value: shim, configurable: true});
    return 'installed';
}
