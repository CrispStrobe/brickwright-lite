// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabExtensionConnection, serializeLabLegacyConnection} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-extension-connection.js';

const fixture = (id, extra = {}) => {
    const calls = [];
    let connected = false;
    const methods = {
        disconnect: () => { connected = false; }, disconnectHub: () => { connected = false; }, disableStreaming () {},
        setMode () {}, setConnectionMode () {}, setConnectionType () {}, setBridgeURL () {},
        connect: () => { connected = true; }, connectHubAt: () => { connected = true; },
        isConnected: () => connected, testConnection: () => 'Connected', ...extra
    };
    const runtime = {_primitives: Object.fromEntries(Object.entries(methods).map(([opcode, fn]) =>
        [`${id}_${opcode}`, (...args) => { calls.push([opcode, args[0]]); return fn(...args); }]))};
    if (id === 'spikeprime') runtime.peripheralExtensions = {spikeprime: {
        portValues: Object.fromEntries('ABCDEF'.split('').map(port => [port, {type: 'unknown'}]))
    }};
    return {vm: {runtime}, calls, start: options => createLabExtensionConnection({vm: {runtime}, extensionId: id, ...options})};
};

for (const [id, route, mode, endpoint] of [
    ['ev3comprehensive', 'serial', 'serial', ''], ['ev3comprehensive', 'bridge', 'bridge', 'ws://localhost:8080'],
    ['legonxt', 'serial', 'direct', ''], ['legonxt', 'bridge', 'bridge', 'ws://localhost:8765']
]) test(`${id} ${route}: disconnect precedes mode/configuration and uses the owned endpoint`, async () => {
    const f = fixture(id);
    const connection = f.start({route});
    assert.deepEqual(await connection.ready, {extensionId: id, route});
    assert.deepEqual(f.calls.slice(0, 3), [
        ['disconnect', {}], [id === 'legonxt' ? 'setConnectionMode' : 'setMode', {MODE: mode}],
        ['connect', id === 'legonxt' ? {URL: endpoint} : {PARAM: endpoint}]
    ]);
    await connection.cancel();
    assert.equal(f.calls.at(-1)[0], 'disconnect');
});

test('SPIKE uses its actual bridge block; radio hubs use their actual HTTP bridge blocks', async () => {
    for (const id of ['spikeprime', 'legopoweredup', 'legoboostunified']) {
        const f = fixture(id);
        const connection = f.start({route: id === 'spikeprime' ? 'bridge' : 'http'});
        await connection.ready;
        if (id === 'spikeprime') assert.deepEqual(f.calls.slice(0, 2), [
            ['disconnectHub', {}], ['connectHubAt', {URL: 'localhost:8081'}]
        ]);
        else assert.deepEqual(f.calls.slice(0, 4), [
            ['disconnect', {}], ['setConnectionType', {TYPE: 'bridge'}],
            ['setBridgeURL', {URL: 'http://localhost:8080'}], ['connect', {}]
        ]);
        await connection.cancel();
    }
});

test('HTTP configures the ev3dev provider to loopback and checks protocol status instead of translated error prose', async () => {
    for (const valid of [true, false]) {
        const f = fixture('scratchtoev3', {testConnection: () => valid ? 'Verbunden' : 'Not connected'});
        const calls = [];
        const connection = f.start({route: 'http', host: {fetch: async url => {
            calls.push(url); return {ok: true, json: async () => ({status: valid ? 'ev3_bridge_active' : 'error'})};
        }}});
        if (valid) await connection.ready;
        else await assert.rejects(connection.ready, /HTTP connection failed/);
        assert.deepEqual(f.calls.slice(0, 3), [
            ['disableStreaming', {}], ['setConnectionMode', {MODE: 'http', IP: '127.0.0.1', PORT: 8080}], ['testConnection', {}]
        ]);
        assert.deepEqual(calls, ['http://127.0.0.1:8080/']);
        await connection.cancel();
    }
});

test('a delayed canceled connect cleans up before the next request can touch the provider', async () => {
    let release;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let count = 0;
    const f = fixture('legonxt', {connect: () => {
        if (++count === 1) { entered(); return new Promise(resolve => { release = resolve; }); }
    }, isConnected: () => true});
    const first = f.start({route: 'serial'});
    const failed = assert.rejects(first.ready, {name: 'AbortError'});
    await started;
    const next = f.start({route: 'bridge'});
    await Promise.resolve();
    assert.equal(count, 1, 'new producer connection waits behind the old callback');
    release();
    await failed;
    await next.ready;
    const secondConnect = f.calls.findIndex(([op, args]) => op === 'connect' && args.URL?.includes('8765'));
    assert.equal(f.calls[secondConnect - 1][0], 'setConnectionMode');
    assert.equal(f.calls[secondConnect - 2][0], 'disconnect');
    assert.equal(f.calls[secondConnect - 3][0], 'disconnect', 'old canceled request cleaned itself before new setup');
    const before = f.calls.length;
    await first.cancel();
    assert.equal(f.calls.length, before, 'late old cancellation cannot close the new connection');
    await next.cancel();
});

