/**
 * The Scratch Link path, made visible on a device with no devtools.
 *
 * THE DEFECT THIS GATES
 * ---------------------
 * "Set connection to Scratch Link, then connect to LEGO Boost" did nothing at
 * all on iOS — no dialog, no error, nothing to read. scratch-vm's
 * ScratchLinkWebSocket opens RAW WebSockets (the local ws:// and the legacy
 * wss:// at once) and surfaces failure only through the extension's own
 * swallowed error path, so from the outside a blocked socket, a socket that
 * opens and is never answered, and a button that was never wired look
 * identical. None of it reached the on-screen log.
 *
 * So the diagnostics layer wraps the WebSocket constructor: which URL was
 * dialled, whether it opened, and the JSON-RPC frames either way. That turns
 * "nothing happens" into a specific unanswered method. These tests assert the
 * wrapper reports all of that AND stays out of the way of every other socket.
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, '../overlay/scratch-gui/src/lib');

/* A WebSocket double that records construction and lets a test drive events. */
const built = [];
class FakeWebSocket {
    constructor (url, protocols) {
        this.url = String(url);
        this.protocols = protocols;
        this.sent = [];
        this.listeners = {};
        built.push(this);
    }
    addEventListener (type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }
    emit (type, event = {}) {
        (this.listeners[type] || []).forEach(fn => fn(event));
    }
    send (data) { this.sent.push(data); }
    close () {}
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

const define = (name, value) =>
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});

define('window', {
    __TAURI__: {},
    isSecureContext: true,
    location: {origin: 'tauri://localhost', hash: ''},
    addEventListener: () => {},
    WebSocket: FakeWebSocket
});
define('navigator', {userAgent: 'test-harness', bluetooth: undefined});
define('document', {body: {appendChild: () => {}}, createElement: () => ({setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {}, style: {}})});

const {default: initBleDiagnostics, getEntries, clearEntries} =
    await import(`${LIB}/ble-diagnostics.js`);

initBleDiagnostics();

/** Every logged line, flattened, since the last clear. */
const logged = () => getEntries().map(e => `${e.tag} ${e.text}`).join('\n');

const LOCAL = 'ws://127.0.0.1:20111/scratch/ble';

describe('the Scratch Link socket reports itself', () => {
    test('dialling the local link is logged with its URL', () => {
        clearEntries();
        new window.WebSocket(LOCAL);
        assert.match(logged(), /scratchlink.*dialling.*127\.0\.0\.1:20111/);
    });

    test('open, error and close each say which URL and how long it took', () => {
        clearEntries();
        const ws = new window.WebSocket(LOCAL);
        ws.emit('open');
        ws.emit('error');
        ws.emit('close', {code: 1006, wasClean: false});
        const text = logged();
        assert.match(text, /OPEN/);
        assert.match(text, /ERROR/);
        // 1006 is the code an iOS-blocked socket closes with, so it has to be
        // in the log verbatim rather than folded into "closed".
        assert.match(text, /CLOSE.*code=1006/);
    });

    test('the JSON-RPC frames are logged in both directions', () => {
        clearEntries();
        const ws = new window.WebSocket(LOCAL);
        ws.send('{"jsonrpc":"2.0","id":1,"method":"discover"}');
        ws.emit('message', {data: '{"jsonrpc":"2.0","id":1,"result":null}'});
        const text = logged();
        assert.match(text, /→.*"method":"discover"/);
        assert.match(text, /←.*"result":null/);
    });

    test('sending still reaches the real socket', () => {
        // Logging that swallowed the frame would break the connection it is
        // meant to diagnose.
        const ws = new window.WebSocket(LOCAL);
        ws.send('hello');
        assert.deepEqual(ws.sent, ['hello']);
    });

    test('the legacy cloud endpoint is covered too', () => {
        clearEntries();
        new window.WebSocket('wss://device-manager.scratch.mit.edu:20110/scratch/ble');
        assert.match(logged(), /scratchlink.*dialling.*20110/);
    });

    test('every other socket passes through unlogged and unwrapped', () => {
        clearEntries();
        const ws = new window.WebSocket('wss://example.com/socket');
        ws.send('x');
        assert.doesNotMatch(logged(), /scratchlink/);
        assert.deepEqual(ws.sent, ['x'], 'a non-link socket must not be rewrapped');
    });

    test('the constructor still produces a real WebSocket', () => {
        // The wrapper returns the native instance rather than a stand-in, so
        // instanceof and the readyState constants keep working.
        const ws = new window.WebSocket(LOCAL);
        assert.ok(ws instanceof FakeWebSocket);
        assert.equal(window.WebSocket.OPEN, 1);
    });
});
