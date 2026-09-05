import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    attributeReactCommits,
    summarizeI8086Pump,
    summarizeI8086Repetitions,
    summarizeSpread,
    summarizeI8086Timeline,
    summarizeReactProfiles
} from '../scripts/lib/i8086-performance.mjs';

test('the production 8086 benchmark covers desktop and mobile pump health', () => {
    const script = readFileSync(new URL('../scripts/bench-i8086-browser.mjs', import.meta.url), 'utf8');
    for (const fact of [
        "name: 'desktop'", "name: 'mobile'", "name: 'minimum-device-4x'", '__BW_I8086_PERF__',
        "selectOption('i8086')", "selectOption('pins')", 'realTimeRatio',
        'pumpMs', 'pumpBreakdown', 'setupTimeline', 'steadyLongTasks',
        'milestones', 'resources', 'longTasks', 'reactProfiles', 'heapBytes', "ratio < 0.25",
        'encodedBodySize', 'decodedBodySize', 'newCDPSession', 'reactUpdateSources',
        "'Emulation.setCPUThrottlingRate'", 'browser-performance-raw/v3',
        'browser-performance/v4', 'summarizeI8086Repetitions', 'cpuThrottleRate: 4',
        'dos-load-start', 'dosLoadResources', 'dosJourneyResources', 'I8086_WEBPACK_STATS',
    ]) assert.ok(script.includes(fact), `benchmark lost ${fact}`);
    assert.match(script, /Math\.max\(3, requestedRepetitions\)/,
        'the statistical gate must not accept fewer than three repetitions');
    assert.match(script, /getByRole\('button', \{name: \/ASM\/\}\)\.click\(\{force: true\}\)/,
        'the minimum-width profile must dispatch the overlapped but enabled ASM control');
    const repetitionLoop = script.indexOf('for (let repetition = 1; repetition <= repetitions; repetition++)');
    const freshContext = script.indexOf('browser.newContext(contextOptions)', repetitionLoop);
    const rawReceipt = script.indexOf('writeFile(resolve(rawDir', freshContext);
    const perRunFloor = script.indexOf('samples.length < 150 || ratio < 0.25', rawReceipt);
    const closeContext = script.indexOf('await context.close()', perRunFloor);
    assert.ok(repetitionLoop >= 0 && repetitionLoop < freshContext && freshContext < rawReceipt &&
        rawReceipt < perRunFloor && perRunFloor < closeContext,
    'each repetition needs a fresh context, a pre-verdict raw receipt, validation and cleanup');
});

