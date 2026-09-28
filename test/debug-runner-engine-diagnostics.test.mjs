import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The runner's engineDiagnostics field: the LabWired fault verdict and the
// instructions the engine skipped, which the run itself never shows (a fault
// looks like an idle handler, a skipped instruction like correct firmware).
// Runs the runner's own helper, cut from the source, against fake targets.
const source = readFileSync(new URL(
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');

function helperWith(target) {
    const start = source.indexOf('    function engineDiagnosticsNow () {');
    assert.ok(start >= 0, 'engineDiagnosticsNow exists');
    const end = source.indexOf('\n    }\n', start) + '\n    }\n'.length;
    const fn = new Function('target', `${source.slice(start, end)}\nreturn engineDiagnosticsNow();`);
    return fn(target);
}

test('a stopped target\'s fault summary and fidelity gaps reach the snapshot', () => {
    const gaps = Array.from({length: 25}, (_, i) => ({kind: 'undecoded', addr: 0x100 + i * 2}));
    const d = helperWith({
        state: () => 'halted',
        diagnostics: () => ({fault: {summary: 'HardFault: UsageFault at 0x08000200', cfsr: 1}, fidelityGaps: gaps}),
    });
    assert.deepEqual(d.fault, {summary: 'HardFault: UsageFault at 0x08000200'}, 'the sentence, not the raw registers');
    assert.equal(d.fidelityGapCount, 25);
    assert.equal(d.fidelityGaps.length, 20, 'the list is capped; the count is not');
});

test('nothing to say, a running target, or no diagnostics() at all: undefined', () => {
    assert.equal(helperWith({state: () => 'halted', diagnostics: () => ({fault: null, fidelityGaps: []})}), undefined);
    assert.equal(helperWith({state: () => 'running', diagnostics: () => { throw new Error('read while running'); }}), undefined);
    assert.equal(helperWith({state: () => 'halted'}), undefined);
    assert.equal(helperWith(null), undefined);
    assert.equal(helperWith({state: () => 'halted', diagnostics: () => { throw new Error('engine gone'); }}), undefined);
});

test('the snapshot carries it and the panel renders both lines', () => {
    assert.match(source, /engineDiagnostics: engineDiagnosticsNow\(\),/);
    const panel = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
    assert.match(panel, /data-engine-fault/);
    assert.match(panel, /data-engine-fidelity/);
});

function savePointsWith(target) {
    const start = source.indexOf('    function savePointsNow () {');
    assert.ok(start >= 0, 'savePointsNow exists');
    const end = source.indexOf('\n    }\n', start) + '\n    }\n'.length;
    return new Function('target', `${source.slice(start, end)}\nreturn savePointsNow();`)(target);
}

test('save points: the list when available, the reason when not, nothing while running', () => {
    const points = [{id: 1, label: '#1', cycles: 1000}];
    assert.deepEqual(savePointsWith({state: () => 'halted', snapshotUnavailable: () => null, listSnapshots: () => points}),
        {unavailable: null, points});
    assert.deepEqual(savePointsWith({state: () => 'halted', snapshotUnavailable: () => 'the circuit cannot be rewound',
        listSnapshots: () => { throw new Error('must not list when unavailable'); }}),
    {unavailable: 'the circuit cannot be rewound', points: []});
    assert.equal(savePointsWith({state: () => 'running', snapshotUnavailable: () => null, listSnapshots: () => points}), undefined);
    assert.equal(savePointsWith({state: () => 'halted'}), undefined, 'a target without save points');
    assert.match(source, /savePoints: savePointsNow\(\),/);
    assert.match(source, /restoreSnapshot\(id\) \{/);
});
