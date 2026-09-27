import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
    remoteCodeAllowed, remoteCodeRestricted, remoteCodePolicy
} from '../overlay/scratch-gui/src/lib/distribution-policy.js';
import {
    localToolchainEnabled, primeToolchainCache
} from '../overlay/scratch-gui/src/lib/sdcc-wasm/toolchain-source.js';
import {lessonMachines} from '../overlay/scratch-gui/src/lib/bw-machines/lessons.js';
import {defaultImageFetcher} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const nativeWindow = () => ({
    __TAURI__: {core: {invoke: async () => {}}},
    location: {search: '?localCompiler=on', hash: ''},
    localStorage: {getItem: () => 'local'}
});

const withPolicy = async (policy, fn) => {
    const previous = process.env.BW_REMOTE_CODE_POLICY;
    if (policy === undefined) delete process.env.BW_REMOTE_CODE_POLICY;
    else process.env.BW_REMOTE_CODE_POLICY = policy;
    try {
        return await fn();
    } finally {
        if (previous === undefined) delete process.env.BW_REMOTE_CODE_POLICY;
        else process.env.BW_REMOTE_CODE_POLICY = previous;
    }
};

test('remote code is allowed by default in web and Tauri runtimes', async () => {
    await withPolicy(undefined, async () => {
        const previousWindow = globalThis.window;
        const previousFetch = globalThis.fetch;
        globalThis.window = nativeWindow();
        globalThis.fetch = async () => ({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
        });
        try {
            assert.equal(remoteCodePolicy(), 'allow');
            assert.equal(remoteCodeAllowed(), true);
            assert.equal(remoteCodeRestricted(), false);
            assert.equal(localToolchainEnabled(globalThis.window), true,
                'Tauri does not imply a restricted distribution');
            assert.ok(lessonMachines('en').length > 0, 'native builds retain remote machine lessons');
            assert.deepEqual(
                [...(await defaultImageFetcher({url: 'https://example.invalid/firmware.bin'})).bytes],
                [1, 2, 3]
            );
        } finally {
            globalThis.window = previousWindow;
            globalThis.fetch = previousFetch;
        }
    });
});

test('deny profile wins over opt-ins and refuses before network access', async () => {
    await withPolicy('deny', async () => {
        const previousWindow = globalThis.window;
        const previousFetch = globalThis.fetch;
        globalThis.window = nativeWindow();
        let fetched = false;
        globalThis.fetch = async () => { fetched = true; };
        try {
            assert.equal(remoteCodeRestricted(), true);
            assert.equal(localToolchainEnabled(globalThis.window), false);
            await assert.rejects(
                () => primeToolchainCache(undefined, {fetch: async () => { fetched = true; }}),
                /distribution cannot download executable toolchains/);
            assert.deepEqual(lessonMachines('en'), []);
            await assert.rejects(
                () => defaultImageFetcher({url: 'https://example.invalid/firmware.bin'}),
                /restricted build does not download executable machine images/);
            assert.equal(fetched, false, 'every refusal happens before a network request');
        } finally {
            globalThis.window = previousWindow;
            globalThis.fetch = previousFetch;
        }
    });
});

test('extension restrictions use the build policy, never the runtime platform', () => {
    const picker = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/containers/extension-library.jsx'), 'utf8');
    const deepLink = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/url-extensions.js'), 'utf8');
    const manager = readFileSync(
        path.join(ROOT, 'overlay/scratch-vm/src/extension-support/extension-manager.js'), 'utf8');
    const webpack = readFileSync(path.join(ROOT, 'overlay/scratch-gui/webpack.config.js'), 'utf8');

    assert.match(picker, /if \(remoteCodeAllowed\(\)\) \{[\s\S]*fetchGallery\(\)/);
    assert.match(picker, /remoteCodeAllowed\(\) \? \[customEntry\] : \[\]/);
    assert.match(deepLink, /if \(remoteCodeRestricted\(\)\) return/);
    assert.match(manager, /process\.env\.BW_REMOTE_CODE_POLICY === 'deny'/);
    assert.doesNotMatch(manager, /window\.__TAURI__/);
    assert.match(webpack, /'process\.env\.BW_REMOTE_CODE_POLICY': JSON\.stringify\(remoteCodePolicy\)/);
    assert.match(webpack, /\['allow', 'deny'\]\.includes\(remoteCodePolicy\)/);
});

test('review notes document both build profiles', () => {
    const metadata = readFileSync(path.join(ROOT, 'docs/app-store-metadata.md'), 'utf8');
    assert.match(metadata, /core purpose[\s\S]*source remains visible and editable/);
    assert.match(metadata, /BW_REMOTE_CODE_POLICY=allow/);
    assert.match(metadata, /BW_REMOTE_CODE_POLICY=deny/);
    assert.match(metadata, /not inferred from Tauri/);
});
