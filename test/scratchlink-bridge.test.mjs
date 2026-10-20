/**
 * The Scratch Link route's fourth transport — and the guarantee that adding it
 * removed none of the others.
 *
 * The extensions offer three connection paths on purpose, so that one
 * transport failing does not take the hardware with it. This module adds a
 * native path for the case CodePM and Scrub both hit on iOS — a webview that
 * cannot open a localhost WebSocket at all (they load https://scratch.mit.edu,
 * where WebKit blocks ws:// as mixed content). Both of those apps replace the
 * page's WebSocket constructor and carry the same JSON-RPC natively.
 *
 * The risk in copying that is obvious: a constructor swap can silently take
 * over transports that were working. So most of what is asserted here is what
 * the module must NOT do.
 */
import {test, describe, beforeEach, afterEach} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '../overlay/scratch-gui/src/lib');

const built = [];
class FakeWebSocket {
    constructor (url, protocols) {
        this.url = String(url);
        this.protocols = protocols;
        this.sent = [];
        built.push(this);
    }
    send (d) { this.sent.push(d); }
    close () { this.closed = true; }
}
FakeWebSocket.CONNECTING = 0; FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2; FakeWebSocket.CLOSED = 3;

const store = new Map();
const invoked = [];
const define = (n, v) => Object.defineProperty(globalThis, n, {value: v, configurable: true, writable: true});

define('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
});
define('Event', class Event { constructor (type) { this.type = type; } });
define('console', {...console, info: () => {}});
define('window', {
    __TAURI__: {
        core: {invoke: (cmd, args) => { invoked.push({cmd, args}); return Promise.resolve(); }},
        event: {listen: () => Promise.resolve(() => {})},
    },
    WebSocket: FakeWebSocket,
});

const {default: installScratchLinkBridge, isScratchLinkUrl, transportPreference, transportOf} =
    await import(`${LIB}/native-scratch-link-bridge.js`);

const LINK = 'ws://127.0.0.1:20111/scratch/ble';
let WrappedSocket;

const sockets = [];
const openSocket = (...args) => {
    const socket = new window.WebSocket(...args);
    sockets.push(socket);
    return socket;
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const defaultTauri = window.__TAURI__;
beforeEach(() => { built.length = 0; invoked.length = 0; store.clear(); });
afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await flush();
    window.__TAURI__ = defaultTauri;
    if (WrappedSocket) window.WebSocket = WrappedSocket;
});

describe('installing the fallback', () => {
    test('it installs in the app', () => {
        assert.equal(installScratchLinkBridge(), 'installed');
        WrappedSocket = window.WebSocket;
        assert.equal(window.WebSocket.__bwScratchLinkBridge, true);
    });

    test('it is idempotent', () => {
        assert.equal(installScratchLinkBridge(), 'already installed');
    });

    test('the readyState constants survive the swap', () => {
        // scratch-vm compares against WebSocket.OPEN; losing these would break
        // every socket in the app, not just Scratch Link's.
        assert.equal(window.WebSocket.OPEN, 1);
        assert.equal(window.WebSocket.CLOSED, 3);
    });
});

describe('nothing that worked before is taken over', () => {
    test('a non-scratch-link URL gets the REAL socket, untouched', () => {
        const ws = openSocket('wss://example.com/game');
        assert.ok(ws instanceof FakeWebSocket, 'a project\'s own WebSocket must not be intercepted');
        assert.equal(invoked.length, 0, 'and must never reach the native bridge');
    });

    test('a scratch-link URL still tries the REAL socket first', () => {
        openSocket(LINK);
        assert.equal(built.length, 1, 'the socket route must be attempted, not bypassed');
        assert.equal(built[0].url, LINK);
        assert.equal(invoked.length, 0, 'the bridge must not be opened while the socket may still succeed');
    });

    test('a socket that opens keeps ownership — send goes to it, not the bridge', () => {
        const facade = openSocket(LINK);
        const real = built[0];
        real.onopen(new Event('open'));
        facade.send('{"method":"discover"}');
        assert.deepEqual(real.sent, ['{"method":"discover"}']);
        assert.equal(invoked.length, 0, 'a working socket must never be replaced by the bridge');
    });
});

