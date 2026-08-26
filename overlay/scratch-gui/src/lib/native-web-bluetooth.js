/**
 * `navigator.bluetooth` for the native app.
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * The LEGO extensions (Boost, WeDo 2.0, Powered Up, SPIKE BLE) default to a
 * connection type called "ble", which is `navigator.bluetooth.requestDevice`.
 * No webview Brickwright ships on has Web Bluetooth: WKWebView (iOS, macOS) has
 * never implemented it, WebKitGTK does not, and WebView2 keeps it behind a flag.
 * So the default path threw `undefined is not an object` inside the extension's
 * own try/catch, which logged to a console nobody can see on a phone — and the
 * block simply did nothing. It was never an iOS entitlement problem; the app's
 * Info.plist has carried NSBluetoothAlwaysUsageDescription and the CoreBluetooth
 * framework all along.
 *
 * THE FIX
 * -------
 * Implement the slice of Web Bluetooth those extensions actually use, on top of
 * the app's in-process Scratch-Link server (`native-ble.js`), which already
 * drives real CoreBluetooth/BlueZ/WinRT radios. Every gallery extension written
 * against Web Bluetooth then works in the app too, without being rewritten.
 *
 * WHAT IS NOT IMPLEMENTED, AND WHY THAT IS SAFE
 * ---------------------------------------------
 * Descriptors, `watchAdvertisements`, and multiple simultaneous peripherals.
 * The native side tracks exactly one connected peripheral, which is what a
 * single-hub teaching app needs; the unimplemented calls reject with a clear
 * message rather than returning something plausible and wrong.
 *
 * This installs ONLY when Web Bluetooth is genuinely absent and we are inside
 * the app — a real implementation is always preferred, and a browser has no
 * local server to talk to.
 */

import {bleLog} from './ble-diagnostics.js';
import {getSession, getNativeStatus, isNativeApp} from './native-ble.js';

/* ------------------------------------------------------------------ uuids */

/**
 * Web Bluetooth accepts a 16/32-bit number, a short assigned name, or a full
 * 128-bit string; the native side wants one canonical lowercase form. Only the
 * few assigned names a LEGO/maker extension plausibly uses are listed — an
 * unknown name throws, because silently treating "heart_rate" as a literal UUID
 * would produce a characteristic that never fires and no explanation.
 */
const ASSIGNED = {
    generic_access: 0x1800,
    generic_attribute: 0x1801,
    device_information: 0x180a,
    battery_service: 0x180f,
    // Nordic UART, which a large share of hobby BLE firmware uses.
    nordic_uart: 0x0001
};

const BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const canonicalUuid = value => {
    if (typeof value === 'number') {
        return `${(value >>> 0).toString(16).padStart(8, '0')}${BASE_UUID_SUFFIX}`;
    }
    if (typeof value !== 'string') throw new TypeError(`not a UUID: ${value}`);
    const lower = value.toLowerCase();
    if (FULL_UUID.test(lower)) return lower;
    if (/^(0x)?[0-9a-f]{1,8}$/.test(lower)) {
        return canonicalUuid(parseInt(lower.replace(/^0x/, ''), 16));
    }
    if (Object.prototype.hasOwnProperty.call(ASSIGNED, lower)) return canonicalUuid(ASSIGNED[lower]);
    throw new TypeError(`unrecognised Bluetooth UUID: ${value}`);
};

const toDataView = value => {
    if (value instanceof DataView) return value;
    if (ArrayBuffer.isView(value)) return new DataView(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new DataView(value);
    throw new TypeError('value must be an ArrayBuffer or a typed array');
};

const toBase64 = view => {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
};

const fromBase64 = b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new DataView(bytes.buffer);
};

/* ----------------------------------------------------------------- picker */

const el = (tag, style, text) => {
    const node = document.createElement(tag);
    if (style) node.setAttribute('style', style);
    if (typeof text === 'string') node.textContent = text;
    return node;
};

/**
 * The chooser a browser would draw itself. Returns a handle: `promise` settles
 * with the chosen device, and `add`/`setStatus`/`fail` are driven by the caller
 * from the native scan notifications.
 *
 * Cancelling rejects with a `NotFoundError` named exactly as a real browser
 * names it — extension code branches on that, so the shape matters more than
 * the styling does.
 * @param {object} options `onCancel` is called when the user dismisses it.
 * @returns {object} the handle described above.
 */
