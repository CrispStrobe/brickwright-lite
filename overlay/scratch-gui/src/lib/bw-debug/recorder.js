/**
 * Target-neutral storage primitives for deterministic debug recording.
 *
 * This module deliberately does not know how to serialize a CPU or device. A
 * target supplies an opaque, complete snapshot and later consumes that same
 * snapshot. The recorder owns ordering, cursors, retention and replay hashes.
 *
 * Eviction is attempted only by `createCheckpoint`. An old checkpoint is
 * removed atomically with the event and input prefixes made unnecessary by
 * the next checkpoint, so retained events always have a restore point.
 */

export const RECORDER_SCHEMA = 1;

const DEFAULT_CHECKPOINT_BUDGET = 32 * 1024 * 1024;
const DEFAULT_EVENT_BUDGET = 16 * 1024 * 1024;

export class RecorderError extends Error {
    constructor (code, message, details = {}) {
        super(message);
        this.name = 'RecorderError';
        this.code = code;
        this.details = details;
    }
}

const fail = (code, message, details) => {
    throw new RecorderError(code, message, details);
};

const assertSchema = (record, label) => {
    if (!record || record.schema !== RECORDER_SCHEMA) {
        fail('SCHEMA_MISMATCH',
            `${label} schema ${String(record && record.schema)} is not supported; expected ${RECORDER_SCHEMA}`,
            {expected: RECORDER_SCHEMA, actual: record && record.schema});
    }
};

const assertCursor = (value, label, min, max) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        fail('INVALID_CURSOR', `${label} ${String(value)} is outside retained range [${min}, ${max}]`,
            {cursor: value, min, max});
    }
};

const assertBudget = (value, label) => {
    if (value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) {
        throw new TypeError(`${label} must be a non-negative safe integer or Infinity`);
    }
};

const clone = value => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    // All supported browsers and the required Node runtime have structuredClone.
    fail('CLONE_UNAVAILABLE', 'This runtime cannot safely clone recording state');
};