test('a replaced scene never reaches a mode change or reports a successful connection', async () => {
    let current = true;
    const f = fixture('ev3comprehensive', {disconnect: () => { current = false; }});
    const connection = f.start({route: 'bridge', isCurrent: () => current});
    await assert.rejects(connection.ready, {name: 'AbortError'});
    assert.ok(f.calls.every(([op]) => op === 'disconnect'));
    await connection.cancel();
});

test('replacement while the final connected reporter returns cannot publish success', async () => {
    let current = true;
    const f = fixture('ev3comprehensive', {isConnected: () => { current = false; return true; }});
    const connection = f.start({route: 'bridge', isCurrent: () => current});
    await assert.rejects(connection.ready, {name: 'AbortError'});
    assert.equal(f.calls.at(-1)[0], 'disconnect');
    await connection.cancel();
});

test('connection failure and cleanup failure remain visible, and unsupported providers never run', async () => {
    const failure = new Error('producer connect failed');
    const f = fixture('legopoweredup', {connect: () => { throw failure; }});
    const connection = f.start({route: 'http'});
    await assert.rejects(connection.ready, error => error === failure);
    assert.equal(f.calls.at(-1)[0], 'disconnect');
    await connection.cancel();
    assert.throws(() => f.start({route: 'serial'}), /does not support/);
    assert.throws(() => createLabExtensionConnection({vm: {_primitives: {}}, extensionId: 'wedo2', route: 'http'}), /does not support/);
});

test('a truthy status error cannot count as connected, and the final poll honors a partial deadline step', async () => {
    const f = fixture('ev3comprehensive', {isConnected: () => 'connection error'});
    const waits = [];
    const connection = f.start({route: 'bridge', timeoutMs: 125, wait: async ms => { waits.push(ms); }});
    await assert.rejects(connection.ready, /No connection/);
    assert.deepEqual(waits, [50, 50, 25]);
    assert.equal(f.calls.filter(([op]) => op === 'isConnected').length, 4);
    assert.equal(f.calls.at(-1)[0], 'disconnect');
    await connection.cancel();
});

test('cancel retains a producer cleanup failure already reported by the canceled connect', async () => {
    const failure = new Error('disconnect failed');
    let entered;
    let release;
    let closes = 0;
    const started = new Promise(resolve => { entered = resolve; });
    const f = fixture('ev3comprehensive', {disconnect: () => { if (++closes > 1) throw failure; },
        connect: () => { entered(); return new Promise(resolve => { release = resolve; }); }});
    const connection = f.start({route: 'bridge'});
    const readyFailure = assert.rejects(connection.ready, error => error instanceof AggregateError && error.errors.includes(failure));
    await started;
    const canceled = assert.rejects(connection.cancel(), error => error === failure);
    release();
    await readyFailure;
    await canceled;
});

test('SPIKE waits for the actual complete port report and accepts legitimate zero distance', async () => {
    const f = fixture('spikeprime');
    const peripheral = f.vm.runtime.peripheralExtensions.spikeprime;
    peripheral.portValues = {};
    const waits = [];
    const connection = f.start({route: 'bridge', wait: async ms => {
        waits.push(ms);
        if (waits.length === 1) peripheral.portValues = {A: {type: 'motor'}};
        if (waits.length === 2) for (const port of 'BCDE') peripheral.portValues[port] = {type: 'unknown'};
        if (waits.length === 3) peripheral.portValues.F = {type: 'distance', distance: 0};
    }});
    await connection.ready;
    assert.deepEqual(waits, [50, 50, 50], 'transport open and a partial report cannot admit Run');
    assert.equal(peripheral.portValues.F.distance, 0);
    await connection.cancel();
});


const deferredProvider = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};

test('a virtual provider on the same runtime waits for an older Bluetooth helper from another pane', async () => {
    const f = fixture('ev3comprehensive'); const gate = deferredProvider(); const entered = deferredProvider();
    const legacy = serializeLabLegacyConnection({vm: {runtime: f.vm.runtime}, connect: async () => {entered.resolve(); await gate.promise;}});
    await entered.promise;
    const next = f.start({route: 'bridge'});
    try {
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(f.calls, [], 'even initial disconnect must wait for the old helper');
    } finally {gate.resolve(); await legacy; await next.ready; await next.cancel();}
});

