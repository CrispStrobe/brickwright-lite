import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEBUG_SESSION_SNAPSHOT_CODEC, structuredSessionSnapshotCodec} from
    '../overlay/scratch-gui/src/lib/bw-debug/session-snapshot-codec.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
const transfer = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-session-transfer.jsx');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');

test('portable snapshot codec round-trips binary state and rejects executable objects', async () => {
    assert.equal(DEBUG_SESSION_SNAPSHOT_CODEC, 'brickworks-structured-v1');
    const snapshot = {ticks: 5n, ram: Uint8Array.of(1, 2), words: Uint16Array.of(0x1234),
        nested: {missing: undefined}};
    const restored = await structuredSessionSnapshotCodec.decode(
        await structuredSessionSnapshotCodec.encode(snapshot));
    assert.deepEqual(restored, snapshot);
    assert.throws(() => structuredSessionSnapshotCodec.encode({date: new Date()}), /plain objects/);
});

test('browser session transport has stable upload, download and visible-status hooks', () => {
    for (const hook of ['data-debug-session-transfer', 'data-debug-session-export',
        'data-debug-session-import', 'data-debug-session-transfer-status']) {
        assert.ok(transfer.includes(hook), `missing browser hook ${hook}`);
    }
    assert.match(transfer, /accept="\.bwdebug,application\/json"/);
    assert.match(transfer, /event\.target\.value = ''/,
        'choosing the same rejected file again must still fire change');
    assert.match(panel, /await runner\.exportDebugSession\(\)/);
    assert.match(panel, /await runner\.importDebugSession\(text\)/);
    assert.match(transfer, /role=\{status\.accepted === false \? 'alert' : 'status'\}/);
});

test('runner stages and validates an import completely before its one history commit', () => {
    const start = runner.indexOf('async importDebugSession (text)');
    const end = runner.indexOf('activeDebugBranch:', start);
    const body = runner.slice(start, end);
    assert.match(body, /importDebuggerSessionBundle\(\{bundle, codecs: sessionCodecs/);
    const prepare = body.indexOf('const importedRecorder = createDebugRecorder()');
    const commit = body.indexOf('activeBranchPayload = importedPayload');
    assert.ok(prepare >= 0 && commit > prepare);
    assert.match(body.slice(prepare, commit), /importedRecorder\.createCheckpoint/);
    assert.match(body, /session-import-recording-active/);
    assert.match(body, /text\.length > 48 \* 1024 \* 1024/);
    assert.doesNotMatch(body.slice(0, commit), /target\.restoreCheckpoint/,
        'validation and staging must not mutate the live target');
});
