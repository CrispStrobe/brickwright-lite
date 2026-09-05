import {compareReplayValues} from './recorder.js';

const refusal = (code, reason, details = {}) => ({accepted: false, code, reason, ...details});

/**
 * Restore an instruction-boundary checkpoint and deterministically replay to
 * a recorded event cursor. Targets still own execution and input semantics;
 * this controller owns cursor validation and lossless event comparison.
 */
export function createInstructionReplayController ({
    recorder,
    getTarget,
    subscribeEvents = null,
    applyInput = null,
    normalizeTimeDomain = domain => domain,
    normalizeEvent = event => {
        const {schema, seq, inputCursor, ...fact} = event;
        return fact;
    }
}) {
    const targetNow = () => typeof getTarget === 'function' ? getTarget() : null;
    const capability = target => {
        if (!target || typeof target.restoreCheckpoint !== 'function' ||
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
            try {
                const restored = target.restoreCheckpoint(checkpoint.snapshot);
                if (restored?.accepted === false || restored?.refused) {
                    return refusal('reverse-restore-failed', restored.reason || restored.refused);
                }
                unsubscribe = subscribeEvents
                    ? subscribeEvents(event => actual.push(event))
                    : target.onDebugEvent(event => actual.push(event));
            } catch (error) {
                return refusal('reverse-restore-failed', error?.message || String(error));
            }

            let inputIndex = 0;
            const retireCount = expected.filter(
                event => event.kind === 'instruction' && event.phase === 'retire').length;
            try {
                for (let instruction = 0; instruction < retireCount; instruction++) {
                    const now = target.debugTime();
                    while (inputIndex < inputs.length &&
                        BigInt(inputs[inputIndex].time.ticks) <= BigInt(now.ticks)) {
                        const applied = applyInput
                            ? applyInput(target, inputs[inputIndex])
                            : target.applyReplayInput(inputs[inputIndex]);
                        if (applied === false || applied?.accepted === false || applied === undefined) {
                            return refusal('reverse-input-refused',
                                `recorded input ${inputs[inputIndex].cursor} could not be replayed`,
                                {inputCursor: inputs[inputIndex].cursor});
                        }
                        inputIndex++;
                    }
                    const stepped = target.replayInstruction();
                    if (!stepped || stepped.accepted === false) {
                        return refusal('reverse-step-failed', stepped?.reason || 'instruction replay was refused');
                    }
                }
            } catch (error) {
                return refusal('reverse-replay-failed', error?.message || String(error));
            } finally {
                unsubscribe?.();
            }

            const comparison = compareReplayValues(
                expected.map(normalizeEvent), actual.map(normalizeEvent),
                {baseCursor: checkpoint.eventCursor});
            if (!comparison.matches) {
                return refusal('REPLAY_DIVERGED', 'replayed event stream diverged', {divergence: comparison});
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
