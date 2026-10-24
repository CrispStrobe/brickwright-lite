// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {installVirtualBridge, registerVirtualBridge, bridgeEndpointFor, VirtualBridgeSocket} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-bridge.js';
import {installVirtualFetch, registerVirtualHttp} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-http.js';
import {installVirtualSerial, createVirtualSerial, VirtualSerialPort} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-serial.js';
import {createVirtualBleBridge} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-ble-bridge.js';

class PhysicalSocket {
    constructor (...args) { this.args = args; }
}
const timers = t => t.mock.timers.enable({apis: ['setTimeout']});
const peripheral = () => {
    const state = {opens: 0, closes: 0};
    return {state, available: () => true, open (link) {
        state.opens++;
        return {receive: bytes => link.send(bytes), close: () => { state.closes++; }};
    }};
};

test('bridge leases preserve a remaining owner and real-network constructor arguments', t => {
    const host = {WebSocket: PhysicalSocket};
    const a = installVirtualBridge({host});
    const b = installVirtualBridge({host});
    t.after(() => { a(); b(); });
    assert.notEqual(host.WebSocket, PhysicalSocket);
    a(); a();
    assert.notEqual(host.WebSocket, PhysicalSocket, 'the second owner still needs its wrapper');
    const real = new host.WebSocket('wss://example.invalid/socket', ['one', 'two']);
    assert.ok(real instanceof PhysicalSocket);
    assert.deepEqual(real.args, ['wss://example.invalid/socket', ['one', 'two']]);
    b();
    assert.equal(host.WebSocket, PhysicalSocket);
});

test('fetch leases keep virtual replies and pass unrelated requests to the original', async t => {
    const calls = [];
    const before = async (...args) => { calls.push(args); return new Response('physical'); };
    const host = {fetch: before};
    const remove = registerVirtualHttp({port: 49610, handle: () => ({json: {lab: true}})});
    const a = installVirtualFetch({host});
    const b = installVirtualFetch({host});
    t.after(() => { remove(); a(); b(); });
    a();
    assert.notEqual(host.fetch, before);
    assert.deepEqual(await (await host.fetch('http://localhost:49610')).json(), {lab: true});
    const init = {method: 'POST', body: 'unchanged'};
    assert.equal(await (await host.fetch('https://example.invalid', init)).text(), 'physical');
    assert.deepEqual(calls, [['https://example.invalid', init]]);
    b();
    assert.equal(host.fetch, before);
});

test('serial release preserves a foreign replacement and restores an owned accessor exactly', () => {
    const original = {};
    const getter = () => original;
    const host = {};
    Object.defineProperty(host, 'serial', {get: getter, enumerable: false, configurable: true});
    const descriptor = Object.getOwnPropertyDescriptor(host, 'serial');
    const a = installVirtualSerial({host});
    a();
    assert.deepEqual(Object.getOwnPropertyDescriptor(host, 'serial'), descriptor);
    const b = installVirtualSerial({host});
    const foreign = {};
    host.serial = foreign;
    b(); b();
    assert.equal(host.serial, foreign);
});

test('unregistering a bridge before its open turn cannot open the removed endpoint', t => {
    timers(t);
    const p = peripheral();
    const host = {WebSocket: PhysicalSocket};
    const restore = installVirtualBridge({host});
    const remove = registerVirtualBridge({port: 49611, framing: 'binary', peripheral: p});
    const socket = new host.WebSocket('ws://localhost:49611');
    let closed = 0;
    socket.onclose = () => { closed++; };
    t.after(() => { socket.close(); remove(); restore(); });
    remove();
    t.mock.timers.runAll();
    assert.equal(p.state.opens, 0);
    assert.equal(socket.readyState, 3);
    assert.equal(closed, 1);
});

