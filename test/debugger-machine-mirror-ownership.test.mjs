// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const path = 'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx';
const source = read(path);

test('debugger teardown preserves an independently owned machine mirror', async () => {
    assert.equal(read('packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), source);
    const start = source.indexOf('    _teardownRunner () {');
    const end = source.indexOf('    async runner () {', start);
    assert.ok(start >= 0 && end > start, 'actual teardown method is present');
    const stops = [];
    const win = Object.fromEntries(['Video', 'Keyboard', 'Audio'].map(kind =>
        [`bwStopMachine${kind}`, () => stops.push(kind)]));
    const Owner = new Function('window', `return class { ${source.slice(start, end)} };`)(win);
    const setup = runner => Object.assign(new Owner(), {state: {runner}, props: {},
        _runnerPromise: null, _runnerOwnership: {release() {}}, releaseSamdButtons() {},
        _invalidateHddDownload() {}, _mouseLeave() {}});
    const idle = setup(null);
    idle._teardownRunner();
    assert.deepEqual(stops, [], 'an idle debugger cannot stop another owner’s mirror');
    const running = setup({destroy() { stops.push('destroy'); }});
    running._teardownRunner();
    assert.deepEqual(stops, ['Video', 'Keyboard', 'Audio', 'destroy'],
        'an owned runner still stops its machine outputs before destruction');
    stops.length = 0;
    const pending = setup(null);
    pending._runnerPromise = Promise.resolve({destroy() { stops.push('destroy'); }});
    pending._teardownRunner();
    await Promise.resolve();
    assert.deepEqual(stops, ['Video', 'Keyboard', 'Audio', 'destroy'],
        'a still-pending owned runner is also stopped and destroyed');
});
