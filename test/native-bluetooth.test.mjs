/**
 * The native Bluetooth path, exercised end to end against a fake native server.
 *
 * THE DEFECT THIS GATES
 * ---------------------
 * The LEGO extensions default to a connection type called "ble", which is
 * `navigator.bluetooth`. No webview Brickwright ships on has Web Bluetooth —
 * WKWebView (iOS and macOS) has never implemented it — so in the app the
 * default path threw inside the extension's own try/catch, logged to a console
 * that does not exist on a phone, and the block silently did nothing. The
 * second connection type, "scratchlink", dialled only the LEGACY Scratch Link
 * host, which nothing in the app listens on, AND read `.peripheralId` off
 * `discover`'s reply — which is `null`, because Scratch Link streams what it
 * finds as notifications. Both paths were dead, and neither said so.
 *
 * So this file asserts behaviour, not shape: it stands up a fake Scratch-Link
 * server and drives the whole chain a hub connection actually makes
 * (requestDevice → connect → service → characteristic → notify → write). A
 * regression in any link fails here rather than on a child's iPad.
 */
import {test, describe, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, '../overlay/scratch-gui/src/lib');
const EXT = resolve(here, '../overlay/scratch-vm/src/extensions/crispstrobe');

const BOOST_SERVICE = '00001623-1212-efde-1623-785feabcd123';
const BOOST_CHAR = '00001624-1212-efde-1623-785feabcd123';

/* ------------------------------------------------------------- DOM double */

