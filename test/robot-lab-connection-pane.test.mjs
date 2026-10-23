// SPDX-License-Identifier: BSD-3-Clause
// Actual pane methods and production coordinator at controlled provider/React
// boundaries. Real protocol/VM/Jolt guests qualify the same coordinator separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLabConnectionCoordinator, labConnectionRoutes} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-connection-coordinator.js';
import {connectVirtualHub} from '../overlay/scratch-gui/src/lib/virtual-hub/connect-virtual-hub.js';
import {serializeLabLegacyConnection, createLabExtensionConnection, labProviderRetirementFailure} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-extension-connection.js';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
import {ev3ClassicPeripheral} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-peripheral.js';
import {nxtClassicPeripheral} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-peripheral.js';
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
    const pane = {state: {status: 'ready'}, session: scene, props: {vm}, lib: {createLabConnectionCoordinator, labConnectionRoutes, serializeLabLegacyConnection, labProviderRetirementFailure},
        stopClock: () => events.push('clock-stop'), startClock: () => events.push('clock-start'),
        setState (value, done) {Object.assign(this.state, value); done?.();},
        t: (_key, {error}) => error};
    for (const [name, end] of [
        ['installConnections', '    observeConnection ('], ['observeConnection', '    connectLegacy ('], ['connectLegacy', '    connectConnection ('], ['connectConnection', '    selectConnection ('],
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

test('pane feedback preserves the operation and clock-cleanup errors without an unhandled rejection', async () => {
    const {pane} = fixture();
    const failure = new Error('run installation failed');
    const cleanup = new Error('clock uninstall failed');
    pane.stopClock = () => {throw cleanup;};
    await pane.observeConnection(() => Promise.reject(failure));
    assert.ok(pane.lastConnectionError instanceof AggregateError);
    assert.ok(pane.lastConnectionError.errors.includes(failure));
    assert.ok(pane.lastConnectionError.errors.includes(cleanup));
    assert.equal(pane.state.status, 'paused');
    assert.match(pane.state.message, /run installation failed/);
    assert.match(pane.state.message, /clock uninstall failed/);
    pane.stopClock = () => {};
    await pane.connections.dispose();
});

test('pane feedback publication failures retain the original operation error', async () => {
    const {pane} = fixture();
    const failure = new Error('run failed');
    const publication = new Error('feedback publication failed');
    pane.setState = () => {throw publication;};
    await pane.observeConnection(() => Promise.reject(failure));
    assert.ok(pane.lastConnectionError instanceof AggregateError);
    assert.deepEqual(pane.lastConnectionError.errors, [failure, publication]);
    await pane.connections.dispose();
});

test('a failed Run reports the paused world before a delayed provider finishes cleanup', async () => {
    const {pane, scene, vm} = fixture();
    const gate = deferred(); const entered = deferred();
    const failure = new Error('world clock refused installation');
    let armed = false; let run;
    await pane.connections.setScene(scene);
    await pane.connections.select({route: 'bridge'});
    const original = vm.runtime._primitives.ev3comprehensive_disconnect;
    vm.runtime._primitives.ev3comprehensive_disconnect = async () => {
        if (armed) {entered.resolve(); await gate.promise;}
        return original();
    };
    pane.startClock = () => {armed = true; throw failure;};
    try {
        run = pane.connectConnection({run: true});
        await entered.promise;
        assert.equal(pane.state.connection.status, 'failed');
        assert.equal(pane.state.status, 'paused', 'displayed execution must retire before slow provider cleanup');
        assert.match(pane.state.message, /world clock refused installation/);
    } finally {
        gate.resolve(); await run; await pane.connections.dispose();
    }
});


test('switching from a delayed Bluetooth provider to the bridge waits for the old producer before admission', async () => {
    const {pane, scene, vm, events} = fixture();
    const gate = deferred(); const entered = deferred();
    let mode = null; let provider = null; let nextReady = false; let next;
    vm.extensionManager = {isExtensionLoaded: id => id === 'ev3comprehensive'};
    vm.runtime._primitives.ev3comprehensive_disconnect = () => {provider = null;};
    vm.runtime._primitives.ev3comprehensive_setMode = args => {mode = args.MODE;};
    vm.runtime._primitives.ev3comprehensive_connect = async () => {
        const admittedMode = mode;
        if (admittedMode === 'scratchlink') {entered.resolve(); await gate.promise;}
        provider = admittedMode;
    };
    vm.runtime._primitives.ev3comprehensive_isConnected = () => provider !== null;
    pane.btProfile = () => 'ev3';
    pane.lib.connectVirtualHub = connectVirtualHub;
    pane.lib.EV3_PERIPHERAL_ID = 'virtual-ev3';
    const start = source.indexOf('    async runBt (');
    const end = source.indexOf('    /** A blocks example', start);
    pane.runBt = new Function(`return ({${source.slice(start, end)}}).runBt`)();
    await pane.connections.setScene(scene);
    const old = pane.runBt();
    try {
        await entered.promise;
        pane.selectConnection({route: 'bridge'});
        next = pane.connectConnection().then(() => {nextReady = true;});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(nextReady, false, 'a new connection cannot be admitted while an older provider can still mutate its backend');
        gate.resolve(); await old; await next;
        assert.equal(provider, 'bridge');
        assert.equal(pane.state.connection.status, 'connected');
        assert.equal(events.includes('flag'), false);
    } finally {
        gate.resolve(); await old; await next; await pane.connections.dispose();
    }
});


const registeredFixture = () => {
    const f = fixture(); const registrations = []; const released = [];
    f.scene.hubs[0].hub = new Ev3VirtualHub();
    f.scene.dispose = () => {f.scene._disposed = true;};
    Object.assign(f.pane.lib, {ev3ClassicPeripheral, nxtClassicPeripheral,
        registerVirtualClassicPeripheral: peripheral => {registrations.push(peripheral); return () => released.push(peripheral.id);}});
    f.pane.registerBtBricks = method('registerBtBricks', '    /**\n     * Run with an EV3', {}, {});
    f.pane.teardown = method('teardown', '    /** Opens a MODELS', {}, {});
    f.pane.registerBtBricks();
    return {...f, registrations, released};
};
const pressEnterPacket = Uint8Array.from([8, 0, 1, 0, 0x80, 0, 0, 0x83, 0x05, 2]);

test('an old Bluetooth session cannot send its real direct command into a replacement scene', async () => {
    const f = registeredFixture(); const old = f.registrations[0]; let closed = 0;
    const peer = old.open({send () {}, close () {closed++;}});
    const replacement = {hubs: [{id: 'brick', profile: 'ev3', hub: new Ev3VirtualHub()}]};
    f.pane.session = replacement;
    let refusal = null;
    try {peer.receive(pressEnterPacket);} catch (error) {refusal = error;}
    try {
        assert.equal(replacement.hubs[0].hub.button(2), false, 'the old peer must not press Enter on the new brick');
        assert.equal(refusal?.name, 'NetworkError');
        assert.equal(closed, 1);
        assert.equal(old.available(), false);
        assert.throws(() => old.open({send () {}, close () {}}), {name: 'NetworkError'});
    } finally {peer.close(); f.pane.unregisterBt?.(); await f.pane.connections.dispose();}
});


test('model teardown closes every owned Bluetooth link even when one link callback throws', async () => {
    const f = registeredFixture(); const closed = []; const failure = new Error('link close callback failed');
    const old = f.registrations[0];
    const first = old.open({send () {}, close () {closed.push(1); throw failure;}});
    const second = old.open({send () {}, close () {closed.push(2);}});
    f.pane.teardown();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(closed, [1, 2]);
    assert.equal(f.released.length, f.registrations.length);
    assert.equal(f.pane.session, null);
    assert.equal(old.available(), false);
    assert.throws(() => first.receive(pressEnterPacket), {name: 'NetworkError'});
    assert.throws(() => second.receive(pressEnterPacket), {name: 'NetworkError'});
    assert.ok(f.pane.lastConnectionError instanceof AggregateError);
    assert.equal(f.scene.hubs[0].hub.button(2), false);
    await f.pane.connections.dispose();
});

test('a closed Bluetooth peer cannot close a later peer sharing the same link', async () => {
    const f = registeredFixture(); let closes = 0;
    const link = {send () {}, close () {closes++;}};
    const old = f.registrations[0].open(link); old.close();
    const next = f.registrations[0].open(link);
    assert.throws(() => old.receive(pressEnterPacket), {name: 'NetworkError'});
    assert.equal(closes, 0, 'the old closed session leaves the newer link owner alone');
    next.receive(pressEnterPacket);
    assert.equal(f.scene.hubs[0].hub.button(2), true);
    f.pane.unregisterBt(); assert.equal(closes, 1);
    await f.pane.connections.dispose();
});

test('failed second-family Bluetooth registration rolls back its own first registration', async () => {
    const {pane, scene} = fixture();
    const failure = new Error('NXT registration refused'); const released = [];
    scene.hubs.push({id: 'nxt', profile: 'nxt', hub: {}});
    Object.assign(pane.lib, {ev3ClassicPeripheral, nxtClassicPeripheral, registerVirtualClassicPeripheral: peripheral => {
        if (peripheral.id.includes('nxt')) throw failure;
        return () => released.push(peripheral.id);
    }});
    pane.registerBtBricks = method('registerBtBricks', '    /**\n     * Run with an EV3', {}, {});
    assert.throws(() => pane.registerBtBricks(), error => error === failure);
    assert.equal(released.length, 1);
    assert.equal(pane.unregisterBt, undefined);
    await pane.connections.dispose();
});


test('Bluetooth open rolls back its returned handle when opening retires the scene registration', async () => {
    const {pane, scene} = fixture(); let closes = 0; const registrations = [];
    scene.hubs[0].hub = new Ev3VirtualHub();
    Object.assign(pane.lib, {nxtClassicPeripheral, ev3ClassicPeripheral: getHub => {
        const real = ev3ClassicPeripheral(getHub);
        return {...real, open: link => {
            const peer = real.open(link);
            pane.unregisterBt();
            return peer;
        }};
    }, registerVirtualClassicPeripheral: peripheral => {registrations.push(peripheral); return () => {};}});
    pane.registerBtBricks = method('registerBtBricks', '    /**\n     * Run with an EV3', {}, {});
    pane.registerBtBricks();
    assert.throws(() => registrations[0].open({send () {}, close () {closes++;}}), {name: 'NetworkError'});
    assert.equal(closes, 1);
    assert.equal(registrations[0].available(), false);
    await pane.connections.dispose();
});


test('a Bluetooth Run refused by uncertain provider cleanup cannot fall through to a green flag', async () => {
    const {pane, vm, events} = fixture(); let fail = false;
    const failure = new Error('the old virtual provider did not retire');
    const original = vm.runtime._primitives.ev3comprehensive_disconnect;
    vm.runtime._primitives.ev3comprehensive_disconnect = () => {if (fail) throw failure; return original();};
    const old = createLabExtensionConnection({vm, extensionId: 'ev3comprehensive', route: 'bridge'});
    await old.ready; fail = true;
    await assert.rejects(old.cancel(), error => error === failure);
    vm.extensionManager = {isExtensionLoaded: () => true}; pane.btProfile = () => 'ev3';
    pane.lib.connectVirtualHub = connectVirtualHub;
    const start = source.indexOf('    async runBt ('); const end = source.indexOf('    /** A blocks example', start);
    pane.runBt = new Function(`return ({${source.slice(start, end)}}).runBt`)();
    await pane.runBt();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(events.includes('flag'), false, 'failed retirement refuses execution as well as another connection');
    assert.equal(events.includes('clock-start'), false);
    assert.equal(pane.state.status, 'paused');
    assert.match(pane.state.message, /the old virtual provider did not retire/);
    await pane.connections.dispose();
});
