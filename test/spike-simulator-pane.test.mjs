// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {React, create, act, loadSimulator, installBrowser, one, settle} from './helpers/spike-simulator-pane.mjs';

test('virtual simulator drives the arena through the supplied hub without a firmware loader', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'en'})); });
        await settle(() => browser.win.__bwSpikeArena?.bridge, 'arena ready');
        assert.equal(one(renderer, 'bw-spike-simulator').props['data-backend'], 'native');
        assert.equal(browser.scripts.length, 0);
        const arena = browser.win.__bwSpikeArena.bridge;
        await act(async () => { await one(renderer, 'bw-spike-arena-start').props.onClick(); });
        hub.backend.runAtSpeed('A', -300); hub.backend.runAtSpeed('B', 300);
        await browser.frames(10);
        assert.ok(arena.sim.pose.x > arena.sim.world.start.x);
        assert.equal(renderer.getInstance().hubState, hub);
        assert.equal(browser.scripts.length, 0);
    } finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});

test('closing the simulator interrupts pending motion and waits on the shared hub', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'de'})); });
        await settle(() => browser.win.__bwSpikeArena?.bridge, 'arena ready');
        const motion = hub.backend.runForTime('A', 10000, 300);
        const wait = hub.backend.wait(10000);
        hub.backend.step(100);
        assert.ok(hub.data.motors[0].degPerSec > 0);
        act(() => renderer.unmount()); renderer = null;
        assert.equal(await motion, 'interrupted');
        assert.equal(await wait, 'interrupted');
        assert.equal(hub.data.motors[0].degPerSec, 0);
    } finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});

test('free sandbox works with no program, survives reopening and reset cancels pending waits', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'en'})); });
        await settle(() => browser.win.__bwSpikeArena?.bridge, 'arena ready');
        await act(async () => { await one(renderer, 'bw-spike-arena-sandbox').props.onClick(); });
        assert.equal(browser.win.__bwSpikeArena.mode, 'sandbox');
        assert.equal(browser.win.__bwSpikeArena.bridge.hubState, hub);
        await act(async () => { await one(renderer, 'bw-spike-sandbox-drive-forward').props.onClick(); });
        await browser.frames(20);
        assert.ok(browser.win.__bwSpikeArena.snapshot.pose.x > 30);
        assert.equal(browser.win.__bwSpikeArena.verdict.status, 'running');
        const pending = hub.backend.wait(5000);
        await act(async () => { await one(renderer, 'bw-spike-arena-reset').props.onClick(); });
        assert.equal(await pending, 'interrupted');
        assert.equal(browser.win.__bwSpikeArena.snapshot.pose.x, 30);
        const original = browser.win.__bwSpikeArena.bridge;
        await act(async () => { await browser.win.__bwSpikeArena._pane.importSandbox({target: {value: 'bad.json', files: [
            {size: 2, text: async () => '{}'}]}}); });
        assert.equal(browser.win.__bwSpikeArena.bridge, original, 'failed import retains the working arena');
        assert.match(one(renderer, 'bw-spike-arena-message').props.children, /Could not open the mat/);
        await act(async () => { await one(renderer, 'bw-spike-arena-challenges').props.onClick(); });
        assert.equal(browser.win.__bwSpikeArena.mode, 'challenge');
        await act(async () => { await one(renderer, 'bw-spike-arena-sandbox').props.onClick(); });
        assert.equal(browser.win.__bwSpikeArena.mode, 'sandbox');
        assert.equal(browser.scripts.length, 0);
    } finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});

test('sandbox does not wait for challenge downloads and late downloads cannot replace it', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const fetchWorld = globalThis.fetch;
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    globalThis.fetch = async url => { await hold; return fetchWorld(url); };
    let renderer;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: new Hub(), locale: 'en'})); });
        const button = one(renderer, 'bw-spike-arena-sandbox');
        assert.notEqual(button.props.disabled, true);
        await act(async () => { await button.props.onClick(); });
        assert.equal(browser.win.__bwSpikeArena.mode, 'sandbox');
        const bridge = browser.win.__bwSpikeArena.bridge;
        await act(async () => { await one(renderer, 'bw-spike-sandbox-drive-forward').props.onClick(); });
        await browser.frames(10);
        assert.ok(bridge.sim.pose.x > bridge.world.start.x, 'free play animates before downloads finish');
        await act(async () => { release(); });
        await settle(() => browser.win.__bwSpikeArena._pane.state.units.length > 0, 'late unit index');
        assert.equal(browser.win.__bwSpikeArena.bridge, bridge);
        assert.equal(browser.win.__bwSpikeArena.mode, 'sandbox');
        await act(async () => { await one(renderer, 'bw-spike-arena-challenges').props.onClick(); });
        await settle(() => browser.win.__bwSpikeArena.mode === 'challenge', 'challenges available after downloads recover');
    } finally { release(); if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});
