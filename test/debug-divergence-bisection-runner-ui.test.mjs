import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
const view = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-divergence-bisection.jsx');

test('bisection endpoints are immutable branch-qualified canonical event cursors', () => {
    assert.match(runner, /createBranchCursor\(forkRecordingStore\.active\(\)\.branch\.branchId, selected\.seq \+ 1\)/);
    assert.match(runner, /bisectionEndpoints = \{\.\.\.bisectionEndpoints, \[which\]: cursor\}/);
    assert.match(runner, /Good and bad events must belong to one retained branch/);
});

test('runner probes passively and restores source before its one output resync', () => {
    const start = runner.indexOf('async startDebugBisection ()');
    const end = runner.indexOf('activeDebugBranch:', start);
    const body = runner.slice(start, end);
    assert.match(body, /createDivergenceBisection\(\{maxProbes: 64/);
    assert.match(body, /captureSource: capture, restoreSource: restore/);
    assert.match(body, /replay\.reverseToCycle\(cursor\.eventCursor\)/);
    assert.match(body, /passive: true,[\s\S]{0,100}deterministic: true, externalEffects: 0/);
    assert.match(body, /replayOutputGate\.resynchronize\(snapshot\(\)\)/);
    assert.doesNotMatch(body, /reverseCursor\s*=|forkRecordingStore\.activate/,
        'a diagnostic probe must not change the logical cursor or active history branch');
});

test('cancellation and bounded progress are observable from stable browser hooks', () => {
    assert.match(runner, /await new Promise\(resolve => setTimeout\(resolve, 0\)\)/,
        'each probe must yield so browser cancellation can run');
    assert.match(runner, /generation !== bisectionGeneration/);
    for (const hook of ['data-debug-divergence-bisection', 'data-debug-bisection-good',
        'data-debug-bisection-bad', 'data-debug-bisection-mark-good',
        'data-debug-bisection-mark-bad', 'data-debug-bisection-start',
        'data-debug-bisection-cancel', 'data-debug-bisection-progress',
        'data-debug-bisection-result']) assert.ok(view.includes(hook), `missing ${hook}`);
    assert.match(panel, /status=\{this\.state\.runner\.debugBisectionStatus\(\)\}/);
});
