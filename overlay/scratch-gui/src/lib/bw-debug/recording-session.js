import {RECORDER_SCHEMA} from './recorder.js';

const refusal = (code, reason) => ({accepted: false, code, reason});

/** Bind target-owned external inputs to the lossless recorder lifecycle. */
export function subscribeDebugTargetInputs (target, recordingSession) {
    if (typeof target?.onDebugInput !== 'function') return null;
    if (!recordingSession || typeof recordingSession.appendInput !== 'function' ||
        typeof recordingSession.status !== 'function') {
        throw new TypeError('debug target inputs require a recording session');
    }
    const unsubscribe = target.onDebugInput(input =>
        !recordingSession.status().active || recordingSession.appendInput(input));
    if (typeof unsubscribe !== 'function') {
        throw new TypeError('onDebugInput must return an unsubscribe function');
    }
    return unsubscribe;
}

/** Connect complete target checkpoints to the target-neutral recorder. */
export function createRecordingSession ({recorder, eventStream, getTarget}) {
    let active = false;
    let failure = null;

    const targetNow = () => typeof getTarget === 'function' ? getTarget() : null;
    const supports = (target, operation) =>
        (target?.capabilities?.().recording || []).includes(operation);

    const capture = target => {
        if (!supports(target, 'checkpoint') || typeof target.captureCheckpoint !== 'function') {
            return refusal('unsupported-checkpoint', 'target does not advertise complete checkpoints');
        }
        let snapshot;
        try {
            snapshot = target.captureCheckpoint();
        } catch (error) {
            return refusal('checkpoint-failed', error?.message || String(error));
        }
        if (snapshot?.accepted === false || snapshot?.refused) {
            return refusal('checkpoint-failed', snapshot.reason || snapshot.refused);
        }
        if (!snapshot?.time) {
            return refusal('invalid-target-checkpoint', 'target checkpoint has no simulation time');
        }
        return {accepted: true, snapshot};
    };

    const checkpoint = () => {
        const target = targetNow();
        const result = capture(target);
        if (!result.accepted) return result;
        const retention = recorder.retention();
        const value = recorder.createCheckpoint({
            schema: RECORDER_SCHEMA,
            time: result.snapshot.time,
            eventCursor: eventStream.nextSequence(),
            inputCursor: retention.nextInputCursor,
            snapshot: result.snapshot
        });
        return {accepted: true, checkpoint: value};
    };

    return {
        start () {
            if (active) return refusal('recording-active', 'recording is already active');
            recorder.clear();
            failure = null;
            const result = checkpoint();
            if (!result.accepted) return result;
            active = true;
            return result;
        },

        appendBatch (batch) {
            if (!active) return {accepted: false, code: 'recording-inactive'};
            const gap = batch.find(event => event.kind === 'gap');
            if (gap) {
                active = false;
                failure = {code: 'recording-gap', dropped: gap.dropped, beforeSeq: gap.beforeSeq};
                return {accepted: false, ...failure};
            }
            try {
                for (const event of batch) recorder.appendEvent(event);
                return {accepted: true, count: batch.length};
            } catch (error) {
                active = false;
                failure = {code: 'recording-error', message: error?.message || String(error)};
                return {accepted: false, ...failure};
            }
        },

        appendInput (input) {
            if (!active) return refusal('recording-inactive', 'input log is not recording');
            return {accepted: true, input: recorder.appendInput({...input, schema: RECORDER_SCHEMA})};
        },

        checkpoint () {
            if (!active) return refusal('recording-inactive', 'recording is not active');
            return checkpoint();
        },

        restore (eventCursor) {
            const target = targetNow();
            if (!supports(target, 'restore') || typeof target?.restoreCheckpoint !== 'function') {
                return refusal('unsupported-restore', 'target does not advertise complete restore');
            }
            let saved;
            try {
                saved = recorder.findCheckpoint(eventCursor);
                const restored = target.restoreCheckpoint(saved.snapshot);
                if (restored?.accepted === false || restored?.refused) {
                    return refusal('restore-failed', restored.reason || restored.refused);
                }
            } catch (error) {
                return refusal('restore-failed', error?.message || String(error));
            }
            active = false;
            return {accepted: true, checkpoint: saved, boundary: 'instruction'};
        },

        stop () {
            active = false;
            return this.status();
        },

        status () {
            return {active, failure: failure ? {...failure} : null, retention: recorder.retention()};
        }
    };
}
