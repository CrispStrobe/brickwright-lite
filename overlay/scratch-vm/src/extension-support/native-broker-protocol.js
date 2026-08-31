// Pure broker-realm policy state only. Transport registration and dependency cancellation/deadlines
// (AbortSignal) remain intentionally deferred until the owning realm and transport are wired.
const PROTOCOL_VERSION = 1;
const LIMITS = Object.freeze({maxWorkers: 64, maxPending: 64, maxExtensions: 16, maxMethods: 256,
    maxDepth: 16, maxNodes: 1024, maxBytes: 65536});
const plain = x => Boolean(x) && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype;
const internalErrors = new WeakSet();
const exact = (x, keys) => {
    try {
        if (!plain(x)) return false;
        const descriptors = Object.getOwnPropertyDescriptors(x);
        const ownKeys = Reflect.ownKeys(descriptors);
        return ownKeys.every(key => typeof key === 'string' && Object.hasOwn(descriptors[key], 'value')) &&
            ownKeys.slice().sort().join('\0') === keys.slice().sort().join('\0');
    } catch {
        return false;
    }
};
class BrokerProtocolError extends Error {
    constructor (code) { super('Native broker request refused'); this.name = 'BrokerProtocolError'; this.code = code; }
    toJSON () { return {name: this.name, code: this.code, message: this.message}; }
}
const refusal = code => {
    const error = new BrokerProtocolError(code);
    internalErrors.add(error);
    return error;
};