test('endpoint removal closes only its own open sockets and suppresses queued replies', t => {
    timers(t);
    const a = peripheral();
    const b = peripheral();
    const host = {WebSocket: PhysicalSocket};
    const restore = installVirtualBridge({host});
    const removeA = registerVirtualBridge({port: 49612, framing: 'binary', peripheral: a});
    const removeB = registerVirtualBridge({port: 49613, framing: 'binary', peripheral: b});
    const sa = new host.WebSocket('ws://localhost:49612');
    const sb = new host.WebSocket('ws://localhost:49613');
    const repliesA = [];
    const repliesB = [];
    sa.onmessage = event => repliesA.push(event.data);
    sb.onmessage = event => repliesB.push(event.data);
    t.after(() => { sa.close(); sb.close(); removeA(); removeB(); restore(); });
    t.mock.timers.runAll();
    assert.equal(a.state.opens, 1);
    assert.equal(b.state.opens, 1);
    sa.send(Uint8Array.of(11));
    removeA(); removeA();
    sb.send(Uint8Array.of(22));
    t.mock.timers.runAll();
    assert.equal(a.state.closes, 1);
    assert.equal(b.state.closes, 0);
    assert.equal(sa.readyState, 3);
    assert.equal(sb.readyState, 1);
    assert.deepEqual(repliesA, []);
    assert.deepEqual(Array.from(repliesB[0]), [22]);
});

test('removing an HTTP endpoint rejects an in-flight consumer before the producer settles', async t => {
    let finish;
    let entered = false;
    const producer = new Promise(resolve => { finish = resolve; });
    const host = {fetch: async () => new Response('physical')};
    const remove = registerVirtualHttp({port: 49614, handle: () => { entered = true; return producer; }});
    const restore = installVirtualFetch({host});
    let outcome = 'pending';
    const reply = host.fetch('http://localhost:49614');
    reply.then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
    t.after(async () => { finish({json: {late: true}}); await reply.catch(() => {}); remove(); restore(); });
    await Promise.resolve();
    assert.equal(entered, true);
    remove();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(outcome, 'rejected');
    await assert.rejects(reply, error => error.name === 'AbortError');
});

test('HTTP handlers on one port are selected by declared paths and unknown paths fall through', async t => {
    const host = {fetch: async () => new Response('physical')};
    const removeA = registerVirtualHttp({port: 49615, matches: url => url.pathname === '/', handle: () => ({json: {brick: true}})});
    const removeB = registerVirtualHttp({port: 49615, matches: url => url.pathname === '/scan', handle: () => ({json: {bridge: true}})});
    const restore = installVirtualFetch({host});
    t.after(() => { removeA(); removeB(); restore(); });
    assert.deepEqual(await (await host.fetch('http://localhost:49615/')).json(), {brick: true});
    assert.deepEqual(await (await host.fetch('http://localhost:49615/scan')).json(), {bridge: true});
    assert.equal(await (await host.fetch('http://localhost:49615/unrelated')).text(), 'physical');
});

test('an unavailable bridge session reports an error and closes without an uncaught open callback', t => {
    timers(t);
    const host = {WebSocket: PhysicalSocket};
    const restore = installVirtualBridge({host});
    const remove = registerVirtualBridge({port: 49616, framing: 'binary', peripheral: {open () { throw new Error('scene closed'); }}});
    const socket = new host.WebSocket('ws://localhost:49616');
    let errors = 0;
    let closes = 0;
    socket.onerror = () => { errors++; };
    socket.onclose = () => { closes++; };
    t.after(() => { socket.close(); remove(); restore(); });
    assert.doesNotThrow(() => t.mock.timers.runAll());
    assert.equal(errors, 1);
    assert.equal(closes, 1);
    assert.equal(socket.readyState, 3);
});

test('bridge installation tolerates native readonly constants and restores an inherited property', () => {
    class NativeLike extends PhysicalSocket {}
    Object.defineProperty(NativeLike, 'CONNECTING', {value: 0});
    const proto = {WebSocket: NativeLike};
    const host = Object.create(proto);
    const restore = installVirtualBridge({host});
    assert.equal(host.WebSocket.CONNECTING, 0);
    assert.ok(new host.WebSocket('wss://example.invalid') instanceof NativeLike);
    restore();
    assert.equal(Object.hasOwn(host, 'WebSocket'), false);
    assert.equal(host.WebSocket, NativeLike);
});

