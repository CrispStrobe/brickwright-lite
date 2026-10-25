// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {Lwp3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/lwp3/lwp3-virtual-hub.js';
import {Wedo2VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/wedo2/wedo2-virtual-hub.js';
import {Lwp3Peripheral, Wedo2Peripheral} from '../overlay/scratch-gui/src/lib/virtual-hub/lab-ble-peripherals.js';
import {LWP3_CHARACTERISTIC} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/lwp3/lwp3-protocol.js';
import {CHAR} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/wedo2/wedo2-protocol.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {createVirtualBleBridge} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-ble-bridge.js';

const types = [
    {name: 'LWP3', Hub: Lwp3VirtualHub, Peripheral: Lwp3Peripheral,
        subscribe: hub => hub.receive(Uint8Array.from([5, 0, 1, 2, 2])),
        poke: hub => hub.receive(Uint8Array.from([5, 0, 1, 2, 5])),
        zero: [6, 0, 1, 2, 6, 0], one: [6, 0, 1, 2, 6, 1]},
    {name: 'WeDo', Hub: Wedo2VirtualHub, Peripheral: Wedo2Peripheral,
        subscribe: hub => hub.startNotifications(CHAR.BUTTON),
        poke: hub => hub._send(CHAR.BUTTON, hub.read(CHAR.BUTTON)), zero: [0], one: [1]}
];

for (const spec of types) {
    test(`${spec.name}: an old peripheral releases only its own notification sink`, t => {
        t.mock.timers.enable({apis: ['setTimeout']});
        const hub = new spec.Hub();
        const old = new spec.Peripheral(hub);
        const next = new spec.Peripheral(hub);
        const oldMessages = [];
        const nextMessages = [];
        old.connect(); old.setNotificationSink((uuid, bytes) => oldMessages.push([...bytes]));
        next.connect(); next.setNotificationSink((uuid, bytes) => nextMessages.push([...bytes]));
        old.disconnect(); old.disconnect(); old.dispose();
        spec.poke(hub);
        t.mock.timers.tick(0);
        assert.deepEqual(oldMessages, []);
        assert.deepEqual(nextMessages, [spec.zero]);
        next.disconnect();
        spec.poke(hub); t.mock.timers.tick(0);
        assert.deepEqual(nextMessages, [spec.zero]);
    });

    test(`${spec.name}: sink release is idempotent and distinguishes repeated installations of the same callback`, () => {
        const hub = new spec.Hub();
        const messages = [];
        const sink = (...args) => messages.push([...args.at(-1)]);
        const old = hub.setSink(sink);
        const next = hub.setSink(sink);
        old(); old();
        spec.poke(hub);
        assert.deepEqual(messages, [spec.zero]);
        next(); next();
        spec.poke(hub);
        assert.deepEqual(messages, [spec.zero]);
    });

    test(`${spec.name}: strict input, notifications, reads and worker state agree`, () => {
        const hub = new spec.Hub();
        const messages = [];
        hub.setSink((...args) => messages.push([...args.at(-1)]));
        for (const code of [-1, 1, 0.5, '0', null, NaN]) assert.equal(hub.pressButton(code, true), false);
        for (const down of [0, 1, 'true', null]) assert.equal(hub.pressButton(0, down), false);
        assert.deepEqual(hub.readButton(0), {pressed: false});
        assert.equal(hub.readButton(1), null);
        spec.subscribe(hub);
        assert.deepEqual(messages, [spec.zero]);
        hub.pressButton(0, true); hub.pressButton(0, true);
        assert.deepEqual(messages, [spec.zero, spec.one]);
        assert.deepEqual(hub.readButton(0), {pressed: true});
        const mirror = new spec.Hub();
        mirror.importState(hub.exportState());
        assert.deepEqual(mirror.readButton(0), {pressed: true});
        assert.equal(mirror.stateKey(mirror.exportState()), hub.stateKey(hub.exportState()));
        hub.pressButton(0, false);
        assert.deepEqual(messages, [spec.zero, spec.one, spec.zero]);
    });

    test(`${spec.name}: a superseded connection cannot write or subscribe through the newer owner's sink`, t => {
        t.mock.timers.enable({apis: ['setTimeout']});
        const hub = new spec.Hub();
        const old = new spec.Peripheral(hub);
        const next = new spec.Peripheral(hub);
        old.connect(); old.setNotificationSink(() => {});
        const received = [];
        next.connect(); next.setNotificationSink((uuid, bytes) => received.push([...bytes]));
        const length = hub.log.length;
        const uuid = hub.protocol === 'lwp3' ? LWP3_CHARACTERISTIC : CHAR.OUTPUT_COMMAND;
        const data = hub.protocol === 'lwp3' ? [5, 0, 1, 2, 5] : [1, 1, 1, 50];
        assert.throws(() => old.onWrite(uuid, Uint8Array.from(data)), {name: 'NetworkError'});
        assert.throws(() => old.onStartNotifications(uuid), {name: 'NetworkError'});
        assert.equal(hub.log.length, length, 'no stale protocol side effect');
        t.mock.timers.tick(0);
        assert.deepEqual(received, [], 'no stale reply delivered to the new owner');
        next.disconnect(); old.disconnect();
    });

    test(`${spec.name}: runtime API holds and bridge notifications reach the actual characteristic`, t => {
        t.mock.timers.enable({apis: ['setTimeout']});
        const hub = new spec.Hub();
        const peripheral = new spec.Peripheral(hub);
        const session = {hubs: [{id: 'radio', profile: hub.profile.id, hub}]};
        const buttons = createRobotLabApi({getSession: () => session});
        const bridge = createVirtualBleBridge(() => [peripheral]);
        t.after(() => { buttons.dispose(); bridge.dispose(); });
        const request = (path, data = {}) => bridge({path, method: path === '/notifications' ? 'GET' : 'POST',
            query: new URLSearchParams(data), json: () => data});
        assert.equal(request('/connect', {deviceId: peripheral.id}).status || 200, 200);
        // LWP3 subscriptions use its property opcode; WeDo uses the existing
        // Button characteristic exposed on the peripheral.
        spec.subscribe(hub);
        t.mock.timers.tick(0);
        request('/notifications', {deviceId: peripheral.id});
        const held = buttons.holdButton('radio', 'button');
        assert.equal(held.ok, true);
        t.mock.timers.tick(0);
        const result = request('/notifications', {deviceId: peripheral.id});
        assert.deepEqual(result.json.map(message => message.data), [spec.one]);
        held.release(); t.mock.timers.tick(0);
        assert.deepEqual(hub.readButton(0), {pressed: false});
        if (hub.protocol === 'wedo2') assert.deepEqual([...peripheral.read(CHAR.BUTTON)], [0]);
        else assert.equal(LWP3_CHARACTERISTIC, peripheral.services[0].characteristics[0].uuid);
    });
}
