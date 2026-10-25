import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchRetry} from '../scripts/lib-pin.mjs';

// WHY THIS EXISTS. fetchRetry retried 429 and 5xx. GitHub answers a secondary
// rate limit with 403 and `x-ratelimit-remaining: 0`, so the rule failed closed
// on the first attempt: on 2026-09-29 `runtime extension gallery content pins`
// went red on three unrelated PRs inside an hour, each saying
// "HTTP 403 (after 1 attempt)". Retrying every 403 would be worse — a
// permissions answer would then cost 60 s of waiting before failing anyway — so
// the rule keys on the headers that distinguish the two.

/** A fetch stub that returns the given responses in order and counts calls. */
const stub = responses => {
    const calls = [];
    const fn = async url => {
        calls.push(url);
        const r = responses[Math.min(calls.length - 1, responses.length - 1)];
        return {
            ok: false,
            status: r.status,
            headers: {
                get: k => (r.headers || {})[k.toLowerCase()] ?? null,
                has: k => Object.prototype.hasOwnProperty.call(r.headers || {}, k.toLowerCase())
            }
        };
    };
    return {fn, calls};
};

const withFetch = async (impl, body) => {
    const real = globalThis.fetch;
    globalThis.fetch = impl;
    try { return await body(); } finally { globalThis.fetch = real; }
};

test('a rate-limited 403 is retried — an exhausted budget is a wait, not a refusal', async () => {
    const {fn, calls} = stub([{status: 403, headers: {'x-ratelimit-remaining': '0', 'retry-after': '0'}}]);
    await withFetch(fn, async () => {
        await assert.rejects(
            () => fetchRetry('https://example.test/a', {attempts: 3, log: () => {}, baseDelayMs: 0}),
            /HTTP 403 \(after 3 attempts\)/);
    });
    assert.equal(calls.length, 3, 'all three attempts must be spent before giving up');
});

test('a 403 that only says retry-after is retried too', async () => {
    const {fn, calls} = stub([{status: 403, headers: {'retry-after': '0'}}]);
    await withFetch(fn, async () => {
        await assert.rejects(() => fetchRetry('https://example.test/b', {attempts: 2, log: () => {}, baseDelayMs: 0}));
    });
    assert.equal(calls.length, 2);
});

test('a bare 403 is NOT retried, and the message says why', async () => {
    const {fn, calls} = stub([{status: 403, headers: {}}]);
    await withFetch(fn, async () => {
        await assert.rejects(
            () => fetchRetry('https://example.test/c', {attempts: 4, log: () => {}, baseDelayMs: 0}),
            /after 1 attempt.*permissions answer, not retried/);
    });
    assert.equal(calls.length, 1,
        'a permissions 403 must fail fast — retrying it wastes a minute and still fails');
});

test('429 and 5xx keep their existing behaviour', async () => {
    for (const status of [429, 500, 503]) {
        const {fn, calls} = stub([{status, headers: {'retry-after': '0'}}]);
        await withFetch(fn, async () => {
            await assert.rejects(() => fetchRetry('https://example.test/d', {attempts: 2, log: () => {}, baseDelayMs: 0}));
        });
        assert.equal(calls.length, 2, `${status} must still be retried`);
    }
});

test('a 404 is not retried — an absent ref is an answer', async () => {
    const {fn, calls} = stub([{status: 404, headers: {}}]);
    await withFetch(fn, async () => {
        await assert.rejects(() => fetchRetry('https://example.test/e', {attempts: 4, log: () => {}, baseDelayMs: 0}));
    });
    assert.equal(calls.length, 1);
});
