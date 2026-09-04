/**
 * D-SMOKE1(3) — the missing escape hatch.
 *
 * `sdcc-wasm/compiler.js` exposes a FROZEN allowlist of five STC parts, and
 * `intercept.js`'s header refuses to fall back to the hosted compiler after a
 * local failure: "a supported request never silently falls back … that would
 * turn offline/debug failures into surprising network traffic." That refusal is
 * deliberate and stays. Its cost was that for those five parts a broken or
 * half-cached toolchain could not be bypassed at all — a stuck user had nothing
 * to try.
 *
 * The record allowed exactly two repairs that satisfy the header instead of
 * reversing it: a LOUD automatic fallback, or an explicit opt-out. This is the
 * second. The default must not move, which is what most of these assertions
 * are about: an absent, empty, unreadable or unrelated preference all have to
 * mean "use the in-page compiler", because anything else silently sends a
 * learner's failed local build onto the network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const {localCompilerOptedOut} = await import(
    path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js'));

/** A window stub: only the two surfaces the rule is allowed to read. */
const win = (search = '', stored = null) => ({
    location: {search},
    localStorage: {getItem: k => (k === 'bwLocalCompiler' ? stored : null)}
});

test('the default is the in-page compiler — no query, no preference', () => {
    assert.equal(localCompilerOptedOut(win()), false);
    assert.equal(localCompilerOptedOut(win('?foo=bar')), false,
        'an unrelated query string is not an opt-out');
    assert.equal(localCompilerOptedOut(win('', 'on')), false,
        'a stored preference that is not "off" leaves the default alone');
});

test('no window at all — Node, a worker, a test — is not an opt-out', () => {
    assert.equal(localCompilerOptedOut(undefined), false);
    assert.equal(localCompilerOptedOut(null), false);
});

test('?localCompiler=off opts out, and so do its plain synonyms', () => {
    for (const v of ['off', 'OFF', '0', 'false', 'no', 'No']) {
        assert.equal(localCompilerOptedOut(win(`?localCompiler=${v}`)), true,
            `?localCompiler=${v} is a request to use the compiler service`);
    }
});

test('?localCompiler=on forces the in-page compiler back on, overriding storage', () => {
    assert.equal(localCompilerOptedOut(win('?localCompiler=on', 'off')), false,
        'the URL is the more immediate statement of intent and must win');
    assert.equal(localCompilerOptedOut(win('?localCompiler=', 'off')), false,
        'an EMPTY value is present-but-unset: it must not read as "off"');
});

test('the stored preference works when the URL says nothing', () => {
    assert.equal(localCompilerOptedOut(win('', 'off')), true);
    assert.equal(localCompilerOptedOut(win('?other=1', 'off')), true);
});

test('a window that throws on read keeps the default rather than guessing', () => {
    const hostile = {
        get location () { throw new Error('no location in this context'); },
        localStorage: {getItem () { throw new Error('private browsing'); }}
    };
    assert.equal(localCompilerOptedOut(hostile), false,
        'an unreadable preference is not a request; erring towards the default ' +
        'keeps a failed local build off the network');
    assert.equal(localCompilerOptedOut({location: {search: ''}, localStorage: null}), false,
        'no storage object at all is not an opt-out');
});

test('the rule is CONSULTED, and it guards the install — in both trees', () => {
    // Species 16, applied to this repair. A predicate nothing asks is exactly
    // as useful as one nobody tested, and the wiring cannot be reached from
    // Node: it needs a VM, a compile and a live session. So the claim about the
    // call site is checked where the claim actually lives — in the source —
    // by brace-matched scope rather than a fixed window, so it cannot pass by
    // reading into a neighbouring branch.
    for (const tree of ['overlay', 'packages']) {
        const file = path.join(ROOT, tree, 'scratch-gui/src/lib/bw-debug/debug-runner.js');
        const src = readFileSync(file, 'utf8');
        const guarded = scopeAfter(src, 'if (LOCAL_8051_TARGETS.has(compileTarget)) {');

        assert.match(guarded, /if \(localCompilerOptedOut\(\)\)/,
            `${tree}: the compile path must ask before installing the in-page compiler`);
        assert.match(guarded, /installWasmCompilerRouting\(setStatus\)/,
            `${tree}: the default path must still install it`);
        assert.match(guarded, /setStatus\([^)]*'building'[\s\S]*?off by request/,
            `${tree}: opting out must SAY so — the header's objection is to a silent fallback`);

        // The install must sit in the else, after the opt-out returns false.
        const optOutAt = guarded.indexOf('localCompilerOptedOut()');
        const installAt = guarded.indexOf('installWasmCompilerRouting(setStatus)');
        assert.ok(optOutAt !== -1 && installAt !== -1 && optOutAt < installAt,
            `${tree}: the opt-out has to be consulted BEFORE the install, not after it`);
    }
});
