// The real-app half of task E8 (test/native-prompt.test.mjs holds the source half): the Tauri
// e2e job takes Extension from URL through the in-app text dialog in the packaged WebView.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const proof = readFileSync(path.join(ROOT, 'scripts/verify-native-prompt-e2e.mjs'), 'utf8');
const workflow = readFileSync(path.join(ROOT, '.github/workflows/tauri.yml'), 'utf8');

test('the prompt proof launches the real Tauri binary and runs in the editor WebView', () => {
    assert.match(proof, /tauri-driver/);
    assert.match(proof, /application: path\.resolve\(binary\)/);
    assert.match(proof, /__brickwrightStore\.getState\(\)\.scratchGui\.vm/);
    assert.match(proof, /attempt < 240 && !editor/);
    assert.match(proof, /\{script: 120000\}/);
    // window.prompt answers null as WKWebView's does, and is restored; the question after OK is
    // answered through a pass-through copy of __TAURI__.core, never by replacing __TAURI__.
    assert.match(proof, /window\.prompt = \(\.\.\.args\) => \{ prompted\.push\(args\.map\(String\)\); return null; \};/);
    assert.match(proof, /window\.prompt = originalPrompt;/);
    assert.match(proof, /tauri\.core = Object\.assign\(\{\}, original, \{/);
    assert.match(proof, /return original\.invoke\(command, args, options\);/);
    assert.match(proof, /tauri\.core = original;/);
    assert.doesNotMatch(proof, /__TAURI__\s*=/);
});

test('the prompt proof states each property it requires', () => {
    for (const property of [/proof\.promptedBeforeAnswer === 0/, /dialog\.role === 'dialog' && dialog\.modal === 'true'/,
        /dialog\.focused === true/, /proof\.askedAfterOk\.length === 1/, /question\.buttons === 'OkCancel'/,
        /proof\.loadedAfterOk === false/, /proof\.askedTotal === 1/, /proof\.prompted === 0/,
        /proof\.loadedAfterEscape === false/]) {
        assert.match(proof, property);
    }
});

test('the Tauri e2e job runs the prompt proof, bounded, with its log kept', () => {
    assert.match(workflow, /name: Drive Extension from URL's text question through the real native WebView/);
    assert.match(workflow, /timeout --signal=TERM --kill-after=15s 300s \\\n\s+xvfb-run -a dbus-run-session -- node scripts\/verify-native-prompt-e2e\.mjs/);
    assert.match(workflow, /e2e-evidence\/native-prompt\.log/);
});
