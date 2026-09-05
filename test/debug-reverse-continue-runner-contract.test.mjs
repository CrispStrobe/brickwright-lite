import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runner = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');

const methodBody = (name, nextName) => {
    const start = runner.indexOf(`${name}()`);
    assert.notEqual(start, -1, `runner must expose ${name}()`);
    const end = runner.indexOf(nextName, start);
    assert.notEqual(end, -1, `could not find boundary after ${name}()`);
    return runner.slice(start, end);
};

test('reverse continue exposes a readiness query and command over recorded halt occurrences', () => {
    const status = methodBody('reverseContinueDebugStatus', 'reverseContinueDebug()');
    assert.match(status, /instructionReplay\.canReverse\(\)/,
        'recorded history is not enough unless restore/replay and inputs are complete');
    assert.match(status, /haltOccurrences\.previousBeforeBoundary\(before\)/,
        'status must use the bounded halt-occurrence index, not scan event payloads');
    assert.match(status, /code:\s*['"]no-previous-breakpoint['"]/,
        'absence of an earlier retained halt must be a structured refusal');
    assert.doesNotMatch(status, /eventsFrom\(|checkpoints\(/,
        'a status/UI query must not clone recorded events or snapshots');
});

test('only active 8086 forward breakpoint halts enter the occurrence ledger', () => {
    assert.match(runner, /targetKind !== 'i8086' \|\| !recordingSession\.status\(\)\.active/);
    assert.match(runner, /\['breakpoint', 'watchpoint', 'port', 'interrupt'\]\.includes\(why\.cause\)/);
    assert.match(runner, /onHalt: \(snapshot\) => \{\s*recordNativeHaltOccurrence\(snapshot\)/);
    assert.match(runner, /boundaryCursor: eventStream\.nextSequence\(\)/);
    assert.doesNotMatch(runner, /\['breakpoint', 'watchpoint', 'port', 'interrupt', 'step'\]/,
        'steps, user pauses, stops and replay orchestration are not historical breakpoint decisions');
});

test('reverse continue chains strictly from the last successful reverse cursor', () => {
    const status = methodBody('reverseContinueDebugStatus', 'reverseContinueDebug()');
    assert.match(status, /const before = reverseCursor \?\?/,
        'the first command searches from live end and later commands from restored history');
    assert.match(status, /previousBeforeBoundary\(before\)/,
        'the recorder query owns strict-before occurrence ordering');

    const command = methodBody('reverseContinueDebug', 'clearTrace');
    assert.match(command, /this\.reverseContinueDebugStatus\(\)/);
    assert.match(command, /this\.reverseDebugToEvent\(status\.eventCursor\)/,
        'successful selection must reuse verified replay and its cursor update');
});

test('reverse continue reuses the one quiesced verified replay lifecycle', () => {
    const replayStart = runner.indexOf('reverseDebugToEvent: eventCursor =>');
    const replayEnd = runner.indexOf('canReverseDebug:', replayStart);
    assert.ok(replayStart >= 0 && replayEnd > replayStart);
    const replay = runner.slice(replayStart, replayEnd);
    assert.match(replay,
        /recordingSession\.stop\(\);[\s\S]*?session\.pause\(\);[\s\S]*?unschedule\(\);[\s\S]*?instructionReplay\.reverseToEvent\(eventCursor\)/);
    assert.match(replay, /reverseCursor = eventCursor/,
        'only a successful verified replay advances the logical reverse cursor');
});

test('historical navigation never reevaluates breakpoints or repeats their actions', () => {
    const start = runner.indexOf('reverseContinueDebugStatus()');
    const end = runner.indexOf('clearTrace', start);
    assert.ok(start >= 0 && end > start);
    const reverseContinue = runner.slice(start, end);
    assert.doesNotMatch(reverseContinue,
        /evaluateEventBreakpoints|evaluateBreakpoints|executeBreakpointPlan/,
        'encounter counters, one-shot state, and conditions are forward-history facts');
    assert.doesNotMatch(reverseContinue,
        /\.checkpointDebugRecording\(|\blog\(|\bcapture\(|\bwrite\(/,
        'log/capture/checkpoint/write actions must not run again while navigating history');
});

test('UI exposes only runner-gated reverse continue and keeps refusals visible', () => {
    assert.match(panel, /runner\.reverseContinueDebugStatus\(\)/);
    assert.match(panel, /runner\.reverseContinueDebug\(\)/);
    assert.match(panel, /disabled=\{!canReverseContinue \|\| busy\}/);
    assert.ok(panel.includes('data-debug-reverse-continue'));
    assert.match(panel, /reverseStatus: result\.accepted \? null : result/);
});
