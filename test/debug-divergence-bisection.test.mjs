import test from 'node:test';
import assert from 'node:assert/strict';
import {createDivergenceBisection} from
    '../overlay/scratch-gui/src/lib/bw-debug/divergence-bisection.js';

const at = eventCursor => ({branchId: 'main', eventCursor});

test('finds the first mismatching event in logarithmic passive probes', async () => {
    let live = {pc: 99}; let restores = 0; const seen = [];
    const controller = createDivergenceBisection({
        captureSource: () => structuredClone(live),
        restoreSource: source => { live = structuredClone(source); restores++; return true; },
        probe: (where, request) => {
            assert.deepEqual(request, {passive: true});
            live.pc = where.eventCursor;
            seen.push(where.eventCursor);
            return {accepted: true, matches: where.eventCursor < 613,
                passive: true, deterministic: true, externalEffects: 0};
        }
    });
    const result = await controller.bisect({good: at(0), bad: at(1024)});
    assert.equal(result.accepted, true);
    assert.deepEqual(result.firstMismatchCursor, at(613));
    assert.equal(result.firstMismatchEventSeq, 612);
    assert.ok(result.probes <= Math.ceil(Math.log2(1024)) + 2);
    assert.equal(restores, seen.length, 'source is restored after every probe');
    assert.deepEqual(live, {pc: 99});
});

test('probe refusal, throw, and non-passive receipt restore source without leaking it', async () => {
    for (const behavior of [() => ({accepted: false, reason: 'no'}), () => { throw new Error('boom'); },
        () => ({accepted: true, matches: true, passive: false, deterministic: false, externalEffects: 1})]) {
        const secret = {memory: 'opaque'}; let live = secret; let restored = 0;
        const controller = createDivergenceBisection({captureSource: () => structuredClone(live),
            restoreSource: source => { live = structuredClone(source); restored++; return true; },
            probe: () => { live = {memory: 'mutated'}; return behavior(); }});
        const result = await controller.bisect({good: at(1), bad: at(4)});
        assert.equal(result.accepted, false);
        assert.equal(restored, 1);
        assert.deepEqual(live, secret);
        assert.equal(JSON.stringify(result).includes('opaque'), false);
    }
});

test('validates branch range and endpoint claims', async () => {
    let restores = 0;
    const make = matches => createDivergenceBisection({captureSource: () => ({}),
            restoreSource: () => { restores++; }, probe: where => ({accepted: true,
            matches: matches(where.eventCursor), passive: true, deterministic: true, externalEffects: 0})});
    assert.equal((await make(() => true).bisect({good: at(0), bad: at(2)})).code,
        'bisection-bad-matched');
    assert.equal((await make(() => false).bisect({good: at(0), bad: at(2)})).code,
        'bisection-good-diverged');
    assert.equal((await make(() => true).bisect({good: at(0),
        bad: {branchId: 'fork', eventCursor: 2}})).code, 'bisection-branch-mismatch');
    assert.ok(restores >= 2);
});

test('restore failure is authoritative and reports a prior probe failure without source payload', async () => {
    const controller = createDivergenceBisection({captureSource: () => ({secret: 42}),
        restoreSource: () => ({accepted: false, reason: 'cannot restore'}),
        probe: () => { throw new Error('probe broke'); }});
    const result = await controller.bisect({good: at(0), bad: at(2)});
    assert.equal(result.code, 'bisection-source-restore-failed');
    assert.equal(result.priorFailureCode, 'bisection-probe-failed');
    assert.equal(JSON.stringify(result).includes('secret'), false);
});
