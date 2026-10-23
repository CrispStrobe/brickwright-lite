// SPDX-License-Identifier: BSD-3-Clause
// Actual pane methods and production coordinator at controlled provider/React
// boundaries. Real protocol/VM/Jolt guests qualify the same coordinator separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLabConnectionCoordinator, labConnectionRoutes} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-connection-coordinator.js';
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx', import.meta.url), 'utf8');
const method = (name, end, host, navigatorHost) => {
    const start = source.indexOf(`    ${name} (`);
    const finish = source.indexOf(end, start);
    assert.ok(start >= 0 && finish > start);
    return new Function('window', 'navigator', `return ({${source.slice(start, finish)}}).${name}`)(host, navigatorHost);
};
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const fixture = () => {
    const events = [];
    const host = {fetch: async () => {throw new Error('physical network fallback');}, WebSocket: class {}};
    const navigatorHost = {};
    let connected = false;
    const hub = {s: {outputs: []}, motorPortIds: () => ['A', 'B'], directCommand: (port, command) => {
        events.push(['motor', port, command.stop]); return {ok: true};
    }};
    const scene = {hubs: [{id: 'brick', profile: 'ev3', hub}]};
    const vm = {runtime: {_primitives: {
        ev3comprehensive_disconnect: () => { connected = false; }, ev3comprehensive_setMode () {},
        ev3comprehensive_connect: () => { connected = true; }, ev3comprehensive_isConnected: () => connected
    }}, stopAll: () => events.push('stop'), greenFlag: () => events.push('flag')};
    const pane = {state: {status: 'ready'}, session: scene, props: {vm}, lib: {createLabConnectionCoordinator, labConnectionRoutes},
        stopClock: () => events.push('clock-stop'), startClock: () => events.push('clock-start'),
        setState (value, done) {Object.assign(this.state, value); done?.();},
        t: (_key, {error}) => error};
    for (const [name, end] of [
        ['installConnections', '    observeConnection ('], ['observeConnection', '    connectConnection ('], ['connectConnection', '    selectConnection ('],
        ['selectConnection', '    disconnectConnection ('], ['disconnectConnection', '    /** loadModel'],
        ['apiStop', '    /** A motor was told']
    ]) pane[name] = method(name, end, host, navigatorHost);
    pane.installConnections();
    return {pane, events, scene, vm, hub};
};

test('pane wiring retires old model motors, Connect leaves execution idle and Run starts through the coordinator', async t => {
    const {pane, events, scene} = fixture();
    t.after(() => pane.connections.dispose());
    await pane.connections.setScene(scene);
    pane.selectConnection({route: 'bridge'});
    await pane.connectConnection();
    assert.equal(events.includes('flag'), false);
    assert.equal(events.includes('clock-start'), false);
    assert.ok(events.some(event => Array.isArray(event) && event[1] === 'B' && event[2] === 'brake'));
    await pane.connections.run();
    assert.equal(pane.state.status, 'running');
    assert.deepEqual(events.slice(-2), ['clock-start', 'flag']);
    pane.disconnectConnection();
    assert.equal(pane.state.status, 'paused');
    assert.equal(pane.state.connection.status, 'idle');
});

test('a stale same-scene provider failure cannot replace feedback from a newer action', async () => {
    const {pane} = fixture();
    const first = deferred();
    const old = pane.observeConnection(() => first.promise);
    await pane.observeConnection(() => Promise.reject(new Error('current refusal')));
    first.reject(new Error('old refusal')); await old;
    assert.equal(pane.state.message, 'current refusal');
    assert.equal(pane.lastConnectionError.message, 'old refusal', 'original failures remain available');
    await pane.connections.dispose();
});

test('one throwing motor-list producer does not prevent retirement of another old brick', async () => {
    const {pane, scene, events} = fixture();
    scene.hubs.unshift({id: 'broken', profile: 'nxt', hub: {directCommand () {}, motorPortIds () {throw new Error('motor list failure');}}});
    await pane.connections.setScene(scene);
    await assert.rejects(pane.connections.disconnect(), /Could not stop the old Lab program/);
    assert.ok(events.some(event => Array.isArray(event) && event[1] === 'B'));
    await assert.rejects(pane.connections.dispose());
});

 test('API Stop cancels a pending green flag without stopping the running script', async t => {
    const {pane, events, scene} = fixture();
    t.after(() => pane.connections.dispose());
    await pane.connections.setScene(scene);
    await pane.connections.select({route: 'bridge'});
    const commit = deferred(); const entered = deferred();
    pane.setState = (value, done) => {
        Object.assign(pane.state, value);
        if (value.status === 'running') {entered.resolve(); commit.promise.then(done);} else done?.();
    };
    const run = pane.connections.run(); const refused = assert.rejects(run, {name: 'AbortError'});
    await entered.promise;
    const stops = events.filter(event => event === 'stop').length;
    pane.apiStop(); commit.resolve(); await refused;
    assert.equal(pane.state.status, 'paused');
    assert.equal(events.filter(event => event === 'stop').length, stops);
    assert.equal(events.includes('flag'), false);
});


test('explicit SPIKE Connect enables only its selected native hub and leaves execution paused', async () => {
    const {pane, events, scene} = fixture();
    const selected = {data: {simulationEnabled: false}, setSimulationEnabled (value) {this.data.simulationEnabled = value;}};
    scene.hubs[0].profile = 'spike-prime'; scene.hubs[0].hub.hubState = selected;
    pane.connections = {snapshot: () => ({hubId: 'brick'}), connect: () => {
        assert.equal(selected.data.simulationEnabled, true); events.push('connect');
    }};
    await pane.connectConnection();
    assert.deepEqual(events, ['connect']);
    assert.equal(pane.state.status, 'ready');
});


test('the transport coordinator does not claim firmware or RCX program ownership', async () => {
    for (const firmware of [false, true]) {
        const {pane, events, scene} = fixture();
        if (firmware) scene.lockstep = {};
        else scene.hubs = [{id: 'rcx', profile: 'rcx', hub: {motorPortIds () {throw new Error('owned by RCX');}}}];
        await pane.connections.setScene(scene);
        await pane.connections.disconnect();
        assert.equal(events.includes('stop'), false);
        assert.equal(events.some(event => Array.isArray(event)), false);
        await pane.connections.dispose();
    }
});
