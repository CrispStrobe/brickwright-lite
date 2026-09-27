import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const proof = readFileSync(path.join(ROOT, 'scripts/verify-native-downloads-e2e.mjs'), 'utf8');
const workflow = readFileSync(path.join(ROOT, '.github/workflows/tauri.yml'), 'utf8');

test('native download proof launches a real Tauri binary and requires native IPC', () => {
    assert.match(proof, /tauri-driver/);
    assert.match(proof, /application: path\.resolve\(binary\)/);
    assert.match(proof, /__TAURI_INTERNALS__/);
    assert.match(proof, /nativeInvoke: 'function'/);
    assert.doesNotMatch(proof, /__TAURI__\s*=/);
});

test('native proof exercises extension, toolchain and pinned machine media', () => {
    assert.match(proof, /remoteExtensionsPolicy: 'allow'/);
    assert.match(proof, /executableToolchainsPolicy: 'allow'/);
    assert.match(proof, /machineImagesPolicy: 'allow'/);
    assert.match(proof, /extensionManager\.loadExtensionURL/);
    assert.match(proof, /sdcc-wasm\/runtime\.json/);
    assert.match(proof, /riscv32-linux\/Image/);
    assert.match(proof, /9130ceb4be18d10560cf49ac495d7f2d5dde23c33972d7a522c077cc523de1a9/);
    assert.match(proof, /kernelBytes: 4876836/);
});

test('Tauri e2e embeds the real frontend and retains its downloadable evidence', () => {
    assert.match(workflow, /name: Build the real allow-profile frontend[\s\S]*bash scripts\/vercel-build\.sh/);
    assert.match(workflow, /name: Drive remote downloads through the real native WebView/);
    assert.match(workflow, /verify-native-downloads-e2e\.mjs/);
    assert.match(workflow, /native-downloads\.log/);
});