/** Canonical JSON-like encoding used for byte estimates and replay hashing. */
export function canonicalStringify (value) {
    const active = new Set();
    const encode = item => {
        if (item === null) return 'null';
        if (typeof item === 'bigint') return `{"$bigint":${JSON.stringify(item.toString())}}`;
        if (typeof item === 'number') {
            if (!Number.isFinite(item)) fail('UNHASHABLE_VALUE', 'Replay values must contain only finite numbers');
            if (Object.is(item, -0)) return '-0';
            return JSON.stringify(item);
        }
        if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
        if (typeof item === 'undefined') return '{"$undefined":true}';
        if (typeof item === 'function' || typeof item === 'symbol') {
            fail('UNHASHABLE_VALUE', `Replay values cannot contain ${typeof item}`);
        }
        if (active.has(item)) fail('UNHASHABLE_VALUE', 'Replay values cannot contain cycles');
        active.add(item);
        let result;
        if (ArrayBuffer.isView(item) && !(item instanceof DataView)) {
            result = `{"$typed":${JSON.stringify(item.constructor.name)},"values":${encode(Array.from(item))}}`;
        } else if (item instanceof ArrayBuffer) {
            result = `{"$buffer":${encode(Array.from(new Uint8Array(item)))}}`;
        } else if (Array.isArray(item)) {
            result = `[${item.map(encode).join(',')}]`;
        } else {
            const keys = Object.keys(item).sort();
            result = `{${keys.map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
        }
        active.delete(item);
        return result;
    };
    return encode(value);
}

const utf8Bytes = value => new TextEncoder().encode(canonicalStringify(value)).byteLength;

/** Stable, dependency-free FNV-1a/64 hash of normalized replay values. */
export function hashReplayValues (values) {
    const bytes = new TextEncoder().encode(canonicalStringify(values));
    let hash = 0xcbf29ce484222325n;
    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
}

/** A structured gate: callers must stop replay when `matches` is false. */
export function compareReplayHash (expected, actualValues) {
    if (typeof expected !== 'string' || !/^[0-9a-f]{16}$/i.test(expected)) {
        fail('INVALID_HASH', 'Expected replay hash must be a 16-digit hexadecimal string');
    }
    const actual = hashReplayValues(actualValues);
    return {
        matches: expected.toLowerCase() === actual,
        expected: expected.toLowerCase(),
        actual,
        reason: expected.toLowerCase() === actual ? null : 'REPLAY_DIVERGED'
    };
}

/**
 * @param {object} [options]
 * @param {number} [options.checkpointBudgetBytes]
 * @param {number} [options.eventBudgetBytes]
 */
export function createDebugRecorder ({
    checkpointBudgetBytes = DEFAULT_CHECKPOINT_BUDGET,
    eventBudgetBytes = DEFAULT_EVENT_BUDGET
} = {}) {
    assertBudget(checkpointBudgetBytes, 'checkpointBudgetBytes');
    assertBudget(eventBudgetBytes, 'eventBudgetBytes');

    let inputs = [];
    let events = [];
    let checkpoints = [];
    let inputBaseCursor = 0;
    let nextInputCursor = 0;
    let lastEventSeq = -1;
    let nextCheckpointId = 0;
    let checkpointBytes = 0;
    let eventBytes = 0;
    let evictedCheckpoints = 0;

    const retention = () => ({
        checkpointBudgetBytes,
        eventBudgetBytes,
        checkpointBytes,
        eventBytes,
        overCheckpointBudget: checkpointBytes > checkpointBudgetBytes,
        overEventBudget: eventBytes > eventBudgetBytes,
        evictedCheckpoints,
        inputBaseCursor,
        nextInputCursor,
        firstEventSeq: events.length ? events[0].seq : null,
        lastEventSeq: events.length ? events.at(-1).seq : null
    });

    const evictAtBoundary = () => {
        while ((checkpointBytes > checkpointBudgetBytes || eventBytes > eventBudgetBytes) &&
               checkpoints.length > 1) {
            const removed = checkpoints.shift();
            const anchor = checkpoints[0];
            checkpointBytes -= removed._bytes;
            const discardedEvents = events.filter(event => event.seq < anchor.eventCursor);
            eventBytes -= discardedEvents.reduce((total, event) => total + event._bytes, 0);
            events = events.filter(event => event.seq >= anchor.eventCursor);
            inputs = inputs.filter(input => input.cursor >= anchor.inputCursor);
            inputBaseCursor = anchor.inputCursor;
            evictedCheckpoints++;
        }
    };

    return {
        appendInput (input) {
            assertSchema(input, 'Input');
            if (!input.time || typeof input.time !== 'object') {
                fail('INVALID_INPUT', 'Input requires a simulation time object');
            }
            if (typeof input.producer !== 'string' || !input.producer) {
                fail('INVALID_INPUT', 'Input requires a non-empty producer');
            }
            const stored = clone({...input, cursor: nextInputCursor, order: nextInputCursor});
            inputs.push(stored);
            nextInputCursor++;
            return clone(stored);
        },

        appendEvent (event) {
            assertSchema(event, 'Event');
            if (!checkpoints.length) {
                fail('NO_RESTORE_POINT', 'Create a checkpoint before recording events');
            }
            if (!Number.isSafeInteger(event.seq) || event.seq <= lastEventSeq) {
                fail('INVALID_EVENT_SEQUENCE',
                    `Event seq must be a safe integer greater than ${lastEventSeq}`,
                    {previous: lastEventSeq, actual: event.seq});
            }
            const value = clone(event);
            const stored = {...value, _bytes: utf8Bytes(value)};
            events.push(stored);
            eventBytes += stored._bytes;
            lastEventSeq = event.seq;
            return clone(value);
        },

        createCheckpoint (checkpoint) {
            assertSchema(checkpoint, 'Checkpoint');
            if (!Object.hasOwn(checkpoint, 'snapshot')) {
                fail('INVALID_CHECKPOINT', 'Checkpoint requires a target-owned snapshot');
            }
            const eventCursor = checkpoint.eventCursor;
            const minimumEventCursor = checkpoints.length ? checkpoints.at(-1).eventCursor : 0;
            assertCursor(eventCursor, 'eventCursor', minimumEventCursor, lastEventSeq + 1);
            assertCursor(checkpoint.inputCursor, 'inputCursor', inputBaseCursor, nextInputCursor);
            const value = clone({...checkpoint, id: checkpoint.id ?? nextCheckpointId});
            if (checkpoints.some(existing => existing.id === value.id)) {
                fail('DUPLICATE_CHECKPOINT', `Checkpoint id ${String(value.id)} already exists`);
            }
            nextCheckpointId++;
            const stored = {...value, _bytes: utf8Bytes(value)};
            checkpoints.push(stored);
            checkpointBytes += stored._bytes;
            evictAtBoundary();
            return clone(value);
        },

        /** Most recent retained checkpoint at or before an event cursor. */
        findCheckpoint (eventCursor) {
            const min = checkpoints.length ? checkpoints[0].eventCursor : 0;
            assertCursor(eventCursor, 'eventCursor', min, lastEventSeq + 1);
            for (let i = checkpoints.length - 1; i >= 0; i--) {
                if (checkpoints[i].eventCursor <= eventCursor) {
                    const {_bytes, ...checkpoint} = checkpoints[i];
                    return clone(checkpoint);
                }
            }
            fail('NO_RESTORE_POINT', `No retained checkpoint can restore event cursor ${eventCursor}`);
        },

        inputsFrom (cursor) {
            assertCursor(cursor, 'inputCursor', inputBaseCursor, nextInputCursor);
            return inputs.filter(input => input.cursor >= cursor).map(clone);
        },

        eventsFrom (eventCursor) {
            const min = checkpoints.length ? checkpoints[0].eventCursor : 0;
            assertCursor(eventCursor, 'eventCursor', min, lastEventSeq + 1);
            return events.filter(event => event.seq >= eventCursor).map(({_bytes, ...event}) => clone(event));
        },

        checkpoints: () => checkpoints.map(({_bytes, ...checkpoint}) => clone(checkpoint)),
        retention,

        clear () {
            inputs = [];
            events = [];
            checkpoints = [];
            inputBaseCursor = 0;
            nextInputCursor = 0;
            lastEventSeq = -1;
            nextCheckpointId = 0;
            checkpointBytes = 0;
            eventBytes = 0;
            evictedCheckpoints = 0;
        }
    };
}
