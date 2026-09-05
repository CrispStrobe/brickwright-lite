import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

test('runner branch payloads own stable recorder/session/replay/ledger quartets', () => {
    assert.match(source, /const createBranchPayload = \(recorder, haltOccurrences\)/);
    assert.match(source, /return \{recorder, recordingSession: branchSession, instructionReplay: replay, haltOccurrences\}/);
    assert.match(source, /createForkRecordingStore\(\{rootRecording: activeBranchPayload\}\)/);
    assert.match(source, /createBranchPayload\(createDebugRecorder\(\), createHaltOccurrenceLedger\(\)\)/);
});

test('event and input recording delegate dynamically to the active payload', () => {
    assert.match(source,
        /eventStream\.onEvent\(event =>\s*activeBranchPayload\.recordingSession\.appendBatch\(\[event\]\)\)/);
    assert.match(source, /Object\.fromEntries\(\[[\s\S]{0,220}activeBranchPayload\.recordingSession\[name\]/);
    assert.match(source, /subscribeDebugTargetInputs\(target, recordingSession\)/,
        'the stable facade, not a branch session, remains attached to target inputs');
});

test('forward-from-history roots and commits a child before activation and callers honor refusal', () => {
    const start = source.indexOf('function beginForwardBranch(');
    const end = source.indexOf('const breakpointIdsForHandle', start);
    const body = source.slice(start, end);
    const order = [
        'prepareFork', '.suspend()', 'child.recordingSession.start()',
        'prepared.reservation.commit(child)', 'forkRecordingStore.activate(branchId)',
        'activeBranchPayload = activated.recording'
    ].map(token => body.indexOf(token));
    assert.ok(order.every(index => index >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order,
        'parent suspension, child root, publication, activation is the atomic order');
    assert.match(body, /prepared\.reservation\.abort\(\)[\s\S]*recordingSession\.resume\(\)/);
    assert.ok((source.match(/if \(!forked\.accepted\)/g) || []).length >= 6,
        'run/resume and every forward step must stop on fork refusal');
});

test('public branch views are summary-only and activation is replay-before-commit', () => {
    assert.match(source, /debugBranchSummaries: \(\) => forkRecordingStore\.summaries\(\)/);
    assert.match(source, /checkpointSummary\(\)/);
    const start = source.indexOf('activateDebugBranch(cursor)');
    const end = source.indexOf('startDebugRecording()', start);
    const body = source.slice(start, end);
    assert.ok(body.indexOf('instructionReplay.reverseToEvent') <
        body.indexOf('forkRecordingStore.activate(cursor.branchId)'));
    assert.match(body, /branch-switch-rollback-failed/);
    assert.doesNotMatch(body, /eventsFrom\(|checkpoints\(|\.snapshot\b/);
});

test('an explicit fork selects the child live end and cannot fork again implicitly', () => {
    const start = source.indexOf('forkDebugHistory(branchId)');
    const end = source.indexOf('activateDebugBranch(cursor)', start);
    const body = source.slice(start, end);
    assert.match(body, /const result = beginForwardBranch\(branchId\)/);
    assert.match(body, /if \(result\.accepted\)[\s\S]*reverseCursor = null/);
});

test('a new recording epoch drops stale lineage only after its root checkpoint succeeds', () => {
    const start = source.indexOf('startDebugRecording()');
    const end = source.indexOf('stopDebugRecording', start);
    const body = source.slice(start, end);
    assert.ok(body.indexOf('const result = recordingSession.start()') <
        body.indexOf('forkRecordingStore = createForkRecordingStore'));
    assert.match(body, /if \(!result\.accepted\) return result/);
    assert.match(body, /payload === activeBranchPayload[\s\S]*payload\.recorder\.clear\(\)/);
});

test('replay host reconstruction suppresses external actions and fails on action outcomes', () => {
    assert.match(source,
        /suppressedActions: \['log', 'checkpoint', 'capture', 'write', 'halt', 'script-safe-expression'\]/);
    assert.match(source, /result\.outcome\?\.failures\?\.length/);
});
