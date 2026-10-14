/**
 * The reverse-execution capture closures pair a checkpoint with host state as
 * `{target, host}`. cycle-replay and divergence-bisection guard the captured
 * source with rejected(), which inspects that value directly -- so a RETURNED
 * refusal buried inside `.target` is falsy at the guard and slips past
 * everything except a throw. Targets refuse by RETURNING a refusal
 * (machine-checkpoint's `{refused, code}`); the emu8051/i8086 throw is the
 * outlier. This test pins that a returned refusal is propagated so the consumer
 * catches it -- the invariant the i8086 throw->return convergence (B2) depends
 * on, and which nothing held before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapSourceState} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';
import {createDivergenceBisection} from '../overlay/scratch-gui/src/lib/bw-debug/divergence-bisection.js';

const REFUSAL = {refused: 'checkpoint machine state is incomplete', code: 'INVALID_CHECKPOINT'};

test('wrapSourceState propagates a returned refusal UNWRAPPED, and does not capture host state on one', () => {
    const wrapped = wrapSourceState(REFUSAL, () => {
        throw new Error('host state must not be captured when the checkpoint refused');
    });
    assert.deepEqual(wrapped, REFUSAL,
        'a refusal must pass through as itself -- buried in {target} the consumer guard cannot see it');
});

test('wrapSourceState wraps a real checkpoint with host state, so the reverse path proceeds', () => {
    const checkpoint = {schema: 1, state: {}};
    assert.deepEqual(wrapSourceState(checkpoint, () => ({h: 1})), {target: checkpoint, host: {h: 1}},
        'a valid checkpoint is paired with host state -- the guard is not simply always-refusing');
});

test('a returned checkpoint refusal is CAUGHT by the divergence-bisection source guard', async () => {
    const bisection = createDivergenceBisection({
        // Exactly what the runner closure does: wrap the target's capture. Here
        // the target RETURNS a refusal rather than throwing.
        captureSource: () => wrapSourceState(REFUSAL, () => ({})),
        restoreSource: () => { throw new Error('restore must not run when source capture refused'); },
        probe: () => { throw new Error('probe must not run when source capture refused'); }
    });
    const result = await bisection.bisect({
        good: {branchId: 'main', eventCursor: 1},
        bad: {branchId: 'main', eventCursor: 4}
    });
    assert.equal(result.accepted, false, 'the bisection must refuse, not proceed on a refused source capture');
    assert.equal(result.code, 'bisection-source-capture-failed',
        'and it must refuse for the source-capture reason, i.e. the guard actually saw the refusal');

    // The contrast that names the hazard: the pre-fix WRAPPER shape gets PAST
    // this same guard, because rejected() cannot see a refusal inside `.target`.
    const wrapperBlind = await createDivergenceBisection({
        captureSource: () => ({target: REFUSAL, host: {}}),
        restoreSource: () => ({accepted: true}),
        probe: async () => ({accepted: true, matches: true})
    }).bisect({good: {branchId: 'main', eventCursor: 1}, bad: {branchId: 'main', eventCursor: 4}});
    assert.notEqual(wrapperBlind.code, 'bisection-source-capture-failed',
        'a wrapped refusal must slip PAST the source guard -- that blindness is exactly what wrapSourceState removes');
});
