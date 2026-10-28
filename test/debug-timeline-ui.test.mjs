import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const panel = readFileSync(path.join(ROOT,
    'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), 'utf8');

test('timeline controls consume the runner-owned model without invoking reverse execution', () => {
    assert.match(panel, /runner\.drainDebugEvents\(512\)/,
        'the UI must explicitly bulk-drain canonical events before navigating them');
    assert.match(panel, /runner\.debugTimeline\(\)\.state\(\)/);
    assert.match(panel, /timeline => timeline\.older\(\)/);
    assert.match(panel, /timeline => timeline\.newer\(\)/);
    assert.match(panel, /timeline => timeline\.latest\(\)/);
    assert.doesNotMatch(panel,
        /onTimeline(?:Refresh|Older|Newer|Latest|Checkpoint)[\s\S]{0,300}reverseToEvent/,
        'cursor inspection must not silently restore or execute the target');
});

test('checkpoint navigation seeks to its event boundary without cloning snapshots', () => {
    assert.match(panel, /checkpointSummary\(\)\.at\(-1\)/);
    assert.match(panel, /timeline => timeline\.seekCursor\(latest\.eventCursor\)/);
    assert.doesNotMatch(panel, /debugTimeline\(\)[\s\S]{0,120}\.range\(\)/,
        'live renders must not clone the retained event range');
    assert.doesNotMatch(panel, /\.eventsFrom\(/,
        'render/navigation must not clone the recorder event log');
    assert.doesNotMatch(panel, /\.checkpoints\(/,
        'checkpoint navigation must consume summaries, not target snapshots');
    assert.match(panel, /data-debug-timeline-refusal/,
        'an evicted checkpoint/event boundary needs a visible structured refusal');
    for (const marker of ['refresh', 'older', 'newer', 'latest', 'checkpoint']) {
        assert.ok(panel.includes(`data-debug-timeline-${marker}`), `missing ${marker} control hook`);
    }
});
