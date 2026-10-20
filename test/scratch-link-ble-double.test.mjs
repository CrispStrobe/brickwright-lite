// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Scratch Link BLE socket double and connectVirtualHub (overlay/scratch-gui/src/lib/virtual-hub/
 * scratch-link-ble.js, connect-virtual-hub.js; docs/ROBOT-LAB-HUBS-PLAN.md P0):
 *
 *   - with NO virtual peripheral registered, or no virtual chooser installed, a Scratch Link BLE
 *     URL opens the page's real WebSocket, unchanged (a headless test, a user's real Scratch Link);
 *     BT-classic and every other URL always do;
 *   - while active it speaks Scratch Link's JSON-RPC: discover answers null at once and streams
 *     didDiscoverPeripheral; connect, write, read, startNotifications; characteristicDidChange
 *     carries the peripheral's notifications, base64, only for subscribed characteristics;
 *     a filter's manufacturerData is matched on what the peripheral advertises (LWP3 §2);
 *   - connectVirtualHub picks the peripheral whose hubState is the hub asked for and refuses others.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VH = path.join(ROOT, 'overlay/scratch-gui/src/lib/virtual-hub');
globalThis.window = globalThis;
const {registerVirtualPeripheral, clearVirtualPeripheralsForTest} = await import(path.join(VH, 'web-bluetooth-shim.js'));
const {default: install, VirtualScratchLinkBleSocket, isScratchLinkBle, manufacturerMatches} = await import(path.join(VH, 'scratch-link-ble.js'));
const {connectVirtualHub} = await import(path.join(VH, 'connect-virtual-hub.js'));

const SERVICE = '00001623-1212-efde-1623-785feabcd123';
const CHAR = '00001624-1212-efde-1623-785feabcd123';

class RealSocket { constructor (url) { this.url = url; this.real = true; } }

const fakePeripheral = (hubState, {company = {0x0397: [0x00, 0x40]}} = {}) => {
    const p = {id: 'p', name: 'LEGO Move Hub', hubState, manufacturerData: company, written: [], subscribed: [],
        services: [{uuid: SERVICE, characteristics: [{uuid: CHAR}]}],
        connect () { this.connected = true; },
        disconnect () { this.connected = false; },
        setNotificationSink (fn) { this.sink = fn; },
        onStartNotifications (uuid) { this.subscribed.push(uuid); this.sink(CHAR, [0x05, 0x00, 0x04, 0x00, 0x00]); },
        onWrite (uuid, bytes) { this.written.push([uuid, [...bytes]]); },
        read () { return [0x64]; }};
    return p;
};

/** Opens a socket through the installed wrapper and talks JSON-RPC to it. */
const client = url => {
    const ws = new window.WebSocket(url);
    const inbox = [];
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else inbox.push(m);
    };
    const opened = new Promise(resolve => { ws.onopen = resolve; });
    const call = (method, params) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({jsonrpc: '2.0', id, method, params})); });
    return {ws, inbox, call, opened};
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('Scratch Link BLE URLs: the loopback and device-manager hosts, /scratch/ble and /ble; never /bt', () => {
    assert.ok(isScratchLinkBle('ws://127.0.0.1:20111/scratch/ble'));
    assert.ok(isScratchLinkBle('wss://device-manager.scratch.mit.edu:20110/scratch/ble'));
    assert.ok(isScratchLinkBle('ws://localhost:20110/ble'));
    assert.ok(!isScratchLinkBle('ws://127.0.0.1:20111/scratch/bt'));
    assert.ok(!isScratchLinkBle('wss://example.org:20110/scratch/ble'));
});

test('falls through to the page\'s WebSocket with no peripheral registered, with no chooser, and for /bt', () => {
    clearVirtualPeripheralsForTest();
    window.WebSocket = RealSocket;
    assert.equal(install(window), 'installed');
    assert.equal(install(window), 'already installed');
    globalThis.__brickwrightChooseVirtualBluetooth = () => null;
    assert.equal(new window.WebSocket('ws://127.0.0.1:20111/scratch/ble').real, true, 'no registry entry: real');
    const off = registerVirtualPeripheral(() => fakePeripheral({}));
    globalThis.__brickwrightChooseVirtualBluetooth = undefined;
    assert.equal(new window.WebSocket('ws://127.0.0.1:20111/scratch/ble').real, true, 'no chooser: real');
    globalThis.__brickwrightChooseVirtualBluetooth = c => c[0];
    assert.equal(new window.WebSocket('ws://127.0.0.1:20111/scratch/bt').real, true, 'BT-classic: real');
    assert.ok(new window.WebSocket('ws://127.0.0.1:20111/scratch/ble') instanceof VirtualScratchLinkBleSocket);
    off();
    globalThis.__brickwrightChooseVirtualBluetooth = undefined;
});

