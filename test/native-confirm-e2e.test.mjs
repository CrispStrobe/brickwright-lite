// The real-app half of task E6 (test/native-confirm.test.mjs holds the source half): the Tauri
// e2e job drives File > New in the packaged WebView with the native message box answered.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const proof = readFileSync(path.join(ROOT, 'scripts/verify-native-confirm-e2e.mjs'), 'utf8');
const workflow = readFileSync(path.join(ROOT, '.github/workflows/tauri.yml'), 'utf8');

test('the confirm proof launches the real Tauri binary and runs in the editor WebView', () => {
    assert.match(proof, /tauri-driver/);
    assert.match(proof, /application: path\.resolve\(binary\)/);
    assert.match(proof, /__brickwrightStore\.getState\(\)\.scratchGui\.vm/);
    assert.match(proof, /attempt < 240 && !editor/);
    assert.match(proof, /\{script: 120000\}/);
    // It answers the dialog by replacing __TAURI__.core with a pass-through copy, never by
    // replacing __TAURI__ itself or the plugin's confirm.
    assert.match(proof, /tauri\.core = Object\.assign\(\{\}, original, \{/);
    assert.match(proof, /command === 'plugin:dialog\|message'/);
    assert.match(proof, /return original\.invoke\(command, args, options\);/);
    assert.match(proof, /tauri\.core = original;/);
    assert.doesNotMatch(proof, /__TAURI__\s*=|window\.confirm\s*=/);
});

test('the confirm proof states each property it requires', () => {
    for (const property of [/proof\.rawThenable === true/, /\^rejected:/, /proof\.askedOnCancel\.length === 1/,
        /asked\.buttons === 'OkCancel'/, /proof\.markerAfterCancel === true/, /proof\.askedTotal === 2/,
        /proof\.markerAfterOk === false/]) {
        assert.match(proof, property);
    }
});

test('the Tauri e2e job runs the confirm proof, bounded, with its log kept', () => {
    assert.match(workflow, /name: Drive File > New's question through the real native WebView/);
    assert.match(workflow, /timeout --signal=TERM --kill-after=15s 300s \\\n\s+xvfb-run -a dbus-run-session -- node scripts\/verify-native-confirm-e2e\.mjs/);
    assert.match(workflow, /e2e-evidence\/native-confirm\.log/);
});