test('a foreign wrapper survives release and an obsolete captured wrapper becomes inert', t => {
    timers(t);
    const p = peripheral();
    const endpoint = {port: 49617, framing: 'binary', peripheral: p};
    const remove = registerVirtualBridge(endpoint);
    const host = {WebSocket: PhysicalSocket};
    const a = installVirtualBridge({host});
    const captured = host.WebSocket;
    const foreign = function (url, protocols) { return new captured(url, protocols); };
    host.WebSocket = foreign;
    a();
    assert.equal(host.WebSocket, foreign);
    assert.ok(new host.WebSocket('ws://localhost:49617') instanceof PhysicalSocket);
    const b = installVirtualBridge({host});
    const socket = new host.WebSocket('ws://localhost:49617');
    t.after(() => { socket.close(); remove(); a(); b(); });
    t.mock.timers.runAll();
    assert.equal(p.state.opens, 1, 'the newly acquired wrapper serves its endpoint');
    b();
    assert.equal(host.WebSocket, foreign);
});

test('duplicate endpoint registrations retain independent ownership and public identity', t => {
    timers(t);
    const p = peripheral();
    const endpoint = {port: 49618, framing: 'binary', peripheral: p};
    const a = registerVirtualBridge(endpoint);
    const b = registerVirtualBridge(endpoint);
    const host = {WebSocket: PhysicalSocket};
    const restore = installVirtualBridge({host});
    const socket = new host.WebSocket('ws://localhost:49618');
    t.after(() => { socket.close(); a(); b(); restore(); });
    assert.equal(bridgeEndpointFor('ws://localhost:49618'), endpoint);
    t.mock.timers.runAll();
    b();
    assert.equal(socket.readyState, 1);
    assert.equal(p.state.closes, 0);
    a();
    assert.equal(socket.readyState, 3);
    assert.equal(p.state.closes, 1);
});

test('direct socket and serial constructors retain normal connection behavior', async t => {
    timers(t);
    const p = peripheral();
    const socket = new VirtualBridgeSocket('ws://localhost:49619', {framing: 'binary', peripheral: p});
    t.after(() => socket.close());
    t.mock.timers.runAll();
    assert.equal(socket.readyState, 1);
    const port = new VirtualSerialPort(p);
    t.after(() => port.close());
    await port.open({baudRate: 9600});
    assert.equal(p.state.opens, 2);
    await port.close();
    await port.open({baudRate: 9600});
    assert.equal(p.state.opens, 3, 'an ordinary close still permits reconnecting');
});

test('serial leases keep separate providers and close only the removed owner ports', async t => {
    const a = {...peripheral(), id: 'a', name: 'A'};
    const b = {...peripheral(), id: 'b', name: 'B'};
    const physical = {};
    const host = {serial: physical};
    const releaseA = installVirtualSerial({host, peripherals: () => [a]});
    const portA = await host.serial.requestPort();
    await portA.open({baudRate: 9600});
    const releaseB = installVirtualSerial({host, peripherals: () => [b]});
    t.after(async () => { await releaseA(); await releaseB(); });
    const portB = await host.serial.requestPort();
    await portB.open({baudRate: 115200});
    await releaseA();
    assert.equal(a.state.closes, 1);
    assert.equal(b.state.closes, 0);
    assert.equal(await host.serial.requestPort(), portB);
    await assert.rejects(portA.open({baudRate: 9600}), {name: 'NetworkError'});
    await releaseB();
    assert.equal(b.state.closes, 1);
    assert.equal(host.serial, physical);
});