test('repeated receipts report a true median and full observed spread', () => {
    assert.deepEqual(summarizeSpread([9, 1, 5]), {median: 5, min: 1, max: 9, range: 8});
    assert.deepEqual(summarizeSpread([8, 2, 4, 6]), {median: 5, min: 2, max: 8, range: 6});
    const runs = [3, 1, 2].map((ratio, index) => ({
        realTimeRatio: ratio,
        elapsedMs: 100 + index,
        pumpMs: {p50: ratio, p95: ratio + 1, max: ratio + 2},
        pumpBreakdown: {totalWallMs: ratio * 10, phases: {
            runMs: {totalMs: ratio, percentOfPump: 50},
            boardMs: {totalMs: 0, percentOfPump: 0},
            publishMs: {totalMs: ratio, percentOfPump: 50}
        }},
        longTasks: Array(index).fill({}),
        steadyLongTasks: [],
        startupLongTaskCount: index,
        setupTimeline: {phases: [{name: 'circuit-open-to-first-pump', durationMs: ratio * 10,
            longTasksStarted: index, longTaskOverlapMs: index,
            scriptTransferBytes: 0, scriptEncodedBodyBytes: 100, scriptDecodedBodyBytes: 200}]},
        reactProfiles: {startup: {CircuitDesigner: {commits: 10 + index,
            actualDurationMs: {totalMs: ratio * 4}}}}
    }));
    const summary = summarizeI8086Repetitions(runs);
    assert.equal(summary.repetitions, 3);
    assert.deepEqual(summary.realTimeRatio, {median: 2, min: 1, max: 3, range: 2});
    assert.equal(summary.setupPhases['circuit-open-to-first-pump'].scriptEncodedBodyBytes.median, 100);
    assert.equal(summary.startupReact.CircuitDesigner.commits.median, 11);
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

test('React update attribution accounts for every commit per nested boundary', () => {
    const result = attributeReactCommits([
        {id: 'CircuitDesigner', phase: 'mount', actualDurationMs: 20, startTime: 8, commitTime: 10},
        {id: 'BoardCanvas', phase: 'mount', actualDurationMs: 15, startTime: 8, commitTime: 11},
        {id: 'CircuitDesigner', phase: 'update', actualDurationMs: 8, startTime: 18, commitTime: 20},
        {id: 'BoardCanvas', phase: 'update', actualDurationMs: 6, startTime: 18, commitTime: 21},
        {id: 'CircuitDesigner', phase: 'update', actualDurationMs: 2, startTime: 29, commitTime: 30}
    ], [
        {seq: 1, source: 'host:designer-load', at: 5},
        {seq: 2, source: 'fit:auto', at: 15},
        {seq: 3, source: 'resize:fit', at: 16},
        {seq: 4, source: 'host:late', at: 40}
    ], {from: 0, to: 50});
    const designer = result.boundaries.CircuitDesigner;
    assert.equal(designer.commits, 3);
    assert.equal(designer.attributedCommits, 2);
    assert.equal(designer.unattributedCommits, 1);
    assert.equal(designer.attributedCommits + designer.unattributedCommits, designer.commits);
    assert.equal(designer.sources['fit:auto'].commits, 1);
    assert.equal(designer.sources['react:mount'].commits, 1);
    assert.deepEqual(designer.commitRows[1].sources, ['fit:auto', 'resize:fit']);
    assert.deepEqual(designer.uncommittedMarks.map(mark => mark.source), ['host:late']);
    const board = result.boundaries.BoardCanvas;
    assert.equal(board.commits, 2);
    assert.equal(board.attributedCommits + board.unattributedCommits, board.commits);
    assert.equal(board.sources['fit:auto'].actualDurationMs, 6);
});

test('the React performance probe is lazy, stable and identity-preserving when absent', async () => {
    const source = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/react-perf-profiler.js', import.meta.url), 'utf8');
    const {getReactPerformanceProbe, profileReactSubtree} = await import(
        `data:text/javascript,${encodeURIComponent(source)}`);
    const previousWindow = globalThis.window;
    try {
        delete globalThis.window;
        const child = {type: 'board'};
        assert.equal(getReactPerformanceProbe(), null);
        assert.equal(profileReactSubtree({Profiler: true}, 'BoardCanvas', child), child);
        globalThis.window = {__BW_I8086_PERF__: {reactUpdateSources: [], sourceLimit: 2}};
        const first = getReactPerformanceProbe();
        assert.equal(first, getReactPerformanceProbe(), 'the benchmark prop identity must stay stable');
        first.mark('fit:auto', {zoom: 1});
        first.mark('resize:fit');
        first.mark('ignored:over-limit');
        assert.deepEqual(globalThis.window.__BW_I8086_PERF__.reactUpdateSources.map(mark => mark.source),
            ['fit:auto', 'resize:fit']);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('React profiling and source marks are opt-in at all three relevant subtrees', () => {
    const helper = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/react-perf-profiler.js', import.meta.url), 'utf8');
    const panel = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
    const circuit = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');
    const designer = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx', import.meta.url), 'utf8');
    const canvas = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-circuit-ui/components/BoardCanvas.jsx', import.meta.url), 'utf8');
    const boardHook = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-circuit-ui/hooks/useBoard.js', import.meta.url), 'utf8');
    const webpack = readFileSync(new URL(
        '../packages/scratch-gui/webpack.config.js', import.meta.url), 'utf8');
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
    assert.match(helper, /if \(!enabled \|\| !React\.Profiler\) return child;/,
        'normal runtime must retain the original subtree without a Profiler element');
    assert.match(helper, /window\.__BW_I8086_PERF__/);
    assert.match(helper, /const getReactPerformanceProbe = \(\) =>/);
    assert.match(helper, /if \(!probe\) return;/,
        'normal production must not allocate source receipts');
    assert.doesNotMatch(panel, /profileReactSubtree/,
        'a Profiler returned inside DebugPanel would omit DebugPanel.render itself');
    assert.match(circuit, /profileReactSubtree\(React, 'DebugPanel', \(<DebugPanel/);
    assert.match(circuit, /profileReactSubtree\(React, 'CircuitDesigner', \(<Designer/);
    assert.match(circuit, /performanceProbe=\{this\._performanceProbe\}/);
    assert.match(designer, /profilePerformanceSubtree\(performanceProbe, React, 'BoardCanvas'/);
    for (const source of ['designer:declaration', 'designer:board-ready']) {
        assert.ok(designer.includes(source), `designer lost ${source} attribution`);
    }
    assert.match(canvas, /performanceProbe\.mark\(`fit:\$\{reason\}`/);
    for (const source of ["'auto'", "'settled-retry'", 'resize:fit',
        'resize:viewport-initial', 'resize:viewport-observer']) {
        assert.ok(canvas.includes(source), `canvas lost ${source} attribution`);
    }
    assert.match(boardHook, /performanceProbe\.mark\(`board-state:\$\{source\}`\)/);
    assert.match(boardHook, /doRefresh\('initial'\)/);
    assert.match(boardHook, /doRefresh\('change'\)/);
    for (const source of ['host:circuit-ready', 'host:declaration-revision',
        'host:declaration-stc', 'host:runner-state', 'host:box-measure']) {
        assert.ok(circuit.includes(source), `host lost ${source} attribution`);
    }
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
            {name: 'main.js', kind: 'script', at: 20, ms: 25,
                transferSize: 1000, encodedBodySize: 900, decodedBodySize: 1200},
            // A cached chunk has no transfer bytes but retains its body sizes.
            {name: 'asm.chunk.js', kind: 'script', at: 135, ms: 5,
                transferSize: 0, encodedBodySize: 200, decodedBodySize: 300}
        ],
        sampleStart: 220,
        sampleEnd: 300
    });
    const phase = name => result.phases.find(item => item.name === name);
    assert.equal(phase('app-bootstrap').longTasksStarted, 1);
    assert.equal(phase('asm-chunk-load').scriptCount, 1);
    assert.equal(phase('asm-chunk-load').scriptTransferBytes, 0);
    assert.equal(phase('asm-chunk-load').scriptEncodedBodyBytes, 200);
    assert.equal(phase('asm-chunk-load').scriptDecodedBodyBytes, 300);
    assert.equal(result.slowestScripts.find(resource => resource.name === 'asm.chunk.js').encodedBodySize, 200);
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
    assert.match(workflow, /I8086_PERF_REPETITIONS=3/);
    assert.match(workflow, /name: i8086-browser-performance/);
    assert.match(workflow, /path: artifacts\/i8086-performance\/\*\*/);
    assert.match(workflow, /\.\/node_modules\/\.bin\/webpack --profile --stats verbose[\s\\]*\n[\s\\]*--json \.\.\/\.\.\/artifacts\/i8086-performance\/webpack-stats\.json/);
    assert.match(workflow, /node scripts\/report-webpack-ownership\.mjs/);
    assert.match(workflow, /I8086_ENFORCE_WEBPACK_BOUNDARY=1 node scripts\/report-webpack-ownership\.mjs/);
    assert.match(workflow, /I8086_WEBPACK_STATS=artifacts\/i8086-performance\/webpack-stats\.json/);
    assert.match(workflow, /gzip -9 artifacts\/i8086-performance\/webpack-stats\.json/);
});