describe('the bridge takes over only when the socket cannot', () => {
    test('a socket that closes before opening hands over', async () => {
        openSocket(LINK);
        built[0].onclose({code: 1006, wasClean: false});
        await new Promise(r => setTimeout(r, 10));
        assert.ok(invoked.some(i => i.cmd === 'scratchlink_bridge_open'),
            'the unrecoverable case is exactly what this module is for');
    });

    test('a socket error hands over too', async () => {
        openSocket(LINK);
        built[0].onerror(new Event('error'));
        await new Promise(r => setTimeout(r, 10));
        assert.ok(invoked.some(i => i.cmd === 'scratchlink_bridge_open'));
    });
});

describe('the transport is selectable, so it is a path and not just a net', () => {
    test('auto is the default', () => {
        assert.equal(transportPreference(), 'auto');
    });

    test('"socket" restores exactly the old behaviour — bridge never consulted', async () => {
        store.set('bw-scratchlink-transport', 'socket');
        const ws = openSocket(LINK);
        assert.ok(ws instanceof FakeWebSocket, 'socket-only must return the real socket itself');
        built[0].onclose && built[0].onclose({code: 1006});
        await new Promise(r => setTimeout(r, 10));
        assert.equal(invoked.length, 0, 'picking socket-only must never fall back');
    });

    test('"native" goes straight to the native path, no socket attempted', async () => {
        store.set('bw-scratchlink-transport', 'native');
        openSocket(LINK);
        await new Promise(r => setTimeout(r, 10));
        assert.equal(built.length, 0, 'bridge-only must not dial a socket at all');
        assert.ok(invoked.some(i => i.cmd === 'scratchlink_bridge_open'));
    });

    test('the old internal "bridge" value migrates to the named native carrier', () => {
        store.set('bw-scratchlink-transport', 'bridge');
        assert.equal(transportPreference(), 'native');
    });

    test('an unknown value falls back to auto rather than breaking', () => {
        store.set('bw-scratchlink-transport', 'nonsense');
        assert.equal(transportPreference(), 'auto');
    });
});

describe('URL matching', () => {
    test('both Scratch Link ports are recognised, nothing else', () => {
        assert.ok(isScratchLinkUrl('ws://127.0.0.1:20111/scratch/ble'));
        assert.ok(isScratchLinkUrl('wss://device-manager.scratch.mit.edu:20110/scratch/ble'));
        assert.ok(!isScratchLinkUrl('wss://example.com/socket'));
        assert.ok(!isScratchLinkUrl('ws://127.0.0.1:8080/bridge'),
            'the user-run bridge path is a DIFFERENT option and must stay untouched');
    });
});


describe('BLE and Bluetooth Classic are different backends, and stay so', () => {
    // The socket route picks ble vs bt from the request path; they are wholly
    // different backends (CoreBluetooth/btleplug vs RFCOMM/MFi). A bridge that
    // sent everything to the BLE dispatcher would work for the BLE hubs and
    // silently break EV3 and NXT — the devices that, on iOS, have no other way
    // in at all. That is the failure this describe exists for.
    test('the transport is read from the path, as the socket route reads it', () => {
        assert.equal(transportOf('ws://127.0.0.1:20111/scratch/ble'), 'ble');
        assert.equal(transportOf('ws://127.0.0.1:20111/scratch/bt'), 'bt');
        assert.equal(transportOf('wss://device-manager.scratch.mit.edu:20110/scratch/bt'), 'bt');
    });

    test('a bt URL opens the bridge as bt, not as ble', async () => {
        store.set('bw-scratchlink-transport', 'native');
        openSocket('ws://127.0.0.1:20111/scratch/bt');
        await new Promise(r => setTimeout(r, 10));
        const open = invoked.find(i => i.cmd === 'scratchlink_bridge_open');
        assert.ok(open, 'the bridge must open');
        assert.equal(open.args.kind, 'bt',
            'EV3/NXT frames must not be handed to the BLE backend');
    });

    test('a ble URL still opens as ble', async () => {
        store.set('bw-scratchlink-transport', 'native');
        openSocket(LINK);
        await new Promise(r => setTimeout(r, 10));
        const open = invoked.find(i => i.cmd === 'scratchlink_bridge_open');
        assert.equal(open.args.kind, 'ble');
    });
});


