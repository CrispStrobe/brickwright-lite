// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const extract = name => {
    const begin = source.indexOf(`    async ${name} (`), end = source.indexOf('\n    async ', begin + 1);
    assert.ok(begin >= 0 && end > begin);
    return source.slice(begin, end).trim();
};
const methods = ['stopProgram', 'pause'].map(extract).join(',\n');
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
};

// One action sequence exercises both merged Pause branches with the shipped
// teardown method. These are authored lifecycle boundaries, not guest evidence.
test('upload cancellation and retained Pause both preserve newer ownership', async () => {
    const uploadStop = deferred(), retainedStop = deferred(), events = [], tasks = [];
    const uploading = {uploading: true, storageSupported: true, closed: false,
        async stopProgram () { events.push('wrong-retained-upload-stop'); },
        stop () { this.closed = true; events.push('full-upload-stop'); return uploadStop.promise; }};
    const pane = new Function('ArenaHubBridge', `return ({${methods}});`)(class {});
    Object.assign(pane, {firmwareSession: uploading, bridge: {}, state: {status: 'starting', message: 'upload'},
        hubState: {backend: {cancel () { events.push('cancel'); }}},
        clock: {uninstall () { events.push('uninstall'); }},
        setState (patch) { Object.assign(this.state, patch); events.push(['state', patch]); }});
    try {
        tasks.push(pane.pause());
        assert.equal(pane.firmwareSession, null, 'Uploading Stop must detach the full session');
        assert.equal(uploading.closed, true); assert.ok(events.includes('full-upload-stop'));
        assert.ok(!events.includes('wrong-retained-upload-stop'));
        await pane.stopProgram();
        const retained = {uploading: false, storageSupported: true, closed: false,
            stopProgram: () => retainedStop.promise, async stop () { this.closed = true; }};
        pane.firmwareSession = retained; pane.state = {status: 'running', message: 'new owner'};
        tasks.push(pane.pause());
        const mark = events.length;
        uploadStop.resolve(); await tasks[0];
        assert.deepEqual(events.slice(mark), [], 'Old full cancellation cannot overwrite current retained Pause');
        assert.equal(pane.state.status, 'running');
        await pane.stopProgram();
        pane.state = {status: 'ready', message: 'latest owner'};
        const finalMark = events.length;
        retainedStop.resolve(); await tasks[1];
        assert.deepEqual(events.slice(finalMark), [], 'Old retained Pause must retain its captured-session guard');
        assert.deepEqual(pane.state, {status: 'ready', message: 'latest owner'});
    } finally {
        uploadStop.resolve(); retainedStop.resolve(); await Promise.allSettled(tasks);
    }
});
