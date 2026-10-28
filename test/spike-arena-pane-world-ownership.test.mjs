// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Authored teardown and load promises exercise the shipped methods, not a guest.
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const extract = name => {
    const begin = source.indexOf(`    async ${name} (`);
    assert.ok(begin >= 0);
    let end = source.indexOf('\n    async ', begin + 1);
    // openUnit is followed by a synchronous lifecycle method.
    if (name === 'openUnit') end = source.indexOf('\n    componentWillUnmount ', begin + 1);
    assert.ok(end > begin);
    return source.slice(begin, end).trim();
};
const methods = ['stopProgram', 'openUnit', 'select', 'setSandbox', 'manualDrive'].map(extract).join(',\n');
const fixture = loader => {
    let release;
    const teardown = new Promise(resolve => { release = resolve; });
    const events = [], callbacks = [];
    class Bridge {
        constructor ({world}) { this.world = world; this.robot = {left: {port: 0}, right: {port: 1}}; events.push(['bridge', world.id]); }
    }
    const loadUnit = loader || (async id => ({unit: {id}, challenges: [{id: `${id}-challenge`}], folder: id}));
    const storage = {setItem (key, value) { events.push(['persist', key, value]); }};
    const pane = new Function('ArenaHubBridge', 'loadUnit', 'localStorage', 'SANDBOX_STORAGE_KEY', `return ({${methods}});`)(Bridge, loadUnit, storage, 'sandbox');
    Object.assign(pane, {
        disposed: false, state: {sandbox: {id: 'original'}, challenges: [{id: 'lesson-a'}, {id: 'lesson-b'}], index: 0, driveSpeed: 25},
        firmwareSession: {stop: () => teardown}, bridge: new Bridge({world: {id: 'original'}}),
        hubState: {setSimulationEnabled () { events.push('simulation'); }, backend: {
            cancel () {}, percentToDps (port, value) { return value; }, runAtSpeed (port, value) { events.push(['drive', port, value]); }
        }},
        clock: {uninstall () {}, clear () { events.push('clock.clear'); }},
        props: {onReady () { events.push('ready'); }}, draw () { events.push('draw'); },
        t: (key, values) => `${key}:${values?.error}`, queueCallbacks: false,
        setState (patch, done) {
            Object.assign(this.state, patch); events.push(['state', patch]);
            if (done) { if (this.queueCallbacks) callbacks.push(done); else done(); }
        }
    });
    Object.defineProperty(pane, 'world', {get () { return this.state.sandbox || this.state.challenges[this.state.index]; }});
    events.length = 0;
    return {pane, events, callbacks, release, Bridge};
};
const invoke = (pane, action, newer = false) => action === 'select' ? pane.select(newer ? 1 : 0) :
    action === 'setSandbox' ? pane.setSandbox({id: newer ? 'sandbox-b' : 'sandbox-a'}) :
    action === 'openUnit' ? pane.openUnit(newer ? 'unit-b' : 'unit-a') : pane.manualDrive(newer ? 'back' : 'forward');

for (const action of ['select', 'setSandbox', 'openUnit', 'manualDrive']) {
    for (const lifecycle of ['live', 'stopped', 'newer-action', 'disposed', 'foreign-bridge']) {
        test(`${action} after delayed teardown: ${lifecycle}`, async () => {
            const f = fixture();
            const task = invoke(f.pane, action);
            assert.equal(f.pane.firmwareSession, null);
            let newer;
            if (lifecycle === 'disposed') { f.pane.disposed = true; newer = f.pane.stopProgram(); }
            if (lifecycle === 'stopped') newer = f.pane.stopProgram();
            if (lifecycle === 'newer-action') newer = invoke(f.pane, action, true);
            if (lifecycle === 'foreign-bridge') f.pane.bridge = new f.Bridge({world: {id: 'foreign'}});
            const bridge = f.pane.bridge, state = JSON.stringify(f.pane.state), mark = f.events.length;
            f.release(); await Promise.all([task, newer]); await Promise.resolve();
            if (lifecycle === 'newer-action') {
                const expected = fixture(); expected.pane.firmwareSession = null;
                await invoke(expected.pane, action, true);
                assert.deepEqual(f.events.slice(mark), expected.events, 'Only the newer action may publish or drive after teardown');
                assert.deepEqual(f.pane.state, expected.pane.state);
            } else if (lifecycle !== 'live') {
                assert.deepEqual(f.events.slice(mark), [], 'Old action must not publish, persist, construct a world or drive motors');
                assert.equal(f.pane.bridge, bridge);
                assert.equal(JSON.stringify(f.pane.state), state);
            } else if (action === 'manualDrive') {
                assert.equal(f.events.filter(event => Array.isArray(event) && event[0] === 'drive').length, 2);
                assert.equal(f.pane.state.status, 'running');
            } else {
                assert.equal(f.pane.state.status, 'ready');
                assert.ok(f.events.includes('draw'));
            }
        });
    }
}

