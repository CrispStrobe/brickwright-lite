/**
 * Versioned, decoded debugger events and the small loss-bounded live ring.
 *
 * This is deliberately an object-level reference implementation. Cycle cores
 * will eventually write a compact typed representation, but consumers must see
 * exactly these validation, ordering and loss semantics after decoding.
 */

export const DEBUG_EVENT_SCHEMA = 1;

export const DEBUG_EVENT_FIDELITIES = Object.freeze([
    'recorded', 'predicted', 'reconstructed'
]);

export const DEBUG_EVENT_KINDS = Object.freeze([
    'instruction', 'bus', 'memory', 'port', 'interrupt', 'signal', 'device', 'scheduler'
]);

const TOP_LEVEL_FIELDS = new Set([
    'schema', 'seq', 'time', 'cpuId', 'kind', 'phase', 'fidelity',
    'pcBefore', 'pcAfter', 'instruction', 'registersAfter', 'changes', 'memory', 'source',
    'device', 'signals', 'signal', 'port', 'interrupt', 'register', 'cause',
    'checkpoint', 'inputCursor', 'requiredFields'
]);

const fail = message => { throw new TypeError(`Invalid debug event: ${message}`); };

const asOrdinal = (value, name) => {
    if (typeof value === 'bigint') {
        if (value < 0n) fail(`${name} must be non-negative`);
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value < 0) fail(`${name} must be a non-negative safe integer`);
        return BigInt(value);
    }
    if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value);
    fail(`${name} must be an integer, bigint, or canonical hexadecimal string`);
};

const cloneValue = value => {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
        return out;
    }
    return value;
};

/** Validate and defensively copy a public decoded schema-v1 event. */
export function normalizeDebugEvent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('event must be an object');
    if (input.schema !== DEBUG_EVENT_SCHEMA) fail(`unsupported schema ${String(input.schema)}`);
    if (input.requiredFields !== undefined) {
        if (!Array.isArray(input.requiredFields) || input.requiredFields.some(x => typeof x !== 'string')) {
            fail('requiredFields must be an array of field names');
        }
        const unknown = input.requiredFields.find(field => !TOP_LEVEL_FIELDS.has(field));
        if (unknown) fail(`unknown required field ${unknown}`);
        const missing = input.requiredFields.find(field => input[field] === undefined);
        if (missing) fail(`missing required field ${missing}`);
    }
    asOrdinal(input.seq, 'seq');
    if (!input.time || typeof input.time !== 'object' || Array.isArray(input.time)) fail('time is required');
    asOrdinal(input.time.ticks, 'time.ticks');
    if (typeof input.time.domain !== 'string' || input.time.domain.length === 0) fail('time.domain is required');
    if (input.time.hz !== undefined && (!Number.isFinite(input.time.hz) || input.time.hz <= 0)) {
        fail('time.hz must be positive');
    }
    if (typeof input.cpuId !== 'string' || input.cpuId.length === 0) fail('cpuId is required');
    if (!DEBUG_EVENT_KINDS.includes(input.kind)) fail(`unknown kind ${String(input.kind)}`);
    if (!DEBUG_EVENT_FIDELITIES.includes(input.fidelity)) fail(`unknown fidelity ${String(input.fidelity)}`);
    if (input.kind === 'instruction' && input.phase === 'retire' &&
        (input.pcBefore === undefined || input.pcAfter === undefined)) {
        fail('instruction retire requires pcBefore and pcAfter');
    }
    if (input.kind === 'memory') {
        const memory = input.memory;
        if (!memory || typeof memory !== 'object' || typeof memory.space !== 'string' ||
            memory.address === undefined || memory.value === undefined) {
            fail('memory event requires space, address, and value');
        }
    }
    if (input.kind === 'port' && (!input.port || input.port.address === undefined ||
        typeof input.port.direction !== 'string')) {
        fail('port event requires address and direction');
    }
    if (input.kind === 'signal' && (!input.signal || typeof input.signal.name !== 'string' ||
        input.signal.value === undefined)) {
        fail('signal event requires name and value');
    }
    if (input.kind === 'interrupt' && !input.interrupt) {
        fail('interrupt event requires interrupt details');
    }

    // Unknown optional fields are intentionally ignored. New producers can add
    // them without changing what an older consumer signs or persists.
    const event = {};
    for (const key of TOP_LEVEL_FIELDS) {
        if (input[key] !== undefined && key !== 'requiredFields') event[key] = cloneValue(input[key]);
    }
    return event;
}

