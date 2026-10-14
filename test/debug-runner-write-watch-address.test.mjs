/**
 * The GUI runner must carry a write-watch address to the engine unchanged.
 *
 * Bounds differ by engine: i8086 has a 20-bit physical write space while
 * smaller targets may refuse the same integer. The runner validates only the
 * host value's shape, delegates the range decision, and preserves the target's
 * reason. These tests use recording targets so they exercise shipped code and
 * can distinguish "not stored" from "target was never called".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleTargetWriteWatchpoint} from
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

const recordingTarget = accept => {
    const calls = [];
    const cleared = [];
    return {
        calls,
        cleared,
        setBreakpoint (spec) {
            calls.push(spec);
            return accept(spec);
        },
        clearBreakpoint (handle) {
            cleared.push(handle);
        }
    };
};

test('a physical write watch above 64 KiB reaches a 20-bit target unchanged', () => {
    const target = recordingTarget(() => 73);
    const watchBps = new Map();
    const added = toggleTargetWriteWatchpoint({target, watchBps, space: 'physical', addr: 0x1f000});

    assert.deepEqual(target.calls, [{kind: 'write', space: 'physical', addr: 0x1f000}],
        'the runner truncated the physical address before the target saw it');
    assert.deepEqual(added, {added: true, space: 'physical', addr: 0x1f000, handle: 73});
    assert.deepEqual([...watchBps], [['physical:126976', 73]],
        'the accepted handle must be keyed by the exact physical address');

    const removed = toggleTargetWriteWatchpoint({target, watchBps, space: 'physical', addr: 0x1f000});
    assert.deepEqual(removed, {removed: true, space: 'physical', addr: 0x1f000});
    assert.deepEqual(target.cleared, [73], 'removal must clear the handle accepted for the exact address');
    assert.equal(watchBps.size, 0);
});

test('a target range refusal reaches the UI byte-for-byte and stores nothing', () => {
    const sentence = 'narrow target: address 0x1f000 lies beyond data space';
    const target = recordingTarget(() => ({unsupported: sentence}));
    const watchBps = new Map();

    const result = toggleTargetWriteWatchpoint({target, watchBps, space: 'data', addr: 0x1f000});

    assert.deepEqual(target.calls, [{kind: 'write', space: 'data', addr: 0x1f000}],
        'engine-specific range validation belongs to the target');
    assert.equal(result.refused, sentence, 'the target sentence was paraphrased or replaced');
    assert.deepEqual(result, {refused: sentence});
    assert.equal(watchBps.size, 0, 'a refused watchpoint must never look armed');
});

for (const [name, addr] of [
    ['a missing address', undefined],
    ['a negative address', -1],
    ['a fractional address', 1.5],
    ['a NaN address', Number.NaN],
    ['an infinite address', Number.POSITIVE_INFINITY]
]) {
    test(`${name} never reaches the target`, () => {
        const target = recordingTarget(() => 19);
        const watchBps = new Map();

        assert.deepEqual(toggleTargetWriteWatchpoint({target, watchBps, space: 'data', addr}),
            {refused: 'write watchpoint address must be a non-negative safe integer'});
        assert.equal(target.calls.length, 0, 'malformed host input reached target.setBreakpoint');
        assert.equal(watchBps.size, 0);
    });
}
