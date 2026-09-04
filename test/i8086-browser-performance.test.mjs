import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeI8086Pump} from '../scripts/lib/i8086-performance.mjs';

test('the production 8086 benchmark covers desktop and mobile pump health', () => {
    const script = readFileSync(new URL('../scripts/bench-i8086-browser.mjs', import.meta.url), 'utf8');
    for (const fact of [
        "name: 'desktop'", "name: 'mobile'", '__BW_I8086_PERF__',
        "selectOption('i8086')", "selectOption('pins')", 'realTimeRatio',
        'pumpMs', 'pumpBreakdown', 'longTasks', 'heapBytes', "ratio < 0.25",
    ]) assert.ok(script.includes(fact), `benchmark lost ${fact}`);
});

test('the pump receipt separates execution, board and publication cost', () => {
    const result = summarizeI8086Pump([
        {wallMs: 10, phases: {runMs: 6, boardMs: 1, publishMs: 3},
            snapshotBuilt: true, snapshotBuildMs: 2},
        {wallMs: 5, phases: {runMs: 4, boardMs: 0.5, publishMs: 0.5},
            snapshotBuilt: false, snapshotBuildMs: 0}
    ]);
    assert.equal(result.totalWallMs, 15);
    assert.deepEqual(result.snapshots, {built: 1, suppressed: 1, buildMs: 2});
    assert.equal(result.phases.runMs.totalMs, 10);
    assert.equal(result.phases.boardMs.totalMs, 1.5);
    assert.equal(result.phases.publishMs.totalMs, 3.5);
    assert.equal(result.phases.runMs.percentOfPump, 1000 / 15);
    assert.equal(result.phases.publishMs.p95, 3);
});

test('production telemetry times through publication and names every pump phase', () => {
    const runner = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(runner, /emitLive\(\);[\s\S]*perfProbe\.samples\.push/,
        'the receipt must stop after publication, not immediately before it');
    for (const field of ['runMs', 'boardMs', 'publishMs', 'snapshotBuilt', 'snapshotBuildMs']) {
        assert.ok(runner.includes(field), `production telemetry lost ${field}`);
    }
});

test('CI retains the browser performance receipt', () => {
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
    assert.match(workflow, /node scripts\/bench-i8086-browser\.mjs/);
    assert.match(workflow, /name: i8086-browser-performance/);
    assert.match(workflow, /path: artifacts\/i8086-performance\/report\.json/);
});
