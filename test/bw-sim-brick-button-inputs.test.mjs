// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrickButtonInputs} from '../overlay/scratch-gui/src/lib/bw-sim/api/brick-button-inputs.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
const setup = (...hubs) => {
    const session = {hubs: hubs.map((hub, i) => ({id: `ev3-${i}`, profile: 'ev3', hub}))};
    return createRobotLabApi({getSession: () => session});
};

test('pointer and keyboard holds overlap, repeats stay bounded, and cancel preserves externally held input', t => {
    const hub = new Ev3VirtualHub();
    const api = setup(hub);
    const inputs = createBrickButtonInputs({getApi: () => api});
    t.after(() => { inputs.dispose(); api.dispose(); });
    inputs.hold('pointer-1', 'ev3-0', 'enter');
    inputs.hold('keyboard', 'ev3-0', 'enter');
    inputs.hold('keyboard', 'ev3-0', 'enter');
    inputs.release('pointer-1');
    assert.equal(hub.button(2), true);
    inputs.release('keyboard');
    assert.equal(hub.button(2), false);
    hub.pressButton(2, true);
    inputs.hold('pointer-2', 'ev3-0', 'enter');
    inputs.clear();
    assert.equal(hub.button(2), true, 'cancel releases its own hold without lifting a pre-held button');
    hub.pressButton(2, false);
});

test('scene cancellation during input acquisition releases the late hold', t => {
    const hub = new Ev3VirtualHub();
    const api = setup(hub);
    const inputs = createBrickButtonInputs({getApi: () => api});
    t.after(() => { inputs.dispose(); api.dispose(); });
    hub.onChange(() => { if (hub.button(2)) inputs.clear(); });
    assert.equal(inputs.hold('late-pointer', 'ev3-0', 'enter').ok, false);
    assert.equal(hub.button(2), false);
});

test('blur/unmount cleanup tries every held brick and refuses reacquisition during producer callbacks', t => {
    const a = new Ev3VirtualHub();
    const b = new Ev3VirtualHub();
    const api = setup(a, b);
    const inputs = createBrickButtonInputs({getApi: () => api});
    t.after(() => api.dispose());
    inputs.hold('first', 'ev3-0', 'enter');
    inputs.hold('second', 'ev3-1', 'enter');
    let reentrant;
    const stop = a.onChange(() => {
        if (!a.button(2)) { reentrant = inputs.hold('again', 'ev3-1', 'up'); throw new Error('input notification failed'); }
    });
    assert.throws(() => inputs.clear(), /release failed/);
    assert.equal(a.button(2), false);
    assert.equal(b.button(2), false);
    assert.equal(b.button(1), false);
    assert.equal(reentrant.ok, false);
    stop(); inputs.dispose();
    assert.equal(inputs.hold('closed', 'ev3-0', 'enter').ok, false);
});

test('an old UI release cannot lift the new scene button', t => {
    const oldHub = new Ev3VirtualHub();
    const newHub = new Ev3VirtualHub();
    const oldApi = setup(oldHub);
    const newApi = setup(newHub);
    let api = oldApi;
    const inputs = createBrickButtonInputs({getApi: () => api});
    t.after(() => { inputs.dispose(); oldApi.dispose(); newApi.dispose(); });
    inputs.hold('pointer', 'ev3-0', 'enter');
    api = newApi;
    newApi.pressButton('ev3-0', 'enter', true);
    inputs.clear();
    assert.equal(oldHub.button(2), false);
    assert.equal(newHub.button(2), true);
});

test('API replacement during publication releases the old acquired input', t => {
    const oldHub = new Ev3VirtualHub();
    const newHub = new Ev3VirtualHub();
    const oldApi = setup(oldHub);
    const newApi = setup(newHub);
    let api = oldApi;
    const inputs = createBrickButtonInputs({getApi: () => api, onChange: () => { api = newApi; }});
    t.after(() => { inputs.dispose(); oldApi.dispose(); newApi.dispose(); });
    assert.equal(inputs.hold('pointer', 'ev3-0', 'enter').ok, false);
    assert.equal(oldHub.button(2), false);
    assert.equal(newHub.button(2), false);
});

test('a failed UI publication rolls back its acquired API hold', t => {
    const hub = new Ev3VirtualHub();
    const api = setup(hub);
    const failure = new Error('UI publication failed');
    let fail = true;
    const inputs = createBrickButtonInputs({getApi: () => api, onChange: () => { if (fail) throw failure; }});
    t.after(() => { fail = false; inputs.dispose(); api.dispose(); });
    assert.throws(() => inputs.hold('pointer', 'ev3-0', 'enter'), error => error === failure);
    fail = false;
    assert.equal(hub.button(2), false, 'failed pointer acquisition cannot remain held without pointer capture');
});

test('producer release and UI publication errors both survive cleanup', () => {
    const producer = new Error('producer release failed');
    const publication = new Error('release publication failed');
    let changes = 0;
    const api = {holdButton: () => ({ok: true, release () { throw producer; }})};
    const inputs = createBrickButtonInputs({getApi: () => api, onChange: () => { if (++changes > 1) throw publication; }});
    assert.equal(inputs.hold('pointer', 'hub', 'enter').ok, true);
    assert.throws(() => inputs.release('pointer'), error => error instanceof AggregateError &&
        error.errors.includes(producer) && error.errors.includes(publication));
    inputs.dispose();
});
