import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

test('recording controls are capability gated and expose checkpoint lifecycle commands', () => {
    assert.match(panel, /recordingCaps\.includes\('checkpoint'\)/);
    assert.match(panel, /recordingCaps\.includes\('restore'\)/);
    assert.match(panel, /checkpointSummary\(\)/,
        'live renders must not clone full checkpoint snapshots');
    for (const marker of ['data-debug-record', 'data-debug-checkpoint', 'data-debug-restore']) {
        assert.ok(panel.includes(marker), `debugger panel lost ${marker}`);
    }
    for (const command of [
        'startDebugRecording', 'stopDebugRecording', 'checkpointDebugRecording',
        'restoreDebugCheckpoint', 'debugRecordingStatus'
    ]) assert.ok(runner.includes(command), `runner lost ${command}`);
});
