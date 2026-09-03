/**
 * The rotating corpus slice — the harness's own gate.
 *
 * `scripts/oracle-differential.mjs corpus N OFFSET` is the emitter-vs-oracle
 * differential. Its sampling was `pairs.slice(offset, offset + count)`, which
 * fails in a way the differential itself would have called a defect: an offset
 * at or past the end returns an EMPTY array, the comparison loop runs zero
 * times, the failure flag stays false, and the process exits 0. The run
 * reports success having compared nothing.
 *
 * That could not be gated where it lived — inside a network-bound CLI that
 * calls `process.exit` — so it was lifted into `scripts/corpus-sample.mjs`.
 * Same lesson as D-EMU-BP2: a rule reachable only through a live session is a
 * rule with no gate.
 *
 * The second defect was in the caller: it wrapped at a hardcoded 200 while the
 * gallery yields 224 eligible pairs, so 24 were unreachable by the rotation.
 * Only the corpus walk knows that bound, so the wrap belongs here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const {wrappedSample} = await import(path.join(ROOT, 'scripts/corpus-sample.mjs'));

const pairs = n => Array.from({length: n}, (_, i) => `p${i}`);

test('an offset past the end wraps instead of comparing nothing', () => {
    // The original defect, stated as the number that produced it.
    const {sample, start, wrapped} = wrappedSample(pairs(224), 6, 5000);
    assert.equal(sample.length, 6, 'slice(5000, 5006) was [] and the run exited 0');
    assert.equal(start, 5000 % 224);
    assert.equal(wrapped, true, 'and it must say it wrapped, not pretend it did not');
});

test('the tail is reachable — the whole point of not wrapping at 200', () => {
    // Offsets 200..223 were unreachable while the caller wrapped at 200.
    for (const off of [200, 210, 223]) {
        const {sample} = wrappedSample(pairs(224), 6, off);
        assert.equal(sample.length, 6);
        assert.equal(sample[0], `p${off}`, `pair ${off} must be reachable`);
    }
});

test('a sample that runs off the end continues from the front', () => {
    const {sample} = wrappedSample(pairs(10), 4, 8);
    assert.deepEqual(sample, ['p8', 'p9', 'p0', 'p1'],
        'a short tail slice under-samples the end of the corpus forever');
});

test('the sample is never empty, whatever it is asked for', () => {
    for (const [n, count, off] of [[224, 6, 5000], [1, 6, 99], [10, 10, 0], [3, 7, 2]]) {
        const {sample} = wrappedSample(pairs(n), count, off);
        assert.ok(sample.length > 0, `empty sample for (${n}, ${count}, ${off})`);
        assert.equal(sample.length, Math.min(count, n));
        assert.ok(sample.every(Boolean), 'no undefined entries — an index ran out of range');
    }
});

test('a negative offset does not index backwards off the front', () => {
    // JS `%` keeps the sign: -1 % 224 is -1, and pairs[-1] is undefined, which
    // would compare `undefined` and throw somewhere far from the cause.
    const {sample, start} = wrappedSample(pairs(224), 3, -1);
    assert.equal(start, 223);
    assert.deepEqual(sample, ['p223', 'p0', 'p1']);
});

test('an impossible request is refused loudly rather than silently empty', () => {
    assert.throws(() => wrappedSample([], 6, 0), /no eligible pairs/,
        'an empty corpus is a broken harness, not a passing run');
    for (const bad of [0, -3, NaN, 'x']) {
        assert.throws(() => wrappedSample(pairs(10), bad, 0), /at least 1/,
            `count=${bad} must be refused, not turned into an empty comparison`);
    }
});
