import assert from 'node:assert/strict';
import test from 'node:test';

import {createDivergenceBisection} from
    '../overlay/scratch-gui/src/lib/bw-debug/divergence-bisection.js';
import {hashReplayValues} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';

const at = eventCursor => ({branchId: 'main', eventCursor});

const fixture = ({omitInput = false, failProbeAt = null, restoreFails = false} = {}) => {
    const inputs = new Map([[4, 7]]);
    const run = (limit, applyInputs = true) => {
        const state = {pc: 0, latch: 0, memory: new Uint8Array(8)};
        const events = [];
        while (state.pc < limit) {
            if (applyInputs && inputs.has(state.pc)) state.latch = inputs.get(state.pc);
            state.memory[state.pc & 7] = (state.pc + state.latch) & 0xff;
            events.push({pc: state.pc, latch: state.latch, byte: state.memory[state.pc & 7]});
            state.pc++;
        }
        return {state, events};
    };
    const expected = run(16, true).events;
    let live = {pc: 99, latch: 3, memory: new Uint8Array([9, 8, 7])};
    const original = structuredClone(live);
    let restores = 0;
    const controller = createDivergenceBisection({maxProbes: 64,
        captureSource: () => structuredClone(live),
        restoreSource: source => {
            if (restoreFails) return {accepted: false, reason: 'checkpoint codec rejected source'};
            live = structuredClone(source); restores++; return {accepted: true};
        },
        probe: where => {
            if (where.eventCursor === failProbeAt) {
                live.pc = -1;
                return {accepted: false, reason: 'checkpoint probe restore failed'};
            }
            const actual = run(where.eventCursor, !omitInput);
            live = actual.state;
            return {accepted: true, passive: true, deterministic: true, externalEffects: 0,
                matches: hashReplayValues(actual.events) ===
                    hashReplayValues(expected.slice(0, where.eventCursor))};
        }});
    return {controller, original, live: () => live, restores: () => restores};
};

test('deterministic target bisection locates the first event affected by an omitted timed input', async () => {
    const f = fixture({omitInput: true});
    const result = await f.controller.bisect({good: at(4), bad: at(16)});
    assert.equal(result.accepted, true, result.reason);
    assert.deepEqual(result.firstMismatchCursor, at(5));
    assert.equal(result.firstMismatchEventSeq, 4);
    assert.ok(result.probes <= Math.ceil(Math.log2(12)) + 2);
    assert.deepEqual(f.live(), f.original, 'every destructive replay probe rolls source state back');
    assert.equal(f.restores(), result.probes);
});

test('checkpoint probe refusal and authoritative source-restore failure remain distinct', async () => {
    let f = fixture({failProbeAt: 4});
    let result = await f.controller.bisect({good: at(4), bad: at(16)});
    assert.equal(result.code, 'bisection-probe-refused');
    assert.deepEqual(f.live(), f.original);

    f = fixture({failProbeAt: 4, restoreFails: true});
    result = await f.controller.bisect({good: at(4), bad: at(16)});
    assert.equal(result.code, 'bisection-source-restore-failed');
    assert.equal(result.priorFailureCode, 'bisection-probe-refused');
});

test('bounded audit rejects a non-monotonic custom predicate that would make binary search unsound', async () => {
    let live = 77;
    const controller = createDivergenceBisection({maxProbes: 32,
        captureSource: () => live,
        restoreSource: value => { live = value; return true; },
        probe: where => {
            live = where.eventCursor;
            const matches = where.eventCursor < 3 || where.eventCursor === 5;
            return {accepted: true, matches, passive: true, deterministic: true, externalEffects: 0};
        }});
    const result = await controller.bisect({good: at(0), bad: at(8), auditMonotonic: true});
    assert.equal(result.code, 'bisection-non-monotonic');
    assert.equal(result.probeCursor, 5);
    assert.equal(live, 77);
});
