// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabVirtualTransports} from '../overlay/scratch-gui/src/lib/bw-sim/transports/lab-virtual-transports.js';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
import {NxtVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-virtual-hub.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import {Lwp3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/lwp3/lwp3-virtual-hub.js';

class PhysicalSocket { constructor (...args) { this.args = args; } }
const scene = (...hubs) => ({hubs});
const record = (profile, hub) => ({id: profile, profile, hub});
const fixture = t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const calls = [];
    const fetch = async (...args) => { calls.push(args); return 'physical'; };
    const serial = {getPorts: async () => ['physical']};
    const host = {WebSocket: PhysicalSocket, fetch};
    const navigatorHost = {serial};
    const controller = createLabVirtualTransports({host, navigatorHost});
    t.after(() => controller.dispose());
    return {controller, host, navigatorHost, fetch, serial, calls};
};
const WAIT = Uint8Array.from([7, 0, 1, 0, 0, 0, 0, 0x83, 3]);

test('routing is opt-in and exact bridge paths leave unrelated traffic and native arguments intact', async t => {
    const {controller, host, navigatorHost, fetch, serial, calls} = fixture(t);
    const hub = new Ev3VirtualHub();
    await controller.setScene(scene(record('ev3', hub)));
    assert.equal(host.WebSocket, PhysicalSocket);
    assert.equal(host.fetch, fetch);
    assert.equal(navigatorHost.serial, serial);
    await controller.setEnabled(true);
    const socket = new host.WebSocket('ws://localhost:8080/?token=local');
    t.mock.timers.tick(0);
    assert.equal(socket.readyState, 1);
    const native = new host.WebSocket('ws://localhost:8080/unrelated', ['physical-protocol']);
    assert.ok(native instanceof PhysicalSocket);
    assert.deepEqual(native.args, ['ws://localhost:8080/unrelated', ['physical-protocol']]);
    assert.equal(await host.fetch('http://localhost:8080/unrelated', {method: 'PATCH'}), 'physical');
    assert.equal(await host.fetch('https://example.invalid/button/up'), 'physical');
    assert.equal(calls.length, 2);
    assert.deepEqual(await (await host.fetch('http://localhost:8080/')).json(), {status: 'ev3_bridge_active'});
    assert.deepEqual(await (await host.fetch('http://localhost:8080/scan', {method: 'POST'})).json(), []);
    await controller.setEnabled(false);
    assert.equal(socket.readyState, 3);
    assert.equal(host.WebSocket, PhysicalSocket);
    assert.equal(host.fetch, fetch);
    assert.equal(navigatorHost.serial, serial);
});

test('scene replacement closes a blocked wire guest and serial port before admitting its replacement', async t => {
    const {controller, host, navigatorHost} = fixture(t);
    const oldHub = new Ev3VirtualHub();
    const nextHub = new Ev3VirtualHub();
    await controller.setScene(scene(record('ev3', oldHub)));
    await controller.setEnabled(true);
    const socket = new host.WebSocket('ws://localhost:8080');
    const replies = [];
    socket.binaryType = 'arraybuffer';
    socket.onmessage = event => replies.push(Array.from(new Uint8Array(event.data)));
    t.mock.timers.tick(0);
    socket.send(WAIT);
    const port = await navigatorHost.serial.requestPort();
    await port.open({baudRate: 115200});
    const writer = port.writable.getWriter();
    await writer.write(WAIT);
    const cleanup = controller.setScene(scene(record('ev3', nextHub)));
    assert.equal(socket.readyState, 3, 'invalidated synchronously, before awaiting cleanup');
    await cleanup;
    oldHub.pressButton(2, true);
    nextHub.pressButton(2, true);
    t.mock.timers.tick(0);
    assert.deepEqual(replies, []);
    await assert.rejects(writer.write(WAIT), /closed/);
    writer.releaseLock();
    await assert.rejects(port.open({baudRate: 115200}), /closed|scene/);
    const next = new host.WebSocket('ws://localhost:8080');
    next.binaryType = 'arraybuffer';
    next.onmessage = event => replies.push(Array.from(new Uint8Array(event.data)));
    t.mock.timers.tick(0);
    next.send(WAIT);
    t.mock.timers.tick(0);
    assert.deepEqual(replies, [[3, 0, 1, 0, 2]], 'only the new explicitly opened connection receives input');
    assert.notEqual(await navigatorHost.serial.requestPort(), port);
});

test('known routes refuse a missing brick rather than reaching the physical network', async t => {
    const {controller, host, navigatorHost, calls} = fixture(t);
    await controller.setEnabled(true);
    for (const url of ['ws://localhost:8080', 'ws://127.0.0.1:8765', 'ws://[::1]:8081']) {
        const socket = new host.WebSocket(url);
        let error = null;
        socket.onerror = event => { error = event.error; };
        t.mock.timers.tick(0);
        assert.equal(socket.readyState, 3);
        assert.equal(error?.name, 'NetworkError');
    }
    assert.equal((await host.fetch('http://localhost:8080/button/up')).status, 503);
    assert.equal((await host.fetch('http://localhost:8080/connect',
        {method: 'POST', body: JSON.stringify({deviceId: 'absent'})})).status, 404);
    await assert.rejects(navigatorHost.serial.requestPort(), {name: 'NotFoundError'});
    assert.equal(calls.length, 0);
});

test('same-record replacement cannot redirect an admitted command to another hub', async t => {
    const {controller, host} = fixture(t);
    const oldHub = new Ev3VirtualHub();
    const nextHub = new Ev3VirtualHub();
    const source = record('ev3', oldHub);
    await controller.setScene(scene(source));
    await controller.setEnabled(true);
    source.hub = nextHub;
    nextHub.pressButton(1, true);
    assert.equal((await host.fetch('http://localhost:8080/button/up')).status, 503);
    const socket = new host.WebSocket('ws://localhost:8080');
    t.mock.timers.tick(0);
    assert.equal(socket.readyState, 3);
});

test('serial advertises only scene EV3/NXT records, and closed controllers cannot revive', async t => {
    const {controller, navigatorHost, host} = fixture(t);
    await controller.setScene(scene(record('ev3', new Ev3VirtualHub()), record('nxt', new NxtVirtualHub())));
    await controller.setEnabled(true);
    const ports = await navigatorHost.serial.getPorts();
    assert.equal(ports.length, 2);
    assert.match(ports[0].peripheral.name, /EV3/);
    assert.match(ports[1].peripheral.name, /NXT/);
    await controller.dispose();
    await controller.dispose();
    assert.equal(host.WebSocket, PhysicalSocket);
    assert.throws(() => controller.setEnabled(true), {name: 'InvalidStateError'});
    assert.throws(() => controller.setScene(null), {name: 'InvalidStateError'});
});

test('official firmware and lockstep scenes cannot open the native SPIKE REPL', async t => {
    const {controller, host} = fixture(t);
    const hub = new SpikeVirtualHub();
    hub.hubState.data.simulationEnabled = true;
    for (const source of [scene(record('spike-prime', hub)), {...scene(record('spike-prime', hub)), lockstep: {}}]) {
        hub.hubState.data.firmwareTarget = source.lockstep ? 'legacy-v2' : 'official-v3';
        await controller.setScene(source);
        await controller.setEnabled(true);
        const socket = new host.WebSocket('ws://localhost:8081');
        t.mock.timers.tick(0);
        assert.equal(socket.readyState, 3);
    }
});

test('a failed host installation restores all already-installed wrappers and endpoints', async t => {
    const {controller, host, navigatorHost, fetch} = fixture(t);
    Object.defineProperty(navigatorHost, 'serial', {configurable: false, get: () => ({})});
    await assert.rejects(Promise.resolve().then(() => controller.setEnabled(true)), /serial|redefine/);
    assert.equal(controller.enabled, false);
    assert.equal(host.WebSocket, PhysicalSocket);
    assert.equal(host.fetch, fetch);
    assert.ok(new host.WebSocket('ws://localhost:8080') instanceof PhysicalSocket);
});

test('a close callback that replaces the scene wins over the superseded outer transition', async t => {
    const {controller, host} = fixture(t);
    const old = new Ev3VirtualHub();
    const outer = new Ev3VirtualHub();
    const winner = new Ev3VirtualHub();
    winner.pressButton(1, true);
    await controller.setScene(scene(record('ev3', old)));
    await controller.setEnabled(true);
    const socket = new host.WebSocket('ws://localhost:8080');
    t.mock.timers.tick(0);
    let callbackCleanup;
    const onChange = old.onChange.bind(old);
    old.onChange = fn => {
        const release = onChange(fn);
        return () => { release(); callbackCleanup = controller.setScene(scene(record('ev3', winner))); };
    };
    socket.send(WAIT);
    await controller.setScene(scene(record('ev3', outer)));
    await callbackCleanup;
    assert.deepEqual(await (await host.fetch('http://localhost:8080/button/up')).json(), {value: true});
    await controller.setEnabled(false);
    assert.equal(host.WebSocket, PhysicalSocket);
});

test('a disposed scene cannot keep answering transport requests', async t => {
    const {controller, host, navigatorHost} = fixture(t);
    const source = scene(record('ev3', new Ev3VirtualHub()));
    await controller.setScene(source);
    await controller.setEnabled(true);
    source._disposed = true;
    assert.equal((await host.fetch('http://localhost:8080/button/up')).status, 503);
    await assert.rejects(navigatorHost.serial.requestPort(), {name: 'NotFoundError'});
    await controller.setScene(source);
    assert.equal((await host.fetch('http://localhost:8080/button/up')).status, 503);
});

test('disposal during a serial host getter releases the late installation', async t => {
    const {controller, host, navigatorHost, fetch} = fixture(t);
    const native = {getPorts: async () => []};
    let intercepted = false;
    let cleanup;
    const getter = () => {
        if (!intercepted) { intercepted = true; cleanup = controller.dispose(); }
        return native;
    };
    Object.defineProperty(navigatorHost, 'serial', {configurable: true, get: getter});
    await controller.setEnabled(true);
    await cleanup;
    assert.equal(controller.enabled, false);
    assert.equal(host.WebSocket, PhysicalSocket);
    assert.equal(host.fetch, fetch);
    assert.equal(Object.getOwnPropertyDescriptor(navigatorHost, 'serial').get, getter);
});

test('an explicit target limits serial and HTTP discovery; the same scene can select a different brick', async t => {
    const {controller, host, navigatorHost} = fixture(t);
    const source = scene(record('ev3', new Ev3VirtualHub()), record('nxt', new NxtVirtualHub()),
        {id: 'one', profile: 'technic-hub', hub: new Lwp3VirtualHub({id: 'one'})},
        {id: 'two', profile: 'technic-hub', hub: new Lwp3VirtualHub({id: 'two'})});
    await controller.setScene(source, {hubId: 'nxt'});
    await controller.setEnabled(true);
    const ports = await navigatorHost.serial.getPorts();
    assert.equal(ports.length, 1);
    assert.match(ports[0].peripheral.name, /NXT/);
    const ev3 = new host.WebSocket('ws://localhost:8080');
    t.mock.timers.tick(0);
    assert.equal(ev3.readyState, 3);
    for (const id of ['two', 'one']) {
        await controller.setScene(source, {hubId: id});
        assert.deepEqual(await navigatorHost.serial.getPorts(), []);
        const offered = await (await host.fetch('http://localhost:8080/scan', {method: 'POST'})).json();
        assert.equal(offered.length, 1);
        assert.ok(offered[0].id.endsWith(`-${id}`));
    }
    assert.throws(() => controller.setScene(source, {hubId: 'missing'}), /not in/);
});
