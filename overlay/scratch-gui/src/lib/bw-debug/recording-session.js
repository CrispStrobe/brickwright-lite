import {RECORDER_SCHEMA} from './recorder.js';

const refusal = (code, reason) => ({accepted: false, code, reason});
const promiseLike = value => value && typeof value.then === 'function';
const outcomeRefusal = (value, label, {allowUndefined = false} = {}) => {
    if (promiseLike(value)) return `${label} must be synchronous`;
    if (value === undefined && !allowUndefined) return `${label} returned no state`;
    if (value === false || value?.accepted === false || value?.refused) {
        return value?.reason || value?.refused || `${label} was refused`;
    }
    return null;
};
const inspectionBounds = (value, {maxBytes, maxFields, maxDepth}) => {
    const encoder = new TextEncoder();
    const active = new Set();
    let bytes = 0;
    let fields = 0;
    const visit = (item, depth) => {
        if (depth > maxDepth) throw new RangeError(`checkpoint inspection exceeds depth ${maxDepth}`);
        if (item && typeof item === 'object') {
            if (active.has(item)) throw new TypeError('checkpoint inspection must not contain cycles');
            active.add(item);
            const keys = ArrayBuffer.isView(item) || item instanceof ArrayBuffer ? [] : Object.keys(item);
            fields += keys.length || 1;
            if (fields > maxFields) throw new RangeError(`checkpoint inspection exceeds ${maxFields} fields`);
            if (ArrayBuffer.isView(item) || item instanceof ArrayBuffer) bytes += item.byteLength;
            else for (const key of keys) {
                bytes += encoder.encode(key).byteLength;
                visit(item[key], depth + 1);
            }
            active.delete(item);
        } else {
            bytes += encoder.encode(JSON.stringify(item) ?? String(item)).byteLength;
        }
        if (bytes > maxBytes) throw new RangeError(`checkpoint inspection exceeds ${maxBytes} bytes`);
    };
    visit(value, 0);
};

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

