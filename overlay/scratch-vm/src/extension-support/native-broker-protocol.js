// Pure broker-realm policy. Transport registration remains intentionally deferred.
const PROTOCOL_VERSION = 1;
const LIMITS = Object.freeze({maxWorkers: 64, maxPending: 64, maxExtensions: 16, maxMethods: 256,
    maxDepth: 16, maxNodes: 1024, maxBytes: 65536});
const plain = x => Boolean(x) && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype;
const marked = new WeakSet();
class BrokerProtocolError extends Error {
    constructor (code) { super('Native broker request refused'); this.name = 'BrokerProtocolError'; this.code = code; }
    toJSON () { return {name: this.name, code: this.code, message: this.message}; }
}
const refusal = code => { const e = new BrokerProtocolError(code); marked.add(e); return e; };
const exact = (x, keys) => {
    try {
        if (!plain(x)) return false;
        const d = Object.getOwnPropertyDescriptors(x); const actual = Reflect.ownKeys(d);
        return actual.every(k => typeof k === 'string' && d[k].enumerable && Object.hasOwn(d[k], 'value')) &&
            actual.slice().sort().join('\0') === keys.slice().sort().join('\0');
    } catch { return false; }
};

class NativeBrokerProtocol {
    constructor (o = {}) {
        const {owner, resolvePin, startWorker, callWorker, revokeWorker = () => {}, terminateWorker = () => {},
            clock = {now: () => Math.floor(globalThis.performance.now())}, scheduler = {
                set: (ms, fn) => globalThis.setTimeout(fn, ms), clear: id => globalThis.clearTimeout(id)
            }, operationTimeoutMs = 30000, cleanupTimeoutMs = 5000} = o;
        if (!owner || !['object', 'function'].includes(typeof owner)) throw new TypeError('Owner object required');
        if ([resolvePin, startWorker, callWorker, revokeWorker, terminateWorker].some(f => typeof f !== 'function')) {
            throw new TypeError('Broker dependencies required');
        }
        if (!clock || typeof clock.now !== 'function' || !scheduler || typeof scheduler.set !== 'function' ||
            typeof scheduler.clear !== 'function') throw new TypeError('Invalid broker timer');
        this._limits = {};
        for (const [k, fallback] of Object.entries(LIMITS)) {
            const v = o[k] === undefined ? fallback : o[k];
            if (!Number.isSafeInteger(v) || v < 1) throw new TypeError('Invalid broker limit');
            this._limits[k] = v;
        }
        for (const v of [operationTimeoutMs, cleanupTimeoutMs]) {
            if (!Number.isSafeInteger(v) || v < 1) throw new TypeError('Invalid broker timeout');
        }
        const known = new Set(['owner', 'resolvePin', 'startWorker', 'callWorker', 'revokeWorker', 'terminateWorker',
            'clock', 'scheduler', 'operationTimeoutMs', 'cleanupTimeoutMs', ...Object.keys(LIMITS)]);
        if (Reflect.ownKeys(o).some(k => typeof k !== 'string' || !known.has(k))) throw new TypeError('Unknown broker option');
        Object.assign(this, {_owner: owner, _resolvePin: resolvePin, _startWorker: startWorker,
            _callWorker: callWorker, _revokeWorker: revokeWorker, _terminateWorker: terminateWorker,
            _clock: clock, _scheduler: scheduler, _operationTimeoutMs: operationTimeoutMs,
            _cleanupTimeoutMs: cleanupTimeoutMs});
        this._lastNow = undefined; this._now(); this._lastRequestId = -1; this._nextWorkerId = 0;
        this._workers = new Map(); this._operations = new Map(); this._closed = false;
    }
    _now () {
        let n; try { n = this._clock.now(); } catch { throw refusal('operation-failed'); }
        if (!Number.isSafeInteger(n) || n < 0 || (this._lastNow !== undefined && n < this._lastNow)) {
            throw refusal('operation-failed');
        }
        this._lastNow = n; return n;
    }
    _authorize (owner) {
        if (owner !== this._owner) throw refusal('invalid-owner');
        if (this._closed) throw refusal('closed');
    }
    _begin (owner, envelope, keys) {
        this._authorize(owner); let request;
        try {
            if (!exact(envelope, keys)) throw refusal('invalid-envelope');
            const d = Object.getOwnPropertyDescriptors(envelope); request = {};
            for (const k of keys) Object.defineProperty(request, k, {value: d[k].value, enumerable: true});
            Object.freeze(request);
        } catch (e) { throw marked.has(e) ? e : refusal('invalid-envelope'); }
        if (request.protocol !== PROTOCOL_VERSION || !Number.isSafeInteger(request.requestId) || request.requestId < 0) {
            throw refusal('invalid-envelope');
        }
        if (request.requestId <= this._lastRequestId) throw refusal('replayed-request');
        if (request.requestId !== this._lastRequestId + 1) throw refusal('out-of-order-request');
        if (this._operations.size >= this._limits.maxPending) throw refusal('capacity');
        const now = this._now();
        if (!Number.isSafeInteger(now + this._operationTimeoutMs)) throw refusal('operation-failed');
        let cancel; const cancelled = new Promise((_, reject) => { cancel = reject; }); cancelled.catch(() => {});
        const op = {requestId: request.requestId, cancel, cancelled, done: false, controller: new AbortController()};
        const previousRequestId = this._lastRequestId;
        this._lastRequestId = request.requestId; this._operations.set(request.requestId, op);
        try { op.timer = this._scheduler.set(this._operationTimeoutMs, () => this._cancel(op, 'timeout')); }
        catch {
            this._operations.delete(request.requestId); this._lastRequestId = previousRequestId;
            op.done = true; try { op.controller.abort(); } catch {}
            throw refusal('operation-failed');
        }
        return {request, op};
    }
    _cancel (op, code) {
        if (op.done) return;
        op.done = true; try { this._scheduler.clear(op.timer); } catch {}
        this._operations.delete(op.requestId); try { op.controller.abort(); } catch {}
        op.cancel(refusal(code));
    }
    _finish (op) {
        if (op.done) return;
        op.done = true; try { this._scheduler.clear(op.timer); } catch {}
        this._operations.delete(op.requestId);
    }
    _wait (op, value) {
        const guarded = Promise.resolve(value).then(x => ({x}), e => { throw e; }); guarded.catch(() => {});
        return Promise.race([guarded, op.cancelled]).then(v => v.x);
    }
    _clone (value) {
        try { return this._cloneChecked(value); } catch (e) { throw marked.has(e) ? e : refusal('invalid-data'); }
    }
    _cloneChecked (value) {
        let nodes = 0; const seen = new Set();
        const visit = (x, depth) => {
            if (++nodes > this._limits.maxNodes || depth > this._limits.maxDepth) throw refusal('invalid-data');
            if (x === null || typeof x === 'string' || typeof x === 'boolean') return x;
            if (typeof x === 'number') { if (!Number.isFinite(x)) throw refusal('invalid-data'); return x; }
            if (typeof x !== 'object' || seen.has(x)) throw refusal('invalid-data');
            seen.add(x); let copy; const d = Object.getOwnPropertyDescriptors(x); const keys = Reflect.ownKeys(d);
            if (Array.isArray(x)) {
                if (Object.keys(x).length !== x.length || keys.some(k => typeof k !== 'string' ||
                    (k !== 'length' && !/^(0|[1-9]\d*)$/.test(k))) || keys.some(k => k !== 'length' &&
                    (!d[k].enumerable || !Object.hasOwn(d[k], 'value')))) throw refusal('invalid-data');
                copy = []; for (let i = 0; i < x.length; i++) copy.push(visit(d[String(i)].value, depth + 1));
            } else {
                if (!plain(x) || keys.some(k => typeof k !== 'string')) throw refusal('invalid-data'); copy = {};
                for (const [k, descriptor] of Object.entries(d)) {
                    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw refusal('invalid-data');
                    Object.defineProperty(copy, k, {value: visit(descriptor.value, depth + 1), enumerable: true});
                }
            }
            seen.delete(x); return Object.freeze(copy);
        };
        const copy = visit(value, 0);
        if (new TextEncoder().encode(JSON.stringify(copy)).byteLength > this._limits.maxBytes) throw refusal('invalid-data');
        return copy;
    }
    _bounded (value) {
        let timer;
        const guarded = Promise.resolve(value).then(() => {}, () => {});
        const timeout = new Promise(resolve => {
            try { timer = this._scheduler.set(this._cleanupTimeoutMs, resolve); } catch { resolve(); }
        });
        return Promise.race([guarded, timeout]).finally(() => { try { this._scheduler.clear(timer); } catch {} });
    }
    _cleanup (state) {
        if (state.cleanupPromise) return state.cleanupPromise;
        state.active = false; this._workers.delete(state.workerId);
        let finish;
        state.cleanupPromise = new Promise(resolve => { finish = resolve; });
        (async () => {
            let p; try { p = this._revokeWorker(state.target); } catch {} await this._bounded(p);
            try { p = this._terminateWorker(state.target); } catch { p = undefined; } await this._bounded(p);
            state.retired = true;
            finish();
        })().catch(() => { state.retired = true; finish(); });
        return state.cleanupPromise;
    }
    _methods (a) {
        if (!Array.isArray(a) || a.length > this._limits.maxMethods) throw refusal('invalid-registration');
        const d = Object.getOwnPropertyDescriptors(a); const keys = Reflect.ownKeys(d);
        if (Object.keys(a).length !== a.length || keys.some(k => typeof k !== 'string' ||
            (k !== 'length' && !/^(0|[1-9]\d*)$/.test(k)))) throw refusal('invalid-registration');
        const out = [];
        for (let i = 0; i < a.length; i++) {
            const x = d[String(i)];
            if (!x || !x.enumerable || !Object.hasOwn(x, 'value') || typeof x.value !== 'string' ||
                x.value.length > 128 || !/^[A-Za-z0-9_]+$/.test(x.value)) throw refusal('invalid-registration');
            out.push(x.value);
        }
        return out;
    }
    async load (owner, envelope) {
        const {request, op} = this._begin(owner, envelope, ['protocol', 'requestId', 'url']); let state;
        try {
            if (typeof request.url !== 'string' || !/^https:\/\//.test(request.url)) throw refusal('invalid-url');
            if (this._workers.size >= this._limits.maxWorkers || this._nextWorkerId >= Number.MAX_SAFE_INTEGER) {
                throw refusal('capacity');
            }
            const workerId = this._nextWorkerId++;
            state = {workerId, target: null, extensions: new Map(), active: true, loading: true};
            this._workers.set(workerId, state);
            let pin;
            try { pin = await this._wait(op, this._resolvePin(request.url, {signal: op.controller.signal})); }
            catch (e) { throw marked.has(e) ? e : refusal('operation-failed'); }
            if (!pin || !Object.isFrozen(pin) || pin.url !== request.url || typeof pin.source !== 'string' ||
                !Array.isArray(pin.capabilities) || !Object.isFrozen(pin.capabilities)) throw refusal('unpinned-url');
            if (this._closed || op.done || !state.active) throw refusal('stale-reply');
            let started;
            try { started = this._startWorker(pin, workerId, {signal: op.controller.signal}); }
            catch { throw refusal('operation-failed'); }
            if (!exact(started, ['target', 'registration']) || !started.target ||
                !['object', 'function'].includes(typeof started.target)) throw refusal('operation-failed');
            state.target = Object.getOwnPropertyDescriptor(started, 'target').value;
            let registration;
            try { registration = await this._wait(op, Object.getOwnPropertyDescriptor(started, 'registration').value); }
            catch (e) { throw marked.has(e) ? e : refusal('operation-failed'); }
            try {
                if (!exact(registration, ['extensions'])) throw refusal('invalid-registration');
                const extensions = Object.getOwnPropertyDescriptor(registration, 'extensions').value;
                if (!Array.isArray(extensions) || !extensions.length || extensions.length > this._limits.maxExtensions) {
                    throw refusal('invalid-registration');
                }
                const ed = Object.getOwnPropertyDescriptors(extensions); const ek = Reflect.ownKeys(ed);
                if (Object.keys(extensions).length !== extensions.length || ek.some(k => typeof k !== 'string' ||
                    (k !== 'length' && !/^(0|[1-9]\d*)$/.test(k)))) throw refusal('invalid-registration');
                const ids = new Set(); let count = 0;
                for (let i = 0; i < extensions.length; i++) {
                    const descriptor = ed[String(i)];
                    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
                        !exact(descriptor.value, ['extensionId', 'opcodes', 'menus'])) throw refusal('invalid-registration');
                    const f = Object.getOwnPropertyDescriptors(descriptor.value); const id = f.extensionId.value;
                    if (!Number.isSafeInteger(id) || id < 0 || ids.has(id)) throw refusal('invalid-registration');
                    const opcodes = this._methods(f.opcodes.value); const menus = this._methods(f.menus.value);
                    count += opcodes.length + menus.length;
                    if (count > this._limits.maxMethods) throw refusal('invalid-registration');
                    ids.add(id); const methods = new Set([...opcodes, ...menus]);
                    if (methods.size !== opcodes.length + menus.length) throw refusal('invalid-registration');
                    state.extensions.set(state.extensions.size, {providerExtensionId: id, methods});
                }
            } catch (e) { throw marked.has(e) ? e : refusal('invalid-registration'); }
            state.loading = false;
            if (this._closed || op.done || !state.active || this._workers.get(workerId) !== state) throw refusal('stale-reply');
            return Object.freeze({protocol: 1, requestId: request.requestId, workerId,
                extensionIds: Object.freeze([...state.extensions.keys()])});
        } catch (e) {
            if (state) {
                if (state.target) {
                    const cleanup = this._cleanup(state);
                    if (!op.done) await cleanup;
                } else this._workers.delete(state.workerId);
            }
            throw marked.has(e) ? e : refusal('operation-failed');
        } finally { this._finish(op); }
    }
    async call (owner, envelope) {
        const {request, op} = this._begin(owner, envelope,
            ['protocol', 'requestId', 'workerId', 'extensionId', 'method', 'args']);
        try {
            if (!Number.isSafeInteger(request.workerId) || !Number.isSafeInteger(request.extensionId) ||
                typeof request.method !== 'string') throw refusal('invalid-envelope');
            const args = this._clone(request.args); if (!plain(args)) throw refusal('invalid-data');
            const state = this._workers.get(request.workerId); const ext = state && state.extensions.get(request.extensionId);
            if (!state || !state.active || state.loading) throw refusal('unknown-worker');
            if (!ext) throw refusal('unknown-extension');
            if (!ext.methods.has(request.method)) throw refusal('unknown-method');
            let result;
            try { result = await this._wait(op, this._callWorker(state.target, ext.providerExtensionId,
                request.method, args, {signal: op.controller.signal})); }
            catch (e) { throw marked.has(e) ? e : refusal('operation-failed'); }
            if (this._closed || op.done || !state.active || this._workers.get(request.workerId) !== state) {
                throw refusal('stale-reply');
            }
            return Object.freeze({protocol: 1, requestId: request.requestId, result: this._clone(result)});
        } finally { this._finish(op); }
    }
    async terminate (owner, envelope) {
        const {request, op} = this._begin(owner, envelope, ['protocol', 'requestId', 'workerId']);
        try {
            if (!Number.isSafeInteger(request.workerId)) throw refusal('invalid-envelope');
            const state = this._workers.get(request.workerId);
            if (!state || !state.active) throw refusal('unknown-worker');
            await this._wait(op, this._cleanup(state));
            return Object.freeze({protocol: 1, requestId: request.requestId, terminated: true});
        } finally { this._finish(op); }
    }
    async dispose (owner) {
        this._authorize(owner); this._closed = true;
        for (const op of [...this._operations.values()]) this._cancel(op, 'closed');
        const states = [...this._workers.values()]; this._workers.clear();
        await Promise.all(states.filter(s => s.target).map(s => this._cleanup(s)));
    }
    snapshot (owner) { this._authorize(owner); return Object.freeze({workers: this._workers.size,
        pending: this._operations.size}); }
}
module.exports = {BrokerProtocolError, LIMITS, NativeBrokerProtocol, PROTOCOL_VERSION};
