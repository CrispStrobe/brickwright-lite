import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from '../scripts/lib/i8086-execution-workload.mjs';

for (const workload of ['mixed', 'words', 'strings']) {
    test(`${workload}: every execution layer retires the same program past the DOS timer deadline`, () => {
        let reference;
        for (const layer of ['core', 'machine', 'dos', 'debugger', 'peripherals']) {
            const bench = setup(layer, workload);
            const warmup = bench.run(1_000_000);
            const result = bench.run(1_000_000);
            assert.ok(result.heartbeat > warmup.heartbeat, `${layer} stopped making useful progress`);
            const {wallMs, realTimeRatio, ...state} = result;
            assert.ok(wallMs > 0 && realTimeRatio > 0);
            if (reference) assert.deepEqual(state, reference, `${layer} changed architectural execution`);
            else reference = state;
        }
    });
}

test('unknown workload and layer fail rather than measuring a fallback', () => {
    assert.throws(() => setup('core', 'missing'), /Unknown workload/);
    assert.throws(() => setup('missing'), /Unknown layer/);
});
