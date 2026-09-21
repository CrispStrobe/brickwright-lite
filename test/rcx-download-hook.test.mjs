// The hook that finally gives the RCX tier a caller.
//
// Everything under it is tested: the protocol against NQC's own captured
// frames, the transport against a mock port, the compiler byte-for-byte
// against native nqc. This tests the JOIN — and the join is where the silent
// failures live, because the extension treats a host-installed function as
// optional and falls back without complaint when it is missing or the wrong
// shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {installRcxDownloader} from '../overlay/scratch-gui/src/lib/rcx-download-hook.js';
import {
    encodeCommand, replyOpcodeFor, TOGGLE_BIT, REQUESTS
} from '../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js';

const image = name => readFileSync(join(import.meta.dirname, 'fixtures/rcx-images', name));

/** A port that answers every frame the way a tower plus a live brick would. */
const workingPort = () => {
    const written = [];
    const queue = [];
    let waiter = null;
    const push = chunk => {
        queue.push(chunk);
        if (waiter) {
            const r = waiter;
            waiter = null;
            r();
        }
    };
    return {
        written,
        opened: [],
        closed: 0,
        open (settings) {
            this.opened.push(settings);
            return Promise.resolve();
        },
        close () {
            this.closed++;
            return Promise.resolve();
        },
        writable: {getWriter: () => ({
            write: async chunk => {
                const frame = new Uint8Array(chunk);
                written.push(frame);
                // Answer with the payload length this opcode's reply
                // actually carries. Replying with one byte to everything
                // looks harmless and mis-frames every command whose reply is
                // the opcode alone — which is most of them.
                const base = frame[3] & ~TOGGLE_BIT & 0xff;
                const spec = REQUESTS.get(base);
                const n = spec && spec.replyParams ? spec.replyParams : 0;
                const replyOp = replyOpcodeFor(frame[3]);
                const reply = encodeCommand(replyOp, new Uint8Array(n), {
                    toggle: (replyOp & TOGGLE_BIT) !== 0, checkArity: false
                });
                setTimeout(() => push(frame), 1);
                setTimeout(() => push(reply), 3);
            },
            releaseLock: () => {}
        })},
        readable: {getReader: () => ({
            read: async () => {
                while (!queue.length) {
                    await new Promise(resolve => {
                        waiter = resolve;
                    });
                }
                return {value: queue.shift(), done: false};
            },
            cancel: async () => {
                if (waiter) {
                    const r = waiter;
                    waiter = null;
                    r();
                }
            },
            releaseLock: () => {}
        })}
    };
};

test('a whole download runs through the hook, port to brick', async () => {
    const vm = {runtime: {}};
    assert.equal(installRcxDownloader(vm), true);
    const port = workingPort();
    const phases = [];
    const out = await vm.runtime.rcxDownload(image('t.rcx'), {
        port, programSlot: 2, onProgress: p => phases.push(p.phase)
    });
    assert.equal(out.ok, true, out.log);
    assert.ok(out.chunks >= 1);
    // The port was opened with the RCX's line settings, not defaults.
    assert.deepEqual(port.opened, [{baudRate: 2400, parity: 'odd', dataBits: 8, stopBits: 1}]);
    assert.deepEqual(phases.slice(0, 4),
        ['setProgramNumber', 'stopAllTasks', 'deleteAllTasks', 'deleteAllSubroutines']);
    assert.equal(phases.at(-1), 'done');
});

test('the port is released afterwards, so another tool can have the tower', async () => {
    // Web Serial grants a port, not a session. A tower held open is a tower
    // Bricx Command Center cannot use, and that failure looks like broken
    // hardware rather than like this app holding a lock.
    const vm = {runtime: {}};
    installRcxDownloader(vm);
    const port = workingPort();
    await vm.runtime.rcxDownload(image('t.rcx'), {port});
    assert.equal(port.closed, 1);
});

test('the port is released even when the download fails', async () => {
    const vm = {runtime: {}};
    installRcxDownloader(vm);
    const port = workingPort();
    // A port whose reader ends immediately: every command times out.
    port.readable = {getReader: () => ({
        read: async () => ({value: undefined, done: true}),
        cancel: async () => {}, releaseLock: () => {}
    })};
    const out = await vm.runtime.rcxDownload(image('t.rcx'), {port});
    assert.equal(out.ok, false);
    assert.equal(port.closed, 1, 'a failed download must not leak the port');
});

test('a bad image is refused before the user is asked for a tower', async () => {
    // Prompting for a port and only then admitting the bytes are unusable
    // wastes the gesture and reads as a hardware fault.
    const vm = {runtime: {}};
    installRcxDownloader(vm);
    let asked = false;
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {serial: {
        requestPort: async () => {
            asked = true;
            return workingPort();
        }
    }}});
    try {
        const out = await vm.runtime.rcxDownload(new Uint8Array([1, 2, 3, 4, 5]));
        assert.equal(out.ok, false);
        assert.match(out.log, /not a usable \.rcx image/);
        assert.equal(asked, false, 'the user must not be asked to pick a tower for a bad image');
    } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original);
        else delete globalThis.navigator;
    }
});

test('a silent brick is explained, not just reported', async () => {
    // The single most likely failure, and the one a user cannot diagnose: a
    // brick with no firmware answers exactly like a brick that is not there.
    const vm = {runtime: {}};
    installRcxDownloader(vm);
    const port = workingPort();
    port.writable = {getWriter: () => ({write: async () => {}, releaseLock: () => {}})};
    port.readable = {getReader: () => ({
        read: async () => ({value: undefined, done: true}),
        cancel: async () => {}, releaseLock: () => {}
    })};
    const out = await vm.runtime.rcxDownload(image('t.rcx'), {port});
    assert.equal(out.ok, false);
    assert.match(out.log, /did not answer/);
    assert.match(out.log, /firmware/);
});

test('a cancelled port chooser is not an error the user must decode', async () => {
    const vm = {runtime: {}};
    installRcxDownloader(vm);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {serial: {
        requestPort: async () => {
            throw new Error('No port selected by the user.');
        }
    }}});
    try {
        const out = await vm.runtime.rcxDownload(image('t.rcx'));
        assert.equal(out.ok, false);
        assert.equal(out.cancelled, true);
        assert.match(out.log, /no tower was chosen/);
    } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original);
        else delete globalThis.navigator;
    }
});

test('the hook never overwrites one the host already installed', () => {
    const mine = async () => ({ok: true});
    const vm = {runtime: {rcxDownload: mine}};
    assert.equal(installRcxDownloader(vm), false);
    assert.equal(vm.runtime.rcxDownload, mine);
});

test('no runtime is a refusal, not a throw', () => {
    assert.equal(installRcxDownloader(null), false);
    assert.equal(installRcxDownloader({}), false);
});
