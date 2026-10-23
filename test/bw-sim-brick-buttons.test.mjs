// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
import {NxtVirtualHub, NXT_BUTTON} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-virtual-hub.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {createEv3Session} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-peripheral.js';
import {createVirtualEv3dev} from '../overlay/scratch-gui/src/lib/bw-sim/transports/virtual-ev3dev.js';

const scene = (...hubs) => ({hubs, _disposed: false});
const record = (profile, hub, id = profile) => ({profile, hub, id});
const setup = (session, extra = {}) => {
    let current = session;
    const api = createRobotLabApi({getSession: () => current, ...extra});
    return {api, replace: value => { current = value; }};
};

test('brick input discovery exposes only supported current capabilities with firmware indices', t => {
    const s = scene(record('ev3', new Ev3VirtualHub()), record('nxt', new NxtVirtualHub()),
        record('spike-prime', new SpikeVirtualHub()), record('lab-direct', {}));
    const {api} = setup(s);
    t.after(() => api.dispose());
    const list = api.brickButtons();
    assert.deepEqual(list.map(h => h.profile), ['ev3', 'nxt', 'spike-prime']);
    assert.deepEqual(list[0].buttons.map(b => [b.name, b.index]),
        [['up', 1], ['enter', 2], ['down', 3], ['right', 4], ['left', 5], ['back', 6]]);
    assert.deepEqual(list[1].buttons.map(b => b.index), Object.values(NXT_BUTTON));
    assert.ok(list.every(h => h.buttons.every(b => b.pressed === false)));
    assert.equal(api.pressButton('lab-direct', 'up', true).code, 'no-buttons');
    assert.equal(api.pressButton('missing', 'up', true).code, 'no-brick');
});

test('button calls distinguish no model, loading, disposed and firmware-owned inputs', () => {
    const {api, replace} = setup(null, {getStatus: () => 'loading'});
    assert.deepEqual(api.brickButtons(), []);
    assert.equal(api.pressButton('ev3', 'enter', true).code, 'loading');
    replace({...scene(record('ev3', new Ev3VirtualHub())), _disposed: true});
    assert.equal(api.holdButton('ev3', 'enter').code, 'loading');
    replace({...scene(record('spike-prime', new SpikeVirtualHub())), lockstep: {}});
    assert.deepEqual(api.brickButtons(), []);
    assert.equal(api.pressButton('spike-prime', 'left', true).code, 'no-buttons');
    api.dispose();
});

test('EV3 accepts six real inputs, refuses sentinels and publishes held-state changes', t => {
    const hub = new Ev3VirtualHub();
    const {api} = setup(scene(record('ev3', hub)));
    t.after(() => api.dispose());
    let changed = 0;
    hub.onChange(() => { changed++; });
    for (const button of [0, 7, -1, 1.5, NaN, Infinity, 'missing', null]) {
        assert.equal(api.pressButton('ev3', button, true).code, 'bad-button');
    }
    assert.equal(api.pressButton('ev3', 'enter', 'false').code, 'bad-button-state');
    assert.equal(hub.anyButton(), false);
    assert.equal(api.pressButton('ev3', 'enter', true).pressed, true);
    assert.equal(hub.button(2), true);
    assert.equal(hub.button(7), true);
    assert.equal(hub.button(0), false);
    assert.equal(hub.pressButton(0, true), false);
    assert.equal(api.pressButton('ev3', 2, false).pressed, false);
    assert.equal(hub.anyButton(), false);
    assert.equal(changed, 2);
});

