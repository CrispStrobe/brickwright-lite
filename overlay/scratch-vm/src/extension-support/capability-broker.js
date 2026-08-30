/**
 * Closed, semantic capability vocabulary. Values describe public broker operations, never native
 * command names. Adding an operation is a security review: unknown names and wildcards fail closed.
 */
const VOCABULARY_VERSION = 1;
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
        this._sessions.set(worker, {hostRecord, declared, requestIds: new Set(), active: true});
    }

    /** Permanently revoke the worker's current session. The same object cannot submit more requests. */
    revoke (worker) {
        const session = this._sessions.get(worker);
        if (session) session.active = false;
        this._sessions.delete(worker);
    }

    /**
     * Validate and execute one semantic request. Authorization comes exclusively from the WeakMap
     * entry for `worker`; caller-supplied URL, slug, digest, worker ID, or reply fields are invalid.
     */
    async request (worker, envelope) {
        const session = this._sessions.get(worker);
        if (!session || !session.active) throw new Error('Capability worker is not active');
        if (!isPlainRecord(envelope) ||
            !hasOnlyKeys(envelope, ['protocol', 'requestId', 'operation', 'args'])) {
            throw new Error('Invalid capability request envelope');
        }
        if (envelope.protocol !== VOCABULARY_VERSION || !Number.isSafeInteger(envelope.requestId) ||
            envelope.requestId < 0 || typeof envelope.operation !== 'string') {
            throw new Error('Invalid capability request envelope');
        }
        if (session.requestIds.has(envelope.requestId)) throw new Error('Replayed capability request');
        session.requestIds.add(envelope.requestId);

        const definition = OPERATIONS[envelope.operation];
        if (!definition || envelope.operation.includes('*')) throw new Error('Unknown capability operation');
        if (!session.declared.has(envelope.operation)) throw new Error('Capability was not declared');
        if (!definition.validate(envelope.args)) throw new Error('Invalid capability arguments');
        const handler = this._handlers[envelope.operation];
        if (typeof handler !== 'function') throw new Error('Capability operation is unavailable');

        const result = await handler(Object.freeze(Object.assign({}, envelope.args)), session.hostRecord);
        if (!session.active || this._sessions.get(worker) !== session) {
            throw new Error('Stale capability reply after revocation');
        }
        return result;
    }
}

module.exports = {CapabilityBroker, OPERATIONS, VOCABULARY_VERSION};
