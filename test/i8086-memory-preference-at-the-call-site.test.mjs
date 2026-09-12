/**
 * The 8086 memory-mode preference belongs to the CALLER, not to the vendored adapter.
 *
 * `bw-board/i8086-adapter.js` reaches OUT of the vendored root for
 * `../bw-i8086-preferences.js`, which reads `globalThis.localStorage`. That is one of
 * only three outward reaches in that tree and the only one needing no upstream change:
 * bw-board is a headless emulator library, and the caller already owns a config.
 *
 * Two claims, and the second is the one that makes the fix non-obvious.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {withI8086MemoryPreference, setI8086MemoryMode}
    from '../overlay/scratch-gui/src/lib/bw-i8086-preferences.js';
import {BREADBOARD8086} from 'bw-board/i8086-machine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const runner = (tree) => readFileSync(
    path.join(HERE, '..', tree, 'scratch-gui/src/lib/bw-debug/debug-runner.js'), 'utf8');

test('the preference applied to NO config replaces the map instead of amending it', () => {
    // THE TRAP. This is why the call site must resolve the default itself, and why
    // "just move the call up" is wrong. In `reference` mode the preference spreads
    // its argument -- so `undefined` becomes `{fastWords: false}`, a config with no
    // memory map at all, which the adapter would then use INSTEAD of BREADBOARD8086.
    setI8086MemoryMode('reference');

    const naive = withI8086MemoryPreference(undefined);
    assert.deepEqual(naive, {fastWords: false},
        'fixture: reference mode must amend, so the naive call yields a bare flag');
    assert.equal('rom' in naive || 'ram' in naive || Object.keys(naive).length > 1, false,
        'the naive result carries no memory map -- a machine built on it boots on nothing');

    const resolved = withI8086MemoryPreference(undefined ?? BREADBOARD8086);
    assert.equal(resolved.fastWords, false, 'the preference still applies');
    assert.ok(Object.keys(resolved).length > 1,
        'and the breadboard map survives, which is the whole point of resolving first');

    setI8086MemoryMode('optimized');
    assert.equal(withI8086MemoryPreference(BREADBOARD8086), BREADBOARD8086,
        'optimized mode returns the config untouched, so this is opt-in');
});

for (const tree of ['overlay', 'packages']) {
    test(`${tree}: the i8086 call site resolves the default before building the target`, () => {
        const src = runner(tree);
        // THE EXECUTABLE CALL, not the first textual mention. `indexOf` on
        // `createDebugTarget('i8086'` lands on a COMMENT 165 lines earlier that
        // describes what that call does -- and a window taken before a comment
        // contains none of the code. A document about a thing matches every
        // pattern meant for the thing; this test found that out about itself.
        const calls = [...src.matchAll(/await createDebugTarget\('i8086'/g)];
        assert.equal(calls.length, 1,
            `fixture: expected exactly one executable i8086 target call in ${tree}, `
            + `found ${calls.length} -- the window below assumes one`);
        const at = calls[0].index;

        // The preference must be applied in the 40 lines before the call, WITH the
        // default resolved. Scanning a window rather than the whole file so a call in
        // some other branch cannot satisfy this one.
        const before = src.slice(Math.max(0, at - 2000), at);
        assert.match(before, /withI8086MemoryPreference\(\s*targetOpts\.config\s*\?\?\s*BREADBOARD8086\s*\)/,
            `${tree}: the i8086 target is built without resolving the memory preference `
            + 'against the default config -- either the call is missing or it was moved '
            + 'without the `?? BREADBOARD8086`, which boots the machine on a bare flag');
    });
}
