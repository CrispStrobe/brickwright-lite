import {compareReplayValues} from './recorder.js';
import {negotiateCycleProvider} from './cycle-provider.js';

const refusal = (code, reason, details = {}) => ({accepted: false, code, reason, ...details});
const promiseLike = value => value && typeof value.then === 'function';
const rejected = (value, label, allowUndefined = false) => {
    if (promiseLike(value)) return `${label} must be synchronous`;
    if (value === undefined && !allowUndefined) return `${label} returned no result`;
    if (value === false || value?.accepted === false || value?.refused) {
        return value?.reason || value?.refused || `${label} was refused`;
    }
    return null;
};
const defaultNormalize = event => {
    const {schema, seq, inputCursor, ...fact} = event;
    return fact;
};
const defaultBoundary = event => event?.phase === 'tick';

/**
 * Restore a complete mid-instruction checkpoint and verify every event while
 * replaying real target cycles. This model is intentionally runner-neutral;
 * wiring must wait until timed input replay and output resynchronization exist.
 */
export function createCycleReplayController ({recorder, getTarget, subscribeEvents = null,
    applyInput = null, replayHostEvent = null, normalizeEvent = defaultNormalize,
    isCycleBoundary = defaultBoundary, normalizeTimeDomain = domain => domain}) {
    const targetNow = () => typeof getTarget === 'function' ? getTarget() : null;
    const capability = target => {
        let provider;
        try { provider = negotiateCycleProvider(target); } catch (error) {
            return refusal('unsupported-cycle-reverse', error?.message || String(error));
        }
        if (!provider || provider.fidelity !== 'recorded' || !provider.resumable || !provider.checkpoint) {
            return refusal('unsupported-cycle-reverse',
                'cycle reverse requires a recorded, resumable provider with complete checkpoints');
        }
        const recording = target.capabilities?.().recording || [];
        if (!recording.includes('restore') || typeof target.captureCheckpoint !== 'function' ||
            typeof target.restoreCheckpoint !== 'function' || typeof target.replayCycle !== 'function' ||
            (!subscribeEvents && typeof target.onDebugEvent !== 'function')) {
            return refusal('unsupported-cycle-reverse',
                'target lacks complete capture/restore, cycle replay, or event observation');
        }
        if (typeof applyInput !== 'function' && typeof target.applyReplayInput !== 'function') {
            return refusal('unsupported-cycle-reverse-inputs', 'no deterministic input applicator is available');
        }
        return {accepted: true, provider};
    };

    const api = {
        canReverse () { return capability(targetNow()); },
        reverseToCycle (eventCursor) {
            const target = targetNow();
            const supported = capability(target);
            if (!supported.accepted) return supported;
            let checkpoint; let expected; let inputs; let source;
            try {
                checkpoint = recorder.findCheckpoint(eventCursor);
                expected = recorder.eventsFrom(checkpoint.eventCursor)
                    .filter(event => event.seq < eventCursor);
                const providerDomain = normalizeTimeDomain(supported.provider.timeDomain);
                const boundaries = expected.filter(event => isCycleBoundary(event) &&
                    normalizeTimeDomain(event.time?.domain) === providerDomain);
                if (!expected.length || !boundaries.length || expected.at(-1) !== boundaries.at(-1) ||
                    boundaries.some(event => event.fidelity !== 'recorded')) {
                    return refusal('not-recorded-cycle-boundary',
                        'cycle cursor must follow a recorded target-cycle boundary', {eventCursor});
                }
                const inputCursor = expected.at(-1).inputCursor ?? checkpoint.inputCursor;
                inputs = recorder.inputsFrom(checkpoint.inputCursor)
                    .filter(input => input.cursor < inputCursor);
                source = target.captureCheckpoint();
            } catch (error) {
                return refusal('cycle-reverse-range-invalid', error?.message || String(error));
            }
            const sourceError = rejected(source, 'source checkpoint capture');
            if (sourceError) return refusal('cycle-reverse-source-capture-failed', sourceError);
            const clockDomain = normalizeTimeDomain(checkpoint.time.domain);
            const incompatible = inputs.find(input =>
                normalizeTimeDomain(input.time.domain) !== clockDomain);
            if (incompatible) return refusal('cycle-reverse-input-clock-mismatch',
                'recorded input clock cannot be ordered against the target cycle clock',
                {inputCursor: incompatible.cursor});

            const rollback = failure => {
                try {
                    const result = target.restoreCheckpoint(source);
                    const error = rejected(result, 'cycle reverse rollback', true);
                    if (error) throw new Error(error);
                } catch (error) {
                    return refusal('cycle-reverse-rollback-failed',
                        `${failure.reason}; rollback failed (${error?.message || String(error)})`,
                        {failureCode: failure.code});
                }
                return refusal(failure.code, failure.reason, failure.details);
            };
            const actual = [];
            let unsubscribe;
            try {
                const restored = target.restoreCheckpoint(checkpoint.snapshot);
                const restoreError = rejected(restored, 'cycle checkpoint restore', true);
                if (restoreError) return rollback({code: 'cycle-reverse-restore-failed', reason: restoreError});
                unsubscribe = subscribeEvents ? subscribeEvents(event => actual.push(event)) :
                    target.onDebugEvent(event => actual.push(event));
                if (promiseLike(unsubscribe) || typeof unsubscribe !== 'function') {
                    return rollback({code: 'cycle-reverse-subscribe-failed',
                        reason: 'event subscription must synchronously return an unsubscribe function'});
                }
                let inputIndex = 0;
                const boundaries = expected.filter(event => isCycleBoundary(event) &&
                    normalizeTimeDomain(event.time?.domain) ===
                        normalizeTimeDomain(supported.provider.timeDomain));
                for (const event of boundaries) {
                    const now = target.debugTime();
                    if (promiseLike(now) || !now ||
                        normalizeTimeDomain(now.domain) !== normalizeTimeDomain(supported.provider.timeDomain) ||
                        (typeof now.ticks !== 'number' && typeof now.ticks !== 'bigint')) {
                        throw Object.assign(new Error('target cycle time is not a synchronous provider boundary'),
                            {code: 'cycle-reverse-time-invalid'});
                    }
                    while (inputIndex < inputs.length &&
                        BigInt(inputs[inputIndex].time.ticks) <= BigInt(now.ticks)) {
                        const applied = applyInput ? applyInput(target, inputs[inputIndex]) :
                            target.applyReplayInput(inputs[inputIndex]);
                        const inputError = rejected(applied, 'recorded cycle input replay');
                        if (inputError) throw Object.assign(new Error(inputError),
                            {code: 'cycle-reverse-input-refused', inputCursor: inputs[inputIndex].cursor});
                        inputIndex++;
                    }
                    const stepped = target.replayCycle();
                    const stepError = rejected(stepped, 'target cycle replay');
                    if (stepError) throw Object.assign(new Error(stepError), {code: 'cycle-reverse-step-failed'});
                }
                const tornDown = unsubscribe(); unsubscribe = null;
                const teardownError = rejected(tornDown, 'cycle replay subscription teardown', true);
                if (teardownError) throw Object.assign(new Error(teardownError),
                    {code: 'cycle-reverse-unsubscribe-failed'});
            } catch (error) {
                try { if (unsubscribe) unsubscribe(); } catch { /* rollback remains authoritative */ }
                return rollback({code: error?.code || 'cycle-reverse-replay-failed',
                    reason: error?.message || String(error), details: {inputCursor: error?.inputCursor}});
            }
            let comparison;
            try {
                comparison = compareReplayValues(expected.map(normalizeEvent), actual.map(normalizeEvent),
                    {baseCursor: checkpoint.eventCursor});
            } catch (error) {
                return rollback({code: 'cycle-reverse-compare-failed', reason: error?.message || String(error)});
            }
            if (!comparison.matches) return rollback({code: 'REPLAY_DIVERGED',
                reason: 'replayed cycle event stream diverged', details: {divergence: comparison}});
            if (typeof replayHostEvent === 'function') {
                try {
                    expected.forEach((event, index) => {
                        const replayed = replayHostEvent(structuredClone(event),
                            {eventCursor: checkpoint.eventCursor + index});
                        const hostError = rejected(replayed, 'cycle debugger-host reconstruction', true);
                        if (hostError) throw new Error(hostError);
                    });
                } catch (error) {
                    return rollback({code: 'cycle-reverse-host-replay-failed',
                        reason: error?.message || String(error)});
                }
            }
            return {accepted: true, boundary: 'cycle', eventCursor, checkpointId: checkpoint.id,
                replayedCycles: expected.filter(event => isCycleBoundary(event) &&
                    normalizeTimeDomain(event.time?.domain) ===
                        normalizeTimeDomain(supported.provider.timeDomain)).length,
                replayedEvents: actual.length};
        }
    };
    return api;
}

export default createCycleReplayController;
