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
const DEFAULT_INPUT_BUDGET = 8 * 1024 * 1024;

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
        } else if (item instanceof DataView) {
            result = `{"$dataView":${encode(Array.from(
                new Uint8Array(item.buffer, item.byteOffset, item.byteLength)))}}`;
        } else if (item instanceof ArrayBuffer) {
            result = `{"$buffer":${encode(Array.from(new Uint8Array(item)))}}`;
        } else if (Array.isArray(item)) {
            result = `[${item.map(encode).join(',')}]`;
        } else {
            const prototype = Object.getPrototypeOf(item);
            if (prototype !== Object.prototype && prototype !== null) {
                fail('UNHASHABLE_VALUE',
                    `Replay values cannot contain ${item.constructor?.name || 'non-plain objects'}`);
            }
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
 * Compare two ordered replay ranges and identify the first divergent entry.
 * The values themselves stay with the caller: diagnostics contain hashes and
 * cursors, not potentially large or sensitive snapshots/input payloads.
 */
export function compareReplayValues (expectedValues, actualValues, {baseCursor = 0} = {}) {
    if (!Array.isArray(expectedValues) || !Array.isArray(actualValues)) {
        throw new TypeError('Replay ranges must be arrays');
    }
    if (!Number.isSafeInteger(baseCursor) || baseCursor < 0) {
        throw new TypeError('baseCursor must be a non-negative safe integer');
    }
    const length = Math.max(expectedValues.length, actualValues.length);
    for (let index = 0; index < length; index++) {
        const expectedPresent = index < expectedValues.length;
        const actualPresent = index < actualValues.length;
        const expectedHash = expectedPresent ? hashReplayValues(expectedValues[index]) : null;
        const actualHash = actualPresent ? hashReplayValues(actualValues[index]) : null;
        if (expectedHash !== actualHash) {
            return {
                matches: false,
                reason: 'REPLAY_DIVERGED',
                cursor: baseCursor + index,
                expectedHash,
                actualHash,
                expectedPresent,
                actualPresent
            };
        }
    }
    return {
        matches: true,
        reason: null,
        cursor: baseCursor + length,
        expectedHash: hashReplayValues(expectedValues),
        actualHash: hashReplayValues(actualValues)
    };
}

/**
 * @param {object} [options]
 * @param {number} [options.checkpointBudgetBytes]
 * @param {number} [options.eventBudgetBytes]
 */
export function createDebugRecorder ({
    checkpointBudgetBytes = DEFAULT_CHECKPOINT_BUDGET,
    eventBudgetBytes = DEFAULT_EVENT_BUDGET,
    inputBudgetBytes = DEFAULT_INPUT_BUDGET
} = {}) {
    assertBudget(checkpointBudgetBytes, 'checkpointBudgetBytes');
    assertBudget(eventBudgetBytes, 'eventBudgetBytes');
    assertBudget(inputBudgetBytes, 'inputBudgetBytes');

    let inputs = [];
    let events = [];
    let checkpoints = [];
    let inputBaseCursor = 0;
    let nextInputCursor = 0;
    let lastEventSeq = -1;
    let nextCheckpointId = 0;
    let checkpointBytes = 0;
    let eventBytes = 0;
    let inputBytes = 0;
    let evictedCheckpoints = 0;
    const lastInputTime = new Map();

    const retention = () => ({
        checkpointBudgetBytes,
        eventBudgetBytes,
        inputBudgetBytes,
        checkpointBytes,
        eventBytes,
        inputBytes,
        overCheckpointBudget: checkpointBytes > checkpointBudgetBytes,
        overEventBudget: eventBytes > eventBudgetBytes,
        overInputBudget: inputBytes > inputBudgetBytes,
        evictedCheckpoints,
        inputBaseCursor,
        nextInputCursor,
        firstEventSeq: events.length ? events[0].seq : null,
        lastEventSeq: events.length ? events.at(-1).seq : null
    });

    const evictAtBoundary = () => {
        while ((checkpointBytes > checkpointBudgetBytes || eventBytes > eventBudgetBytes ||
                inputBytes > inputBudgetBytes) &&
               checkpoints.length > 1) {
            const removed = checkpoints.shift();
            const anchor = checkpoints[0];
            checkpointBytes -= removed._bytes;
            const discardedEvents = events.filter(event => event.seq < anchor.eventCursor);
            eventBytes -= discardedEvents.reduce((total, event) => total + event._bytes, 0);
            events = events.filter(event => event.seq >= anchor.eventCursor);
            const discardedInputs = inputs.filter(input => input.cursor < anchor.inputCursor);
            inputBytes -= discardedInputs.reduce((total, input) => total + input._bytes, 0);
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
            if ((typeof input.time.ticks !== 'number' && typeof input.time.ticks !== 'bigint') ||
                typeof input.time.domain !== 'string' || !input.time.domain) {
                fail('INVALID_INPUT', 'Input time requires numeric ticks and a non-empty domain');
            }
            if (typeof input.time.ticks === 'number' && !Number.isSafeInteger(input.time.ticks)) {
                fail('INVALID_INPUT', 'Input time ticks must be a safe integer');
            }
            const ticks = BigInt(input.time.ticks);
            if (ticks < 0n) fail('INVALID_INPUT', 'Input time ticks must be non-negative');
            const previous = lastInputTime.get(input.time.domain);
            if (previous !== undefined && ticks < previous) {
                fail('INVALID_INPUT_ORDER',
                    `Input time decreased in domain ${input.time.domain}`,
                    {domain: input.time.domain, previous, actual: ticks});
            }
            const value = clone({...input, cursor: nextInputCursor, order: nextInputCursor});
            const stored = {...value, _bytes: utf8Bytes(value)};
            inputs.push(stored);
            inputBytes += stored._bytes;
            lastInputTime.set(input.time.domain, ticks);
            nextInputCursor++;
            return clone(value);
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
            if (event.seq !== lastEventSeq + 1) {
                fail('EVENT_SEQUENCE_GAP',
                    `Lossless recording expected event seq ${lastEventSeq + 1}, got ${event.seq}`,
                    {expected: lastEventSeq + 1, actual: event.seq});
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
            if (!checkpoint.time || typeof checkpoint.time !== 'object') {
                fail('INVALID_CHECKPOINT', 'Checkpoint requires a simulation time object');
            }
            const eventCursor = checkpoint.eventCursor;
            const minimumEventCursor = checkpoints.length ? checkpoints.at(-1).eventCursor : 0;
            const maximumEventCursor = checkpoints.length ? lastEventSeq + 1 : Number.MAX_SAFE_INTEGER;
            assertCursor(eventCursor, 'eventCursor', minimumEventCursor, maximumEventCursor);
            assertCursor(checkpoint.inputCursor, 'inputCursor', inputBaseCursor, nextInputCursor);
            while (checkpoints.some(existing => existing.id === nextCheckpointId)) nextCheckpointId++;
            const value = clone({...checkpoint, id: checkpoint.id ?? nextCheckpointId});
            if (checkpoints.some(existing => existing.id === value.id)) {
                fail('DUPLICATE_CHECKPOINT', `Checkpoint id ${String(value.id)} already exists`);
            }
            if (checkpoint.id == null || checkpoint.id === nextCheckpointId) nextCheckpointId++;
            const stored = {...value, _bytes: utf8Bytes(value)};
            checkpoints.push(stored);
            checkpointBytes += stored._bytes;
            if (checkpoints.length === 1) lastEventSeq = eventCursor - 1;
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
            return inputs.filter(input => input.cursor >= cursor)
                .map(({_bytes, ...input}) => clone(input));
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
            inputBytes = 0;
            evictedCheckpoints = 0;
            lastInputTime.clear();
        }
    };
}