test('ev3dev button reads use the same six firmware indices as API input', t => {
    const hub = new Ev3VirtualHub();
    const {api} = setup(scene(record('ev3', hub)));
    t.after(() => api.dispose());
    const http = createVirtualEv3dev(() => hub);
    const paths = ['up', 'enter', 'down', 'right', 'left', 'backspace'];
    const buttons = ['up', 'enter', 'down', 'right', 'left', 'back'];
    for (let i = 0; i < buttons.length; i++) {
        assert.equal(api.pressButton('ev3', buttons[i], true).ok, true);
        for (let j = 0; j < paths.length; j++) {
            const reply = http({method: 'GET', path: `/button/${paths[j]}`, headers: {}, json: () => ({})});
            assert.equal(reply.json.value, i === j, `${buttons[i]} versus ${paths[j]}`);
        }
        api.pressButton('ev3', buttons[i], false);
    }
});

test('NXT discovery and input preserve existing non-clearing release counters', t => {
    const hub = new NxtVirtualHub();
    const {api} = setup(scene(record('nxt', hub)));
    t.after(() => api.dispose());
    api.pressButton('nxt', 'enter', true);
    assert.equal(hub.readButton(NXT_BUTTON.enter).pressed, true);
    hub.advanceTo(2101);
    api.pressButton('nxt', 'enter', false);
    assert.equal(hub.readButton(NXT_BUTTON.enter).count, 1);
    api.brickButtons(); api.brickButtons();
    assert.equal(hub.readButton(NXT_BUTTON.enter).count, 1);
    assert.equal(api.pressButton('nxt', 4, true).code, 'bad-button');
});

test('overlapping UI holds release independently and manual input supersedes an old release', t => {
    const hub = new Ev3VirtualHub();
    const {api} = setup(scene(record('ev3', hub)));
    t.after(() => api.dispose());
    const a = api.holdButton('ev3', 'enter');
    const b = api.holdButton('ev3', 'enter');
    a.release(); a.release();
    assert.equal(hub.button(2), true);
    b.release();
    assert.equal(hub.button(2), false);
    const old = api.holdButton('ev3', 'left');
    api.pressButton('ev3', 'left', true);
    old.release();
    assert.equal(hub.button(5), true);
    api.pressButton('ev3', 'left', false);
    assert.equal(hub.button(5), false);
});

test('a temporary hold preserves an input already held outside the API', t => {
    const hub = new Ev3VirtualHub();
    hub.pressButton(2, true);
    const {api} = setup(scene(record('ev3', hub)));
    t.after(() => api.dispose());
    const hold = api.holdButton('ev3', 'enter');
    hold.release();
    assert.equal(hub.button(2), true);
    api.pressButton('ev3', 'enter', false);
    assert.equal(hub.button(2), false);
});

test('session invalidation releases held and manual inputs on their original brick', () => {
    const oldHub = new Ev3VirtualHub();
    const newHub = new Ev3VirtualHub();
    const {api, replace} = setup(scene(record('ev3', oldHub, 'brick')));
    const held = api.holdButton('brick', 'enter');
    api.pressButton('brick', 'left', true);
    replace(scene(record('ev3', newHub, 'brick')));
    api.pressButton('brick', 'enter', true);
    held.release();
    assert.equal(oldHub.button(2), false);
    assert.equal(newHub.button(2), true);
    api.sessionChanged();
    assert.equal(oldHub.button(5), false);
    assert.equal(newHub.button(2), false);
    api.dispose();
});

test('an old SPIKE hold cannot release input adopted by a replacement sharing hub state', () => {
    const state = new VirtualSpikeHubState();
    const {api, replace} = setup(scene(record('spike-prime', new SpikeVirtualHub({hubState: state}))));
    const old = api.holdButton('spike-prime', 'left');
    replace(scene(record('spike-prime', new SpikeVirtualHub({hubState: state}))));
    api.pressButton('spike-prime', 'left', true);
    old.release();
    assert.equal(state.data.buttons.left, true);
    api.pressButton('spike-prime', 'left', false);
    api.dispose();
});