for (const action of ['select', 'setSandbox']) {
    test(`${action} deferred render callback cannot report readiness after replacement`, async () => {
        const f = fixture(); f.pane.firmwareSession = null; f.pane.queueCallbacks = true;
        await invoke(f.pane, action);
        assert.equal(f.callbacks.length, 1);
        await f.pane.stopProgram();
        f.pane.bridge = new f.Bridge({world: {id: 'replacement'}});
        const mark = f.events.length;
        f.callbacks[0]();
        assert.deepEqual(f.events.slice(mark), [], 'Old render callback must not draw, remount or notify readiness');
    });
}

for (const outcome of ['success', 'error']) {
    for (const lifecycle of ['live', 'stopped', 'sandbox', 'newer-unit']) {
        test(`unit fetch ${outcome} after ${lifecycle}`, async () => {
            let resolve, reject;
            const fetch = new Promise((yes, no) => { resolve = yes; reject = no; });
            const result = id => ({unit: {id}, challenges: [{id: `${id}-challenge`}], folder: id});
            const f = fixture(id => id === 'unit-a' ? fetch : Promise.resolve(result(id)));
            f.pane.firmwareSession = null;
            const task = f.pane.openUnit('unit-a');
            await Promise.resolve(); await Promise.resolve();
            assert.equal(f.pane.state.status, 'loading');
            if (lifecycle === 'stopped') await f.pane.stopProgram();
            if (lifecycle === 'sandbox') await f.pane.setSandbox({id: 'newer-sandbox'});
            if (lifecycle === 'newer-unit') { await f.pane.openUnit('unit-b'); await Promise.resolve(); }
            const mark = f.events.length, bridge = f.pane.bridge, state = JSON.stringify(f.pane.state);
            if (outcome === 'success') resolve(result('unit-a'));
            else reject(new Error('authored unit fetch error'));
            await task; await Promise.resolve();
            if (lifecycle !== 'live') {
                assert.deepEqual(f.events.slice(mark), [], 'Obsolete unit load must not select a world or show its failure');
                assert.equal(f.pane.bridge, bridge); assert.equal(JSON.stringify(f.pane.state), state);
            } else if (outcome === 'success') {
                assert.equal(f.pane.state.unit.id, 'unit-a'); assert.equal(f.pane.state.status, 'ready');
            } else { assert.equal(f.pane.state.status, 'failed'); assert.match(f.pane.state.message, /authored unit fetch error/); }
        });
    }
}

for (const boundary of ['simulation', 'first-motor']) {
    test(`manual drive stops publishing when Stop reenters from ${boundary}`, async () => {
        const f = fixture(); f.pane.firmwareSession = null;
        let stopped;
        const cancel = () => { stopped = f.pane.stopProgram(); };
        if (boundary === 'simulation') f.pane.hubState.setSimulationEnabled = cancel;
        else {
            const drive = f.pane.hubState.backend.runAtSpeed;
            f.pane.hubState.backend.runAtSpeed = (port, value) => { drive(port, value); if (port === 0) cancel(); };
        }
        await f.pane.manualDrive('forward'); assert.ok(stopped); await stopped;
        assert.equal(f.events.filter(event => Array.isArray(event) && event[0] === 'drive').length, boundary === 'simulation' ? 0 : 1);
        assert.notEqual(f.pane.state.status, 'running');
    });
}