const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
let harnessId = 0;
const freshBridge = async (invoke, listen = async () => () => {}) => {
    window.__TAURI__ = {core: {invoke}, event: {listen}};
    // Each case owns an independent native transition queue, as a fresh page does.
    const source = readFileSync(resolve(LIB, 'native-scratch-link-bridge.js'), 'utf8');
    const moduleSource = source + '\n// case ' + ++harnessId;
    const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64');
    return import(moduleUrl);
};

describe('native cancellation and reconnect ownership', () => {
    test('closing during listener registration never opens native and releases the late listener', async () => {
        const registration = deferred();
        const calls = [];
        let released = 0;
        const {BridgedSocket} = await freshBridge(async name => calls.push(name), () => registration.promise);
        const socket = new BridgedSocket();
        let opened = 0;
        let closed = 0;
        socket.onopen = () => opened++;
        socket.onclose = () => closed++;
        const opening = socket._start();
        socket.close();
        registration.resolve(() => released++);
        await opening;
        await flush();
        assert.equal(socket.readyState, 3);
        assert.equal(opened, 0);
        assert.equal(closed, 1);
        assert.equal(released, 1);
        assert.ok(!calls.includes('scratchlink_bridge_open'));
    });

    test('closing during native open waits for it, cleans up once, and never reports open', async () => {
        const nativeOpen = deferred();
        const calls = [];
        let released = 0;
        const {BridgedSocket} = await freshBridge(name => {
            calls.push(name);
            return name === 'scratchlink_bridge_open' ? nativeOpen.promise : Promise.resolve();
        }, async () => () => released++);
        const socket = new BridgedSocket();
        let opened = 0;
        socket.onopen = () => opened++;
        const opening = socket._start();
        await flush();
        assert.deepEqual(calls, ['scratchlink_bridge_open']);
        socket.close();
        nativeOpen.resolve();
        await opening;
        await flush();
        assert.equal(opened, 0);
        assert.equal(socket.readyState, 3);
        assert.equal(released, 1);
        assert.deepEqual(calls, ['scratchlink_bridge_open', 'scratchlink_bridge_close']);
    });

    test('failed native open releases its listener and partial session before a successful retry', async () => {
        const calls = [];
        let fail = true;
        let released = 0;
        const {BridgedSocket} = await freshBridge(async name => {
            calls.push(name);
            if (name === 'scratchlink_bridge_open' && fail) throw new Error('permission denied');
        }, async () => () => released++);
        const first = new BridgedSocket();
        let errors = 0;
        let closes = 0;
        first.onerror = () => errors++;
        first.onclose = () => closes++;
        await first._start();
        assert.equal(first.readyState, 3);
        assert.equal(errors, 1);
        assert.equal(closes, 1);
        assert.equal(released, 1);
        assert.deepEqual(calls, ['scratchlink_bridge_open', 'scratchlink_bridge_close']);
        fail = false;
        const next = new BridgedSocket();
        await next._start();
        assert.equal(next.readyState, 1);
        next.close();
        await flush();
        assert.equal(released, 2);
    });

    test('an immediate reconnect waits for the old close and ignores old notifications', async () => {
        const nativeClose = deferred();
        const calls = [];
        const listeners = [];
        const {BridgedSocket} = await freshBridge(name => {
            calls.push(name);
            return name === 'scratchlink_bridge_close' ? nativeClose.promise : Promise.resolve();
        }, async (name, listener) => { listeners.push(listener); return () => {}; });
        const old = new BridgedSocket();
        let oldMessages = 0;
        old.onmessage = () => oldMessages++;
        await old._start();
        old.close();
        const next = new BridgedSocket();
        let newMessages = 0;
        next.onmessage = () => newMessages++;
        const opening = next._start();
        await flush();
        assert.equal(calls.filter(name => name === 'scratchlink_bridge_open').length, 1);
        nativeClose.resolve();
        await opening;
        assert.equal(next.readyState, 1);
        listeners[0]({payload: 'stale'});
        listeners[1]({payload: 'current'});
        assert.equal(oldMessages, 0);
        assert.equal(newMessages, 1);
        const count = calls.length;
        old.close();
        await flush();
        assert.equal(calls.length, count, 'a repeated old close cannot reach the new native session');
        next.close();
        await flush();
    });

    test('native close failure is reported and prevents an unsafe new open', async () => {
        const calls = [];
        const {BridgedSocket} = await freshBridge(async name => {
            calls.push(name);
            if (name === 'scratchlink_bridge_close') throw new Error('close failed');
        });
        const first = new BridgedSocket();
        let errors = 0;
        first.onerror = () => errors++;
        await first._start();
        first.close();
        await flush();
        const next = new BridgedSocket();
        await next._start();
        assert.equal(next.readyState, 3);
        assert.equal(errors, 1);
        assert.equal(calls.filter(name => name === 'scratchlink_bridge_open').length, 1);
    });

    test('closing an unopened real socket cancels fallback even after late failure events', async () => {
        const calls = [];
        const bridge = await freshBridge(async name => calls.push(name));
        window.WebSocket = FakeWebSocket;
        bridge.default();
        const facade = new window.WebSocket(LINK);
        const real = built.at(-1);
        const lateFailure = real.onerror;
        const lateClose = real.onclose;
        facade.close();
        lateFailure(new Event('error'));
        lateClose({code: 1006});
        await flush();
        assert.equal(real.closed, true);
        assert.equal(facade.readyState, 3);
        assert.ok(!calls.includes('scratchlink_bridge_open'));
        window.WebSocket = WrappedSocket;
    });

    test('a live native owner cannot be replaced by a second socket', async () => {
        const calls = [];
        const {BridgedSocket} = await freshBridge(async name => calls.push(name));
        const first = new BridgedSocket();
        await first._start();
        const second = new BridgedSocket();
        await second._start();
        assert.equal(first.readyState, 1);
        assert.equal(second.readyState, 3);
        assert.deepEqual(calls, ['scratchlink_bridge_open']);
        first.close();
        await flush();
    });

    test('failed event registration never opens native or closes a different owner', async () => {
        const calls = [];
        const {BridgedSocket} = await freshBridge(async name => calls.push(name), async () => undefined);
        const socket = new BridgedSocket();
        await socket._start();
        assert.equal(socket.readyState, 3);
        assert.deepEqual(calls, []);
    });

    test('starting twice shares one registration and one native open', async () => {
        const calls = [];
        let registrations = 0;
        const {BridgedSocket} = await freshBridge(async name => calls.push(name), async () => {
            registrations++;
            return () => {};
        });
        const socket = new BridgedSocket();
        await Promise.all([socket._start(), socket._start()]);
        assert.equal(registrations, 1);
        assert.deepEqual(calls, ['scratchlink_bridge_open']);
        socket.close();
        await flush();
    });

    test('a rejected send closes the owning session and releases its listener', async () => {
        const calls = [];
        let released = 0;
        const {BridgedSocket} = await freshBridge(async name => {
            calls.push(name);
            if (name === 'scratchlink_bridge_send') throw new Error('session disappeared');
        }, async () => () => released++);
        const socket = new BridgedSocket();
        let closed = 0;
        socket.onclose = () => closed++;
        await socket._start();
        socket.send('first');
        await flush();
        socket.send('after failure');
        assert.equal(socket.readyState, 3);
        assert.equal(released, 1);
        assert.equal(closed, 1);
        assert.deepEqual(calls, ['scratchlink_bridge_open', 'scratchlink_bridge_send', 'scratchlink_bridge_close']);
    });

    test('late real-socket opening cannot replace a bridge which already took over', async () => {
        const calls = [];
        const bridge = await freshBridge(async name => calls.push(name));
        window.WebSocket = FakeWebSocket;
        bridge.default();
        const facade = new window.WebSocket(LINK);
        const real = built.at(-1);
        let opened = 0;
        facade.onopen = () => opened++;
        real.onerror(new Event('error'));
        await flush();
        real.onopen(new Event('open'));
        facade.send('native frame');
        await flush();
        assert.equal(opened, 1);
        assert.equal(real.closed, true);
        assert.deepEqual(real.sent, []);
        assert.ok(calls.includes('scratchlink_bridge_send'));
        facade.close();
        await flush();
    });

});
