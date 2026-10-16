// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const extract = name => {
    const begin = source.indexOf(`    async ${name} (`);
    assert.ok(begin >= 0);
    const end = source.indexOf('\n    async ', begin + 1);
    assert.ok(end > begin);
    return source.slice(begin, end).trim();
};
const methods = ['stopProgram', 'pause', 'reset', 'step'].map(extract).join(',\n');
const fixture = () => {
    let release;
    const teardown = new Promise(resolve => { release = resolve; });
    const events = [];
    class Bridge {
        constructor () { events.push('bridge.construct'); }
        reset () { events.push('bridge.reset'); }
    }
    const pane = new Function('ArenaHubBridge', 'STEP_BUTTON_MS', `return ({${methods}});`)(Bridge, 20);
    Object.assign(pane, {
        disposed: false, state: {execution: 'native', status: 'running'},
        firmwareSession: {stop: () => teardown}, bridge: new Bridge(), world: {},
        hubState: {backend: {cancel () {}}, setPort () {}}, clock: {uninstall () {}},
        advance (ms) { events.push(['advance', ms]); }, draw () { events.push('draw'); },
        setState (patch, done) { Object.assign(this.state, patch); events.push(['state', patch]); done?.(); }
    });
    events.length = 0;
    return {pane, events, release, Bridge};
};

for (const action of ['reset', 'step']) {
    for (const lifecycle of ['live', 'stopped', 'replacement', 'disposed', 'foreign-bridge']) {
        test(`${action} after delayed teardown: ${lifecycle}`, async () => {
            const f = fixture();
            f.pane.hubState.externalBackend = {cancel () {}};
            const task = f.pane[action]();
            assert.equal(f.pane.firmwareSession, null, 'Actual teardown detaches its session synchronously');
            if (lifecycle === 'disposed') f.pane.disposed = true;
            if (['stopped', 'replacement', 'disposed'].includes(lifecycle)) await f.pane.stopProgram();
            if (lifecycle === 'replacement') f.pane.firmwareSession = {stop: async () => {}};
            if (lifecycle === 'foreign-bridge') f.pane.bridge = new f.Bridge();
            const mark = f.events.length;
            f.release(); await task;
            const later = f.events.slice(mark);
            if (lifecycle !== 'live') assert.deepEqual(later, [], 'Old action must not touch the current world or feedback');
            else if (action === 'reset') {
                assert.ok(later.includes('bridge.reset'));
                assert.equal(f.pane.state.status, 'ready');
                assert.ok(later.includes('draw'));
            } else {
                assert.ok(later.some(event => Array.isArray(event) && event[0] === 'advance' && event[1] === 20));
                assert.equal(f.pane.state.status, 'paused');
            }
        });
    }
}

for (const action of ['pause', 'reset']) {
    for (const topology of ['six-motors', 'dual-ultrasonic']) {
        test(`${action} accepts its own ${topology} bridge restoration`, async () => {
            const f = fixture();
            f.pane.arenaFirmwareTopology = topology;
            const originalBridge = f.pane.bridge;
            const task = f.pane[action]();
            f.release(); await task;
            assert.notEqual(f.pane.bridge, originalBridge, 'Actual teardown restores the ordinary bridge');
            assert.ok(f.events.includes('bridge.construct'));
            assert.equal(f.pane.state.status, action === 'reset' ? 'ready' : 'paused');
            if (action === 'reset') assert.ok(f.events.includes('bridge.reset'));
        });
    }
}