class NativeBrokerProtocol {
    constructor (options = {}) {
        const {owner, resolvePin, loadWorker, callWorker, revokeWorker = () => {}, terminateWorker = () => {}} = options;
        if (!owner || !['object', 'function'].includes(typeof owner)) throw new TypeError('Owner object required');
        if ([resolvePin, loadWorker, callWorker, revokeWorker, terminateWorker].some(x => typeof x !== 'function')) {
            throw new TypeError('Broker dependencies required');
        }
        this._limits = {};
        for (const [key, fallback] of Object.entries(LIMITS)) {
            const value = options[key] === undefined ? fallback : options[key];
            if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid broker limit');
            this._limits[key] = value;
        }
        const known = new Set(['owner', 'resolvePin', 'loadWorker', 'callWorker', 'revokeWorker', 'terminateWorker',
            ...Object.keys(LIMITS)]);
        if (Object.keys(options).some(key => !known.has(key))) throw new TypeError('Unknown broker option');
        Object.assign(this, {_owner: owner, _resolvePin: resolvePin, _loadWorker: loadWorker, _callWorker: callWorker,
            _revokeWorker: revokeWorker, _terminateWorker: terminateWorker});
        this._lastRequestId = -1; this._nextWorkerId = 0; this._workers = new Map();
        this._pending = new Set(); this._closed = false;
    }
    _authorize (owner) {
        if (owner !== this._owner) throw refusal('invalid-owner');
        if (this._closed) throw refusal('closed');
    }
    _begin (owner, envelope, keys) {
        this._authorize(owner); // Must precede every parse and sequence mutation.
        let request;
        try {
            if (!exact(envelope, keys)) throw refusal('invalid-envelope');
            const descriptors = Object.getOwnPropertyDescriptors(envelope);
            request = {};
            for (const key of keys) {
                const descriptor = descriptors[key];
                if (!descriptor.enumerable) throw refusal('invalid-envelope');
                Object.defineProperty(request, key, {value: descriptor.value, enumerable: true});
            }
            Object.freeze(request);
        } catch (error) {
            throw internalErrors.has(error) ? error : refusal('invalid-envelope');
        }
        if (request.protocol !== 1 || !Number.isSafeInteger(request.requestId) || request.requestId < 0) {
            throw refusal('invalid-envelope');
        }
        if (request.requestId <= this._lastRequestId) throw refusal('replayed-request');
        if (request.requestId !== this._lastRequestId + 1) throw refusal('out-of-order-request');
        if (this._pending.size >= this._limits.maxPending) throw refusal('capacity');
        this._lastRequestId = request.requestId; this._pending.add(request.requestId);
        return request;
    }
    _clone (value) {
        try {
            return this._cloneChecked(value);
        } catch (error) {
            throw internalErrors.has(error) ? error : refusal('invalid-data');
        }
    }
    _cloneChecked (value) {
        let nodes = 0; const seen = new Set();
        const visit = (item, depth) => {
            if (++nodes > this._limits.maxNodes || depth > this._limits.maxDepth) throw refusal('invalid-data');
            if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
            if (typeof item === 'number') { if (!Number.isFinite(item)) throw refusal('invalid-data'); return item; }
            if (typeof item !== 'object' || seen.has(item)) throw refusal('invalid-data');
            seen.add(item); let copy;
            if (Array.isArray(item)) {
                const descriptors = Object.getOwnPropertyDescriptors(item);
                const keys = Reflect.ownKeys(descriptors);
                if (Object.keys(item).length !== item.length || keys.some(key => typeof key !== 'string' ||
                    (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) || keys.some(key =>
                    key !== 'length' && !Object.hasOwn(descriptors[key], 'value'))) throw refusal('invalid-data');
                copy = [];
                for (let index = 0; index < item.length; index++) {
                    copy.push(visit(descriptors[String(index)].value, depth + 1));
                }
            } else {
                if (!plain(item)) throw refusal('invalid-data'); copy = {};
                const descriptors = Object.getOwnPropertyDescriptors(item);
                if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string')) throw refusal('invalid-data');
                for (const [key, descriptor] of Object.entries(descriptors)) {
                    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw refusal('invalid-data');
                    Object.defineProperty(copy, key, {value: visit(descriptor.value, depth + 1), enumerable: true,
                        configurable: false, writable: false});
                }
            }
            seen.delete(item); return Object.freeze(copy);
        };
        const copy = visit(value, 0);
        if (new TextEncoder().encode(JSON.stringify(copy)).byteLength > this._limits.maxBytes) throw refusal('invalid-data');
        return copy;
    }
    async _cleanup (state) {
        if (state.cleaned) return;
        if (state.creationSettled) await state.creationSettled;
        if (state.cleaned) return;
        state.cleaned = true;
        state.active = false; this._workers.delete(state.workerId);
        try { await this._revokeWorker(state); } catch {} // Termination remains mandatory.
        try { await this._terminateWorker(state); } catch {} // Never expose dependency errors.
    }
    _methodArray (value) {
        if (!Array.isArray(value) || value.length > this._limits.maxMethods) throw refusal('invalid-registration');
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.some(key => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) ||
            Object.keys(value).length !== value.length) throw refusal('invalid-registration');
        const result = [];
        for (let index = 0; index < value.length; index++) {
            const descriptor = descriptors[String(index)];
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
                typeof descriptor.value !== 'string' || descriptor.value.length > 128 ||
                !/^[A-Za-z0-9_]+$/.test(descriptor.value)) throw refusal('invalid-registration');
            result.push(descriptor.value);
        }
        return result;
    }
    async load (owner, envelope) {
        const request = this._begin(owner, envelope, ['protocol', 'requestId', 'url']); let state; let attempted = false;
        try {
            if (typeof request.url !== 'string' || !/^https:\/\//.test(request.url)) throw refusal('invalid-url');
            if (this._workers.size >= this._limits.maxWorkers || this._nextWorkerId >= Number.MAX_SAFE_INTEGER) {
                throw refusal('capacity');
            }
            const workerId = this._nextWorkerId++;
            let settleCreation;
            state = {workerId, pin: null, extensions: new Map(), active: true, loading: true, cleaned: false,
                creationSettled: new Promise(resolve => { settleCreation = resolve; })};
            state.settleCreation = settleCreation;
            this._workers.set(workerId, state); // Reserve before any await.
            let pin; try { pin = await this._resolvePin(request.url); } catch { throw refusal('operation-failed'); }
            if (!pin || !Object.isFrozen(pin) || pin.url !== request.url || typeof pin.source !== 'string' ||
                !Array.isArray(pin.capabilities) || !Object.isFrozen(pin.capabilities)) throw refusal('unpinned-url');
            if (this._closed || !state.active) throw refusal('stale-reply');
            state.pin = pin; let registration;
            try { attempted = true; registration = await this._loadWorker(pin, workerId); } catch {
                throw refusal('operation-failed');
            } finally {
                state.settleCreation();
                state.creationSettled = null;
            }
            try {
                if (!plain(registration) || !exact(registration, ['extensions']) ||
                    !Array.isArray(registration.extensions) || !registration.extensions.length ||
                    registration.extensions.length > this._limits.maxExtensions) {
                    throw refusal('invalid-registration');
                }
                const extensionDescriptors = Object.getOwnPropertyDescriptors(registration.extensions);
                const extensionKeys = Reflect.ownKeys(extensionDescriptors);
                if (Object.keys(registration.extensions).length !== registration.extensions.length ||
                    extensionKeys.some(key => typeof key !== 'string' ||
                        (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) || extensionKeys.some(key =>
                        key !== 'length' && (!extensionDescriptors[key].enumerable ||
                            !Object.hasOwn(extensionDescriptors[key], 'value')))) throw refusal('invalid-registration');
                const providerIds = new Set(); let methodCount = 0;
                for (let index = 0; index < registration.extensions.length; index++) {
                    const item = extensionDescriptors[String(index)].value;
                    if (!exact(item, ['extensionId', 'opcodes', 'menus']) || !Number.isSafeInteger(item.extensionId) ||
                        item.extensionId < 0 || providerIds.has(item.extensionId)) throw refusal('invalid-registration');
                    const opcodes = this._methodArray(item.opcodes);
                    const menus = this._methodArray(item.menus);
                    methodCount += opcodes.length + menus.length;
                    if (methodCount > this._limits.maxMethods) throw refusal('invalid-registration');
                    providerIds.add(item.extensionId); const methods = new Set([...opcodes, ...menus]);
                    if (methods.size !== opcodes.length + menus.length) throw refusal('invalid-registration');
                    state.extensions.set(state.extensions.size, {providerExtensionId: item.extensionId, methods});
                }
            } catch (error) {
                throw internalErrors.has(error) ? error : refusal('invalid-registration');
            }
            state.loading = false;
            if (this._closed || !state.active || this._workers.get(workerId) !== state) throw refusal('stale-reply');
            return Object.freeze({protocol: 1, requestId: request.requestId, workerId,
                extensionIds: Object.freeze([...state.extensions.keys()])});
        } catch (error) {
            if (state) {
                if (state.creationSettled && !attempted) {
                    state.settleCreation(); state.creationSettled = null;
                }
                if (attempted) await this._cleanup(state); else this._workers.delete(state.workerId);
            }
            throw internalErrors.has(error) ? error : refusal('operation-failed');
        } finally { this._pending.delete(request.requestId); }
    }
    async call (owner, envelope) {
        const request = this._begin(owner, envelope,
            ['protocol', 'requestId', 'workerId', 'extensionId', 'method', 'args']);
        try {
            if (!Number.isSafeInteger(request.workerId) || !Number.isSafeInteger(request.extensionId) ||
                typeof request.method !== 'string') throw refusal('invalid-envelope');
            const args = this._clone(request.args); if (!plain(args)) throw refusal('invalid-data');
            const state = this._workers.get(request.workerId);
            if (!state || !state.active || state.loading) throw refusal('unknown-worker');
            const extension = state.extensions.get(request.extensionId);
            if (!extension) throw refusal('unknown-extension');
            if (!extension.methods.has(request.method)) throw refusal('unknown-method');
            let raw; try { raw = await this._callWorker(state, extension.providerExtensionId, request.method,
                Object.freeze(args)); } catch { throw refusal('operation-failed'); }
            if (this._closed || !state.active || this._workers.get(request.workerId) !== state) throw refusal('stale-reply');
            return Object.freeze({protocol: 1, requestId: request.requestId, result: this._clone(raw)});
        } finally { this._pending.delete(request.requestId); }
    }
    async terminate (owner, envelope) {
        const request = this._begin(owner, envelope, ['protocol', 'requestId', 'workerId']);
        try {
            if (!Number.isSafeInteger(request.workerId)) throw refusal('invalid-envelope');
            const state = this._workers.get(request.workerId);
            if (!state || !state.active) throw refusal('unknown-worker');
            await this._cleanup(state);
            return Object.freeze({protocol: 1, requestId: request.requestId, terminated: true});
        } finally { this._pending.delete(request.requestId); }
    }
    async dispose (owner) {
        this._authorize(owner); this._closed = true;
        const states = [...this._workers.values()]; states.forEach(state => { state.active = false; });
        this._workers.clear(); await Promise.all(states.map(state => this._cleanup(state)));
    }
    snapshot (owner) { this._authorize(owner); return Object.freeze({workers: this._workers.size, pending: this._pending.size}); }
}
module.exports = {BrokerProtocolError, LIMITS, NativeBrokerProtocol, PROTOCOL_VERSION};