test('the JSON-RPC session: discover → didDiscoverPeripheral, connect, startNotifications → characteristicDidChange, write, read', async () => {
    clearVirtualPeripheralsForTest();
    const hub = {};
    const p = fakePeripheral(hub);
    registerVirtualPeripheral(() => p);
    globalThis.__brickwrightChooseVirtualBluetooth = c => c.find(x => x.hubState === hub);
    const c = client('ws://127.0.0.1:20111/scratch/ble');
    await c.opened;
    // Stock scratch3_boost's filter: the LWP3 service and manufacturer data 0x0397 with byte 1 = 0x40 (Move Hub).
    const filters = [{services: [SERVICE], manufacturerData: {0x0397: {dataPrefix: [0x00, 0x40], mask: [0x00, 0xff]}}}];
    assert.equal((await c.call('discover', {filters})).result, null, 'discover answers null at once');
    await tick();
    const found = c.inbox.find(m => m.method === 'didDiscoverPeripheral');
    assert.equal(found.params.name, 'LEGO Move Hub');
    assert.equal((await c.call('connect', {peripheralId: found.params.peripheralId})).error, undefined);
    assert.equal(p.connected, true);
    await c.call('startNotifications', {serviceId: SERVICE, characteristicId: CHAR});
    assert.deepEqual(p.subscribed, [CHAR]);
    const change = c.inbox.find(m => m.method === 'characteristicDidChange');
    assert.deepEqual({...change.params, message: Buffer.from(change.params.message, 'base64').toString('hex')},
        {serviceId: SERVICE, characteristicId: CHAR, message: '0500040000', encoding: 'base64'});
    await c.call('write', {serviceId: SERVICE, characteristicId: CHAR, message: Buffer.from([5, 0, 1, 0x0b, 5]).toString('base64'), encoding: 'base64'});
    assert.deepEqual(p.written, [[CHAR, [5, 0, 1, 0x0b, 5]]]);
    const read = await c.call('read', {serviceId: SERVICE, characteristicId: CHAR});
    assert.equal(read.result.message, Buffer.from([0x64]).toString('base64'));
    // A service the discover did not allow is refused, as Scratch Link refuses it.
    const refused = await c.call('write', {serviceId: '00004f0e-1212-efde-1523-785feabcd123', characteristicId: CHAR, message: '', encoding: 'base64'});
    assert.match(refused.error.message, /unexpected service/);
    c.ws.close();
    assert.equal(p.connected, false, 'closing the socket disconnects the peripheral');
    globalThis.__brickwrightChooseVirtualBluetooth = undefined;
});

test('a manufacturerData filter is matched on the advertised bytes under the mask', () => {
    const moveHub = fakePeripheral({});
    const filter = {manufacturerData: {0x0397: {dataPrefix: [0x00, 0x40], mask: [0x00, 0xff]}}};
    assert.ok(manufacturerMatches(moveHub, filter));
    assert.ok(!manufacturerMatches(fakePeripheral({}, {company: {0x0397: [0x00, 0x80]}}), filter), 'a Technic hub is not a Move Hub');
    assert.ok(!manufacturerMatches(fakePeripheral({}, {company: {}}), filter));
    assert.ok(manufacturerMatches(moveHub, {services: [SERVICE]}), 'no manufacturerData in the filter: passes');
});

test('connectVirtualHub chooses by hubState, fails closed on another hub, and puts the previous chooser back', async () => {
    const mine = {};
    const previous = () => null;
    globalThis.__brickwrightChooseVirtualBluetooth = previous;
    let connected = false;
    let chose = null;
    await connectVirtualHub({hubState: mine, connected: () => connected, disconnect: () => {}, wait: () => Promise.resolve(),
        connect: () => {
            const chooser = globalThis.__brickwrightChooseVirtualBluetooth;
            assert.equal(chooser.virtualOnly, true);
            chose = chooser([{hubState: {}}, {hubState: mine, id: 'mine'}]);
            connected = true;
        }});
    assert.equal(chose.id, 'mine');
    assert.equal(globalThis.__brickwrightChooseVirtualBluetooth, previous);
    await assert.rejects(connectVirtualHub({hubState: mine, extensionId: 'legopoweredup', connected: () => false, disconnect: () => {},
        wait: () => Promise.resolve(), timeoutMs: 1,
        connect: () => globalThis.__brickwrightChooseVirtualBluetooth([{hubState: {}}])}), /not among the offered devices/);
    await assert.rejects(connectVirtualHub({connected: () => false}), /unavailable/);
    globalThis.__brickwrightChooseVirtualBluetooth = undefined;
});