const chooseDevice = ({onCancel}) => {
    const overlay = el('div', 'position:fixed;inset:0;z-index:2147483500;background:rgba(12,16,22,.72);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
        'padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom) 16px;');
    const card = el('div', 'background:#fff;color:#1b2129;border-radius:14px;width:min(420px,100%);' +
        'max-height:min(70vh,560px);display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 18px 48px rgba(0,0,0,.35);');
    const statusLine = el('div', 'padding:0 18px 10px;color:#5a6673;font-size:13px;', 'Searching…');
    const list = el('div', 'flex:1 1 auto;overflow:auto;border-top:1px solid #e6eaee;' +
        '-webkit-overflow-scrolling:touch;');
    const footer = el('div', 'padding:12px 18px;display:flex;gap:10px;justify-content:flex-end;' +
        'border-top:1px solid #e6eaee;');
    const cancel = el('button', 'background:#e9edf1;border:0;border-radius:8px;padding:9px 16px;' +
        'font:inherit;cursor:pointer;', 'Cancel');

    card.appendChild(el('div', 'padding:16px 18px 8px;font-weight:600;font-size:16px;',
        'Choose a Bluetooth device'));
    card.appendChild(statusLine);
    card.appendChild(list);
    footer.appendChild(cancel);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let settle = null;
    let settled = false;
    const seen = new Map();

    const finish = fn => {
        if (settled) return;
        settled = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        fn();
    };

    const promise = new Promise((resolve, reject) => {
        settle = {resolve, reject};
    });

    cancel.addEventListener('click', () => finish(() => {
        onCancel();
        const err = new Error('User cancelled the requestDevice() chooser.');
        err.name = 'NotFoundError';
        settle.reject(err);
    }));

    return {
        promise,
        add (device) {
            if (settled || seen.has(device.id)) return;
            seen.set(device.id, device);
            statusLine.textContent = 'Tap a device to connect.';
            const row = el('button', 'display:block;width:100%;text-align:left;background:none;' +
                'border:0;border-bottom:1px solid #f0f3f6;padding:13px 18px;font:inherit;cursor:pointer;');
            row.appendChild(el('div', 'font-weight:600;', device.name || 'Unnamed device'));
            row.appendChild(el('div', 'color:#6b7785;font-size:12px;',
                `${device.id}${typeof device.rssi === 'number' ? ` · ${device.rssi} dBm` : ''}`));
            row.addEventListener('click', () => finish(() => settle.resolve(device)));
            list.appendChild(row);
        },
        setStatus (text) {
            if (!settled) statusLine.textContent = text;
        },
        /**
         * Give up with a reason.
         * @param {string} message shown instead, once a device is already listed —
         *   the user can still pick it, so this must not close the chooser.
         */
        fail (message) {
            if (seen.size > 0) {
                this.setStatus(message);
                return;
            }
            finish(() => {
                const err = new Error(message);
                err.name = 'NotFoundError';
                settle.reject(err);
            });
        },
        get settled () {
            return settled;
        }
    };
};

/* -------------------------------------------------------------- GATT tree */

class BluetoothRemoteGATTCharacteristic extends EventTarget {
    constructor (service, uuid, properties) {
        super();
        this.service = service;
        this.uuid = uuid;
        this.value = null;
        this.properties = properties || {
            read: true, write: true, writeWithoutResponse: true, notify: true
        };
        this._unsubscribe = null;
    }

    async readValue () {
        const result = await getSession().request('read', {
            serviceId: this.service.uuid,
            characteristicId: this.uuid
        });
        this.value = fromBase64(result.message);
        return this.value;
    }

    async writeValue (value) {
        const view = toDataView(value);
        await getSession().request('write', {
            serviceId: this.service.uuid,
            characteristicId: this.uuid,
            message: toBase64(view),
            encoding: 'base64',
            withResponse: false
        });
    }

    /**
     * Both explicit spellings, so callers that use either behave the same.
     * @param {ArrayBuffer|ArrayBufferView} value the bytes to send.
     * @returns {Promise} resolves once the native side has accepted the write.
     */
    writeValueWithoutResponse (value) {
        return this.writeValue(value);
    }

    async writeValueWithResponse (value) {
        const view = toDataView(value);
        await getSession().request('write', {
            serviceId: this.service.uuid,
            characteristicId: this.uuid,
            message: toBase64(view),
            encoding: 'base64',
            withResponse: true
        });
    }