class El {
    constructor (tag) {
        this.tagName = tag;
        this.children = [];
        this.listeners = {};
        this.parentNode = null;
        this._text = '';
    }
    setAttribute () {}
    appendChild (child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    removeChild (child) {
        this.children = this.children.filter(c => c !== child);
        child.parentNode = null;
    }
    addEventListener (type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }
    click () {
        (this.listeners.click || []).forEach(fn => fn({}));
    }
    select () {}
    get textContent () {
        return this._text;
    }
    set textContent (value) {
        this._text = value;
        this.children = [];
    }
    /** Own text plus every descendant's, which is how a row is identified. */
    get deepText () {
        return this._text + this.children.map(c => c.deepText).join(' ');
    }
}

const walk = node => [node, ...node.children.flatMap(walk)];

/**
 * Bound anything that could otherwise wait for a user. Without this, a
 * regression that lets the chooser open when it should have refused does not
 * fail the run — it hangs it, and a hung run reads as a stuck machine rather
 * than as a bug.
 */
const within = (promise, ms, what) => Promise.race([
    promise,
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${what} did not settle within ${ms}ms`)), ms))
]);

/** The chooser row for a named device, as a user would find it. */
const rowFor = (body, name) => walk(body).find(n =>
    n.tagName === 'button' && n.deepText.includes(name));

/* ---------------------------------------------------- fake Scratch Link */

/** What the native side is told to do, and what it answers. */
class FakeNative {
    constructor () {
        this.reset();
    }
    reset () {
        this.sent = [];
        this.status = {
            platform: 'ios',
            authorization: 'allowed',
            powerState: 'poweredOn',
            usable: true,
            scanning: false,
            connected: false,
            advice: null,
            handler: true
        };
        this.peripherals = [{peripheralId: 'A1B2', name: 'LEGO Move Hub', rssi: -55}];
        this.sockets = [];
        this.refuse = new Set();
    }
    handle (socket, msg) {
        this.sent.push(msg);
        const reply = result =>
            socket.deliver({jsonrpc: '2.0', id: msg.id, result});
        switch (msg.method) {
        case 'ping':
            return reply(42);
        case 'getStatus':
            return reply(this.status);
        case 'discover':
            reply(null);
            this.peripherals.forEach(p => socket.deliver(
                {jsonrpc: '2.0', method: 'didDiscoverPeripheral', params: p}));
            return socket.deliver({
                jsonrpc: '2.0',
                method: 'discoverDidFinish',
                params: {count: this.peripherals.length}
            });
        case 'connect':
            this.status.connected = true;
            return reply(null);
        case 'getServices':
            if (this.refuse.has('getServices')) {
                return socket.deliver({
                    jsonrpc: '2.0',
                    id: msg.id,
                    error: {code: -32000, message: 'unknown method: getServices'}
                });
            }
            return reply([{
                uuid: BOOST_SERVICE,
                characteristics: [{
                    uuid: BOOST_CHAR,
                    properties: {read: true, write: true, notify: true},
                    descriptors: []
                }]
            }]);
        case 'startNotifications':
            return reply(null);
        case 'write':
            return reply(msg.params.message.length);
        case 'read':
            return reply({message: 'AQID', encoding: 'base64'});
        default:
            return socket.deliver({
                jsonrpc: '2.0',
                id: msg.id,
                error: {code: -32000, message: `unknown method: ${msg.method}`}
            });
        }
    }
    /** Push an unsolicited notification, as a hub sending sensor data does. */
    notify (method, params) {
        this.sockets.forEach(s => s.deliver({jsonrpc: '2.0', method, params}));
    }
}

const native = new FakeNative();

class FakeWebSocket {
    constructor (url) {
        this.url = url;
        this.readyState = 0;
        native.sockets.push(this);
        // Opening is asynchronous in every real implementation; making it
        // synchronous here would hide ordering bugs rather than catch them.
        setTimeout(() => {
            this.readyState = 1;
            if (this.onopen) this.onopen({});
        }, 0);
    }
    send (text) {
        native.handle(this, JSON.parse(text));
    }
    deliver (message) {
        setTimeout(() => {
            if (this.readyState === 1 && this.onmessage) {
                this.onmessage({data: JSON.stringify(message)});
            }
        }, 0);
    }
    close () {
        if (this.readyState === 3) return;
        this.readyState = 3;
        native.sockets = native.sockets.filter(s => s !== this);
        if (this.onclose) this.onclose({code: 1000, reason: ''});
    }
}
FakeWebSocket.OPEN = 1;

/* ------------------------------------------------------------------ setup */

const body = new El('body');
const define = (name, value) =>
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});

define('window', {
    __TAURI__: {},
    isSecureContext: false,
    location: {origin: 'tauri://localhost', hash: ''},
    addEventListener: () => {}
});
define('navigator', {userAgent: 'test-harness'});
define('document', {
    body,
    createElement: tag => new El(tag),
    createTextNode: text => {
        const n = new El('#text');
        n._text = text;
        return n;
    }
});
define('WebSocket', FakeWebSocket);

const {default: installNativeWebBluetooth, canonicalUuid} =
    await import(`${LIB}/native-web-bluetooth.js`);
const {selfTestReport, getSession} = await import(`${LIB}/native-ble.js`);

/* ------------------------------------------------------------------ tests */

describe('canonicalUuid', () => {
    test('accepts the three forms the Web Bluetooth spec accepts', () => {
        assert.equal(canonicalUuid(BOOST_SERVICE.toUpperCase()), BOOST_SERVICE);
        assert.equal(canonicalUuid(0x1623), '00001623-0000-1000-8000-00805f9b34fb');
        assert.equal(canonicalUuid('1623'), '00001623-0000-1000-8000-00805f9b34fb');
        assert.equal(canonicalUuid('battery_service'), '0000180f-0000-1000-8000-00805f9b34fb');
    });

    test('refuses a name it does not know rather than inventing a UUID', () => {
        // Silently passing "heart_rate" through as a literal would produce a
        // characteristic that never fires and no way to find out why.
        assert.throws(() => canonicalUuid('heart_rate'), /unrecognised/);
    });
});

describe('the shim installs only where it is both needed and possible', () => {
    test('installs in the app when Web Bluetooth is absent', () => {
        assert.equal(installNativeWebBluetooth(), 'installed');
        assert.equal(typeof navigator.bluetooth.requestDevice, 'function');
        assert.equal(navigator.bluetooth.__brickwrightShim, true);
    });
});

describe('a hub connection, end to end', () => {
    beforeEach(() => {
        const sockets = native.sockets.slice();
        native.reset();
        native.sockets = sockets;
    });

    /** Drive the chooser the way a user does, once a row for `name` appears. */
    const pick = async (promise, name) => {
        for (let i = 0; i < 50; i++) {
            const row = rowFor(body, name);
            if (row) {
                row.click();
                break;
            }
            await new Promise(r => setTimeout(r, 5));
        }
        return promise;
    };

    test('requestDevice scans, offers what it found, and returns the choice', async () => {
        const device = await pick(
            navigator.bluetooth.requestDevice({filters: [{services: [BOOST_SERVICE]}]}),
            'LEGO Move Hub'
        );
        assert.equal(device.id, 'A1B2');
        assert.equal(device.name, 'LEGO Move Hub');

        const discover = native.sent.find(m => m.method === 'discover');
        assert.ok(discover, 'no scan was requested');
        assert.deepEqual(discover.params.filters, [{services: [BOOST_SERVICE]}],
            'the service filter must reach the native scan, or every BLE device in the room is offered');
    });

    test('connect → service → characteristic → notify → write all reach the radio', async () => {
        const device = await pick(
            navigator.bluetooth.requestDevice({filters: [{services: [BOOST_SERVICE]}]}),
            'LEGO Move Hub'
        );
        const server = await device.gatt.connect();
        assert.equal(server.connected, true);

        const service = await server.getPrimaryService(BOOST_SERVICE);
        const characteristic = await service.getCharacteristic(BOOST_CHAR);
        await characteristic.startNotifications();

        // Sensor data arriving from the hub must surface as the event the
        // extensions listen for, with the bytes on `.value`.
        const seen = new Promise(res =>
            characteristic.addEventListener('characteristicvaluechanged', e =>
                res(new Uint8Array(e.target.value.buffer))));
        native.notify('characteristicDidChange', {
            serviceId: BOOST_SERVICE,
            characteristicId: BOOST_CHAR,
            message: 'BQYH',
            encoding: 'base64'
        });
        assert.deepEqual(Array.from(await seen), [5, 6, 7]);

        await characteristic.writeValue(new Uint8Array([9, 8]));
        const write = native.sent.find(m => m.method === 'write');
        assert.equal(write.params.characteristicId, BOOST_CHAR);
        assert.equal(write.params.message, 'CQg=');
    });

    test('a switched-off radio is reported, not scanned past', async () => {
        native.status.usable = false;
        native.status.powerState = 'poweredOff';
        native.status.advice = 'Bluetooth is switched off. Turn it on in Settings › Bluetooth.';
        await assert.rejects(
            within(
                navigator.bluetooth.requestDevice({filters: [{services: [BOOST_SERVICE]}]}),
                1000, 'requestDevice against a powered-off radio'
            ),
            /switched off/,
            'the whole point: on Apple platforms a scan against a powered-off radio is a SILENT no-op'
        );
        assert.equal(native.sent.some(m => m.method === 'discover'), false,
            'it should not have scanned at all');
    });

    test('getPrimaryService still works when the peer cannot enumerate', async () => {
        // A stock Scratch Link answers getServices with method-not-found. Named
        // lookups must keep working; only getPrimaryServices() is lost.
        native.refuse.add('getServices');
        const device = await pick(
            navigator.bluetooth.requestDevice({filters: [{services: [BOOST_SERVICE]}]}),
            'LEGO Move Hub'
        );
        await device.gatt.connect();
        const service = await device.gatt.getPrimaryService(BOOST_SERVICE);
        assert.equal(service.uuid, BOOST_SERVICE);
        await assert.rejects(() => device.gatt.getPrimaryServices(), /unavailable/);
    });
});

describe('the self-test says which step failed', () => {
    test('a healthy stack reports the adapter facts', async () => {
        native.reset();
        getSession().close();
        const report = await selfTestReport();
        assert.equal(report['local Bluetooth service'], 'reachable');
        assert.equal(report.ping, 'ok');
        assert.equal(report['bluetooth permission'], 'allowed');
        assert.equal(report['adapter power'], 'poweredOn');
        assert.equal(report['radio usable'], 'yes');
    });
});

/* ------------------------------- the extensions' own Scratch Link adapter */

const extensionSource = id => {
    const file = readFileSync(resolve(EXT, id, 'index.js'), 'utf8');
    // The extension is a source STRING passed to the adapter; decode it the
    // same way the adapter does so these assertions read the real code.
    return JSON.parse(file.slice(file.indexOf('makeExt(') + 8, file.lastIndexOf(');')));
};

describe('the extensions can reach the app\'s own Scratch Link', () => {
    for (const id of ['legoboostunified', 'legopoweredup']) {
        test(`${id} dials the local service before the legacy host`, () => {
            const src = extensionSource(id);
            const table = src.match(/const SCRATCH_LINK_ENDPOINTS = \[([\s\S]*?)\];/);
            assert.ok(table, 'no endpoint table — the legacy host is probably hard-coded again');
            const urls = [...table[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
            assert.match(urls[0], /^ws:\/\/127\.0\.0\.1:20111\//,
                'the app\'s in-process service must be tried first, or the app can never connect');
            assert.equal(urls.length, 2, 'legacy Scratch Link should remain as the fallback');
        });

        test(`${id} takes its peripheral from didDiscoverPeripheral`, () => {
            const src = extensionSource(id);
            assert.ok(src.includes('didDiscoverPeripheral'),
                'discover() resolves with null; the device only ever arrives as a notification');
            assert.ok(!/\_sendRequest\("discover"[\s\S]{0,200}\.then\(\(device\)/.test(src),
                'reading .peripheralId off discover\'s null reply is the original TypeError');
        });
    }
});
