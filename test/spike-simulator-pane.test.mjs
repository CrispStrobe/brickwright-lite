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
