import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
const view = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-correlated-targets.jsx');

test('runner preserves native clock domains and correlation cursors without numeric cross-domain order', () => {
    assert.match(runner, /createCorrelatedDebugger\(\{targets: descriptors, capacity: 8192, maxBranches: 64\}\)/);
    assert.match(runner, /correlated\.append\('main', \{targetId, kind: event\.kind,\s*time: event\.time/);
    assert.match(runner, /correlatedSelectedCursor = appended\.event\.cursor/);
    assert.doesNotMatch(runner, /event\.time\.ticks\s*[-+<>]/,
        'runner must never numerically compare clocks from different domains');
});

test('target selection, cross-core triggers and causal navigation remain runner-owned', () => {
    assert.match(runner, /selectCorrelatedDebugTarget \(targetId\)/);
    assert.match(runner, /addCorrelatedDebugTrigger \(\)/);
    assert.match(runner, /sourceTarget: selected\.targetId, targetId: destination/);
    assert.match(runner, /followCorrelatedDebugCause \(\)/);
    assert.match(runner, /correlatedSelectedCursor = source\.cursor/);
    assert.match(panel, /onSelectEvent=\{this\.onCorrelatedEvent\}/);
});

test('whole-machine checkpoint controls delegate atomic prepare/commit/rollback to the coordinator', () => {
    assert.match(runner, /await correlatedDebugger\.captureCheckpoint\('main'\)/);
    assert.match(runner, /await correlatedDebugger\.restoreCheckpoint\(correlatedCheckpoint\)/);
    assert.doesNotMatch(runner, /restoreCorrelatedDebugTargets[\s\S]{0,500}target\.restoreCheckpoint/,
        'runner must not independently mutate only one CPU');
});

test('correlated lanes expose bounded target/domain/causality browser hooks', () => {
    for (const hook of ['data-debug-correlated-targets', 'data-debug-correlated-target-select',
        'data-debug-cross-core-trigger', 'data-debug-causal-follow',
        'data-debug-correlated-checkpoint', 'data-debug-correlated-restore',
        'data-debug-correlated-lanes', 'data-debug-correlated-lane',
        'data-debug-correlated-event', 'data-debug-correlated-status']) {
        assert.ok(view.includes(hook), `missing browser hook ${hook}`);
    }
    assert.match(view, /data-clock-domain=\{lane\.clockDomain\}/);
    assert.match(view, /data-causal-order=\{event\.causalOrder\}/);
    assert.match(view, /\.slice\(-32\)/, 'each visible CPU lane must remain bounded');
});
