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

test('sandbox item drag and resize update sensors; project load replaces the mounted mat', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();
    const hub = new Hub(); let renderer;
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {hubState: hub, locale: 'en'})); });
        await settle(() => browser.win.__bwSpikeArena?.bridge, 'arena ready');
        await act(async () => { await one(renderer, 'bw-spike-arena-sandbox').props.onClick(); });
        const pane = browser.win.__bwSpikeArena._pane;
        act(() => pane.setState({sandboxTool: 'move'}));
        const target = {getBoundingClientRect: () => ({left: 0, top: 0, width: 180, height: 120}), setPointerCapture () {}};
        act(() => pane.sandboxPointerDown({currentTarget: target, clientX: 90, clientY: 100, pointerId: 1}));
        await act(async () => {await pane.sandboxPointerUp({currentTarget: target, clientX: 110, clientY: 90});});
        assert.ok(Math.abs(pane.world.objects[0].shape.x - 110) < 1e-9);
        await act(async () => {await one(renderer, 'bw-spike-sandbox-larger').props.onClick();});
        assert.equal(pane.world.objects[0].shape.w, 15);
        const loaded = structuredClone(pane.world); loaded.start.x = 45;
        localStorage.setItem('bw-spike-sandbox-v1', JSON.stringify(loaded));
        await act(async () => {browser.win.dispatchEvent(new CustomEvent('bw-project-bundle-loaded'));});
        await settle(() => pane.world.start.x === 45, 'project mat restored');
        assert.equal(pane.bridge.hubState, hub);
        localStorage.removeItem?.('bw-spike-sandbox-v1');
    } finally {if (renderer) act(() => renderer.unmount()); browser.restore(); await cleanup();}
});

test('program storage controls gate unsupported packages and explicitly run loaded code without resetting', async () => {
    const browser = installBrowser(), {Pane, cleanup} = await loadSimulator();let renderer;
    try {
        await act(async () => {renderer = create(React.createElement(Pane, {hubState:new Hub(), locale:'en'}));});
        await act(async () => {await one(renderer, 'bw-spike-arena-sandbox').props.onClick();});
        await settle(() => browser.win.__bwSpikeArena?.bridge, 'arena ready');
        const pane = browser.win.__bwSpikeArena._pane;
        await act(async () => {pane.setState({execution:'nuttx',status:'paused',programState:1});});
        assert.equal(one(renderer,'bw-spike-program-save').props.disabled,true);
        assert.equal(one(renderer,'bw-spike-program-load').props.disabled,true);
        const seen = [], session = {storageSupported:true,programState:1,loaded:false,
            storage:async operation => {seen.push(operation);if(operation==='load')session.loaded=true;return {state:1};},
            startProgram:async()=>seen.push('start-loaded'),stopProgram:async()=>seen.push('stop-program'),
            stop:async()=>seen.push('close')};
        pane.firmwareSession=session;
        await act(async()=>pane.setState({storageSupported:true}));
        await act(async()=>one(renderer,'bw-spike-program-save').props.onClick());
        await act(async()=>one(renderer,'bw-spike-program-load').props.onClick());
        assert.deepEqual(seen,['save','load']);
        assert.match(one(renderer,'bw-spike-arena-message').props.children,/Editor text is unchanged/);
        assert.equal(one(renderer,'bw-spike-arena-start').props.children,'Run loaded program');
        await act(async()=>one(renderer,'bw-spike-arena-start').props.onClick());
        assert.deepEqual(seen,['save','load','start-loaded']);
        await act(async()=>one(renderer,'bw-spike-arena-stop').props.onClick());
        assert.deepEqual(seen,['save','load','start-loaded','stop-program']);
        session.storage=async()=>{throw Object.assign(new Error('errno -16'),{result:-16});};
        await act(async()=>one(renderer,'bw-spike-program-load').props.onClick());
        assert.match(one(renderer,'bw-spike-arena-message').props.children,/storage is busy/);
        pane.locale = 'de';
        await act(async()=>one(renderer,'bw-spike-program-load').props.onClick());
        assert.match(one(renderer,'bw-spike-arena-message').props.children,/Programmspeicher beschäftigt/);
        assert.equal(one(renderer,'bw-spike-arena-start').props.children,'Geladenes Programm starten');
        assert.match(one(renderer,'bw-spike-program-storage-hint').props.children,/Laden startet das Programm nicht/);
        await act(async()=>pane.setState({programState:2}));
        assert.equal(one(renderer,'bw-spike-program-save').props.disabled,true);
        assert.equal(one(renderer,'bw-spike-program-load').props.disabled,true);
        pane.firmwareSession=null;
    } finally {if(renderer)act(()=>renderer.unmount());browser.restore();await cleanup();}
});

test('six-motor profile is sandbox-only, localized, pre-start and compiled-program capable', async () => {
    const browser=installBrowser(),{Pane,cleanup}=await loadSimulator();let renderer;
    try {
        await act(async()=>{renderer=create(React.createElement(Pane,{hubState:new Hub(),locale:'en'}));});
        await act(async()=>{await one(renderer,'bw-spike-arena-sandbox').props.onClick();});
        await settle(()=>browser.win.__bwSpikeArena?.bridge,'arena ready');
        const pane=browser.win.__bwSpikeArena._pane;
        await act(async()=>pane.setState({execution:'nuttx',status:'ready'}));
        assert.equal(one(renderer,'bw-spike-nuttx-topology').props.disabled,false);
        await act(async()=>one(renderer,'bw-spike-nuttx-topology').props.onChange({target:{value:'six-motors'}}));
        assert.equal(one(renderer,'bw-spike-arena-start').props.disabled,false);
        assert.match(one(renderer,'bw-spike-six-motor-hint').props.children,/Scratch motor commands support A–F.*without synchronized starts/);
        let uploaded;
        pane.firmwareSession={topology:'six-motors',storageSupported:true,stop:async()=>{},uploadProgram:async p=>{uploaded=p;}};
        const compiled={version:1,instructions:[[1,5,200,0],[0,0,0,0]]};
        await act(async()=>pane.startFirmware(compiled));
        assert.equal(uploaded,compiled);
        await assert.rejects(pane.startFirmware({version:1,instructions:[[3,1,200,0],[0,0,0,0]]}),/ABI bounds/);
        uploaded=null;
        await act(async()=>pane.loadReferenceSolution());
        assert.match(pane.state.message,/Lesson templates require the default devices/);
        pane.firmwareSession={topology:'six-motors',loaded:true,programState:1,storageSupported:true,stop:async()=>{}};
        await act(async()=>pane.setState({programState:1,status:'paused'}));
        assert.equal(one(renderer,'bw-spike-nuttx-topology').props.disabled,true);
        assert.equal(one(renderer,'bw-spike-arena-start').props.disabled,false);
        assert.equal(one(renderer,'bw-spike-arena-start').props.children,'Run loaded program');
        pane.firmwareSession=null;pane.locale='de';
        await act(async()=>pane.setState({sandbox:null}));
        const selector=one(renderer,'bw-spike-nuttx-topology');
        assert.equal(selector.props['aria-label'],'NuttX-Geräte');
        assert.equal(selector.findAllByType('option').find(o=>o.props.value==='six-motors').props.disabled,true);
        assert.match(one(renderer,'bw-spike-six-motor-hint').props.children,/Scratch-Motorbefehle unterstützen A–F/);
    } finally {if(renderer)act(()=>renderer.unmount());browser.restore();await cleanup();}
});
