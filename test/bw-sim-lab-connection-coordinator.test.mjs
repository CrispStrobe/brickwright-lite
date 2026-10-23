// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabConnectionCoordinator, labConnectionRoutes} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-connection-coordinator.js';
import {createLabVirtualTransports} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-virtual-transports.js';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const makeScene = () => ({hubs: [{id: 'brick', profile: 'ev3', hub: new Ev3VirtualHub()}]});

const fixture = (t, {connect = () => {}, disconnect = () => {}, prepareRun = () => {}, startClock = null, onState = () => {}, autoCleanup = true} = {}) => {
    let connected = false;
    const events = [];
    const state = {clock: false, flags: 0, calls: 0, closes: 0};
    const physicalFetch = async () => { throw new Error('physical network fallback'); };
    const host = {fetch: physicalFetch, WebSocket: class PhysicalSocket {}};
    const navigatorHost = {};
    const vm = {runtime: {_primitives: {
        ev3comprehensive_disconnect: async () => { state.closes++; await disconnect(state.closes); connected = false; },
        ev3comprehensive_setMode: () => {},
        ev3comprehensive_connect: async () => { state.calls++; connected = true; await connect(state.calls); },
        ev3comprehensive_isConnected: () => connected
    }}, stopAll () { events.push('stop'); }, greenFlag () { state.flags++; }};
    const routing = createLabVirtualTransports({host, navigatorHost});
    const coordinator = createLabConnectionCoordinator({getVM: () => vm, host, navigatorHost, routing,
        stopClock: () => { state.clock = false; events.push('clock-stop'); }, stopProgram: oldVM => oldVM?.stopAll(),
        startClock: () => { state.clock = true; if (startClock) startClock(coordinator); }, prepareRun,
        onState: value => { events.push(value.status); onState(value, coordinator); }});
    if (autoCleanup) t.after(async () => { await coordinator.dispose(); });
    return {coordinator, routing, host, navigatorHost, vm, state, events, physicalFetch};
};
const selected = async f => { await f.coordinator.setScene(makeScene()); await f.coordinator.select({route: 'bridge'}); };

test('route choices refuse unsupported and firmware-owned inputs', () => {
    const s = makeScene();
    assert.deepEqual(labConnectionRoutes(s, s.hubs[0]), ['bluetooth', 'serial', 'bridge', 'http']);
    assert.deepEqual(labConnectionRoutes({...s, lockstep: {}}, s.hubs[0]), []);
    assert.deepEqual(labConnectionRoutes(s, {profile: 'rcx', hub: {}}), []);
    assert.deepEqual(labConnectionRoutes(s, {profile: 'wedo2', hub: {protocol: 'wedo2'}}), ['bluetooth']);
});

test('Connect admits routes without starting execution; explicit Run starts once and Disconnect invalidates synchronously', async t => {
    const f = fixture(t);
    await selected(f);
    assert.equal((await f.host.fetch('http://localhost:8080/')).status, 503, 'selection alone exposes no brick');
    await f.coordinator.connect();
    assert.equal(f.coordinator.snapshot().status, 'connected');
    assert.equal(f.state.flags, 0); assert.equal(f.state.clock, false);
    assert.deepEqual(await (await f.host.fetch('http://localhost:8080/')).json(), {status: 'ev3_bridge_active'});
    await f.coordinator.run();
    assert.equal(f.state.flags, 1); assert.equal(f.state.clock, true);
    const cleanup = f.coordinator.disconnect();
    assert.equal(f.state.clock, false);
    assert.equal(f.coordinator.snapshot().status, 'idle');
    assert.equal((await f.host.fetch('http://localhost:8080/')).status, 503);
    await cleanup;
});

test('a delayed old provider cannot expose or start the replacement scene, and the newer connect waits for cleanup', async t => {
    const gate = deferred(); const entered = deferred();
    const f = fixture(t, {connect: n => { if (n === 1) { entered.resolve(); return gate.promise; } }});
    t.after(() => gate.resolve());
    await selected(f);
    const first = f.coordinator.connect();
    const firstRefusal = assert.rejects(first, {name: 'AbortError'});
    await entered.promise;
    const replacement = makeScene(); replacement.hubs[0].hub.pressButton(1, true);
    const cleanup = f.coordinator.setScene(replacement);
    assert.equal(f.coordinator.snapshot().status, 'idle');
    assert.equal(f.state.clock, false); assert.equal(f.state.flags, 0);
    assert.equal((await f.host.fetch('http://localhost:8080/button/up')).status, 503, 'late old requests cannot reach the new brick');
    const next = f.coordinator.connect();
    await Promise.resolve(); assert.equal(f.state.calls, 1);
    gate.resolve(); await firstRefusal; await cleanup; await next;
    assert.equal(f.state.calls, 2);
    assert.deepEqual(await (await f.host.fetch('http://localhost:8080/button/up')).json(), {value: true});
    assert.equal(f.state.flags, 0);
});

