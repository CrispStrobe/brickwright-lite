/**
 * SDCC is GPL-2.0-or-later and this app is BSD-3-Clause. These are the
 * source-level halves of that separation; `scripts/verify-no-gpl-in-build.mjs`
 * is the half that inspects a real build, which a unit test cannot do because
 * `npm test` runs before the editor is built.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
    getToolchainMode, setToolchainMode, localToolchainEnabled,
    GPL_TOOLCHAIN_ORIGIN, TOOLCHAIN_FILES
} from '../overlay/scratch-gui/src/lib/sdcc-wasm/toolchain-source.js';

const read = p => readFileSync(p, 'utf8');
const CONFIGS = [
    'overlay/scratch-gui/webpack.config.js',
    'packages/scratch-gui/webpack.config.js'
];

test('neither webpack config copies the GPL toolchain into the build', () => {
    for (const path of CONFIGS) {
        const src = read(path);
        assert.equal(/from:\s*'src\/lib\/sdcc-wasm\/dist'/.test(src), false,
            `${path} still copies the SDCC toolchain into the build output`);
        assert.equal(/to:\s*'static\/sdcc-wasm'/.test(src), false,
            `${path} still writes static/sdcc-wasm`);
    }
});

test('both configs are checked, so the overlay cannot drift from the mirror', () => {
    // integrate.mjs copies overlay -> packages, so fixing only one is a fix that
    // survives until the next integrate. Assert the pair really is a pair.
    for (const path of CONFIGS) assert.ok(read(path).includes('sdcc-wasm'),
        `${path} lost the comment explaining why the copy is absent — without it ` +
        'a future edit re-adds the rule with nothing to read');
});

test('the default is online: no GPL is fetched unless a user asks', () => {
    const store = new Map();
    const fake = {getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v)};
    assert.equal(getToolchainMode(fake), 'online');
    assert.equal(localToolchainEnabled(fake), false);
    setToolchainMode('local', fake);
    assert.equal(getToolchainMode(fake), 'local');
    assert.equal(localToolchainEnabled(fake), true);
    setToolchainMode('nonsense', fake);
    assert.equal(getToolchainMode(fake), 'online', 'an unknown value falls back to the safe default');
});

test('storage that throws still yields the safe default', () => {
    const hostile = {getItem () { throw new Error('denied'); }, setItem () { throw new Error('denied'); }};
    assert.equal(getToolchainMode(hostile), 'online');
    assert.doesNotThrow(() => setToolchainMode('local', hostile));
});

test('the toolchain origin is the GPL repository, not this app', () => {
    assert.match(GPL_TOOLCHAIN_ORIGIN, /^https:\/\/crispstrobe\.github\.io\/sdcc-wasm\//);
    // Every file loadToolchain asks for must be primeable, or "works offline"
    // is only true for the ones someone remembered.
    for (const name of ['cc1.js', 'cc1.wasm', 'sdcc.js', 'sdcc.wasm',
        'sdas8051.js', 'sdas8051.wasm', 'sdld.js', 'sdld.wasm', 'runtime.json']) {
        assert.ok(TOOLCHAIN_FILES.includes(name), `${name} is loaded but never cached`);
    }
});

test('the route is gated on the SETTING, not on the capability', () => {
    const intercept = read('overlay/scratch-gui/src/lib/sdcc-wasm/intercept.js');
    assert.match(intercept, /localToolchainEnabled\(\)\s*&&\s*localTargetSupported\(/,
        'intercept must consult the user setting before claiming a compile');
    const compiler = read('overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js');
    assert.equal(/loadToolchain\(document\.baseURI\)/.test(compiler), false,
        'the toolchain must not be loaded from the app origin — that is what bundled it');
});
