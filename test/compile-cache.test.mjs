// The compile cache: a Run whose (code, target, format) tuple was compiled
// before must not touch the network — the edit-run-edit loop mostly re-runs
// unchanged programs, and a serverless cold start costs seconds each time.
//
// Keyed by the FULL tuple (exact string match): a hash key could collide
// and serve a WRONG IMAGE, which is strictly worse than any slowness this
// cache removes. Failures are never cached; quota errors evict, then give
// up quietly — the cache must never be the reason a Run fails.
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

// debug-runner imports browser-flavored modules at top level only via
// dynamic import() inside functions, so a bare import of the cache
// helpers is safe in Node — but localStorage must exist first.
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); }
};

const {compileCacheGet, compileCachePut, compileCacheLoad} =
    await import('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');

describe('compile cache', () => {
    test('round-trips a response by exact key', () => {
        store.clear();
        const out = {success: true, base64: 'QUJD', symbols: {main: 16}};
        compileCachePut('["int main(){}","rp2040","bin"]', out);
        assert.deepEqual(compileCacheGet('["int main(){}","rp2040","bin"]'), out);
    });

    test('a different tuple is a miss — never a near-match', () => {
        store.clear();
        compileCachePut('["int main(){}","rp2040","bin"]', {success: true, base64: 'QUJD'});
        assert.equal(compileCacheGet('["int main(){}","rp2040","ihx"]'), null);
        assert.equal(compileCacheGet('["int main(){ }","rp2040","bin"]'), null);
    });

    test('LRU: the cap holds and recency decides who survives', () => {
        store.clear();
        for (let i = 0; i < 9; i++) compileCachePut(`k${i}`, {success: true, i});
        assert.equal(compileCacheLoad().length, 6, 'capped at 6');
        assert.equal(compileCacheGet('k0'), null, 'the oldest fell out');
        // touch k3, then push two more: k3 must survive where k4 falls out
        assert.ok(compileCacheGet('k3'));
        compileCachePut('k9', {success: true});
        compileCachePut('k10', {success: true});
        assert.ok(compileCacheGet('k3'), 'recently-used survives');
        assert.equal(compileCacheGet('k4'), null, 'least-recently-used evicted');
    });

    test('re-putting the same key replaces, not duplicates', () => {
        store.clear();
        compileCachePut('k', {success: true, v: 1});
        compileCachePut('k', {success: true, v: 2});
        assert.equal(compileCacheLoad().length, 1);
        assert.equal(compileCacheGet('k').v, 2);
    });

    test('quota exhaustion evicts and retries instead of throwing', () => {
        store.clear();
        let calls = 0;
        const realSet = globalThis.localStorage.setItem;
        globalThis.localStorage.setItem = (k, v) => {
            calls++;
            if (calls <= 2) throw new Error('QuotaExceededError');
            realSet(k, v);
        };
        try {
            compileCachePut('a', {success: true});
            compileCachePut('b', {success: true});
            compileCachePut('c', {success: true}); // two throws, then lands smaller
            assert.ok(compileCacheLoad().length >= 1, 'something was kept after eviction');
        } finally {
            globalThis.localStorage.setItem = realSet;
        }
    });

    test('a browser with no localStorage degrades to a no-op, never a throw', () => {
        const saved = globalThis.localStorage;
        delete globalThis.localStorage;
        try {
            assert.doesNotThrow(() => compileCachePut('k', {success: true}));
            assert.equal(compileCacheGet('k'), null);
        } finally {
            globalThis.localStorage = saved;
        }
    });
});
