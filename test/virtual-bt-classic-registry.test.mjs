// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Scratch Link BT-classic virtual peripheral registry (lib/virtual-hub/bt-classic-registry.js;
 * docs/ROBOT-LAB-HUBS-PLAN.md P0): JSON-RPC discover/connect/send with base64 bytes, peripherals
 * keyed by name and device class, replies after the `send` result, and fall-through to the real
 * WebSocket when nothing is registered — with SPIKE's 2.x REPL simulation still claiming first.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, '../overlay/scratch-gui/src/lib/virtual-hub');
const {VirtualClassicSocket, registerVirtualClassicPeripheral, clearVirtualClassicPeripheralsForTest,
    installVirtualClassicScratchLink, availableClassicPeripherals} = await import(`${LIB}/bt-classic-registry.js`);
const {default: installSpike, VirtualSpikeClassicSocket} = await import(`${LIB}/spike-classic-scratch-link.js`);
const {default: HubState} = await import(`${LIB}/spike-hub-state.js`);

const URL = 'ws://127.0.0.1:20111/scratch/bt';
const macrotask = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await macrotask(); };

/** An echo brick: replies with its input reversed, records what it got. */
const echo = (id, name, cls = {}) => {
    const log = {opened: 0, closed: 0, got: []};
    return {log, peripheral: {id, name, ...cls, open: link => {
        log.opened++;
        return {receive: bytes => { log.got.push([...bytes]); link.send(Uint8Array.from([...bytes].reverse())); },
            close: () => { log.closed++; }};
    }}};
};

const rpc = socket => {
    const messages = [];
    socket.onmessage = event => messages.push(JSON.parse(event.data));
    let id = 0;
    return {messages, call: (method, params) => { socket.send(JSON.stringify({jsonrpc: '2.0', id: ++id, method, params})); return id; }};
};

test('discover announces registered peripherals of the asked device class; connect + send carry base64 bytes both ways', async t => {
    clearVirtualClassicPeripheralsForTest();
    t.after(clearVirtualClassicPeripheralsForTest);
    const ev3 = echo('virtual-ev3', 'Virtual EV3', {majorDeviceClass: 8, minorDeviceClass: 1});
    const other = echo('virtual-printer', 'Virtual Printer', {majorDeviceClass: 6, minorDeviceClass: 32});
    registerVirtualClassicPeripheral(ev3.peripheral);
    registerVirtualClassicPeripheral(other.peripheral);
    const socket = new VirtualClassicSocket(URL);
    const {messages, call} = rpc(socket);
    await settle();
    assert.equal(socket.readyState, 1);
    call('discover', {majorDeviceClass: 8, minorDeviceClass: 1});
    await settle();
    const found = messages.filter(m => m.method === 'didDiscoverPeripheral').map(m => m.params.name);
    assert.deepEqual(found, ['Virtual EV3'], 'the toy/robot class only');
    const connect = call('connect', {peripheralId: 'virtual-ev3', pin: '1234'});
    assert.deepEqual(messages.find(m => m.id === connect), {jsonrpc: '2.0', id: connect, result: null});
    assert.equal(ev3.log.opened, 1);
    const send = call('send', {message: Buffer.from([1, 2, 3]).toString('base64'), encoding: 'base64'});
    // The result first, the reply on a later macrotask (an extension that awaits `send` before
    // listening for the reply must still get it).
    const resultAt = messages.findIndex(m => m.id === send);
    assert.ok(resultAt >= 0);
    assert.equal(messages.slice(resultAt).some(m => m.method === 'didReceiveMessage'), false);
    await settle();
    const reply = messages.find(m => m.method === 'didReceiveMessage');
    assert.deepEqual([...Buffer.from(reply.params.message, 'base64')], [3, 2, 1]);
    assert.equal(reply.params.encoding, 'base64');
    assert.deepEqual(ev3.log.got, [[1, 2, 3]]);
    socket.close();
    assert.equal(ev3.log.closed, 1, 'closing the socket closes the session');
});

test('an unknown or unavailable peripheral is refused; text is refused; ping answers 42', async t => {
    clearVirtualClassicPeripheralsForTest();
    t.after(clearVirtualClassicPeripheralsForTest);
    let up = true;
    const nxt = echo('virtual-nxt', 'Virtual NXT');
    registerVirtualClassicPeripheral({...nxt.peripheral, available: () => up});
    assert.equal(availableClassicPeripherals().length, 1);
    const socket = new VirtualClassicSocket(URL);
    const {messages, call} = rpc(socket);
    await settle();
    const missing = call('connect', {peripheralId: 'nobody'});
    assert.match(messages.find(m => m.id === missing).error.message, /no virtual peripheral/);
    up = false;
    const gone = call('connect', {peripheralId: 'virtual-nxt'});
    assert.ok(messages.find(m => m.id === gone).error, 'an unavailable peripheral cannot be connected');
    up = true;
    call('connect', {peripheralId: 'virtual-nxt'});
    const text = call('send', {message: 'hello', encoding: 'utf8'});
    assert.match(messages.find(m => m.id === text).error.message, /base64/);
    const ping = call('ping', {});
    assert.equal(messages.find(m => m.id === ping).result, 42);
    assert.throws(() => registerVirtualClassicPeripheral(nxt.peripheral), /twice/);
});

test('the WebSocket wrapper: nothing registered falls through to the real socket; SPIKE claims first while enabled', async t => {
    clearVirtualClassicPeripheralsForTest();
    t.after(clearVirtualClassicPeripheralsForTest);
    class Native { constructor (url) { this.url = url; this.native = true; } }
    const host = {WebSocket: Native};
    assert.equal(installVirtualClassicScratchLink({host}), 'installed');
    assert.equal(installVirtualClassicScratchLink({host}), 'already installed');
    assert.equal(new host.WebSocket(URL).native, true, 'nothing registered: the real Scratch Link');
    assert.equal(new host.WebSocket('ws://example.com:20111/scratch/bt').native, true);
    const unregister = registerVirtualClassicPeripheral(echo('virtual-ev3', 'Virtual EV3').peripheral);
    assert.ok(new host.WebSocket(URL) instanceof VirtualClassicSocket, 'a registered brick: the registry');
    assert.equal(new host.WebSocket('ws://127.0.0.1:20111/scratch/ble').native, true, 'BLE is not this registry\'s');
    // SPIKE's REPL simulation: its claim comes first while it is enabled, and passes otherwise.
    const hubState = new HubState();
    assert.equal(installSpike(hubState, {host}), 'already installed', 'one wrapper serves both');
    assert.ok(new host.WebSocket(URL) instanceof VirtualClassicSocket);
    hubState.setSimulationEnabled(true);
    assert.ok(new host.WebSocket(URL) instanceof VirtualClassicSocket, 'official 3.x firmware speaks no REPL: the registry');
    hubState.setFirmwareTarget('legacy-v2');
    assert.ok(new host.WebSocket(URL) instanceof VirtualSpikeClassicSocket);
    hubState.setSimulationEnabled(false);
    unregister();
    assert.equal(new host.WebSocket(URL).native, true);
    host.__brickwrightVirtualSpikeClassicClaim();
});