/** Connect complete target and optional debugger-host checkpoints to the recorder. */
export function createRecordingSession ({
    recorder,
    eventStream,
    getTarget,
    captureInspection = null,
    maxInspectionBytes = 64 * 1024,
    maxInspectionFields = 512,
    maxInspectionDepth = 8,
    captureHostState = null,
    prepareHostRestore = null,
    commitHostRestore = null
}) {
    for (const [value, label] of [[maxInspectionBytes, 'maxInspectionBytes'],
        [maxInspectionFields, 'maxInspectionFields'], [maxInspectionDepth, 'maxInspectionDepth']]) {
        if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be positive`);
    }
    const hostHooks = [captureHostState, prepareHostRestore, commitHostRestore];
    const hostAware = hostHooks.every(hook => typeof hook === 'function');
    if (!hostAware && hostHooks.some(hook => hook !== null && hook !== undefined)) {
        throw new TypeError('host checkpoint capture, prepare, and commit hooks must be provided together');
    }
    let active = false;
    let failure = null;
    let suspension = null;

    const suspensionSignature = () => {
        const retention = recorder.retention();
        return JSON.stringify({
            retention,
            checkpoints: recorder.checkpointSummary().map(item => ({
                id: item.id, eventCursor: item.eventCursor, inputCursor: item.inputCursor
            })),
            streamCursor: eventStream.nextSequence()
        });
    };

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
        const captureRefusal = outcomeRefusal(snapshot, 'target checkpoint capture');
        if (captureRefusal) return refusal('checkpoint-failed', captureRefusal);
        if (!snapshot?.time) {
            return refusal('invalid-target-checkpoint', 'target checkpoint has no simulation time');
        }
        return {accepted: true, snapshot};
    };

    const checkpoint = () => {
        const target = targetNow();
        const result = capture(target);
        if (!result.accepted) return result;
        let hostSnapshot;
        if (hostAware) {
            try {
                hostSnapshot = captureHostState();
            } catch (error) {
                return refusal('host-checkpoint-failed', error?.message || String(error));
            }
            const hostCaptureRefusal = outcomeRefusal(hostSnapshot, 'host checkpoint capture');
            if (hostCaptureRefusal) return refusal('host-checkpoint-failed', hostCaptureRefusal);
        }
        const retention = recorder.retention();
        let inspection;
        if (captureInspection !== null) {
            if (typeof captureInspection !== 'function') {
                return refusal('checkpoint-inspection-failed', 'checkpoint inspection hook must be a function');
            }
            try {
                inspection = captureInspection(target);
            } catch (error) {
                return refusal('checkpoint-inspection-failed', error?.message || String(error));
            }
            const inspectionRefusal = outcomeRefusal(inspection, 'checkpoint public inspection',
                {allowUndefined: true});
            if (inspectionRefusal) return refusal('checkpoint-inspection-failed', inspectionRefusal);
            if (inspection !== undefined) {
                try {
                    inspectionBounds(inspection, {maxBytes: maxInspectionBytes,
                        maxFields: maxInspectionFields, maxDepth: maxInspectionDepth});
                } catch (error) {
                    return refusal('checkpoint-inspection-failed', error?.message || String(error));
                }
            }
        }
        const value = recorder.createCheckpoint({
            schema: RECORDER_SCHEMA,
            time: result.snapshot.time,
            eventCursor: eventStream.nextSequence(),
            inputCursor: retention.nextInputCursor,
            snapshot: result.snapshot,
            ...(inspection === undefined ? {} : {inspection}),
            ...(hostAware ? {hostSnapshot} : {})
        });
        return {accepted: true, checkpoint: value};
    };

    return {
        start () {
            if (active) return refusal('recording-active', 'recording is already active');
            if (suspension) return refusal('recording-suspended',
                'recording is suspended and must be resumed or stopped before starting');
            failure = null;
            const target = targetNow();
            const captured = capture(target);
            if (!captured.accepted) return captured;
            let inspection;
            if (captureInspection !== null) {
                try {
                    inspection = captureInspection(target);
                    const rejected = outcomeRefusal(inspection, 'checkpoint public inspection', {allowUndefined: true});
                    if (rejected) return refusal('checkpoint-inspection-failed', rejected);
                    if (inspection !== undefined) inspectionBounds(inspection, {maxBytes: maxInspectionBytes,
                        maxFields: maxInspectionFields, maxDepth: maxInspectionDepth});
                } catch (error) {
                    return refusal('checkpoint-inspection-failed', error?.message || String(error));
                }
            }
            let hostSnapshot;
            if (hostAware) {
                try { hostSnapshot = captureHostState(); } catch (error) {
                    return refusal('host-checkpoint-failed', error?.message || String(error));
                }
                const rejected = outcomeRefusal(hostSnapshot, 'host checkpoint capture');
                if (rejected) return refusal('host-checkpoint-failed', rejected);
            }
            let value;
            try {
                value = recorder.resetWithCheckpoint({schema: RECORDER_SCHEMA, time: captured.snapshot.time,
                    eventCursor: eventStream.nextSequence(), inputCursor: 0, snapshot: captured.snapshot,
                    ...(inspection === undefined ? {} : {inspection}), ...(hostAware ? {hostSnapshot} : {})});
            } catch (error) {
                return refusal('checkpoint-failed', error?.message || String(error));
            }
            const result = {accepted: true, checkpoint: value};
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
            let stagedHost;
            let rollbackTarget;
            try {
                saved = recorder.findCheckpoint(eventCursor);
                if (Object.hasOwn(saved, 'hostSnapshot')) {
                    if (!hostAware) {
                        return refusal('host-restore-unavailable',
                            'checkpoint contains debugger-host state but no host restore hooks are available');
                    }
                    try {
                        stagedHost = prepareHostRestore(saved.hostSnapshot);
                    } catch (error) {
                        return refusal('host-restore-incompatible', error?.message || String(error));
                    }
                    const prepareRefusal = outcomeRefusal(stagedHost, 'host restore preparation');
                    if (prepareRefusal) return refusal('host-restore-incompatible', prepareRefusal);
                    const rollback = capture(target);
                    if (!rollback.accepted) {
                        return refusal('restore-rollback-unavailable', rollback.reason);
                    }
                    rollbackTarget = rollback.snapshot;
                } else if (hostAware) {
                    return refusal('host-snapshot-missing',
                        'checkpoint predates required debugger-host state');
                }
                const restored = target.restoreCheckpoint(saved.snapshot);
                // Existing target adapters use undefined to mean successful
                // synchronous restoration, so that one legacy shape remains.
                const restoreRefusal = outcomeRefusal(restored,
                    'target checkpoint restore', {allowUndefined: true});
                if (restoreRefusal) return refusal('restore-failed', restoreRefusal);
            } catch (error) {
                return refusal('restore-failed', error?.message || String(error));
            }
            if (hostAware) {
                try {
                    const committed = commitHostRestore(stagedHost);
                    // Legacy host commit hooks are commands and commonly have
                    // no return value; undefined remains synchronous success.
                    const commitRefusal = outcomeRefusal(committed,
                        'host restore commit', {allowUndefined: true});
                    if (commitRefusal) throw new Error(commitRefusal);
                } catch (error) {
                    try {
                        const rolledBack = target.restoreCheckpoint(rollbackTarget);
                        const rollbackRefusal = outcomeRefusal(rolledBack,
                            'target checkpoint rollback', {allowUndefined: true});
                        if (rollbackRefusal) throw new Error(rollbackRefusal);
                    } catch (rollbackError) {
                        return refusal('restore-rollback-failed',
                            `host restore failed (${error?.message || String(error)}); ` +
                            `target rollback failed (${rollbackError?.message || String(rollbackError)})`);
                    }
                    return refusal('host-restore-failed', error?.message || String(error));
                }
            }
            active = false;
            suspension = null;
            return {accepted: true, checkpoint: saved, boundary: 'instruction'};
        },

        /** Temporarily stop appends without clearing or recapturing history. */
        suspend () {
            if (suspension) return refusal('recording-already-suspended',
                'recording is already suspended');
            suspension = {wasActive: active, signature: suspensionSignature()};
            active = false;
            return {accepted: true, wasActive: suspension.wasActive};
        },

        /** Restore the pre-suspend lifecycle only if no history cursor moved. */
        resume () {
            if (!suspension) return refusal('recording-not-suspended',
                'recording was not suspended');
            const saved = suspension;
            suspension = null;
            if (suspensionSignature() !== saved.signature) {
                active = false;
                return refusal('recording-changed-while-suspended',
                    'recorder or event stream cursors changed while recording was suspended');
            }
            active = saved.wasActive;
            return {accepted: true, active};
        },

        stop () {
            active = false;
            suspension = null;
            return this.status();
        },

        status () {
            return {active, suspended: suspension !== null,
                failure: failure ? {...failure} : null, retention: recorder.retention()};
        }
    };
}
