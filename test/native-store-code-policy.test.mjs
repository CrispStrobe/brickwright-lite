import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
    isNativeAppRuntime, localToolchainEnabled, primeToolchainCache
} from '../overlay/scratch-gui/src/lib/sdcc-wasm/toolchain-source.js';
import {lessonMachines} from '../overlay/scratch-gui/src/lib/bw-machines/lessons.js';
import {defaultImageFetcher} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const nativeWindow = () => ({
    __TAURI__: {core: {invoke: async () => {}}},
    location: {search: '?localCompiler=on', hash: ''},
    localStorage: {getItem: () => 'local'}
});

test('native runtime wins over every SDCC opt-in and the downloader refuses before fetch', async () => {
    const previous = globalThis.window;
    const win = nativeWindow();
    globalThis.window = win;
    let fetched = false;
    try {
        assert.equal(isNativeAppRuntime(win), true);
        assert.equal(localToolchainEnabled(win), false);
        await assert.rejects(
            () => primeToolchainCache(undefined, {fetch: async () => { fetched = true; }}),
            /native app cannot download executable toolchains/);
        assert.equal(fetched, false, 'refusal happens before any network request');
    } finally {
        globalThis.window = previous;
    }
});

test('native runtime neither offers remote Linux media nor fetches remote machine images', async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    globalThis.window = nativeWindow();
    let fetched = false;
    globalThis.fetch = async () => { fetched = true; };
    try {
        assert.deepEqual(lessonMachines('en'), []);
        await assert.rejects(
            () => defaultImageFetcher({url: 'https://example.invalid/firmware.bin'}),
            /native app does not download executable machine images/);
        assert.equal(fetched, false, 'refusal happens before any network request');
    } finally {
        globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
});

test('native extension policy is enforced at UI, deep-link and VM boundaries', () => {
    const picker = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/containers/extension-library.jsx'), 'utf8');
    const deepLink = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/url-extensions.js'), 'utf8');
    const manager = readFileSync(
        path.join(ROOT, 'overlay/scratch-vm/src/extension-support/extension-manager.js'), 'utf8');

    assert.match(picker, /if \(!window\.__TAURI__\) \{[\s\S]*fetchGallery\(\)/);
    assert.match(picker, /window\.__TAURI__ \? \[\] : \[customEntry\]/);
    assert.match(deepLink, /if \(typeof window !== 'undefined' && window\.__TAURI__\) return/);
    assert.match(manager, /if \(typeof window !== 'undefined' && window\.__TAURI__\) \{[\s\S]*only bundled extensions/);
});

test('App Review notes describe the same self-contained native boundary', () => {
    const metadata = readFileSync(path.join(ROOT, 'docs/app-store-metadata.md'), 'utf8');
    assert.match(metadata, /submitted native app is self-contained/);
    assert.match(metadata, /does not download extension[\s\S]*toolchains[\s\S]*machine\s+images/);
    assert.match(metadata, /source remains visible[\s\S]*editable in the app/);
});