for (const preCanceled of [false, true]) test(`Bluetooth waits for a ${preCanceled ? 'previously canceled' : 'pending'} virtual provider and its cleanup`, async () => {
    const gate = deferredProvider(); const entered = deferredProvider(); let legacyEntered = false;
    const f = fixture('ev3comprehensive', {connect: async () => {entered.resolve(); await gate.promise;}});
    const old = f.start({route: 'bridge'}); const refused = assert.rejects(old.ready, {name: 'AbortError'});
    await entered.promise;
    const canceled = preCanceled ? old.cancel() : null;
    const legacy = serializeLabLegacyConnection({vm: f.vm, connect: () => {
        legacyEntered = true; f.calls.push(['legacy-start', {}]);
    }});
    try {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(legacyEntered, false);
    } finally {gate.resolve(); await refused; await canceled; await legacy;}
    assert.equal(f.calls.at(-2)[0], 'disconnect');
    assert.equal(f.calls.at(-1)[0], 'legacy-start');
});

test('an older Bluetooth error is retained without poisoning clean later provider work', async () => {
    const f = fixture('ev3comprehensive'); const failure = new Error('Bluetooth helper failed');
    await assert.rejects(serializeLabLegacyConnection({vm: f.vm, connect: () => {throw failure;}}), error => error === failure);
    const next = f.start({route: 'bridge'}); await next.ready; await next.cancel();
    assert.equal(f.calls.some(([name]) => name === 'connect'), true);
});

test('uncertain virtual cleanup also refuses Bluetooth and another Lab provider on that runtime', async () => {
    const failure = new Error('provider cleanup uncertain'); let disconnects = 0;
    const f = fixture('ev3comprehensive', {disconnect: () => {if (++disconnects > 1) throw failure;}});
    const old = f.start({route: 'bridge'}); await old.ready;
    await assert.rejects(old.cancel(), error => error === failure);
    let legacyEntered = false;
    await assert.rejects(serializeLabLegacyConnection({vm: f.vm, connect: () => {legacyEntered = true;}}), error => error === failure);
    assert.equal(legacyEntered, false);
    const other = fixture('legonxt'); Object.assign(f.vm.runtime._primitives, other.vm.runtime._primitives);
    const next = createLabExtensionConnection({vm: f.vm, extensionId: 'legonxt', route: 'bridge'});
    await assert.rejects(next.ready, error => error === failure);
    assert.deepEqual(other.calls, []);
    await next.cancel();
});

test('unrelated runtimes do not wait on one another legacy helper', async () => {
    const gate = deferredProvider(); const entered = deferredProvider(); const f = fixture('ev3comprehensive'); const other = fixture('ev3comprehensive');
    const old = serializeLabLegacyConnection({vm: f.vm, connect: async () => {entered.resolve(); await gate.promise;}});
    await entered.promise;
    let nextReady = false;
    const next = serializeLabLegacyConnection({vm: other.vm, connect: () => {nextReady = true;}});
    try {await new Promise(resolve => setImmediate(resolve)); assert.equal(nextReady, true);}
    finally {gate.resolve(); await old; await next;}
});

test('Bluetooth helpers sharing a runtime serialize their chooser lifetimes', async () => {
    const vm = {runtime: {}}; const events = []; const gate = deferredProvider(); const entered = deferredProvider();
    const old = serializeLabLegacyConnection({vm, connect: async () => {entered.resolve(); await gate.promise; events.push('old-finished');}});
    await entered.promise;
    const next = serializeLabLegacyConnection({vm, connect: () => {events.push('next-started');}});
    try {await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(events, []);}
    finally {gate.resolve(); await old; await next;}
    assert.deepEqual(events, ['old-finished', 'next-started']);
});


test('a replaced queued Bluetooth request does not open its chooser', async () => {
    const vm = {runtime: {}}; const gate = deferredProvider(); const entered = deferredProvider();
    const old = serializeLabLegacyConnection({vm, connect: async () => {entered.resolve(); await gate.promise;}});
    await entered.promise;
    let active = true; let connected = false;
    const next = serializeLabLegacyConnection({vm, isCurrent: () => active, connect: () => {connected = true;}});
    const refused = assert.rejects(next, {name: 'AbortError'});
    active = false; gate.resolve(); await old; await refused;
    assert.equal(connected, false);
});

test('a replaced in-flight Bluetooth helper rejects its own waiter after returning', async () => {
    const vm = {runtime: {}}; const gate = deferredProvider(); const entered = deferredProvider(); let active = true;
    const old = serializeLabLegacyConnection({vm, isCurrent: () => active, connect: async () => {entered.resolve(); await gate.promise;}});
    const refused = assert.rejects(old, {name: 'AbortError'});
    await entered.promise; active = false; gate.resolve(); await refused;
});
