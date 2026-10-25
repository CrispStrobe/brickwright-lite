import {compareReplayValues} from './recorder.js';

const refusal = (code, reason, details = {}) => ({accepted: false, code, reason, ...details});
const promiseLike = value => value && typeof value.then === 'function';
const outcomeRefusal = (value, label, {allowUndefined = false} = {}) => {
    if (promiseLike(value)) return `${label} must be synchronous`;
    if (value === undefined && !allowUndefined) return `${label} returned no result`;
    if (value === false || value?.accepted === false || value?.refused) {
        return value?.reason || value?.refused || `${label} was refused`;
    }
    return null;
};
const replayError = (code, reason, details = {}) => Object.assign(new Error(reason), {code, details});

/**
 * Restore an instruction-boundary checkpoint and deterministically replay to
 * a recorded event cursor. Targets still own execution and input semantics;
 * this controller owns cursor validation and lossless event comparison.
 */
export function createInstructionReplayController ({
    recorder,
    getTarget,
    restoreCheckpoint = null,
    subscribeEvents = null,
    applyInput = null,
    replayHostEvent = null,
    normalizeTimeDomain = domain => domain,
    normalizeEvent = event => {
        const {schema, seq, inputCursor, ...fact} = event;
        return fact;
    }
}) {
    const targetNow = () => typeof getTarget === 'function' ? getTarget() : null;
    const capability = target => {
        if (!target || (typeof restoreCheckpoint !== 'function' &&
            typeof target.restoreCheckpoint !== 'function') ||
            typeof target.replayInstruction !== 'function' ||
            (!subscribeEvents && typeof target.onDebugEvent !== 'function')) {
            return refusal('unsupported-reverse', 'target lacks restore, instruction replay, or event observation');
        }
        const recording = target.capabilities?.().recording || [];
        if (!recording.includes('restore')) {
            return refusal('unsupported-reverse', 'target does not advertise complete restore');
        }
        if (typeof applyInput !== 'function' && typeof target.applyReplayInput !== 'function') {
            return refusal('unsupported-reverse-inputs', 'no deterministic input applicator is available');
        }
        return {accepted: true};
    };

    return {
        canReverse () {
            return capability(targetNow());
        },

        reverseToEvent (eventCursor) {
            const target = targetNow();
            const supported = capability(target);
            if (!supported.accepted) return supported;

            let checkpoint, expected, inputs;
            try {
                checkpoint = recorder.findCheckpoint(eventCursor);
                expected = recorder.eventsFrom(checkpoint.eventCursor)
                    .filter(event => event.seq < eventCursor);
                const targetInputCursor = expected.at(-1)?.inputCursor ?? checkpoint.inputCursor;
                inputs = recorder.inputsFrom(checkpoint.inputCursor)
                    .filter(input => input.cursor < targetInputCursor);
            } catch (error) {
                return refusal('reverse-range-invalid', error?.message || String(error));
            }
            if (expected.length &&
                !(expected.at(-1).kind === 'instruction' && expected.at(-1).phase === 'retire')) {
                return refusal('not-instruction-boundary',
                    'reverse cursor must be immediately after a recorded instruction retire', {eventCursor});
            }
            const clockDomain = normalizeTimeDomain(checkpoint.time.domain);
            const incompatibleInput = inputs.find(
                input => normalizeTimeDomain(input.time.domain) !== clockDomain);
            if (incompatibleInput) {
                return refusal('reverse-input-clock-mismatch',
                    'recorded input clock cannot be ordered against the target instruction clock',
                    {inputCursor: incompatibleInput.cursor});
            }

            const actual = [];
            let unsubscribe;
            const restoreRecordedCheckpoint = () => typeof restoreCheckpoint === 'function'
                ? restoreCheckpoint(checkpoint, target)
                : target.restoreCheckpoint(checkpoint.snapshot);
            const rollbackFailure = (failure, rollbackCode = 'reverse-source-rollback-failed') => {
                try {
                    const rolledBack = restoreRecordedCheckpoint();
                    const rollbackRefusal = outcomeRefusal(rolledBack,
                        'source checkpoint rollback', {allowUndefined: true});
                    if (rollbackRefusal) throw new Error(rollbackRefusal);
                } catch (rollbackError) {
                    return refusal(rollbackCode,
                        `${failure.reason}; source checkpoint restore failed ` +
                        `(${rollbackError?.message || String(rollbackError)})`,
                    {...failure.details, failureCode: failure.code});
                }
                return refusal(failure.code, failure.reason, failure.details);
            };
            try {
                const restored = restoreRecordedCheckpoint();
                const restoreRefusal = outcomeRefusal(restored,
                    'source checkpoint restore', {allowUndefined: true});
                if (restoreRefusal) return refusal('reverse-restore-failed', restoreRefusal);
                unsubscribe = subscribeEvents
                    ? subscribeEvents(event => actual.push(event))
                    : target.onDebugEvent(event => actual.push(event));
                if (promiseLike(unsubscribe) || typeof unsubscribe !== 'function') {
                    throw replayError('reverse-subscribe-failed',
                        'replay event subscription must synchronously return an unsubscribe function');
                }
            } catch (error) {
                if (error?.code === 'reverse-subscribe-failed') {
                    return rollbackFailure(error);
                }
                return refusal('reverse-restore-failed', error?.message || String(error));
            }

            let inputIndex = 0;
            let operationFailure = null;
            const retireCount = expected.filter(
                event => event.kind === 'instruction' && event.phase === 'retire').length;
            const retires = expected.filter(
                event => event.kind === 'instruction' && event.phase === 'retire');
            try {
                for (let instruction = 0; instruction < retireCount; instruction++) {
                    let now = target.debugTime();
                    if (promiseLike(now)) throw replayError('reverse-replay-failed',
                        'debug time inspection must be synchronous');
                    const nextInput = inputs[inputIndex];
                    const retire = retires[instruction];
                    const retireInputCursor = retire.inputCursor ?? checkpoint.inputCursor;
                    if (nextInput && nextInput.cursor < retireInputCursor &&
                        BigInt(nextInput.time.ticks) < BigInt(now.ticks)) {
                        throw replayError('reverse-input-boundary-passed',
                            'target is already past the next recorded input boundary',
                            {inputCursor: nextInput.cursor});
                    }
                    if (nextInput && nextInput.cursor < retireInputCursor &&
                        BigInt(nextInput.time.ticks) > BigInt(retire.time.ticks)) {
                        throw replayError('reverse-input-time-order-invalid',
                            'recorded input prefix contradicts the instruction retire time',
                            {inputCursor: nextInput.cursor});
                    }
                    if (nextInput && BigInt(nextInput.time.ticks) > BigInt(now.ticks) &&
                        nextInput.cursor < retireInputCursor) {
                        if (typeof target.replayToInputBoundary !== 'function') {
                            throw replayError('reverse-input-boundary-unsupported',
                                'target cannot stop at the next recorded input boundary',
                                {inputCursor: nextInput.cursor});
                        }
                        const advanced = target.replayToInputBoundary(structuredClone(nextInput.time));
                        const advanceRefusal = outcomeRefusal(advanced,
                            'recorded input boundary replay', {allowUndefined: true});
                        if (advanceRefusal) throw replayError('reverse-input-boundary-refused',
                            advanceRefusal, {inputCursor: nextInput.cursor});
                        now = advanced?.time ?? target.debugTime();
                        if (promiseLike(now) || !now ||
                            normalizeTimeDomain(now.domain) !== clockDomain ||
                            BigInt(now.ticks) !== BigInt(nextInput.time.ticks)) {
                            throw replayError('reverse-input-boundary-inexact',
                                'target did not stop at the exact recorded input boundary',
                                {inputCursor: nextInput.cursor});
                        }
                    }
                    while (inputIndex < inputs.length &&
                        inputs[inputIndex].cursor < retireInputCursor &&
                        BigInt(inputs[inputIndex].time.ticks) <= BigInt(now.ticks)) {
                        const applied = applyInput
                            ? applyInput(target, inputs[inputIndex])
                            : target.applyReplayInput(inputs[inputIndex]);
                        const applyRefusal = outcomeRefusal(applied, 'recorded input replay');
                        if (applyRefusal) {
                            throw replayError('reverse-input-refused',
                                `recorded input ${inputs[inputIndex].cursor} could not be replayed`,
                                {inputCursor: inputs[inputIndex].cursor});
                        }
                        inputIndex++;
                    }
                    const stepped = target.replayInstruction();
                    const stepRefusal = outcomeRefusal(stepped, 'instruction replay');
                    if (stepRefusal) throw replayError('reverse-step-failed', stepRefusal);
                }
            } catch (error) {
                operationFailure = {
                    code: error?.code || 'reverse-replay-failed',
                    reason: error?.message || String(error), details: error?.details || {}
                };
            } finally {
                try {
                    const tornDown = unsubscribe();
                    const teardownRefusal = outcomeRefusal(tornDown,
                        'replay subscription teardown', {allowUndefined: true});
                    if (teardownRefusal) throw new Error(teardownRefusal);
                } catch (error) {
                    operationFailure = {
                        code: 'reverse-unsubscribe-failed',
                        reason: error?.message || String(error),
                        details: operationFailure ? {priorFailureCode: operationFailure.code} : {}
                    };
                }
            }
            if (operationFailure) return rollbackFailure(operationFailure);

            let comparison;
            try {
                comparison = compareReplayValues(
                    expected.map(normalizeEvent), actual.map(normalizeEvent),
                    {baseCursor: checkpoint.eventCursor});
            } catch (error) {
                return rollbackFailure({code: 'reverse-compare-failed',
                    reason: error?.message || String(error), details: {}});
            }
            if (!comparison.matches) {
                return rollbackFailure({code: 'REPLAY_DIVERGED', reason: 'replayed event stream diverged',
                    details: {divergence: comparison}});
            }
            if (typeof replayHostEvent === 'function') {
                for (let index = 0; index < expected.length; index++) {
                    const eventCursor = checkpoint.eventCursor + index;
                    try {
                        // Reconstruct from recorded facts only after the actual
                        // stream has matched them; unverified replay output must
                        // never become debugger-host truth.
                        const reconstructed = replayHostEvent(structuredClone(expected[index]), {eventCursor});
                        const hostRefusal = outcomeRefusal(reconstructed,
                            'debugger-host reconstruction', {allowUndefined: true});
                        if (hostRefusal) throw new Error(hostRefusal);
                    } catch (error) {
                        return rollbackFailure({code: 'reverse-host-replay-failed',
                            reason: error?.message || String(error), details: {eventCursor}},
                        'reverse-host-rollback-failed');
                    }
                }
            }
            return {
                accepted: true,
                boundary: 'instruction',
                eventCursor,
                checkpointId: checkpoint.id,
                replayedInstructions: retireCount,
                replayedEvents: actual.length
            };
        }
    };
}

export default createInstructionReplayController;