    async startNotifications () {
        const session = getSession();
        if (!this._unsubscribe) {
            this._unsubscribe = session.on('characteristicDidChange', params => {
                if (!params || canonicalUuid(params.characteristicId) !== this.uuid) return;
                this.value = fromBase64(params.message);
                // Real Web Bluetooth puts the payload on `.value` and fires a
                // valueless event; extensions read `event.target.value`.
                this.dispatchEvent(new Event('characteristicvaluechanged'));
            });
        }
        await session.request('startNotifications', {
            serviceId: this.service.uuid,
            characteristicId: this.uuid
        });
        bleLog('info', 'ble', 'notifications started', this.uuid);
        return this;
    }

    // eslint-disable-next-line require-await -- the API it stands in for returns a promise
    async stopNotifications () {
        // The native protocol has no unsubscribe; detaching locally stops the
        // events reaching the caller, which is what the caller asked for.
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        return this;
    }
}

class BluetoothRemoteGATTService {
    constructor (server, uuid, characteristics) {
        this.device = server.device;
        this.uuid = uuid;
        this.isPrimary = true;
        this._server = server;
        // Populated from `getServices` when enumeration was possible; otherwise
        // characteristics are created on demand, which is all the LEGO
        // extensions ever need (they know their UUIDs).
        this._known = characteristics || null;
        this._cache = new Map();
    }

    // eslint-disable-next-line require-await -- the API it stands in for returns a promise
    async getCharacteristic (uuid) {
        const canonical = canonicalUuid(uuid);
        if (this._cache.has(canonical)) return this._cache.get(canonical);
        let properties = null;
        if (this._known) {
            const match = this._known.find(c => canonicalUuid(c.uuid) === canonical);
            if (!match) {
                const err = new Error(`No characteristic ${canonical} on service ${this.uuid}.`);
                err.name = 'NotFoundError';
                throw err;
            }
            properties = match.properties;
        }
        const characteristic = new BluetoothRemoteGATTCharacteristic(this, canonical, properties);
        this._cache.set(canonical, characteristic);
        return characteristic;
    }

    // eslint-disable-next-line require-await -- the API it stands in for returns a promise
    async getCharacteristics () {
        if (!this._known) {
            throw new Error('Characteristic enumeration is unavailable on this transport.');
        }
        return Promise.all(this._known.map(c => this.getCharacteristic(c.uuid)));
    }
}

class BluetoothRemoteGATTServer {
    constructor (device) {
        this.device = device;
        this.connected = false;
        this._services = null;
        this._cache = new Map();
    }

    async connect () {
        const session = getSession();
        await session.request('connect', {peripheralId: this.device.id});
        this.connected = true;
        bleLog('info', 'ble', 'connected to', `${this.device.name} (${this.device.id})`);
        // A hub switched off mid-session drops the socket; the extensions listen
        // for gattserverdisconnected to reset their own state.
        this._offClose = session.on('sessionDidClose', () => this._markDisconnected());
        return this;
    }

    _markDisconnected () {
        if (!this.connected) return;
        this.connected = false;
        this.device.dispatchEvent(new Event('gattserverdisconnected'));
    }

    disconnect () {
        if (this._offClose) {
            this._offClose();
            this._offClose = null;
        }
        // Closing the socket is what tells the native side to drop the
        // peripheral (`ble::cleanup`), so this is a real disconnect and not
        // just a local flag.
        getSession().close();
        this._markDisconnected();
    }

    async _enumerate () {
        if (this._services) return this._services;
        try {
            const raw = await getSession().request('getServices', {peripheralId: this.device.id});
            this._services = (raw || []).map(s => ({
                uuid: canonicalUuid(s.uuid),
                characteristics: s.characteristics || []
            }));
        } catch (e) {
            // A stock Scratch Link cannot enumerate. That only costs us
            // getPrimaryServices(); named lookups still work.
            bleLog('warn', 'ble', 'service enumeration unavailable', e.message);
            this._services = null;
        }
        return this._services;
    }

    async getPrimaryService (uuid) {
        const canonical = canonicalUuid(uuid);
        if (this._cache.has(canonical)) return this._cache.get(canonical);
        const services = await this._enumerate();
        const match = services && services.find(s => s.uuid === canonical);
        if (services && !match) {
            const err = new Error(`No service ${canonical} on ${this.device.name || this.device.id}.`);
            err.name = 'NotFoundError';
            throw err;
        }
        const service = new BluetoothRemoteGATTService(
            this, canonical, match ? match.characteristics : null);
        this._cache.set(canonical, service);
        return service;
    }

