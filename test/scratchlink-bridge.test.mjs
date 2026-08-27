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
import {test, describe, beforeEach} from 'node:test';
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

const {default: installScratchLinkBridge, isScratchLinkUrl, transportPreference} =
    await import(`${LIB}/native-scratch-link-bridge.js`);

const LINK = 'ws://127.0.0.1:20111/scratch/ble';

beforeEach(() => { built.length = 0; invoked.length = 0; store.clear(); });

describe('installing the fallback', () => {
    test('it installs in the app', () => {
        assert.equal(installScratchLinkBridge(), 'installed');
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
        const ws = new window.WebSocket('wss://example.com/game');
        assert.ok(ws instanceof FakeWebSocket, 'a project\'s own WebSocket must not be intercepted');
        assert.equal(invoked.length, 0, 'and must never reach the native bridge');
    });

    test('a scratch-link URL still tries the REAL socket first', () => {
        new window.WebSocket(LINK);
        assert.equal(built.length, 1, 'the socket route must be attempted, not bypassed');
        assert.equal(built[0].url, LINK);
        assert.equal(invoked.length, 0, 'the bridge must not be opened while the socket may still succeed');
    });

    test('a socket that opens keeps ownership — send goes to it, not the bridge', () => {
        const facade = new window.WebSocket(LINK);
        const real = built[0];
        real.onopen(new Event('open'));
        facade.send('{"method":"discover"}');
        assert.deepEqual(real.sent, ['{"method":"discover"}']);
        assert.equal(invoked.length, 0, 'a working socket must never be replaced by the bridge');
    });
});

describe('the bridge takes over only when the socket cannot', () => {
    test('a socket that closes before opening hands over', async () => {
        new window.WebSocket(LINK);
        built[0].onclose({code: 1006, wasClean: false});
        await new Promise(r => setTimeout(r, 10));
        assert.ok(invoked.some(i => i.cmd === 'scratchlink_bridge_open'),
            'the unrecoverable case is exactly what this module is for');
    });

    test('a socket error hands over too', async () => {
        new window.WebSocket(LINK);
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
        const ws = new window.WebSocket(LINK);
        assert.ok(ws instanceof FakeWebSocket, 'socket-only must return the real socket itself');
        built[0].onclose && built[0].onclose({code: 1006});
        await new Promise(r => setTimeout(r, 10));
        assert.equal(invoked.length, 0, 'picking socket-only must never fall back');
    });

    test('"bridge" goes straight to the native path, no socket attempted', async () => {
        store.set('bw-scratchlink-transport', 'bridge');
        new window.WebSocket(LINK);
        await new Promise(r => setTimeout(r, 10));
        assert.equal(built.length, 0, 'bridge-only must not dial a socket at all');
        assert.ok(invoked.some(i => i.cmd === 'scratchlink_bridge_open'));
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
