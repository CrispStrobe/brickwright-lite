// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const extract = name => {
    const start = source.indexOf(`    async ${name} (`), end = source.indexOf('\n    async ', start + 1);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end).trim();
};
const methods = ['stopProgram', 'pause'].map(extract).join(',\n');
// Evaluate the shipped Stop/Start JSX branch condition; installed rendering is a separate gate.
const begin = source.indexOf("{status === 'running' ||"), end = source.indexOf(' ? (', begin);
assert.ok(begin >= 0 && end > begin);
const rendersStop = new Function('status', `return Boolean(${source.slice(begin + 1, end)});`);
for (const [status, session, expected] of [
    ['paused', {uploading: true}, true], ['ready', {uploading: true}, true],
    ['paused', {uploading: false}, false], ['running', null, true],
    ['starting', {}, true], ['starting', null, false]
]) test(`Stop branch ${status}, uploading=${session?.uploading}`, () => {
    assert.equal(rendersStop.call({firmwareSession: session}, status), expected);
});

for (const outcome of ['success', 'error']) {
    for (const owner of ['current', 'replacement', 'disposed']) {
        test(`pending upload Stop uses full session cancellation: ${outcome}/${owner}`, async () => {
            let resolve, reject;
            const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
            const events = [];
            const session = {uploading: true, storageSupported: true,
                stopProgram () { events.push('retained-program-stop'); return Promise.resolve(); },
                stop () { this.closed = true; events.push('full-session-stop'); return pending; }};
            const pane = new Function('ArenaHubBridge', `return ({${methods}});`)(class {});
            Object.assign(pane, {firmwareSession: session, state: {status: 'paused', message: 'Uploading current code...'}, bridge: {},
                clock: {uninstall () { events.push('clock.uninstall'); }}, hubState: {backend: {cancel () {}}},
                setState (patch) { Object.assign(this.state, patch); events.push(['state', patch]); }});
            let deliver;
            const delivery = new Promise(done => { deliver = done; });
            const originalStop = pane.stopProgram.bind(pane);
            let calls = 0;
            pane.stopProgram = async options => {
                const first = calls++ === 0;
                try { return await originalStop(options); }
                finally { if (first && owner !== 'current') await delivery; }
            };
            const task = pane.pause();
            // Release even on a baseline failure, preserving the original method's completion.
            try {
                assert.equal(pane.firmwareSession, null, 'Upload Stop must detach the owning session immediately');
                assert.equal(session.closed, true); assert.ok(events.includes('full-session-stop'));
                assert.ok(!events.includes('retained-program-stop'));
                if (owner === 'disposed') pane.disposed = true;
                if (owner !== 'current') {
                    const stopped = pane.stopProgram();
                    const observed = outcome === 'error' && owner !== 'disposed' ?
                        assert.rejects(stopped, /authored cancellation failure/) : assert.doesNotReject(stopped);
                    if (outcome === 'success') resolve(); else reject(new Error('authored cancellation failure'));
                    await observed;
                    pane.firmwareSession = {stop: async () => {}};
                    pane.state = {status: 'running', message: 'replacement'};
                }
                const mark = events.length;
                if (outcome === 'success') resolve(); else reject(new Error('authored cancellation failure'));
                deliver(); await task;
                if (owner !== 'current') {
                    assert.deepEqual(events.slice(mark), [], 'Old cancellation must not publish into a replacement');
                    assert.equal(pane.state.status, 'running');
                } else if (outcome === 'success') {
                    assert.equal(pane.state.status, 'ready'); assert.ok(events.includes('clock.uninstall'));
                    assert.equal(pane.state.message, '', 'Finished cancellation must clear stale upload feedback');
                } else { assert.equal(pane.state.status, 'failed'); assert.equal(pane.state.message, 'authored cancellation failure'); }
            } finally { resolve(); deliver(); await task; }
        });
    }
}

test('ordinary retained program Stop keeps its live storage session', async () => {
    let stops = 0;
    const session = {uploading: false, storageSupported: true, stopProgram: async () => { stops++; }};
    const pane = new Function(`return ({${methods}});`)();
    Object.assign(pane, {firmwareSession: session, state: {}, setState (patch) { Object.assign(this.state, patch); }});
    await pane.pause();
    assert.equal(stops, 1); assert.equal(pane.firmwareSession, session); assert.equal(pane.state.status, 'paused');
});

test('late cancellation delivery error cannot overwrite a replacement', async () => {
    let resolveNative, release;
    const native = new Promise(resolve => { resolveNative = resolve; });
    const delivery = new Promise(resolve => { release = resolve; });
    const states = [];
    const session = {uploading: true, storageSupported: true,
        stopProgram: async () => {}, stop: () => native};
    const pane = new Function('ArenaHubBridge', `return ({${methods}});`)(class {});
    Object.assign(pane, {firmwareSession: session, bridge: {}, state: {},
        clock: {uninstall () {}}, hubState: {backend: {cancel () {}}},
        setState (patch) { Object.assign(this.state, patch); states.push(patch); }});
    const original = pane.stopProgram.bind(pane);
    let held = false;
    pane.stopProgram = async options => {
        await original(options); held = true; await delivery;
        throw new Error('authored late cancellation delivery error');
    };
    const task = pane.pause();
    try {
        resolveNative();
        for (let i = 0; i < 20 && !held; i++) await Promise.resolve();
        assert.equal(held, true, 'Actual full teardown must complete before delaying its error delivery');
        await original();
        pane.firmwareSession = {stop: async () => {}};
        pane.state = {status: 'running', message: 'replacement'};
        const mark = states.length;
        release(); await task;
        assert.deepEqual(states.slice(mark), []);
        assert.equal(pane.state.message, 'replacement');
    } finally { resolveNative(); release(); await task; }
});