test('Stop while the pane commits Run prevents a late clock install and green flag; retry remains usable', async t => {
    const gate = deferred(); const entered = deferred(); let prepares = 0;
    const f = fixture(t, {prepareRun: () => { if (++prepares === 1) { entered.resolve(); return gate.promise; } }});
    t.after(() => gate.resolve());
    await selected(f);
    const run = f.coordinator.run(); const stopped = assert.rejects(run, {name: 'AbortError'});
    await entered.promise;
    const cleanup = f.coordinator.disconnect();
    assert.equal(f.state.clock, false);
    gate.resolve(); await stopped; await cleanup;
    assert.equal(f.state.flags, 0);
    await f.coordinator.run(); assert.equal(f.state.flags, 1);
});

test('replacement during clock installation cannot reach the VM green flag', async t => {
    let cleanup;
    const f = fixture(t, {startClock: coordinator => { cleanup = coordinator.setScene(makeScene()); }});
    await selected(f);
    await assert.rejects(f.coordinator.run(), {name: 'AbortError'});
    await cleanup;
    assert.equal(f.state.clock, false); assert.equal(f.state.flags, 0);
});

test('a failed connection with successful rollback can be retried', async t => {
    const failure = new Error('connection refused');
    const f = fixture(t, {connect: n => { if (n === 1) throw failure; }});
    await selected(f);
    await assert.rejects(f.coordinator.connect(), error => error === failure);
    assert.equal(f.coordinator.snapshot().status, 'failed');
    await f.coordinator.connect();
    assert.equal(f.coordinator.snapshot().status, 'connected');
    assert.equal(f.state.calls, 2); assert.equal(f.state.flags, 0);
});

test('the newest reentrant Run intent wins when publication requests another Run', async t => {
    let second; let once = false;
    const f = fixture(t, {onState: (value, coordinator) => {
        if (value.status === 'connecting' && !once) { once = true; second = coordinator.run(); }
    }});
    await selected(f);
    await assert.rejects(f.coordinator.run(), {name: 'AbortError'});
    await second;
    assert.equal(f.state.flags, 1);
});

test('failed connecting publication cannot start a provider or strand the request', async t => {
    const failure = new Error('state publication failed'); let once = false;
    const f = fixture(t, {onState: value => {
        if (value.status === 'connecting' && !once) { once = true; throw failure; }
    }});
    await selected(f);
    await assert.rejects(Promise.resolve().then(() => f.coordinator.connect()), error => error === failure);
    await Promise.resolve();
    assert.equal(f.state.calls, 0);
    assert.equal(f.state.clock, false);
    assert.equal(f.coordinator.snapshot().status, 'failed');
    await f.coordinator.connect();
    assert.equal(f.state.calls, 1);
});

test('failed producer cleanup remains visible and quarantines routes until the provider is actually retired', async t => {
    const failure = new Error('provider cleanup failed');
    let fail = false;
    const f = fixture(t, {autoCleanup: false, disconnect: () => { if (fail) throw failure; }});
    t.after(async () => {
        // Retire the injected failing producer before releasing this test's
        // independently owned routing resource. No product cleanup is faked.
        fail = false;
        await f.vm.runtime._primitives.ev3comprehensive_disconnect();
        await f.routing.dispose();
    });
    await selected(f); await f.coordinator.connect();
    fail = true;
    await assert.rejects(f.coordinator.disconnect(), error => error === failure);
    await assert.rejects(f.coordinator.connect(), error => error === failure);
    assert.equal(f.state.calls, 1, 'failed cleanup cannot admit a new producer');
    assert.equal((await f.host.fetch('http://localhost:8080/')).status, 503);
    const disposing = f.coordinator.dispose();
    await assert.rejects(disposing, error => error === failure);
    assert.equal(f.coordinator.dispose(), disposing, 'repeat disposal retains the same failed result');
    await assert.rejects(f.coordinator.dispose(), error => error === failure);
    assert.notEqual(f.host.fetch, f.physicalFetch, 'late old requests retain virtual refusal instead of physical fallback');
    assert.equal((await f.host.fetch('http://localhost:8080/')).status, 503);
});
