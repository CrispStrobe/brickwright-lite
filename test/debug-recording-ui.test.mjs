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

test('runner checkpoints debugger-host state and replay uses the atomic restore path', () => {
    assert.match(runner, /const captureHostState = \(\) => \([\s\S]*exportBreakpointState\(\)[\s\S]*eventBreakpointCounters/);
    assert.match(runner, /const prepareHostRestore = snapshot =>[\s\S]*prepareBreakpointState\(snapshot\.breakpoints\)/);
    assert.match(runner, /const commitHostRestore = prepared =>[\s\S]*preparedBreakpoints\.commit\(\)/);
    assert.match(runner, /createRecordingSession\(\{recorder, eventStream[\s\S]*captureHostState, prepareHostRestore, commitHostRestore/);
    assert.match(runner, /restoreCheckpoint: checkpoint => branchSession\.restore\(checkpoint\.eventCursor\)/,
        'verified replay must not bypass debugger-host restoration');
    assert.match(runner, /replayHostEvent:[\s\S]*replayBreakpointDispatcher\.dispatch/,
        'verified replay must reconstruct stateful debugger-host predicates');
    assert.match(runner, /replayBreakpointDispatcher = createEventBreakpointDispatcher[\s\S]*counter:/,
        'host replay must advance deterministic counters without external actions');
});

test('runner suppresses replay-era UI output and publishes one complete state after success or rollback', () => {
    assert.match(runner, /createHistoricalOutputGate\(\{publishState: state => onChange\(state\)\}\)/);
    assert.match(runner, /if \(replayingDebugHistory\) return replayOutputGate\.emit\(null\)/,
        'both immediate and live replay output must stay behind the historical gate');
    assert.match(runner, /replayOutputGate\.begin\(\)[\s\S]*instructionReplay\.reverseToEvent\(eventCursor\)/,
        'suppression must begin before checkpoint replay');
    assert.match(runner, /replayOutputGate\.resynchronize\(snapshot\(\)\)/,
        'the post-replay publication must be one complete runner snapshot');
    assert.doesNotMatch(runner,
        /if \(result\.accepted\)[\s\S]{0,120}setStatus\('paused'\)/,
        'successful replay must not emit once through setStatus and again through resynchronization');
});
