// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {React, create, act, loadSimulator, installBrowser, one, settle} from './helpers/spike-simulator-pane.mjs';

test('native GUI opens without Pybricks, drives the arena and recovers from absent optional assets', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'en'})); });
        await settle(() => renderer.getInstance().state.arenaReady, 'arena ready');
        assert.equal(one(renderer, 'bw-spike-backend').props.value, 'native');
        assert.equal(browser.scripts.length, 0, 'native never requests optional WASM loader');
        assert.ok(browser.requests.every(url => !url.includes('pybricks')));
        const arena = browser.win.__bwSpikeArena.bridge;
        await act(async () => { await one(renderer, 'bw-spike-arena-start').props.onClick(); });
        hub.backend.runAtSpeed('A', -300); hub.backend.runAtSpeed('B', 300);
        await browser.frames(10);
        assert.ok(arena.sim.pose.x > arena.sim.world.start.x);
        const before = {...arena.sim.pose};
        await act(async () => { await one(renderer, 'bw-spike-backend').props.onChange({target: {value: 'pybricks'}}); });
        await settle(() => renderer.root.findAll(node => node.props['data-testid'] === 'bw-pybricks-status' &&
            node.props.children === 'Could not load the simulator').length > 0, 'missing assets reported');
        assert.equal(browser.scripts.length, 1);
        assert.equal(one(renderer, 'bw-spike-arena-start').props.disabled, true);
        await act(async () => { await one(renderer, 'bw-spike-backend').props.onChange({target: {value: 'native'}}); });
        assert.equal(browser.win.__bwSpikeArena.bridge, arena, 'world object preserved through both switches');
        assert.deepEqual(arena.sim.pose, before);
        assert.equal(hub.data.motors[0].degPerSec, 0);
        assert.equal(one(renderer, 'bw-spike-arena-start').props.disabled, false);
        assert.equal(browser.win.__bwSpikeArena.status, 'ready', 'next native run restarts stopped VM threads');
    } finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});

test('backend switch waits for external completion and latest selection wins without replacing the arena', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer, release; const completion = new Promise(resolve => {release = resolve;});
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'de'})); });
        await settle(() => renderer.getInstance().state.arenaReady, 'arena ready');
        const arena = browser.win.__bwSpikeArena.bridge;
        hub.externalBackend = {cancel: () => {}, completion}; hub.clockOwner = 'pybricks';
        let first, second;
        act(() => { first = renderer.getInstance().selectBackend('pybricks'); });
        assert.equal(one(renderer, 'bw-spike-backend').props.disabled, true);
        assert.equal(one(renderer, 'bw-spike-backend').props.value, 'native');
        act(() => { second = renderer.getInstance().selectBackend('native'); });
        await act(async () => { hub.externalBackend = null; hub.clockOwner = null; release(); await Promise.all([first, second]); });
        assert.equal(one(renderer, 'bw-spike-backend').props.value, 'native');
        assert.equal(browser.win.__bwSpikeArena.bridge, arena);
        assert.equal(browser.scripts.length, 0, 'superseded request does not load Pybricks');
        assert.match(one(renderer, 'bw-spike-backend-hint').props.children, /Scratch/);
    } finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});

test('leaving Python while its optional loader is pending prevents a late boot from claiming the native hub', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const scripts = []; document.head.appendChild = script => scripts.push(script);
    const hub = new Hub(); let renderer, factoryCalls = 0;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub})); });
        await settle(() => renderer.getInstance().state.arenaReady, 'arena ready');
        await act(async () => { await renderer.getInstance().selectBackend('pybricks'); });
        await settle(() => scripts.length === 1, 'optional loader pending');
        await act(async () => { await renderer.getInstance().selectBackend('native'); });
        browser.win.createPybricksHub = () => { factoryCalls++; throw new Error('late factory must not execute'); };
        await act(async () => { scripts[0].onload(); await new Promise(resolve => setImmediate(resolve)); });
        assert.equal(factoryCalls, 0);
        assert.equal(hub.clockOwner, null);
        assert.equal(one(renderer, 'bw-spike-backend').props.value, 'native');
        hub.backend.runAtSpeed('A', -100); hub.backend.step(100);
        assert.ok(hub.data.motors[0].position < 0);
    } finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});
