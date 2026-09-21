// SPDX-License-Identifier: Apache-2.0
//
// The EV3 auto-detection probes in the right order, and cannot hang.
//
// `auto` is the default connection mode, so this is the code path every user
// who does not touch the menu takes. It was written against four transports
// that fail in four different ways — a refused socket, a rejected promise, a
// request that never answers — and "auto detection hangs" is a worse failure
// than "auto detection found nothing", so the bound matters as much as the
// order.
//
// The extension is exercised through its VENDORED BUNDLE, which is what ships.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();

const {loadExtension} = await import('../scripts/spike/load-extension.mjs');
const {bundleSource} = await import('../scripts/spike/bundled-upstream.mjs');

/**
 * Load the extension with the browser surface stubbed, and record which
 * transports were attempted in which order.
 */
const harness = function ({serialPorts = [], answers = {}} = {}) {
    const tried = [];
    const previous = {
        navigator: globalThis.navigator,
        WebSocket: globalThis.WebSocket,
        fetch: globalThis.fetch
    };

    globalThis.window = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
        value: {
            language: 'en-US',
            languages: ['en-US', 'en'],
            userAgent: 'node',
            serial: {
                getPorts: async () => { tried.push('serial:getPorts'); return serialPorts; },
                requestPort: async () => {
                    // Reaching this in a PROBE is the bug: it opens a browser
                    // chooser and needs a user gesture.
                    tried.push('serial:requestPort');
                    throw new Error('requestPort must never be reached by a probe');
                }
            }
        },
        configurable: true, writable: true
    });
    globalThis.document = {
        documentElement: {lang: 'en'},
        createElement: () => ({style: {}, appendChild () {}, click () {}, setAttribute () {}}),
        body: {appendChild () {}, removeChild () {}}
    };
    globalThis.localStorage = {getItem: () => null, setItem: () => {}};
    globalThis.addEventListener = () => {};
    globalThis.alert = () => {};
    globalThis.WebSocket = function (url) {
        tried.push(`ws:${url}`);
        this.readyState = 0;
        this.close = () => {};
        // Never opens, never errors: the shape that would hang an unbounded probe.
        if (answers.ws === 'silent') return;
        setTimeout(() => this.onerror && this.onerror(new Error('refused')), 0);
    };
    globalThis.fetch = async (url) => {
        tried.push(`http:${url}`);
        if (answers.http === 'silent') return new Promise(() => {});
        throw new Error('unreachable');
    };

    const instance = loadExtension(bundleSource('ev3comprehensive'));
    return {
        instance,
        tried,
        restore () {
            Object.defineProperty(globalThis, 'navigator',
                {value: previous.navigator, configurable: true, writable: true});
            globalThis.WebSocket = previous.WebSocket;
            globalThis.fetch = previous.fetch;
        }
    };
};

test('auto is the default, so this path is the one most users take', () => {
    const h = harness();
    try {
        const info = h.instance.getInfo();
        const modeArg = info.blocks.find(b => b && b.opcode === 'setMode').arguments.MODE;
        assert.equal(modeArg.defaultValue, 'auto');
    } finally {
        h.restore();
    }
});

test('a probe never opens the Web Serial chooser', async () => {
    // getPorts() returns what the user already authorised and needs no
    // gesture; requestPort() opens a dialog and throws without one. With no
    // authorised port, detection must move on rather than prompt.
    const h = harness({serialPorts: []});
    try {
        await h.instance.ev3.detect({timeoutMs: 50});
        assert.ok(h.tried.includes('serial:getPorts'), 'the silent serial probe did not run');
        assert.ok(!h.tried.includes('serial:requestPort'),
            'detection opened the browser port chooser, which needs a user gesture it does not have');
    } finally {
        h.restore();
    }
});

test('the probe order is serial, then Scratch Link, then bridge, then HTTP', async () => {
    // ASSERTED FROM THE EXTENSION'S OWN PROBE LOG, not from the globals the
    // harness stubs. The first version of this test watched for a WebSocket
    // construction and a fetch call, and concluded HTTP was never probed —
    // wrong, and wrong in the direction that reports a working chain as
    // broken. Two of the four transports do not touch those globals at all:
    // ScratchLinkBackend goes through the runtime's session machinery, and
    // HTTPBackend uses Scratch.fetch, which the loader stubs. What the probe
    // order actually is, is what detect() says it is doing.
    const h = harness({serialPorts: []});
    const probed = [];
    const restoreConsole = ['log', 'info', 'warn', 'debug', 'error'].map(level => {
        const original = console[level];
        console[level] = (...args) => {
            const match = args.map(String).join(' ').match(/auto — probing (\w+)/);
            if (match) probed.push(match[1]);
        };
        return () => { console[level] = original; };
    });
    try {
        await h.instance.ev3.detect({timeoutMs: 50});
    } finally {
        restoreConsole.forEach(fn => fn());
        h.restore();
    }
    assert.deepEqual(probed, ['serial', 'scratchlink', 'bridge', 'http'],
        'the probe order changed; serial-via-getPorts must stay first because it is the ' +
        'only one that costs nothing, and HTTP last because an unreachable IP is the ' +
        'slowest thing here');
});

test('a transport that never answers is bounded, not waited on', async () => {
    // The failure this exists to prevent: a bridge host or brick IP that
    // silently drops packets holds the whole chain on its own TCP timeout.
    const h = harness({serialPorts: [], answers: {ws: 'silent', http: 'silent'}});
    try {
        const started = Date.now();
        const found = await h.instance.ev3.detect({timeoutMs: 100});
        const elapsed = Date.now() - started;
        assert.equal(found, null, 'nothing answered, so detection must report nothing');
        // Three bounded probes at 100ms plus overhead. Generous, because the
        // point is that it TERMINATES, not that it is fast.
        assert.ok(elapsed < 5000,
            `detection took ${elapsed}ms against unresponsive transports — it is not bounded`);
    } finally {
        h.restore();
    }
});

test('detection reports what it found, and the reporter agrees', async () => {
    const h = harness({serialPorts: []});
    try {
        await h.instance.ev3.detect({timeoutMs: 50});
        assert.equal(h.instance.ev3.detectedMode, null);
        // Nothing connected: the reporter must say so rather than name a mode
        // that was only ever a default.
        assert.equal(h.instance.getConnectionMode(), '');
    } finally {
        h.restore();
    }
});
