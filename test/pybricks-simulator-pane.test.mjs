// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {React, create, act, loadSimulator, installBrowser, one, settle} from './helpers/spike-simulator-pane.mjs';
const require = createRequire(import.meta.url);
const assets = new URL('../overlay/scratch-gui/static/pybricks-sim/', import.meta.url);
const factory = require(new URL('pybricks-hub.js', assets).pathname);
const wasmBinary = readFileSync(new URL('pybricks-hub.wasm', assets));

const motion = `from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port
from pybricks.tools import wait
from pybricks.hubs import PrimeHub
left = Motor(Port.A)
right = Motor(Port.B)
left.run(-300)
right.run(300)
wait(400)
left.brake()
right.brake()
wait(100)
PrimeHub().display.pixel(1,2,100)
print('gui-shared', ColorSensor(Port.C).reflection())
`;

test('GUI Run on SPIKE auto-selects Python, drives the mounted arena and returns to native', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    browser.win.createPybricksHub = args => {
        args.wasmBinary = wasmBinary;
        args.locateFile = name => new URL(name, assets).pathname;
        return factory(args);
    };
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'en'})); });
        await settle(() => renderer.getInstance().state.arenaReady, 'arena ready');
        const arena = browser.win.__bwSpikeArena.bridge, before = {...arena.sim.pose};
        await act(async () => { browser.win.dispatchEvent(new CustomEvent('bw-pybricks-run', {detail: {code: motion}})); });
        await settle(() => renderer.root.findAll(node => node.props['data-testid'] === 'bw-pybricks-output' &&
            String(node.props.children).includes('gui-shared')).length > 0, 'real Python output');
        await settle(() => hub.clockOwner === null, 'Python complete');
        assert.equal(one(renderer, 'bw-spike-backend').props.value, 'pybricks');
        assert.equal(browser.win.__bwSpikeArena.bridge, arena);
        assert.ok(arena.sim.pose.x > before.x + 1, JSON.stringify(arena.sim.pose));
        assert.ok(arena.sim.timeMs >= 500);
        assert.equal(hub.data.display[7], 9);
        assert.equal(browser.scripts.length, 0, 'injected test factory used');
        await act(async () => { one(renderer, 'bw-pybricks-button-left').props.onPointerDown(); });
        assert.equal(hub.data.buttons.left, true, 'GUI buttons update the shared hub, not a private WASM copy');
        await act(async () => { one(renderer, 'bw-pybricks-button-left').props.onPointerUp(); });
        assert.equal(hub.data.buttons.left, false);
        hub.setHeading(47);
        await browser.frames(1);
        const heading = renderer.root.findByProps({'aria-label': 'Heading'});
        assert.equal(heading.props.value, 47, 'shared IMU is displayed instead of an unused private slider value');
        assert.equal(heading.props.disabled, true);
        await act(async () => { one(renderer, 'bw-pybricks-button-left').props.onPointerDown(); });
        const after = {...arena.sim.pose};
        await act(async () => { await one(renderer, 'bw-spike-backend').props.onChange({target: {value: 'native'}}); });
        assert.equal(hub.externalBackend, null);
        assert.equal(hub.data.buttons.left, false, 'unmount releases GUI buttons in the shared hub');
        assert.deepEqual(arena.sim.pose, after);
        hub.backend.runAtSpeed('A', -200); hub.backend.runAtSpeed('B', 200);
        arena.tick(300);
        assert.ok(arena.sim.pose.x > after.x);
        assert.equal(hub.backend.simulatedMs, 300, 'native clock starts after Python clock released');
    } catch (error) { console.error(renderer?.root.findAll(node => ['bw-pybricks-status','bw-pybricks-output'].includes(node.props['data-testid'])).map(node => [node.props['data-testid'],node.props.children])); throw error; }
    finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});

test('switching a running GUI Python loop cancels it and leaves a usable native controller', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    browser.win.createPybricksHub = args => {
        args.wasmBinary = wasmBinary;
        args.locateFile = name => new URL(name, assets).pathname;
        return factory(args);
    };
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub})); });
        await settle(() => renderer.getInstance().state.arenaReady, 'arena ready');
        const arena = browser.win.__bwSpikeArena.bridge;
        await act(async () => { browser.win.dispatchEvent(new CustomEvent('bw-pybricks-run', {detail: {code:
            'from pybricks.tools import wait\nprint("loop-started")\nwhile True:\n    wait(10)\n'}})); });
        await settle(() => hub.clockOwner === 'pybricks', 'Python claims hub');
        const active = hub.externalBackend;
        await act(async () => { await one(renderer, 'bw-spike-backend').props.onChange({target: {value: 'native'}}); });
        assert.equal((await active.completion).result, 'stopped');
        assert.equal(hub.clockOwner, null);
        assert.equal(browser.win.__bwSpikeArena.bridge, arena);
        hub.backend.runAtSpeed('A', -100); arena.tick(100);
        assert.ok(hub.data.motors[0].position < 0);
        assert.equal(one(renderer, 'bw-spike-arena-start').props.disabled, false);
    } catch (error) { console.error(renderer?.root.findAll(node => ['bw-pybricks-status','bw-pybricks-output'].includes(node.props['data-testid'])).map(node => [node.props['data-testid'],node.props.children])); throw error; }
    finally { if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup(); }
});
