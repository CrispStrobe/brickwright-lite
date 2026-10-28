import assert from 'node:assert/strict';
import {hashReplayValues} from '../../overlay/scratch-gui/src/lib/bw-debug/recorder.js';

const clone = value => structuredClone(value);
const defaultRefusal = ({result, error}) => Boolean(error) || result?.accepted === false ||
    typeof result?.code === 'string' || typeof result?.refused === 'string';

/**
 * Reusable synchronous checkpoint/replay certification for instruction-atomic targets.
 * The adapter fixture supplies only its true observable state and event subscription;
 * clock-domain epochs or other transport identity can be removed by normalizeEvent.
 */
export function certifyCheckpointReplay ({
    createFixture,
    warmup = () => {},
    advance,
    observableState,
    subscribeEvents,
    normalizeEvent = event => event,
    replaySteps = 4,
    corruptSchema = snapshot => ({...snapshot, schema: Number(snapshot.schema) + 1}),
    omitSensitiveState,
    perturbSensitiveState = () => {},
    isRefusal = defaultRefusal
}) {
    if (typeof createFixture !== 'function' || typeof advance !== 'function' ||
        typeof observableState !== 'function' || typeof subscribeEvents !== 'function' ||
        typeof omitSensitiveState !== 'function' || !Number.isSafeInteger(replaySteps) || replaySteps < 1) {
        throw new TypeError('checkpoint certification fixture is incomplete');
    }
    const fixture = createFixture();
    const {target} = fixture;
    assert.equal(typeof target?.captureCheckpoint, 'function');
    assert.equal(typeof target?.restoreCheckpoint, 'function');
    warmup(fixture);
    const checkpoint = clone(target.captureCheckpoint());
    const atCheckpoint = clone(observableState(fixture));

    advance(fixture, 1);
    target.restoreCheckpoint(clone(checkpoint));
    assert.deepEqual(observableState(fixture), atCheckpoint,
        'checkpoint restore did not reproduce the complete observable state');

    const events = [];
    const unsubscribe = subscribeEvents(fixture, event => events.push(normalizeEvent(event)));
    assert.equal(typeof unsubscribe, 'function', 'event subscription must be removable');
    const replay = () => {
        const start = events.length;
        advance(fixture, replaySteps);
        return {
            stateHash: hashReplayValues(observableState(fixture)),
            eventHash: hashReplayValues(events.slice(start))
        };
    };
    let expected;
    let actual;
    try {
        expected = replay();
        target.restoreCheckpoint(clone(checkpoint));
        actual = replay();
    } finally {
        unsubscribe();
    }
    assert.deepEqual(actual, expected, 'checkpoint replay state/event hashes diverged');

    const beforeInvalid = clone(observableState(fixture));
    let result;
    let error;
    try { result = target.restoreCheckpoint(corruptSchema(clone(checkpoint))); } catch (caught) { error = caught; }
    assert.equal(isRefusal({result, error}), true, 'schema mismatch was not refused');
    assert.deepEqual(observableState(fixture), beforeInvalid,
        'schema refusal mutated target state');

    target.restoreCheckpoint(clone(checkpoint));
    perturbSensitiveState(fixture);
    const omitted = omitSensitiveState(clone(checkpoint));
    const beforeOmitted = clone(observableState(fixture));
    result = undefined;
    error = undefined;
    try { result = target.restoreCheckpoint(omitted); } catch (caught) { error = caught; }
    const refused = isRefusal({result, error});
    if (refused) {
        assert.deepEqual(observableState(fixture), beforeOmitted,
            'incomplete-state refusal mutated target state');
    } else {
        const probeEvents = [];
        const stopProbe = subscribeEvents(fixture,
            event => probeEvents.push(normalizeEvent(event)));
        assert.equal(typeof stopProbe, 'function', 'sensitivity subscription must be removable');
        let probe;
        try {
            advance(fixture, replaySteps);
            probe = {
                stateHash: hashReplayValues(observableState(fixture)),
                eventHash: hashReplayValues(probeEvents)
            };
        } finally {
            stopProbe();
        }
        assert.notDeepEqual(probe, expected,
            'omitted functional state was accepted and replay could not detect its loss');
    }
    return {accepted: true, snapshotEqual: true, replayEqual: true,
        schemaAtomic: true, omittedStateDetected: true, omittedStateRefused: refused};
}
