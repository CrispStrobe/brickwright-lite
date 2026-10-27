// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Two block fixes adopted from CrispStrobe/extensions, judged on the vendored
// bundles' own source: micro:bit+ "set pin pull" applies the chosen pull, and
// NXT "raw value of sensor" returns the raw ADC word (GETINPUTVALUES 8-9).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const bundleSource = name => {
    const text = readFileSync(new URL(`../overlay/scratch-vm/src/extensions/crispstrobe/${name}/index.js`, import.meta.url), 'utf8');
    return JSON.parse(text.match(/makeExt\(("(?:[^"\\]|\\.)*")/s)[1]);
};
const quiet = () => {};
const load = (name, runtime) => {
    let extension;
    const any = new Proxy({}, {get: (_, key) => String(key)});
    vm.runInNewContext(bundleSource(name), {
        console: {log: quiet, info: quiet, debug: quiet, warn: quiet, error: quiet, trace: quiet, group: quiet, groupEnd: quiet},
        window: {addEventListener: quiet, setTimeout, clearTimeout},
        alert: quiet, btoa, atob, setTimeout, clearTimeout,
        setInterval: () => 0, clearInterval: quiet,
        Scratch: {
            vm: {runtime}, extensions: {unsandboxed: true, register: e => { extension = e; }},
            Cast: {toNumber: Number, toString: String}, BlockType: any, ArgumentType: any,
            translate: Object.assign(m => (m && typeof m === 'object' ? m.default : m), {setup: quiet})
        }
    });
    return extension;
};

test('micro:bit+ set pin pull reads its declared PULL argument', () => {
    const calls = [];
    const extension = load('microbitplus', {circuitBoard: {setPin: (...args) => calls.push(args)}, on: quiet});
    const block = extension.getInfo().blocks.find(b => b && b.opcode === 'setpull');
    assert.deepEqual(Object.keys(block.arguments), ['PIN', 'PULL']);
    extension.setpull({PIN: '0', PULL: 'up'});
    extension.setpull({PIN: '1', PULL: 'down'});
    extension.setpull({PIN: '2', PULL: 'none'});
    assert.deepEqual(calls, [['p0', 'input-pullup', true], ['p1', 'input-pulldown', false], ['p2', 'input', false]]);
});

test('NXT raw sensor value is the raw ADC word, and touch pressed judges it', async () => {
    const runtime = {on: quiet, emit: quiet, registerPeripheralExtension: quiet};
    const extension = load('legonxt', runtime);
    // GETINPUTVALUES reply: 8-9 raw, 10-11 normalized (BDK offsets).
    const reply = raw => {
        const b = Buffer.alloc(16);
        b[0] = 0x02; b[1] = 0x07; b[4] = 1;
        b.writeUInt16LE(raw, 8);
        b.writeUInt16LE(1023, 10);
        return [...b];
    };
    let raw = 183;
    extension.peripheral.sendTelegram = async () => reply(raw);
    assert.equal(await extension.getRawSensorValue({PORT: 'S1'}), 183);
    assert.equal(await extension.isTouchPressed({PORT: 'S1'}), true, 'pressed raw 183 < 500');
    raw = 1015;
    assert.equal(await extension.isTouchPressed({PORT: 'S1'}), false);
});