/** Deterministic JSON; bigint values cross the boundary as canonical hex. */
export function serializeDebugEvent(value) {
    const canonical = item => {
        if (typeof item === 'bigint') return `0x${item.toString(16)}`;
        if (Array.isArray(item)) return item.map(canonical);
        if (item && typeof item === 'object') {
            const out = {};
            for (const key of Object.keys(item).sort()) out[key] = canonical(item[key]);
            return out;
        }
        return item;
    };
    return JSON.stringify(canonical(value));
}

/** Parse serialized data and re-apply the public schema validation. */
export function deserializeDebugEvent(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        fail(`malformed JSON (${error.message})`);
    }
    return normalizeDebugEvent(parsed);
}

/**
 * A bounded producer ring with bulk drain. Loss is returned as an explicit
 * marker immediately before the retained batch and is never reset silently.
 */
export function createDebugEventStream({capacity = 1024} = {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
        throw new RangeError('debug event stream capacity must be a positive integer');
    }
    const ring = new Array(capacity);
    const lastTime = new Map();
    let start = 0;
    let length = 0;
    let lastSeq = null;
    let nextSeq = 0;
    let totalDropped = 0;
    let undrainedDropped = 0;
    const listeners = new Set();

    return {
        append(input) {
            const event = normalizeDebugEvent(input);
            const seq = asOrdinal(event.seq, 'seq');
            if (lastSeq !== null && seq <= lastSeq) fail('seq must be strictly increasing');
            const ticks = asOrdinal(event.time.ticks, 'time.ticks');
            const prior = lastTime.get(event.time.domain);
            if (prior !== undefined && ticks < prior) fail(`time decreased in domain ${event.time.domain}`);

            lastSeq = seq;
            if (seq >= BigInt(nextSeq)) {
                const following = seq + 1n;
                nextSeq = following <= BigInt(Number.MAX_SAFE_INTEGER)
                    ? Number(following) : following;
            }
            lastTime.set(event.time.domain, ticks);
            if (length < capacity) {
                ring[(start + length) % capacity] = event;
                length++;
            } else {
                ring[start] = event;
                start = (start + 1) % capacity;
                totalDropped++;
                undrainedDropped++;
            }
            for (const listener of listeners) listener(event);
            return event;
        },

        /**
         * Publish an event from a target producer. Targets deliberately do
         * not allocate stream sequence numbers: several CPUs, devices and the
         * compatibility trace can share this ring, and only the ring knows
         * their total order.
         */
        publish(input) {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                fail('event must be an object');
            }
            return this.append({...input, schema: DEBUG_EVENT_SCHEMA, seq: nextSeq});
        },

        drain(max = length) {
            if (!Number.isSafeInteger(max) || max < 0) throw new RangeError('drain max must be non-negative');
            const count = Math.min(max, length);
            const batch = [];
            if (undrainedDropped > 0 && count > 0) {
                batch.push(Object.freeze({
                    schema: DEBUG_EVENT_SCHEMA,
                    kind: 'gap',
                    dropped: undrainedDropped,
                    beforeSeq: ring[start].seq
                }));
                undrainedDropped = 0;
            }
            for (let i = 0; i < count; i++) batch.push(ring[(start + i) % capacity]);
            start = (start + count) % capacity;
            length -= count;
            return batch;
        },

        size: () => length,
        dropped: () => totalDropped,
        nextSequence: () => nextSeq,
        onEvent (listener) {
            if (typeof listener !== 'function') throw new TypeError('event listener must be a function');
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        clear() {
            start = 0;
            length = 0;
            lastSeq = null;
            nextSeq = 0;
            totalDropped = 0;
            undrainedDropped = 0;
            lastTime.clear();
        }
    };
}