    async getPrimaryServices () {
        const services = await this._enumerate();
        if (!services) throw new Error('Service enumeration is unavailable on this transport.');
        return Promise.all(services.map(s => this.getPrimaryService(s.uuid)));
    }
}

class BluetoothDevice extends EventTarget {
    constructor (id, name) {
        super();
        this.id = id;
        this.name = name;
        this.gatt = new BluetoothRemoteGATTServer(this);
    }
}

/* ---------------------------------------------------------------- install */

const matchesFilters = (device, filters) => {
    if (!filters || filters.length === 0) return true;
    return filters.some(f => {
        // `services` is already enforced natively by the scan filter; only the
        // name predicates need checking here.
        if (f.name && device.name !== f.name) return false;
        if (f.namePrefix && String(device.name || '').indexOf(f.namePrefix) !== 0) return false;
        return true;
    });
};

const requestDevice = async (options = {}) => {
    const filters = options.acceptAllDevices ? [] : (options.filters || []);
    const services = [];
    filters.forEach(f => (f.services || []).forEach(s => services.push(canonicalUuid(s))));
    bleLog('info', 'ble', 'requestDevice', JSON.stringify({services, filters: filters.length}));

    // Ask the radio's state BEFORE scanning. On Apple platforms a scan issued
    // against a central that is not powered on is a silent no-op, so without
    // this the only symptom is an empty chooser — which reads as "no hub here"
    // when the real answer is "Bluetooth is off" or "permission denied".
    const status = await getNativeStatus();
    if (status && !status.usable) {
        const err = new Error(status.advice || 'Bluetooth is unavailable on this device.');
        err.name = 'NotFoundError';
        bleLog('error', 'ble', 'refusing to scan', err.message);
        throw err;
    }

    const session = getSession();
    const picker = chooseDevice({
        onCancel: () => bleLog('info', 'ble', 'chooser cancelled')
    });
    const offDiscover = session.on('didDiscoverPeripheral', params => {
        const device = {id: params.peripheralId, name: params.name, rssi: params.rssi};
        if (matchesFilters(device, filters)) picker.add(device);
    });
    const offFail = session.on('discoverDidFail', params =>
        picker.fail((params && params.message) || 'The Bluetooth scan could not start.'));
    const offDone = session.on('discoverDidFinish', params => {
        if (params && params.count === 0) {
            picker.fail('No Bluetooth devices found. Make sure the hub is switched on and nearby.');
        } else {
            picker.setStatus('Search finished. Tap a device to connect.');
        }
    });

    try {
        await session.request('discover', {filters: services.length ? [{services}] : []});
        const chosen = await picker.promise;
        bleLog('info', 'ble', 'chose', `${chosen.name} (${chosen.id})`);
        return new BluetoothDevice(chosen.id, chosen.name);
    } finally {
        offDiscover();
        offFail();
        offDone();
    }
};

let installed = false;

/**
 * Install the shim if and only if it is both needed and possible.
 * @returns {string} what it decided, reported verbatim by the diagnostics panel.
 */
export default function installNativeWebBluetooth () {
    if (installed || typeof navigator === 'undefined') return 'already installed';
    if (typeof navigator.bluetooth !== 'undefined') {
        bleLog('info', 'ble', 'Web Bluetooth is native here; shim not installed');
        return 'native Web Bluetooth present';
    }
    if (!isNativeApp()) {
        bleLog('warn', 'ble',
            'no Web Bluetooth and no native app — hardware blocks needing BLE will not connect');
        return 'unavailable (browser without Web Bluetooth)';
    }
    const shim = {
        __brickwrightShim: true,
        requestDevice,
        // Truthful: the app has a radio. The real API resolves false only when
        // there is no adapter at all, which `getStatus` reports separately.
        getAvailability: async () => {
            const status = await getNativeStatus();
            return status ? !!status.usable : true;
        },
        // No persisted permissions on this transport, so there is never a
        // previously-granted device to hand back.
        // eslint-disable-next-line require-await -- the API it stands in for returns a promise
        getDevices: async () => []
    };
    try {
        Object.defineProperty(navigator, 'bluetooth', {value: shim, configurable: true});
    } catch (e) {
        navigator.bluetooth = shim;
    }
    installed = true;
    bleLog('info', 'ble', 'installed the native Web Bluetooth shim');
    return 'installed';
}
