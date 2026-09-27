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

test('native proof is bounded and reports the stage that stalled', () => {
    assert.match(proof, /AbortSignal\.timeout\(timeout\)/);
    assert.match(proof, /creating Tauri WebDriver session/);
    assert.match(proof, /discovering the editor WebView/);
    assert.match(proof, /starting remote download probe/);
    assert.match(proof, /DELETE[\s\S]*5000/);
    assert.match(proof, /\{script: 120000\}/);
    assert.match(proof, /native download probe timed out during/);
    assert.match(proof, /extension manager load/);
    assert.match(proof, /machine image digest/);
    assert.match(workflow, /timeout --signal=TERM --kill-after=15s 240s/);
});

test('Tauri e2e embeds the real frontend and retains its downloadable evidence', () => {
    const webpack = readFileSync(path.join(ROOT, 'overlay/scratch-gui/webpack.config.js'), 'utf8');
    assert.match(webpack, /from: 'static\/capability-broker\.html',[\s\S]*to: 'capability-broker\.html'/);
    assert.match(workflow, /name: Build the real allow-profile frontend[\s\S]*bash scripts\/vercel-build\.sh/);
    assert.match(workflow, /name: Drive remote downloads through the real native WebView/);
    assert.match(workflow, /verify-native-downloads-e2e\.mjs/);
    assert.match(workflow, /native-downloads\.log/);
    assert.match(workflow, /e2e-evidence\/frontend-dist\.log/);
});
