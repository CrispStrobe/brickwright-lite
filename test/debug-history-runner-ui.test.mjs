import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const runner = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');

test('runner owns one branch-aware history store and captures public checkpoint inspection', () => {
    assert.match(runner, /import \{createHistoryAnnotationStore\} from '\.\/history-annotations\.js'/);
    assert.match(runner, /createHistoryAnnotationStore\(\{\s*initialEntries, resolveCheckpoint: cursor =>/);
    assert.match(runner, /recordingFor\(cursor\.branchId\)/);
    assert.match(runner, /checkpoint\.eventCursor === cursor\.eventCursor/);
    assert.match(runner, /captureInspection: currentTarget => \(\{registers:/);
});

test('runner exposes bounded history operations without exposing checkpoint snapshots', () => {
    assert.match(runner, /debugHistoryAnnotations: \(\) => historyAnnotations\.list\(\)/);
    assert.match(runner, /addDebugBookmark: request => historyAnnotations\.addBookmark\(request\)/);
    assert.match(runner, /addDebugAnnotation: request => historyAnnotations\.addAnnotation\(request\)/);
    assert.match(runner, /compareDebugCheckpoints: \(left, right\) => historyAnnotations\.compareCheckpoints/);
    const resolver = runner.slice(runner.indexOf('const historyAnnotations ='),
        runner.indexOf('const recordingSession ='));
    assert.doesNotMatch(resolver, /\.snapshot/);
});

test('a new recording epoch discards marks only after its root checkpoint succeeds', () => {
    const start = runner.indexOf('startDebugRecording()');
    const end = runner.indexOf('stopDebugRecording', start);
    const body = runner.slice(start, end);
    assert.ok(body.indexOf('if (!result.accepted) return result') <
        body.indexOf('historyAnnotations = historyStoreFor(forkRecordingStore)'));
});

test('debugger panel wires selected-event bookmarks, notes, and checkpoint comparison', () => {
    assert.match(panel, /data-debug-add-bookmark/);
    assert.match(panel, /data-debug-add-annotation/);
    assert.match(panel, /data-debug-compare-checkpoints/);
    assert.match(panel, /addDebugBookmark\(\{cursor, label\}\)/);
    assert.match(panel, /addDebugAnnotation\(\{cursor, annotation\}\)/);
    assert.match(panel, /compareDebugCheckpoints\(/);
    assert.match(panel, /data-debug-checkpoint-comparison/);
});
