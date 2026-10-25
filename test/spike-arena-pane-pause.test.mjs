// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise shipped pane methods with explicitly delayed firmware replies.
// These controls do not replace installed-app or guest qualification.
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const extract = name => {
    const begin = source.indexOf(`    async ${name} (`);
    assert.ok(begin >= 0, `Missing pane method: ${name}`);
    const end = source.indexOf('\n    async ', begin + 1);
    assert.ok(end > begin);
    return source.slice(begin, end).trim();
};
const methods = [extract('stopProgram'), extract('pause')].join(',\n');

for (const storage of [true, false]) {
    for (const outcome of ['success', 'error']) {
        for (const lifecycle of ['live', 'stopped', 'replacement', 'disposed']) {
            test(`Pause storage=${storage}, ${outcome}, lifecycle=${lifecycle}`, async () => {
                let resolve, reject;
                const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
                const states = [];
                const pane = new Function(`return ({${methods}})`)();
                const old = {
                    storageSupported: storage,
                    stopProgram: () => pending,
                    stop: () => storage ? Promise.resolve() : pending
                };
                Object.assign(pane, {
                    firmwareSession: old, disposed: false, locale: 'en', state: {status: 'running'},
                    bridge: {}, clock: {uninstall () {}}, hubState: {backend: {cancel () {}}},
                    setState (patch) { Object.assign(this.state, patch); states.push(patch); }
                });
                const task = pane.pause();
                assert.equal(pane.firmwareSession, storage ? old : null);
                let stopped;
                if (lifecycle !== 'live') {
                    if (lifecycle === 'disposed') pane.disposed = true;
                    stopped = pane.stopProgram();
                    pane.state = {status: 'ready', message: 'current state'};
                    if (lifecycle === 'replacement') {
                        pane.firmwareSession = {storageSupported: true};
                        pane.state.status = 'running';
                    }
                }
                const mark = states.length;
                if (outcome === 'success') resolve();
                else reject(new Error('authored old Pause failure'));
                let error, stopError;
                await Promise.all([
                    task.catch(failure => { error = failure; }),
                    stopped?.catch(failure => { stopError = failure; })
                ]);
                if (!storage && outcome === 'error' && ['stopped', 'replacement'].includes(lifecycle)) {
                    assert.equal(stopError?.message, 'authored old Pause failure', 'Current Stop owns the teardown error');
                } else assert.equal(stopError, undefined);
                if (!storage && outcome === 'error' && lifecycle === 'live') {
                    assert.equal(error?.message, 'authored old Pause failure');
                } else assert.equal(error, undefined);
                if (lifecycle !== 'live') {
                    assert.deepEqual(states.slice(mark), [], 'Old Pause must not publish after losing ownership');
                    assert.equal(pane.state.status, lifecycle === 'replacement' ? 'running' : 'ready');
                    assert.equal(pane.state.message, 'current state');
                } else if (outcome === 'success') {
                    assert.equal(pane.state.status, 'paused');
                    if (storage) assert.match(pane.state.message, /Program stopped/);
                } else if (storage) assert.equal(pane.state.message, 'authored old Pause failure');
                else assert.equal(pane.state.status, 'running');
            });
        }
    }
}