test('same-ID serial replacements never inherit the old port or its open session', async t => {
    const old = {...peripheral(), id: 'brick', name: 'Old'};
    const next = {...peripheral(), id: 'brick', name: 'Next'};
    let current = old;
    const serial = createVirtualSerial({peripherals: () => [current], granted: true});
    t.after(() => serial.dispose());
    const [port] = await serial.getPorts();
    await port.open({baudRate: 9600});
    current = next;
    const [first, second] = await Promise.all([serial.getPorts(), serial.getPorts()]);
    assert.notEqual(first[0], port);
    assert.equal(first[0], second[0], 'concurrent discovery shares one new incarnation');
    assert.equal(old.state.closes, 1);
    await assert.rejects(port.open({baudRate: 9600}), {name: 'NetworkError'});
    await first[0].open({baudRate: 9600});
    assert.equal(next.state.opens, 1);
    assert.equal(old.state.opens, 1);
    await serial.dispose();
    assert.deepEqual(await serial.getPorts(), []);
    await assert.rejects(serial.requestPort(), {name: 'NotFoundError'});
});

test('a serial session closed synchronously during open cannot revive after its return', async () => {
    let closes = 0;
    const port = new VirtualSerialPort({open (link) {
        link.close();
        return {receive () {}, close () { closes++; }};
    }});
    await assert.rejects(port.open({baudRate: 9600}), {name: 'NetworkError'});
    assert.equal(port.session, null);
    assert.equal(port.readable, null);
    assert.equal(port.writable, null);
    assert.equal(closes, 1);
});

test('BLE HTTP handler disposal closes retained connections and refuses later traffic', () => {
    let connects = 0;
    let disconnects = 0;
    let writes = 0;
    const p = {id: 'radio', name: 'Radio', services: [{characteristics: [{uuid: 'notify'}]}],
        connect () { connects++; }, disconnect () { disconnects++; }, setNotificationSink () {},
        onWrite () { writes++; }};
    const bridge = createVirtualBleBridge(() => [p]);
    const request = path => ({method: 'POST', path, json: () => ({deviceId: 'radio', characteristic: 'notify', data: [1]})});
    assert.deepEqual(bridge(request('/connect')), {json: {}});
    assert.equal(connects, 1);
    assert.deepEqual(bridge(request('/write')), {json: {}});
    assert.equal(writes, 1);
    bridge.dispose(); bridge.dispose();
    assert.equal(disconnects, 1);
    assert.equal(bridge(request('/connect')).status, 503);
    assert.equal(bridge(request('/write')).status, 503);
    assert.equal(connects, 1);
    assert.equal(writes, 1);
});

const serialFixture = () => {
    const links = [];
    const writes = [];
    const closes = [];
    const port = new VirtualSerialPort({open (link) {
        const id = links.length;
        links.push(link);
        return {receive: bytes => writes.push({id, bytes: Array.from(bytes)}), close: () => closes.push(id)};
    }});
    return {port, links, writes, closes};
};

test('a queued serial reply from an earlier open cannot reach a reopened reader', async t => {
    timers(t);
    const {port, links} = serialFixture();
    t.after(() => port.dispose());
    await port.open({baudRate: 9600});
    links[0].send(Uint8Array.of(7));
    await port.close();
    await port.open({baudRate: 9600});
    const reader = port.readable.getReader();
    const received = reader.read();
    links[1].send(Uint8Array.of(8));
    t.mock.timers.runAll();
    assert.deepEqual(Array.from((await received).value), [8]);
});

test('a retained old serial writer cannot send into a newer session', async t => {
    const {port, writes} = serialFixture();
    t.after(() => port.dispose());
    await port.open({baudRate: 9600});
    const old = port.writable.getWriter();
    await port.close();
    await port.open({baudRate: 9600});
    await assert.rejects(old.write(Uint8Array.of(9)), {name: 'InvalidStateError'});
    assert.deepEqual(writes, []);
    await port.writable.getWriter().write(Uint8Array.of(10));
    assert.deepEqual(writes, [{id: 1, bytes: [10]}]);
});

test('an earlier serial peer close callback cannot close a reopened connection', async t => {
    const {port, links, closes} = serialFixture();
    t.after(() => port.dispose());
    await port.open({baudRate: 9600});
    await port.close();
    await port.open({baudRate: 9600});
    links[0].close();
    assert.ok(port.session);
    assert.deepEqual(closes, [0]);
    await port.writable.getWriter().write(Uint8Array.of(12));
});

