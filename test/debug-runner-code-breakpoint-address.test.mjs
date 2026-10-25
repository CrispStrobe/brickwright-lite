/**
 * The GUI runner must carry a code-breakpoint address to the engine unchanged.
 *
 * Address bounds differ by engine. The runner validates the host value's
 * shape, delegates the range decision, and preserves the target's reason.
 * The visible listing still has target-specific wrapping to resolve in C3;
 * these tests protect the API boundary independently of that route.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {toggleTargetCodeBreakpoint} from
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

test('a code breakpoint above 64 KiB does not alias onto a different byte', () => {
    const target = recordingTarget(() => 91);
    const addrBps = new Map();
    const added = toggleTargetCodeBreakpoint({target, addrBps, addr: 0x1f000});

    assert.deepEqual(target.calls, [{kind: 'code', addr: 0x1f000}],
        'the runner aliased the requested 0x1f000 breakpoint onto a different byte');
    assert.deepEqual(added, {added: true, addr: 0x1f000, handle: 91});
    assert.deepEqual([...addrBps], [[0x1f000, 91]],
        'the accepted handle must be keyed by the exact code address');

    const removed = toggleTargetCodeBreakpoint({target, addrBps, addr: 0x1f000});
    assert.deepEqual(removed, {removed: true, addr: 0x1f000});
    assert.deepEqual(target.cleared, [91],
        'removal must clear the handle accepted for the exact address');
    assert.equal(addrBps.size, 0);
});

test('a code-breakpoint target refusal reaches the caller byte-for-byte and stores nothing', () => {
    const sentence = 'narrow target: address 0x1f000 lies beyond code space';
    const target = recordingTarget(() => ({unsupported: sentence}));
    const addrBps = new Map();

    const result = toggleTargetCodeBreakpoint({target, addrBps, addr: 0x1f000});

    assert.deepEqual(target.calls, [{kind: 'code', addr: 0x1f000}],
        'engine-specific range validation belongs to the target');
    assert.equal(result.refused, sentence, 'the target refusal sentence was paraphrased or replaced');
    assert.deepEqual(result, {refused: sentence});
    assert.equal(addrBps.size, 0, 'a refused code breakpoint must never look armed');
});

for (const [name, addr] of [
    ['a missing code address', undefined],
    ['a negative code address', -1],
    ['a fractional code address', 1.5],
    ['a NaN code address', Number.NaN],
    ['an infinite code address', Number.POSITIVE_INFINITY]
]) {
    test(`${name} never calls the target`, () => {
        const target = recordingTarget(() => 19);
        const addrBps = new Map();

        assert.deepEqual(toggleTargetCodeBreakpoint({target, addrBps, addr}),
            {refused: 'code breakpoint address must be a non-negative safe integer'});
        assert.equal(target.calls.length, 0, 'malformed host input reached target.setBreakpoint');
        assert.equal(target.cleared.length, 0, 'malformed host input reached target.clearBreakpoint');
        assert.equal(addrBps.size, 0);
    });
}
