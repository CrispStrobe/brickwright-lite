import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    summarizeI8086Pump,
    summarizeI8086Timeline,
    summarizeReactProfiles
} from '../scripts/lib/i8086-performance.mjs';

test('the production 8086 benchmark covers desktop and mobile pump health', () => {
    const script = readFileSync(new URL('../scripts/bench-i8086-browser.mjs', import.meta.url), 'utf8');
    for (const fact of [
        "name: 'desktop'", "name: 'mobile'", '__BW_I8086_PERF__',
        "selectOption('i8086')", "selectOption('pins')", 'realTimeRatio',
        'pumpMs', 'pumpBreakdown', 'setupTimeline', 'steadyLongTasks',
        'milestones', 'resources', 'longTasks', 'reactProfiles', 'heapBytes', "ratio < 0.25",
    ]) assert.ok(script.includes(fact), `benchmark lost ${fact}`);
});

test('the receipt reports React commit counts and actual durations by subtree', () => {
    const result = summarizeReactProfiles([
        {id: 'DebugPanel', phase: 'mount', actualDurationMs: 12, baseDurationMs: 15},
        {id: 'DebugPanel', phase: 'update', actualDurationMs: 4, baseDurationMs: 14},
        {id: 'CircuitDesigner', phase: 'update', actualDurationMs: 30, baseDurationMs: 40}
    ]);
    assert.deepEqual(result.DebugPanel, {
        commits: 2,
        mounts: 1,
        updates: 1,
        actualDurationMs: {totalMs: 16, p50: 12, p95: 12, max: 12},
        baseDurationMs: {totalMs: 29, p50: 15, p95: 15, max: 15}
    });
    assert.equal(result.CircuitDesigner.commits, 1);
    assert.equal(result.CircuitDesigner.actualDurationMs.totalMs, 30);
});

test('React profiling is opt-in and wraps only the two relevant subtrees', () => {
    const helper = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/react-perf-profiler.js', import.meta.url), 'utf8');
    const panel = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
    const circuit = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');
    const webpack = readFileSync(new URL(
        '../packages/scratch-gui/webpack.config.js', import.meta.url), 'utf8');
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
    assert.match(helper, /if \(!enabled \|\| !React\.Profiler\) return child;/,
        'normal runtime must retain the original subtree without a Profiler element');
    assert.match(helper, /window\.__BW_I8086_PERF__/);
    assert.doesNotMatch(panel, /profileReactSubtree/,
        'a Profiler returned inside DebugPanel would omit DebugPanel.render itself');
    assert.match(circuit, /profileReactSubtree\(React, 'DebugPanel', \(<DebugPanel/);
    assert.match(circuit, /profileReactSubtree\(React, 'CircuitDesigner', \(<Designer/);
    assert.match(webpack, /BW_REACT_PROFILE/);
    assert.match(webpack, /'react-dom\$': 'react-dom\/profiling'/,
        'a normal production React renderer cannot emit actualDuration');
    assert.match(webpack, /reactProfiling \? 'build-profile' : 'build'/,
        'the profiling renderer must not replace the deployable production build');
    assert.match(workflow, /BW_REACT_PROFILE=1[\s\S]*build-profile[\s\S]*bench-i8086-browser\.mjs/);
    const preserve = workflow.indexOf(
        'mv packages/scratch-gui/build packages/scratch-gui/build-production-ci');
    const profile = workflow.indexOf('BW_REACT_PROFILE=1', preserve);
    const restore = workflow.indexOf(
        'mv packages/scratch-gui/build-production-ci packages/scratch-gui/build');
    const cleanupTrap = workflow.indexOf('trap cleanup_profile_build EXIT', preserve);
    assert.ok(preserve >= 0 && preserve < profile,
        'CI must shelter the production build before npm run build cleans it');
    assert.ok(restore >= 0 && cleanupTrap > preserve && cleanupTrap < profile,
        'CI must install the production-build restore trap before profiling');
});

test('setup attribution owns crossing work by start phase without losing overlap', () => {
    const result = summarizeI8086Timeline({
        milestones: [
            ['probe-installed', 0], ['dom-ready', 100], ['device-ready', 120],
            ['i8086-selected', 130], ['asm-ready', 140], ['example-ready', 150],
            ['bench-booted', 190], ['runner-running', 200], ['circuit-open-request', 210]
        ].map(([name, at]) => ({name, at})),
        longTasks: [{at: 10, ms: 60}, {at: 180, ms: 50}, {at: 230, ms: 60}],
        resources: [
            {name: 'main.js', kind: 'script', at: 20, ms: 25, bytes: 1000},
            {name: 'asm.chunk.js', kind: 'script', at: 135, ms: 5, bytes: 200}
        ],
        sampleStart: 220,
        sampleEnd: 300
    });
    const phase = name => result.phases.find(item => item.name === name);
    assert.equal(phase('app-bootstrap').longTasksStarted, 1);
    assert.equal(phase('asm-chunk-load').scriptCount, 1);
    assert.equal(phase('assemble-and-attach').longTasksStarted, 1);
    assert.equal(phase('circuit-open-to-first-pump').longTasksStarted, 0);
    assert.equal(phase('circuit-open-to-first-pump').longTaskOverlapMs, 10);
    assert.equal(phase('steady-pump').longTasksStarted, 1);
    assert.equal(phase('steady-pump').longTaskOverlapMs, 70);
    assert.deepEqual(result.boundaryCrossingLongTasks, [{at: 180, ms: 50}]);
    assert.equal(result.slowestScripts[0].name, 'main.js');
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
