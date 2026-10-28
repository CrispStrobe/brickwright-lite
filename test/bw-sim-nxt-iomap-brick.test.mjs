// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Hosted affected virtual-brick qualification. No compiler, network or physics bench.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NxtVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-virtual-hub.js';
import {executeTelegram} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/nxt-direct-commands.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readFileSync(new URL('./fixtures/nxt-rxe/iomap-buttons.nxc', import.meta.url));
const rxe = readFileSync(new URL('./fixtures/nxt-rxe/iomap-buttons.rxe', import.meta.url));
const expected = [0, 128, 0, 1, 0, 1, -111, 1, 0, 0, 0, 0, 128, -112, 1, 99,
    -111, 99, -19, 0, -19, -111, 0, 0, 0, 999];
const shown = hub => hub.events.filter(e => e.kind === 'display' && e.what === 'text').map(e => Number(e.text));
const name20 = name => [...name].map(c => c.charCodeAt(0)).concat(Array(20).fill(0)).slice(0, 20);
const exec = (hub, bytes) => Array.from(executeTelegram(Uint8Array.from(bytes), hub).reply);
const until = (hub, predicate) => {
    const limit = hub.s.timeMs + 5000;
    while (!predicate() && hub.s.timeMs < limit) { hub.advanceTo(hub.s.timeMs + 5); hub.publish(); }
    assert.ok(predicate(), 'finite virtual-time completion boundary');
};
const seed = hub => {
    hub.pressButton(1, false); hub.readButton(1, true);
    hub.pressButton(1, true); hub.pressButton(1, false); hub.pressButton(1, true);
};
const upload = hub => {
    const n = rxe.length;
    const open = exec(hub, [1, 0x81, ...name20('iomap.rxe'), n & 255, (n >>> 8) & 255, 0, 0]);
    assert.deepEqual(open.slice(0, 3), [2, 0x81, 0]);
    const handle = open[3];
    for (let at = 0; at < n; at += 32) {
        const bytes = [...rxe.subarray(at, at + 32)];
        assert.deepEqual(exec(hub, [1, 0x83, handle, ...bytes]), [2, 0x83, 0, handle, bytes.length, 0]);
    }
    assert.deepEqual(exec(hub, [1, 0x84, handle]), [2, 0x84, 0, handle]);
    assert.deepEqual(hub.s.files['iomap.rxe'], [...rxe]);
};
const start = hub => assert.deepEqual(exec(hub, [0, 0, ...name20('iomap.rxe')]), [2, 0, 0]);
const prepared = () => { const hub = new NxtVirtualHub({id: 'iomap-proof'}); upload(hub); seed(hub); return hub; };

test('IOMap fixture binds the one hosted compiler response to owned source and executable bytes', () => {
    assert.equal(sha(source), '0baf668c0cb75143a402d94012243b2acbfe0192975cca156b0324cca3c2397e');
    assert.equal(sha(rxe), '850c20375793c255808eb9a3d5076e353222e52b4b1af2c3c146f836f932a5a2');
    assert.equal(rxe.length, 2410);
    assert.deepEqual([...rxe.subarray(0, 14)], [...Buffer.from('MindstormsNXT\0')]);
});

test('compiled IOMap program uploads and runs through the actual virtual brick with signed errors and shared button state', t => {
    const hub = prepared(); start(hub); until(hub, () => !hub.currentProgramName());
    assert.deepEqual(hub.s.lastProgram, {name: 'iomap.rxe', how: 'ok', error: null});
    assert.deepEqual(shown(hub), expected);
    assert.deepEqual(hub.readButton(1), {pressed: true, count: 0});
    assert.deepEqual(exec(hub, [1, 0x94, 1, 0, 4, 0, 33, 0, 1, 0]), [2, 0x94, 0, 1, 0, 4, 0, 1, 0, 128]);
    t.diagnostic(JSON.stringify({case: 'iomap-normal', sourceSha256: sha(source), rxeSha256: sha(rxe), shown: shown(hub)}));
});

test('IOMap compiled-program Stop retires execution and restart uses the same live button state adapter', () => {
    const hub = prepared(); start(hub);
    until(hub, () => shown(hub).length > 0);
    assert.ok(hub.currentProgramName());
    assert.deepEqual(exec(hub, [0, 1]), [2, 1, 0]);
    assert.equal(hub.s.lastProgram.how, 'abort');
    const afterStop = shown(hub);
    hub.advanceTo(hub.s.timeMs + 200); hub.publish();
    assert.deepEqual(shown(hub), afterStop);
    seed(hub); const before = shown(hub).length; start(hub);
    until(hub, () => !hub.currentProgramName());
    assert.deepEqual(shown(hub).slice(before), expected);
    assert.equal(hub.s.lastProgram.how, 'ok');
});

test('IOMap running snapshot restores deterministically and map writes address restored state', () => {
    const original = prepared(); start(original);
    until(original, () => shown(original).length > 0);
    assert.ok(original.currentProgramName());
    const prefix = shown(original), snapshot = original.exportState();
    const restored = new NxtVirtualHub({id: 'iomap-proof'}); restored.importState(snapshot);
    assert.deepEqual(restored.readButton(1), original.readButton(1));
    until(original, () => !original.currentProgramName());
    until(restored, () => !restored.currentProgramName());
    assert.deepEqual(prefix.concat(shown(restored)), expected);
    assert.deepEqual(shown(original), expected);
    assert.deepEqual(restored.s.buttons, original.s.buttons);
    assert.deepEqual(restored.s.lastProgram, original.s.lastProgram);
});
