#!/usr/bin/env node
/** Deterministic allocation benchmark for the live debugger snapshot gate. */
import {
    createDebugSnapshotEmitter,
    DEBUG_LIVE_SNAPSHOT_MS
} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

const frames = Math.max(1, Number(process.argv[2]) || 6000);
let at = 0;
let serial = Array.from({length: 200}, (_, i) => `serial line ${i}`);
const blockMap = new Map(Array.from({length: 128}, (_, i) => [`task/${i}`, `block-${i}`]));
let checksum = 0;
const emitter = createDebugSnapshotEmitter({
    now: () => at,
    snapshot: () => ({
        blockOfTask: Object.fromEntries(blockMap),
        glowing: [...blockMap.values()].slice(0, 8),
        serialOutput: [...serial]
    }),
    onChange: value => { checksum += value.serialOutput.length; }
});

const started = performance.now();
for (let frame = 0; frame < frames; frame++) {
    at = frame * (1000 / 60);
    emitter.live();
}
const wallMs = performance.now() - started;
const stats = emitter.stats();
const result = {
    frames,
    intervalMs: DEBUG_LIVE_SNAPSHOT_MS,
    snapshotsBuilt: stats.emitted,
    snapshotsAvoided: stats.suppressed,
    reductionPercent: Number((100 * stats.suppressed / stats.attempted).toFixed(1)),
    snapshotBuildMs: Number(stats.snapshotBuildMs.toFixed(3)),
    benchmarkWallMs: Number(wallMs.toFixed(3)),
    checksum
};
console.log(JSON.stringify(result, null, 2));