test('a scene replacement during activation prevents writing either brick', () => {
    const old = new Ev3VirtualHub();
    const next = new Ev3VirtualHub();
    let replace;
    const setupResult = setup(scene(record('ev3', old)), {ensureRunning: () => replace(scene(record('ev3', next)))});
    replace = setupResult.replace;
    assert.equal(setupResult.api.pressButton('ev3', 'enter', true).code, 'scene-changed');
    assert.equal(old.anyButton(), false);
    assert.equal(next.anyButton(), false);
    setupResult.api.dispose();
});

for (const method of ['pressButton', 'holdButton']) {
    test(`a scene replacement from ${method} publication releases only the old owned input`, () => {
        const old = new Ev3VirtualHub();
        const next = new Ev3VirtualHub();
        const {api, replace} = setup(scene(record('ev3', old)));
        let changed = false;
        old.onChange(() => {
            if (changed) return;
            changed = true;
            replace(scene(record('ev3', next)));
            api.sessionChanged();
        });
        const result = api[method]('ev3', 'enter', true);
        assert.equal(result.code, 'scene-changed');
        assert.equal(old.button(2), false);
        assert.equal(next.button(2), false);
        api.dispose();
    });
}

test('real EV3 WAIT_FOR_PRESS command stays blocked until valid API input and then replies', t => {
    const hub = new Ev3VirtualHub();
    const {api} = setup(scene(record('ev3', hub)));
    const replies = [];
    const session = createEv3Session(() => hub, {send: bytes => replies.push(Array.from(bytes)), close () {}});
    t.after(() => { session.close(); api.dispose(); });
    // Independent CDK frame: direct reply, no allocation, UI_BUTTON WAIT_FOR_PRESS.
    session.receive(Uint8Array.from([7, 0, 1, 0, 0, 0, 0, 0x83, 3]));
    assert.equal(session.pending, 1);
    assert.deepEqual(replies, []);
    assert.equal(api.pressButton('ev3', 0, true).ok, false);
    assert.deepEqual(replies, []);
    assert.equal(api.pressButton('ev3', 'enter', true).ok, true);
    assert.equal(session.pending, 0);
    assert.deepEqual(replies, [[3, 0, 1, 0, 2]]);
});

test('button invalidation refuses reentrant acquisition from a release publication', () => {
    const hub = new Ev3VirtualHub();
    const {api} = setup(scene(record('ev3', hub)));
    const held = api.holdButton('ev3', 'enter');
    let attempted = false;
    let reacquired;
    hub.onChange(() => {
        if (attempted || hub.button(2)) return;
        attempted = true;
        reacquired = api.holdButton('ev3', 'enter');
    });
    api.sessionChanged();
    assert.equal(attempted, true);
    assert.equal(reacquired.ok, false);
    assert.equal(reacquired.code, 'buttons-unavailable');
    assert.equal(hub.button(2), false);
    held.release();
    api.dispose();
});

test('replacing a hub inside the same record during activation refuses the old action', () => {
    const old = new Ev3VirtualHub();
    const next = new Ev3VirtualHub();
    const brick = record('ev3', old);
    const {api} = setup(scene(brick), {ensureRunning: () => { brick.hub = next; }});
    assert.equal(api.pressButton('ev3', 'enter', true).code, 'scene-changed');
    assert.equal(old.anyButton(), false);
    assert.equal(next.anyButton(), false);
    api.dispose();
});

test('publication detects a replaced SPIKE wrapper and preserves its newly owned shared state', () => {
    const state = new VirtualSpikeHubState();
    const brick = record('spike-prime', new SpikeVirtualHub({hubState: state}));
    const {api} = setup(scene(brick));
    let replaced = false;
    state.subscribe(() => {
        if (replaced) return;
        replaced = true;
        brick.hub = new SpikeVirtualHub({hubState: state});
    });
    const result = api.pressButton('spike-prime', 'left', true);
    assert.equal(result.code, 'scene-changed');
    assert.equal(state.data.buttons.left, true, 'old cleanup cannot clear the new wrapper input');
    api.pressButton('spike-prime', 'left', false);
    api.dispose();
});
