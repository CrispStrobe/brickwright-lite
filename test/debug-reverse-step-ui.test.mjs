import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

test('reverse step is runner-gated and reports structured refusals', () => {
    assert.match(panel, /runner\.reverseStepDebugStatus\(\)/);
    assert.match(panel, /runner\.reverseStepDebugInstruction\(\)/);
    assert.match(panel, /disabled=\{!canReverse \|\| busy\}/);
    assert.match(panel, /data-debug-reverse-refusal role="status"/);
    assert.ok(panel.includes('data-debug-reverse-step'));
});

test('reverse step queries bounded instruction boundaries without cloning history', () => {
    assert.match(runner, /recorder\.previousInstructionBoundaryCursor\(before\)/,
        'the first recorded instruction must be able to reverse to its checkpoint anchor');
    assert.match(runner, /reverseCursor \?\?/,
        'successive reverse steps must search strictly before the restored cursor');
    assert.doesNotMatch(panel, /\.eventsFrom\(/,
        'a live render must not clone retained event payloads');
    assert.doesNotMatch(panel, /\.checkpoints\(/,
        'a live render must not clone checkpoint snapshots');
});

test('reverse execution is quiesced and never inferred from target capabilities', () => {
    assert.match(runner, /recordingSession\.stop\(\);[\s\S]*?session\.pause\(\);[\s\S]*?unschedule\(\);[\s\S]*?instructionReplay\.reverseToEvent/);
    assert.match(runner, /canReverseDebug: \(\) => instructionReplay\.canReverse\(\)/);
    assert.doesNotMatch(panel, /caps\.reverse/,
        'the UI must use composed runner/session readiness, not a target claim');
});
