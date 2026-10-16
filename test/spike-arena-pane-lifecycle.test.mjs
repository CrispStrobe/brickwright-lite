// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the shipped methods with explicitly delayed connection promises.
// These controls do not replace installed-app or guest qualification.
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const methods = source.slice(source.indexOf('    async start () {'), source.indexOf('    async step () {'))
    .replace(/\n    async /g, '\n    ,async ');
const fixture = () => {
    const events = [];
    const connections = [];
    const pane = new Function('ArenaHubBridge', `return ({${methods}});`)(class {});
    Object.assign(pane, {
        state: {execution: 'native', status: 'ready'},
        bridge: {reset () {events.push('bridge.reset');}, verdict: {status: 'running'}},
        clock: {installed: false, uninstall () {this.installed = false;}, clear () {}, install () {this.installed = true;}},
        hubState: {backend: {cancel () {}}, setSimulationEnabled () {}},
        vm: {runtime: {}, stopAll () {}, greenFlag () {events.push('greenFlag');}},
        spikeLoaded: () => true,
        connect: () => new Promise((resolve, reject) => connections.push({resolve, reject})),
        t: key => key,
        draw () {},
        setState (patch, done) {Object.assign(this.state, patch); events.push(['state', patch]); done?.();}
    });
    const pending = async () => {
        const run = pane.start();
        // stopProgram is asynchronous even without a firmware session.
        await Promise.resolve(); await Promise.resolve();
        assert.equal(connections.length, 1, 'the actual Start must reach its awaited connection');
        return {run};
    };
    return {pane, events, connections, pending};
};

test('Reset cancels a pending native Start without changing its backend or bridge', async () => {
    const f = fixture(); const {run} = await f.pending();
    const bridge = f.pane.bridge;
    await f.pane.reset();
    const mark = f.events.length;
    assert.equal(f.pane.bridge, bridge); assert.equal(f.pane.state.execution, 'native');
    f.connections[0].resolve(); await run;
    assert.deepEqual(f.events.slice(mark), []);
    assert.equal(f.pane.clock.installed, false); assert.equal(f.pane.state.status, 'ready');
});

test('backend changes, including a return to native, cancel the earlier Start', async () => {
    for (const returnToNative of [false, true]) {
        const f = fixture(); const {run} = await f.pending();
        await f.pane.stopProgram(); f.pane.state.execution = 'nuttx';
        if (returnToNative) f.pane.state.execution = 'native';
        const mark = f.events.length;
        f.connections[0].resolve(); await run;
        assert.deepEqual(f.events.slice(mark), []);
        assert.equal(f.pane.clock.installed, false);
    }
});

test('pane disposal prevents late VM start, clock installation and state publication', async () => {
    const f = fixture(); const {run} = await f.pending();
    f.pane.disposed = true; await f.pane.stopProgram();
    const mark = f.events.length;
    f.connections[0].resolve(); await run;
    assert.deepEqual(f.events.slice(mark), []); assert.equal(f.pane.clock.installed, false);
    await f.pane.start();
    assert.equal(f.connections.length, 1, 'a disposed pane must not start another connection');
});

test('a replacement bridge cannot be reset by an earlier pending connection', async () => {
    const f = fixture(); const {run} = await f.pending();
    f.pane.bridge = {reset () {assert.fail('stale Start reset the replacement bridge');}};
    const mark = f.events.length;
    f.connections[0].resolve(); await run;
    assert.deepEqual(f.events.slice(mark), []); assert.equal(f.pane.clock.installed, false);
});

test('a late connection failure cannot overwrite the state after Reset', async () => {
    const f = fixture(); const {run} = await f.pending();
    await f.pane.reset(); const mark = f.events.length;
    f.connections[0].reject(new Error('delayed connection failure')); await run;
    assert.deepEqual(f.events.slice(mark), []); assert.equal(f.pane.state.message, '');
});

test('normal native Start and a fresh Start after Reset still install the clock once per run', async () => {
    const f = fixture(); const {run} = await f.pending();
    f.connections[0].resolve(); await run;
    assert.equal(f.pane.state.status, 'running'); assert.equal(f.pane.clock.installed, true);
    assert.equal(f.events.filter(e => e === 'greenFlag').length, 1);
    await f.pane.reset(); assert.equal(f.pane.clock.installed, false);
    const second = f.pane.start(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.connections.length, 2);
    assert.equal(f.events.filter(e => e === 'greenFlag').length, 1);
    f.connections[1].resolve(); await second;
    assert.equal(f.pane.state.status, 'running'); assert.equal(f.pane.clock.installed, true);
    assert.equal(f.events.filter(e => e === 'greenFlag').length, 2);
});