test('reentrant serial open is refused without replacing the admitted session', async t => {
    let opens = 0;
    let nested;
    const port = new VirtualSerialPort({open () {
        opens++;
        if (opens === 1) nested = port.open({baudRate: 9600}).then(
            value => ({ok: true, value}), error => ({ok: false, error}));
        return {receive () {}, close () {}};
    }});
    t.after(() => port.dispose());
    await assert.doesNotReject(port.open({baudRate: 9600}));
    const outcome = await nested;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.name, 'InvalidStateError');
    assert.equal(opens, 1);
    assert.ok(port.session);
});

test('serial cleanup failure still closes its reader and releases stream references', async () => {
    const original = new Error('session cleanup failed');
    const port = new VirtualSerialPort({open: () => ({receive () {}, close () { throw original; }})});
    await port.open({baudRate: 9600});
    const reader = port.readable.getReader();
    const pending = reader.read();
    await assert.rejects(port.close(), error => error === original);
    assert.equal(port.session, null);
    assert.equal(port.readable, null);
    assert.equal(port.writable, null);
    assert.deepEqual(await pending, {value: undefined, done: true});
    await port.close();
});

test('throwing bridge cleanup terminates every owned socket and reports all failures', t => {
    timers(t);
    const firstError = new Error('first session cleanup failed');
    let opens = 0;
    let closes = 0;
    const host = {WebSocket: PhysicalSocket};
    const restore = installVirtualBridge({host});
    const remove = registerVirtualBridge({port: 49620, framing: 'binary', peripheral: {open () {
        const id = opens++;
        return {receive () {}, close () { closes++; if (id === 0) throw firstError; }};
    }}});
    const a = new host.WebSocket('ws://localhost:49620');
    const b = new host.WebSocket('ws://localhost:49620');
    let events = 0;
    a.onclose = b.onclose = () => { events++; };
    t.after(() => { a.close(); b.close(); remove(); restore(); });
    t.mock.timers.runAll();
    assert.throws(remove, error => error instanceof AggregateError && error.errors[0] === firstError);
    assert.equal(closes, 2);
    assert.equal(a.readyState, 3);
    assert.equal(b.readyState, 3);
    t.mock.timers.runAll();
    assert.equal(events, 2);
    assert.throws(() => b.send(Uint8Array.of(1)), {name: 'InvalidStateError'});
});

test('a failed BLE notification subscription rolls back before a later connect', t => {
    let fail = true;
    let connects = 0;
    let disconnects = 0;
    const original = new Error('subscription failed');
    const p = {id: 'radio', connected: false, services: [{characteristics: [{uuid: 'notify'}]}],
        connect () { connects++; this.connected = true; },
        disconnect () { disconnects++; this.connected = false; }, setNotificationSink () {},
        onStartNotifications () { if (fail) throw original; }};
    const bridge = createVirtualBleBridge(() => [p]);
    t.after(() => bridge.dispose());
    const request = {method: 'POST', path: '/connect', json: () => ({deviceId: 'radio'})};
    assert.throws(() => bridge(request), error => error === original);
    assert.equal(p.connected, false);
    assert.equal(disconnects, 1);
    fail = false;
    assert.deepEqual(bridge(request), {json: {}});
    assert.equal(connects, 2, 'the recovery invokes a real new connection');
});

test('BLE disposal during connect cannot install a new sink or report success afterward', () => {
    let sinks = 0;
    let bridge;
    const p = {id: 'radio', services: [{characteristics: [{uuid: 'notify'}]}],
        connect () { bridge.dispose(); }, disconnect () {},
        setNotificationSink (sink) { if (sink) sinks++; }};
    bridge = createVirtualBleBridge(() => [p]);
    const request = {method: 'POST', path: '/connect', json: () => ({deviceId: 'radio'})};
    assert.throws(() => bridge(request), /closed/);
    assert.equal(sinks, 0);
    assert.equal(bridge(request).status, 503);
});
