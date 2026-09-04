import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createDebugSnapshotEmitter,
    DEBUG_LIVE_SNAPSHOT_MS
} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

test('live frames are throttled before constructing snapshots', () => {
    let at = 0;
    let builds = 0;
    const seen = [];
    const emitter = createDebugSnapshotEmitter({
        snapshot: () => ({build: ++builds}),
        onChange: value => seen.push(value),
        now: () => at,
        measureNow: () => 0
    });

    for (let frame = 0; frame < 60; frame++) {
        at = frame * (1000 / 60);
        emitter.live();
    }
    const stats = emitter.stats();
    assert.equal(stats.attempted, 60);
    assert.ok(stats.emitted >= 4 && stats.emitted <= 5, stats);
    assert.equal(stats.suppressed, 60 - stats.emitted);
    assert.equal(builds, stats.emitted, 'a suppressed frame must not call snapshot()');
    assert.equal(seen.length, stats.emitted);
    assert.equal(stats.minIntervalMs, DEBUG_LIVE_SNAPSHOT_MS);
});

test('pauses, errors and other semantic transitions emit immediately', () => {
    let at = 5;
    let state = 'running';
    const seen = [];
    const emitter = createDebugSnapshotEmitter({
        snapshot: () => ({state}),
        onChange: value => seen.push(value.state),
        now: () => at,
        measureNow: () => 0
    });

    emitter.live();
    state = 'paused';
    emitter.immediate();             // same timestamp: never throttled
    state = 'error';
    emitter.immediate();             // neither is a second transition
    emitter.live();                  // progress refresh is now suppressible
    assert.deepEqual(seen, ['running', 'paused', 'error']);
    assert.deepEqual(emitter.stats(), {
        attempted: 4, emitted: 3, suppressed: 1, snapshotBuildMs: 0,
        minIntervalMs: DEBUG_LIVE_SNAPSHOT_MS
    });
});

test('the runner uses throttling only for its animation-frame tail', () => {
    const source = fs.readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    const pump = /function pumpFrame\(\) \{([\s\S]*?)\n    \}\n\n    function schedule/.exec(source)?.[1] || '';
    assert.match(pump, /emitLive\(\);\s*$/,
        'the per-frame tail must use the pre-snapshot throttle');
    assert.doesNotMatch(pump, /\n\s*emit\(\);\s*$/,
        'a full immediate snapshot at the frame tail defeats the throttle');
    assert.match(source,
        /function setStatus\(phase, message = ''\) \{\s*status = \{ phase, message \};\s*emit\(\);\s*\}/,
        'phase transitions and errors must stay immediate');
    const circuit = fs.readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');
    assert.match(circuit, /const DEBUG_LIVE_REFRESH_MS = 250/);
    assert.match(circuit, /floorDue[^;]+>= DEBUG_LIVE_REFRESH_MS/,
        'the React subtree must use the same progress-only 4 Hz class of refresh');
});