test('a current connection failure still reports its error', async () => {
    const f = fixture(); const {run} = await f.pending();
    f.connections[0].reject(new Error('current connection failure')); await run;
    assert.equal(f.pane.state.message, 'connectFailed'); assert.equal(f.pane.clock.installed, false);
});

test('Reset while Start awaits earlier firmware teardown prevents even a new connection', async () => {
    const f = fixture(); let release;
    f.pane.firmwareSession = {stop: () => new Promise(resolve => {release = resolve;})};
    const run = f.pane.start();
    assert.equal(typeof release, 'function'); assert.equal(f.connections.length, 0);
    const reset = f.pane.reset();
    release(); await reset; const mark = f.events.length; await new Promise(resolve => setImmediate(resolve));
    // Let the broken baseline settle too, so its failure is an assertion,
    // rather than an unresolved asynchronous test.
    f.connections[0]?.resolve(); await run;
    assert.equal(f.connections.length, 0);
    assert.deepEqual(f.events.slice(mark), []); assert.equal(f.pane.clock.installed, false);
});

const pendingFirmwareStop = () => {
    const f = fixture();
    let resolve; let reject;
    f.pane.firmwareSession = {stop: () => new Promise((yes, no) => {resolve = yes; reject = no;})};
    f.pane.vm.stopAll = () => f.events.push('stopAll');
    f.pane.hubState.backend.cancel = () => f.events.push('backend.cancel');
    const stopping = f.pane.stopProgram();
    assert.equal(typeof resolve, 'function', 'the actual Stop must reach firmware teardown');
    return {...f, stopping, resolve, reject};
};

test('disposed firmware cleanup cannot cancel the shared backend or replacement VM', async () => {
    const f = pendingFirmwareStop();
    f.pane.world = {}; f.pane.arenaFirmwareTopology = 'dual-ultrasonic';
    f.pane.hubState.setPort = () => f.events.push('setPort');
    f.pane.disposed = true;
    const replacement = {vm: f.pane.vm, hubState: f.pane.hubState};
    replacement.vm.greenFlag();
    const mark = f.events.length;
    f.resolve(); await f.stopping;
    assert.deepEqual(f.events.slice(mark), []);
    assert.equal(f.events.filter(event => event === 'greenFlag').length, 1);
});

test('a newer Reset and native Start survive an earlier firmware Stop return', async () => {
    const f = pendingFirmwareStop();
    const reset = f.pane.reset();
    const start = f.pane.start(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.connections.length, 0, 'New Start must wait for detached native teardown');
    f.resolve(); await reset; await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.connections.length, 1);
    f.connections[0].resolve(); await start;
    assert.equal(f.pane.state.status, 'running'); assert.equal(f.pane.clock.installed, true);
    const mark = f.events.length;
    f.resolve(); await f.stopping;
    assert.deepEqual(f.events.slice(mark), []);
    assert.equal(f.pane.clock.installed, true); assert.equal(f.pane.state.status, 'running');
});

test('a replacement bridge retains its ports and backend after old firmware teardown', async () => {
    const f = pendingFirmwareStop();
    const replacement = {reset () {}, verdict: {status: 'running'}};
    f.pane.bridge = replacement;
    f.pane.world = {}; f.pane.arenaFirmwareTopology = 'dual-ultrasonic';
    f.pane.hubState.setPort = () => f.events.push('setPort');
    const mark = f.events.length;
    f.resolve(); await f.stopping;
    assert.equal(f.pane.bridge, replacement);
    assert.deepEqual(f.events.slice(mark), []);
});

test('a stale firmware teardown failure does not escape a disposed owner', async () => {
    const f = pendingFirmwareStop(); f.pane.disposed = true;
    const completed = assert.doesNotReject(f.stopping);
    f.reject(new Error('old firmware teardown failure')); await completed;
    assert.deepEqual(f.events, []);
});

test('current firmware Stop still cancels the backend and VM', async () => {
    const f = pendingFirmwareStop(); f.pane.clock.installed = true;
    f.resolve(); await f.stopping;
    assert.equal(f.pane.clock.installed, false);
    assert.equal(f.events.filter(event => event === 'backend.cancel').length, 1);
    assert.equal(f.events.filter(event => event === 'stopAll').length, 1);
    assert.equal(f.pane.firmwareSession, null);
});

test('current firmware teardown failure still rejects', async () => {
    const f = pendingFirmwareStop();
    const failed = assert.rejects(f.stopping, /current firmware teardown failure/);
    f.reject(new Error('current firmware teardown failure')); await failed;
    assert.deepEqual(f.events, []);
});
