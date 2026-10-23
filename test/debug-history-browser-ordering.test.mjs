// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Source/page-protocol controls only: no browser, CPU, firmware or guest is simulated.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source = readFileSync(new URL('../scripts/verify-debug-history-browser.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function prepareHistoryMachine (');
const end = source.indexOf('\ntry {\n    if (!url)', start);
assert.ok(start >= 0 && end > start);
const prepareSource = source.slice(start, end).trim();

function control (mode = 'late', circuitDelay = 1000) {
    let clock = 0, visible = false, media = null, listeners = 0;
    const order = [], timeouts = [];
    class Window extends EventTarget {
        addEventListener (name, listener) {
            if (name === 'bw-settings-change') {listeners++;order.push('observe');}
            return super.addEventListener(name, listener);
        }
        removeEventListener (name, listener) {
            if (name === 'bw-settings-change') {listeners--;order.push('cleanup');}
            return super.removeEventListener(name, listener);
        }
    }
    const window = new Window();
    window.addEventListener('bw-asm-rom-ready', event => {
        order.push('media');media = {bytes: Array.from(event.detail.rom),
            applied: window.__bwDebugHistorySetup?.applied, visible};
    });
    const context = {window, CustomEvent, Uint8Array, Date: {now: () => clock}};
    const prepare = runInNewContext(`(${prepareSource})`, context);
    const emit = value => window.dispatchEvent(new CustomEvent('bw-settings-change',
        {detail: {key: 'bw-device-id', value}}));
    const timeout = options => {timeouts.push(options.timeout);assert.ok(options.timeout > 0 && options.timeout <= 30000);};
    const panel = {
        async waitFor (options) {timeout(options);order.push('visible');visible = true;clock += 1000;},
        locator (selector) {
            assert.equal(selector, '[data-debug-record]:not([disabled])');
            return {async waitFor (options) {timeout(options);order.push('record');}};
        }, first () {return this;}
    };
    const page = {
        async evaluate (fn) {return fn();},
        getByTestId (id) {
            assert.equal(id, 'bw-device-select');
            return {async selectOption (value, options) {
                assert.equal(value, 'z80');timeout(options);order.push('select');clock += 1000;
                if (mode === 'sync') emit('z80');
            }};
        },
        async waitForFunction (fn, arg, options) {
            timeout(options);order.push('await-applied');clock += 2000;
            if (mode === 'late' || mode === 'changed') {emit('ev3');assert.equal(fn(), false);emit('z80');}
            if (mode === 'wrong') emit('ev3');
            if (mode === 'wrong-key') window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'unrelated', value: 'z80'}}));
            if (!fn()) throw new Error('applied device acknowledgement timed out');
        },
        getByRole (role) {
            assert.equal(role, 'tab');
            return {async click (options) {timeout(options);order.push('circuit');clock += circuitDelay;if (mode === 'changed') emit('ev3');}};
        },
        locator (selector) {assert.equal(selector, '[data-debug-panel]:visible');return panel;}
    };
    return {prepare: () => prepare(page), order, timeouts, get media () {return media;},
        get listeners () {return listeners;}, window};
}

test('actual history setup registers before even a synchronous applied acknowledgement', async () => {
    const c = control('sync');let result;await assert.doesNotReject(async () => {result = await c.prepare();});
    assert.equal(result.deviceApplied, true);
    assert.deepEqual(c.order, ['observe', 'select', 'await-applied', 'circuit', 'visible', 'media', 'record', 'cleanup']);
    assert.equal(c.media.applied, true);assert.equal(c.media.visible, true);
    assert.deepEqual(c.media.bytes, [0x3e, 0, 0x32, 0, 0x80, 0x3c, 0xc3, 2, 0]);
    assert.equal(c.listeners, 0);assert.equal(c.window.__bwDebugHistorySetup, undefined);
});
test('late applied acknowledgement precedes visible Circuit and ROM, sharing the original setup budget', async () => {
    const c = control();let result;await assert.doesNotReject(async () => {result = await c.prepare();});
    assert.deepEqual(Array.from(result.events), ['ev3', 'z80']);
    assert.ok(c.order.indexOf('await-applied') < c.order.indexOf('media'));
    assert.equal(c.media.applied, true);assert.equal(c.media.visible, true);
    assert.deepEqual(c.timeouts, [30000, 29000, 27000, 26000, 25000]);
});
test('absent or wrong device acknowledgement refuses before media and cleans its real observer', async () => {
    for (const mode of ['missing', 'wrong', 'wrong-key']) {
        const c = control(mode);
        await assert.rejects(c.prepare(), /applied device acknowledgement timed out/);
        assert.equal(c.media, null);assert.equal(c.order.includes('circuit'), false);
        assert.equal(c.listeners, 0);assert.equal(c.window.__bwDebugHistorySetup, undefined);
    }
});
test('exhausted setup budget cannot grant a new media or Record timeout', async () => {
    const c = control('late', 31000);
    await assert.rejects(c.prepare(), /exceeded 30000 ms/);
    assert.equal(c.media, null);assert.equal(c.order.includes('record'), false);assert.equal(c.listeners, 0);
});

test('a later applied device invalidates Z80 readiness before ROM delivery', async () => {
    const c = control('changed');
    await assert.rejects(c.prepare(), /Z80 applied-device acknowledgement missing/);
    assert.equal(c.media, null);assert.equal(c.order.includes('record'), false);assert.equal(c.listeners, 0);
});
