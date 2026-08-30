/**
 * Closed, semantic capability vocabulary. Values describe public broker operations, never native
 * command names. Adding an operation is a security review: unknown names and wildcards fail closed.
 */
const VOCABULARY_VERSION = 1;
const MAX_DIAGNOSTICS = 256;
const OPERATIONS = Object.freeze({
    'project.metadata.read': Object.freeze({
        validate: args => {
            if (!isPlainRecord(args) || !hasOnlyKeys(args, ['field'])) return false;
            return args.field === 'title' || args.field === 'locale';
        }
    })
});

const isPlainRecord = value => Boolean(value) && typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype;
const hasOnlyKeys = (value, allowed) => {
    const keys = Object.keys(value);
    return keys.length === allowed.length && keys.every(key => allowed.includes(key));
};

class CapabilityBroker {
    /**
     * @param {object} handlers semantic operation handlers, keyed by vocabulary operation
     */
    constructor (handlers = {}) {
        this._handlers = Object.assign(Object.create(null), handlers);
        this._sessions = new WeakMap();
        this._diagnostics = [];
        this._diagnosticSequence = 0;
    }

    _record (session, event, code, operation) {
        const hostRecord = session && session.hostRecord;
        const entry = Object.freeze({
            seq: this._diagnosticSequence++,
            time: Date.now(),
            event,
            workerId: hostRecord ? hostRecord.workerId : null,
            slug: hostRecord ? hostRecord.slug : null,
            declared: Object.freeze(session ? Array.from(session.declared).sort() : []),
            operation: OPERATIONS[operation] ? operation : null,
            code
        });
        this._diagnostics.push(entry);
        if (this._diagnostics.length > MAX_DIAGNOSTICS) {
            this._diagnostics.splice(0, this._diagnostics.length - MAX_DIAGNOSTICS);
        }
    }

    _refuse (session, code, message, operation) {
        this._record(session, 'refused', code, operation);
        const error = new Error(message);
        error.code = code;
        throw error;
    }

    /** A frozen, redacted copy suitable for product diagnostics. */
    diagnostics () {
        return Object.freeze(this._diagnostics.slice());
    }

    /** Bind authorization to the worker object and manager-created immutable host record. */
    attach (worker, hostRecord) {
        if (!worker || !hostRecord || !Object.isFrozen(hostRecord) || hostRecord.protocol !== 1 ||
            !Number.isInteger(hostRecord.workerId) || !Array.isArray(hostRecord.capabilities) ||
            !Object.isFrozen(hostRecord.capabilities)) {
            throw new Error('Capability broker requires an immutable host worker record');
        }
        if (this._sessions.has(worker)) throw new Error('Capability worker is already attached');
        const declared = new Set();
        for (const capability of hostRecord.capabilities) {
            if (typeof capability !== 'string' || capability.includes('*') || !OPERATIONS[capability]) {
                throw new Error(`Unknown capability declaration: ${String(capability)}`);
            }
            declared.add(capability);
        }
        const session = {hostRecord, declared, lastRequestId: -1, active: true};
        this._sessions.set(worker, session);
        this._record(session, 'attached', 'worker-attached', null);
    }

    /** Permanently revoke the worker's current session. The same object cannot submit more requests. */
    revoke (worker) {
        const session = this._sessions.get(worker);
        if (session) {
            session.active = false;
            this._record(session, 'revoked', 'worker-revoked', null);
        }
        this._sessions.delete(worker);
    }

    /**
     * Validate and execute one semantic request. Authorization comes exclusively from the WeakMap
     * entry for `worker`; caller-supplied URL, slug, digest, worker ID, or reply fields are invalid.
     */
    async request (worker, envelope) {
        const session = this._sessions.get(worker);
        if (!session || !session.active) {
            return this._refuse(session, 'invalid-session', 'Capability worker is not active', null);
        }
        if (!isPlainRecord(envelope) ||
            !hasOnlyKeys(envelope, ['protocol', 'requestId', 'operation', 'args'])) {
            return this._refuse(session, 'invalid-envelope', 'Invalid capability request envelope', null);
        }
        if (envelope.protocol !== VOCABULARY_VERSION || !Number.isSafeInteger(envelope.requestId) ||
            envelope.requestId < 0 || typeof envelope.operation !== 'string') {
            return this._refuse(session, 'invalid-envelope', 'Invalid capability request envelope', null);
        }
        if (envelope.requestId <= session.lastRequestId) {
            return this._refuse(session, 'replayed-request', 'Replayed capability request', envelope.operation);
        }
        session.lastRequestId = envelope.requestId;

        const definition = OPERATIONS[envelope.operation];
        if (!definition || envelope.operation.includes('*')) {
            return this._refuse(session, 'unknown-operation', 'Unknown capability operation', envelope.operation);
        }
        if (!session.declared.has(envelope.operation)) {
            return this._refuse(session, 'undeclared-operation', 'Capability was not declared', envelope.operation);
        }
        if (!definition.validate(envelope.args)) {
            return this._refuse(session, 'invalid-arguments', 'Invalid capability arguments', envelope.operation);
        }
        const handler = this._handlers[envelope.operation];
        if (typeof handler !== 'function') {
            return this._refuse(session, 'unavailable-operation', 'Capability operation is unavailable',
                envelope.operation);
        }

        let result;
        try {
            result = await handler(Object.freeze(Object.assign({}, envelope.args)), session.hostRecord);
        } catch {
            return this._refuse(session, 'operation-failed', 'Capability operation failed', envelope.operation);
        }
        if (!session.active || this._sessions.get(worker) !== session) {
            return this._refuse(session, 'stale-reply', 'Stale capability reply after revocation', envelope.operation);
        }
        this._record(session, 'allowed', 'operation-allowed', envelope.operation);
        return result;
    }
}

module.exports = {CapabilityBroker, MAX_DIAGNOSTICS, OPERATIONS, VOCABULARY_VERSION};
