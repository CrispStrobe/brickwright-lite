// The stale-build recovery, tested against the script that actually ships.
//
// This path had no test until now, which is how it shipped a real bug: the
// recovery was correct and unreachable, because the only two listeners were
// for UNHANDLED failures and every component that failed gracefully handled
// its own. A user sat looking at "Loading chunk 783 failed" while the fix sat
// three files away doing nothing.
//
// bw-board's corollary, written after that: "a check that has never failed has
// not been shown to work." This one has now failed on purpose — see the
// one-shot and non-match cases below.
//
// The logic lives in an inline <script> in playground/index.ejs, so it cannot
// be imported. Rather than duplicate it here (which would test a copy, not the
// thing), the test extracts that block from the file and evaluates it against a
// fake window. If someone edits the shipped script, this test sees the edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ejs = resolve(here, '../overlay/scratch-gui/src/playground/index.ejs');

/** Pull the recovery IIFE out of index.ejs and run it against a fake window. */
function loadRecovery () {
    const src = readFileSync(ejs, 'utf8');
    const start = src.indexOf("var KEY = 'bw-chunk-recovery'");
    assert.ok(start > 0, 'recovery block not found in index.ejs — did it move or get deleted?');
    // From the enclosing (function () { to the matching }());
    const open = src.lastIndexOf('(function () {', start);
    const close = src.indexOf('}());', start);
    assert.ok(open > 0 && close > open, 'could not bracket the recovery IIFE');
    const body = src.slice(open, close + '}());'.length);

    const store = new Map();
    const state = {reloaded: 0, cachesDeleted: 0, unregistered: 0, warned: []};
    const listeners = {};
    const win = {
        addEventListener: (name, fn) => { listeners[name] = fn; },
        location: {reload: () => { state.reloaded++; }}
    };
    const sandbox = {
        window: win,
        // The shipped script calls bare `location.reload()`, which resolves to
        // window.location in a browser. Providing only window.location made the
        // reload throw asynchronously and the test pass anyway — the sandbox has
        // to match the globals the real page has, or it tests a different program.
        location: win.location,
        sessionStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, v),
            removeItem: (k) => store.delete(k)
        },
        caches: {
            keys: () => Promise.resolve(['a', 'b']),
            delete: () => { state.cachesDeleted++; return Promise.resolve(true); }
        },
        navigator: {serviceWorker: {getRegistrations: () => Promise.resolve([])}},
        console: {warn: (...a) => state.warned.push(a.join(' ')),
            error: (...a) => state.warned.push(a.join(' '))}
    };
    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(sandbox), body)(...Object.values(sandbox));
    return {win, state, listeners, store};
}

test('the recovery block is still present in the shipped page', () => {
    const {win} = loadRecovery();
    assert.equal(typeof win.__bwRecoverFromStaleBuild, 'function',
        'index.ejs must expose __bwRecoverFromStaleBuild — components that catch ' +
        'their own import failures have no other way to reach the recovery');
});

test('both global listeners are registered', () => {
    const {listeners} = loadRecovery();
    // These catch the failures nobody handled. They are necessary and, on their
    // own, insufficient — which is the bug this file exists to remember.
    assert.ok(listeners.error, 'window error listener');
    assert.ok(listeners.unhandledrejection, 'unhandledrejection listener');
});

test('it recognises the messages a stale build actually produces', () => {
    const {win} = loadRecovery();
    // The real one from production was "Loading chunk 783 failed".
    assert.equal(win.__bwRecoverFromStaleBuild('Loading chunk 783 failed'), true);
});

test('each stale-build spelling is recognised, one fresh page each', () => {
    for (const msg of [
        'Loading chunk 596 failed. (error: https://example/chunks/x.js)',
        'ChunkLoadError: Loading chunk 12 failed',
        'error loading dynamically imported module'
    ]) {
        const {win} = loadRecovery();   // fresh: the guard is one-shot per tab
        assert.equal(win.__bwRecoverFromStaleBuild(msg), true, msg);
    }
});

test('it does NOT fire for ordinary errors', () => {
    const {win, state} = loadRecovery();
    for (const msg of [
        'TypeError: undefined is not a function',
        'NetworkError when attempting to fetch resource',
        '',
        null,
        undefined
    ]) {
        assert.equal(win.__bwRecoverFromStaleBuild(msg), false, String(msg));
    }
    assert.equal(state.reloaded, 0, 'must not reload for a non-stale-build error');
});

test('one shot per tab: the second call declines', () => {
    const {win} = loadRecovery();
    assert.equal(win.__bwRecoverFromStaleBuild('Loading chunk 1 failed'), true);
    // Without this guard, a chunk genuinely missing from the server turns the
    // recovery into an infinite reload loop — a worse failure than the one it
    // is fixing. The caller uses the false to show an error with a Reload
    // button instead of a silent second attempt.
    assert.equal(win.__bwRecoverFromStaleBuild('Loading chunk 1 failed'), false,
        'second stale-build failure in one tab must NOT recover again');
});

test('recovering clears caches and reloads', async () => {
    const {win, state} = loadRecovery();
    win.__bwRecoverFromStaleBuild('Loading chunk 42 failed');
    // The work is promise-chained; let it settle.
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(state.cachesDeleted > 0, 'must delete caches — a stale document is the cause');
    assert.equal(state.reloaded, 1, 'must reload exactly once');
});

test('it says what it is doing', () => {
    const {win, state} = loadRecovery();
    win.__bwRecoverFromStaleBuild('Loading chunk 7 failed');
    assert.ok(state.warned.some((m) => /stale build/i.test(m)),
        'recovery must log its trigger — it clears caches and reloads the page, ' +
        'which is otherwise indistinguishable from a random blank moment');
});
