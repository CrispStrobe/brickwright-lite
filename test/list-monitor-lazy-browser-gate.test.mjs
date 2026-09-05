import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const gate = readFileSync(path.join(root, 'scripts/verify-list-monitor-lazy.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');

test('large-list gate preserves the same baseline/candidate activation probe', () => {
    assert.match(gate, /const ROW_COUNT = 1000/);
    assert.match(gate, /bw-right-pane-hidden/);
    assert.match(gate, /receipt\.successfulActivation = activation/);
    assert.ok(gate.indexOf('receipt.successfulActivation = activation') <
        gate.indexOf('first visible list requests the named body chunk exactly once'));
    assert.match(gate, /LIST_MONITOR_EAGER_BASELINE/);
    assert.match(gate, /process\.once\('SIGTERM'/);
    assert.match(gate, /receipt\.phase = phase/);
    assert.match(gate, /\.monitor-overlay \.ReactVirtualized__List/);
    assert.doesNotMatch(gate, /getByText\(LIST_NAME/);
    assert.match(gate, /forced chunk failure skipped/);
    assert.match(gate, /acceptedBaselineMs \* 1\.15/);
    assert.match(gate, /const absoluteLimitMs = 1000/);
    assert.match(gate, /const maxLongTaskMs = 100/);
    assert.ok(gate.includes('list-monitor-body(?:\\.[^/?#]+)?\\.js'));
    assert.doesNotMatch(gate, /waitForTimeout|setTimeout\s*\(/);
});

test('candidate proof requires owned lazy-state selectors and the complete behavior seam', () => {
    for (const selector of [
        'data-right-pane-toggle',
        'data-testid="list-monitor-shell"',
        'data-list-monitor-label',
        'data-testid="list-monitor-scroll-body"',
        'data-list-index',
        'data-list-row-remove',
        'data-testid="list-monitor-body-loading"',
        'data-testid="list-monitor-body-retry"'
    ]) assert.match(gate, new RegExp(selector));
    assert.match(gate, /edited-row-1000/);
    assert.match(gate, /scrollTop = element\.scrollHeight/);
    assert.match(gate, /chunkRequests\.length === 2/);
    assert.match(gate, /writeFile\(path\.join\(OUT, 'result\.json'/);
});

test('CI runs the list-monitor proof and retains its failure receipt', () => {
    assert.match(workflow, /node scripts\/verify-list-monitor-lazy\.mjs/);
    assert.match(workflow, /timeout --signal=TERM --kill-after=10s 6m/);
    assert.match(workflow, /name: list-monitor-lazy-proof[\s\S]*path: artifacts\/list-monitor-lazy\/\*/);
});
