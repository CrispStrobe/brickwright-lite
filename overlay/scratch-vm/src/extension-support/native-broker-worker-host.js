const manifest = require('../../../scratch-gui/static/native-broker/proof-pins/manifest.json');

const DEFAULT_LIMITS = Object.freeze({maxSourceBytes: 65536, maxPending: 64, maxExtensions: 16,
    maxMethods: 256, maxDataBytes: 65536, maxDepth: 16, maxNodes: 1024, callTimeoutMs: 30000,
    registrationTimeoutMs: 30000, capabilityTimeoutMs: 30000});
const PROTOCOL = 1;
const METHOD = /^[A-Za-z0-9_]{1,128}$/;
const OPERATION = /^[a-z][a-z0-9]*(?:[.:][a-z][a-z0-9]*){1,7}$/;
const CAPABILITY_FAILURE = new Set(['invalid-session', 'invalid-envelope', 'replayed-request', 'unknown-operation',
    'undeclared-operation', 'invalid-arguments', 'unavailable-operation', 'operation-failed', 'stale-reply']);
const plain = value => Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => {
    if (!plain(value)) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    return actual.length === keys.length && actual.every(key => typeof key === 'string' && keys.includes(key) &&
        descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
};
const refused = () => new Error('Native broker worker host refused');
const bytesOf = value => value instanceof Uint8Array ? value :
    value instanceof ArrayBuffer ? new Uint8Array(value) : null;

const createNativeBrokerWorkerHost = (options = {}) => {
    const {createWorker, loadAsset, sha256Hex, requestCapability = async () => { throw refused(); },
        scheduler = {set: (ms, fn) => setTimeout(fn, ms), clear: id => clearTimeout(id)}} = options;
    if (typeof createWorker !== 'function' || typeof loadAsset !== 'function' ||
        (sha256Hex !== undefined && typeof sha256Hex !== 'function') || typeof requestCapability !== 'function' ||
        !scheduler || typeof scheduler.set !== 'function' || typeof scheduler.clear !== 'function') {
        throw new TypeError('Native broker worker host dependencies required');
    }
    const limits = {};
    for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
        const value = options[key] === undefined ? fallback : options[key];
        if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid worker host limit');
        limits[key] = value;
    }
    const allowed = new Set(['createWorker', 'loadAsset', 'sha256Hex', 'requestCapability', 'scheduler',
        ...Object.keys(DEFAULT_LIMITS)]);
    if (Reflect.ownKeys(options).some(key => typeof key !== 'string' || !allowed.has(key))) {
        throw new TypeError('Unknown worker host option');
    }
    const pins = new WeakSet(); const targets = new WeakSet();
    const cloneData = root => {
        let nodes = 0; const active = new Set();
        const visit = (value, depth) => {
            if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw refused();
            if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
            if (typeof value === 'number') { if (!Number.isFinite(value)) throw refused(); return value; }
            if (typeof value !== 'object' || active.has(value)) throw refused();
            active.add(value);
            const descriptors = Object.getOwnPropertyDescriptors(value); const keys = Reflect.ownKeys(descriptors);
            let copy;
            if (Array.isArray(value)) {
                if (Object.keys(value).length !== value.length || keys.some(key => typeof key !== 'string' ||
                    (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) throw refused();
                copy = value.map((_item, index) => {
                    const descriptor = descriptors[String(index)];
                    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw refused();
                    return visit(descriptor.value, depth + 1);
                });
            } else {
                if (!plain(value) || keys.some(key => typeof key !== 'string')) throw refused();
                copy = {};
                for (const [key, descriptor] of Object.entries(descriptors)) {
                    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw refused();
                    copy[key] = visit(descriptor.value, depth + 1);
                }
            }
            active.delete(value); return Object.freeze(copy);
        };
        const copy = visit(root, 0);
        if (new TextEncoder().encode(JSON.stringify(copy)).byteLength > limits.maxDataBytes) throw refused();
        return copy;
    };
    const sha = async bytes => sha256Hex ? sha256Hex(bytes) :
        [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))]
            .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const resolvePin = async (url, {signal} = {}) => {
        if (typeof url !== 'string' || !signal || typeof signal.aborted !== 'boolean') throw refused();
        if (signal.aborted) throw Object.assign(refused(), {name: 'AbortError'});
        const alias = manifest.aliases[url];
        if (!alias || Object.keys(manifest.aliases).length !== 2 || alias.digest !== manifest.source.digest ||
            manifest.source.bytes > limits.maxSourceBytes) throw refused();
        const loaded = bytesOf(await loadAsset(manifest.source.asset, {signal}));
        if (signal.aborted) throw Object.assign(refused(), {name: 'AbortError'});
        const bytes = loaded && loaded.slice();
        if (!bytes || bytes.byteLength !== manifest.source.bytes || await sha(bytes) !== manifest.source.digest) throw refused();
        if (signal.aborted) throw Object.assign(refused(), {name: 'AbortError'});
        let source; try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { throw refused(); }
        const pin = Object.freeze({url, slug: alias.slug, digest: alias.digest, source,
            capabilities: Object.freeze([...alias.brokerCapabilities])});
        pins.add(pin); return pin;
    };
    const rejectPending = target => {
        for (const pending of target.pending.values()) {
            try { scheduler.clear(pending.timer); } catch {} pending.reject(refused());
        }
        target.pending.clear();
    };
    const clearCapabilities = target => {
        for (const pending of target.capabilityPending.values()) {
            try { scheduler.clear(pending.timer); } catch {}
        }
        target.capabilityPending.clear();
    };
    const close = target => {
        if (!targets.has(target) || target.closed) return;
        target.closed = true; target.active = false; rejectPending(target); clearCapabilities(target);
        if (target.registrationTimer !== undefined) {
            const timer = target.registrationTimer; target.registrationTimer = undefined;
            try { scheduler.clear(timer); } catch {}
        }
        if (target.abortListener) target.signal.removeEventListener('abort', target.abortListener);
        if (!target.registered) target.rejectRegistration(refused());
        try { target.worker.terminate(); } catch {}
    };
    const parseRegistration = extensions => {
        if (!Array.isArray(extensions) || !extensions.length || extensions.length > limits.maxExtensions) throw refused();
        const result = new Map(); let count = 0;
        for (const entry of extensions) {
            if (!exact(entry, ['extensionId', 'opcodes', 'menus']) || !Number.isSafeInteger(entry.extensionId) ||
                entry.extensionId < 0 || result.has(entry.extensionId) || !Array.isArray(entry.opcodes) ||
                !Array.isArray(entry.menus)) throw refused();
            const names = [...entry.opcodes, ...entry.menus];
            if (names.some(name => typeof name !== 'string' || !METHOD.test(name)) ||
                new Set(names).size !== names.length || (count += names.length) > limits.maxMethods) throw refused();
            result.set(entry.extensionId, {methods: new Set(names), public: Object.freeze({extensionId: entry.extensionId,
                opcodes: Object.freeze([...entry.opcodes]), menus: Object.freeze([...entry.menus])})});
        }
        return result;
    };
    const sendCapabilityReply = (target, requestId, response) => {
        if (!target.active) return;
        const frame = response.failure ? {protocol: PROTOCOL, kind: 'capability-reply', workerId: target.workerId,
            requestId, failure: CAPABILITY_FAILURE.has(response.failure) ? response.failure : 'operation-failed'} :
            {protocol: PROTOCOL, kind: 'capability-reply', workerId: target.workerId, requestId, result: response.result};
        try { target.worker.postMessage(frame); } catch { close(target); }
    };
    const finishCapability = (target, requestId, pending, response) => {
        if (target.capabilityPending.get(requestId) !== pending) return;
        target.capabilityPending.delete(requestId);
        if (pending.timer !== undefined) { try { scheduler.clear(pending.timer); } catch {} }
        sendCapabilityReply(target, requestId, response);
    };
    const onMessage = (target, event) => {
        if (target.closed) return;
        if (!target.active) return close(target);
        const message = event && event.data;
        if (!plain(message) || message.protocol !== PROTOCOL || message.workerId !== target.workerId) return close(target);
        if (message.kind === 'registration') {
            if (target.registered || !exact(message, ['protocol', 'kind', 'workerId', 'extensions'])) return close(target);
            try { target.extensions = parseRegistration(message.extensions); } catch { return close(target); }
            if (target.registrationTimer !== undefined) {
                const timer = target.registrationTimer; target.registrationTimer = undefined;
                try { scheduler.clear(timer); } catch {}
            }
            target.registered = true; target.resolveRegistration(Object.freeze({extensions:
                Object.freeze([...target.extensions.values()].map(value => value.public))})); return;
        }
        if (message.kind === 'reply') {
            if (!exact(message, ['protocol', 'kind', 'workerId', 'requestId', 'result']) ||
                !Number.isSafeInteger(message.requestId) || message.requestId < 0) return close(target);
            const pending = target.pending.get(message.requestId); if (!pending) return close(target);
            let result; try { result = cloneData(message.result); } catch { return close(target); }
            target.pending.delete(message.requestId); try { scheduler.clear(pending.timer); } catch {}
            pending.resolve(result); return;
        }
        if (message.kind === 'capability') {
            if (!exact(message, ['protocol', 'kind', 'workerId', 'requestId', 'operation', 'args']) ||
                !Number.isSafeInteger(message.requestId) || message.requestId < 0 ||
                message.requestId !== target.nextCapabilityId++ || typeof message.operation !== 'string' ||
                !OPERATION.test(message.operation) || !plain(message.args)) return close(target);
            if (!target.pin.capabilities.includes(message.operation)) {
                sendCapabilityReply(target, message.requestId, {failure: 'undeclared-operation'}); return;
            }
            let args; try { args = cloneData(message.args); } catch { return close(target); }
            if (target.capabilityPending.size >= limits.maxPending) {
                sendCapabilityReply(target, message.requestId, {failure: 'unavailable-operation'}); return;
            }
            const pending = {};
            target.capabilityPending.set(message.requestId, pending);
            let fired = false;
            try {
                const timer = scheduler.set(limits.capabilityTimeoutMs, () => {
                    fired = true;
                    finishCapability(target, message.requestId, pending, {failure: 'unavailable-operation'});
                });
                if (fired || !target.active) { try { scheduler.clear(timer); } catch {} }
                else pending.timer = timer;
            } catch {
                finishCapability(target, message.requestId, pending, {failure: 'operation-failed'}); return;
            }
            if (fired || !target.active || target.capabilityPending.get(message.requestId) !== pending) return;
            Promise.resolve().then(() => requestCapability(target, message.operation, args))
                .then(result => {
                    let safeResult; try { safeResult = cloneData(result); } catch {
                        return finishCapability(target, message.requestId, pending, {failure: 'operation-failed'});
                    }
                    finishCapability(target, message.requestId, pending, {result: safeResult});
                }, error =>
                    finishCapability(target, message.requestId, pending,
                        {failure: error && CAPABILITY_FAILURE.has(error.code) ? error.code : 'operation-failed'}));
            return;
        }
        if (message.kind === 'failure' && exact(message, ['protocol', 'kind', 'workerId', 'code']) &&
            typeof message.code === 'string') return close(target);
        if (message.kind === 'terminated' && exact(message, ['protocol', 'kind', 'workerId'])) return close(target);
        close(target);
    };
    const startWorker = (pin, workerId, {signal} = {}) => {
        if (!pins.has(pin) || !Number.isSafeInteger(workerId) || workerId < 0 ||
            !signal || typeof signal.aborted !== 'boolean') throw refused();
        let worker; try { worker = createWorker(); } catch { throw refused(); }
        if (!worker || typeof worker.postMessage !== 'function' || typeof worker.terminate !== 'function') {
            try { worker && worker.terminate(); } catch {} throw refused();
        }
        const target = {worker, workerId, pin, active: true, closed: false, registered: false,
            nextRequestId: 0, nextCapabilityId: 0, pending: new Map(), capabilityPending: new Map(),
            extensions: new Map(), signal};
        targets.add(target);
        const registration = new Promise((resolve, reject) => Object.assign(target,
            {resolveRegistration: resolve, rejectRegistration: reject}));
        worker.onmessage = event => { try { onMessage(target, event); } catch { close(target); } };
        worker.onerror = worker.onmessageerror = () => close(target);
        if (signal.aborted) close(target);
        else {
            target.abortListener = () => close(target);
            signal.addEventListener('abort', target.abortListener, {once: true});
            try { worker.postMessage({protocol: PROTOCOL, workerId, source: pin.source}); } catch { close(target); }
            if (!target.closed && !target.registered) {
                let fired = false;
                try {
                    const timer = scheduler.set(limits.registrationTimeoutMs, () => { fired = true; close(target); });
                    if (fired || target.closed) { try { scheduler.clear(timer); } catch {} }
                    else target.registrationTimer = timer;
                } catch { close(target); }
            }
        }
        return Object.freeze({target, registration});
    };
    const callWorker = (target, extensionId, method, args) => {
        if (!targets.has(target) || !target.active || !target.registered || target.pending.size >= limits.maxPending ||
            !Number.isSafeInteger(extensionId) || extensionId < 0 || typeof method !== 'string' || !plain(args)) {
            return Promise.reject(refused());
        }
        const extension = target.extensions.get(extensionId);
        if (!extension || !extension.methods.has(method) || target.nextRequestId > Number.MAX_SAFE_INTEGER) {
            return Promise.reject(refused());
        }
        let safeArgs; try { safeArgs = cloneData(args); } catch { return Promise.reject(refused()); }
        const requestId = target.nextRequestId++;
        return new Promise((resolve, reject) => {
            const pending = {resolve, reject}; target.pending.set(requestId, pending);
            let fired = false;
            try {
                const timer = scheduler.set(limits.callTimeoutMs, () => {
                    fired = true;
                    if (target.pending.delete(requestId)) reject(refused());
                    close(target);
                });
                if (fired || target.closed) { try { scheduler.clear(timer); } catch {} }
                else pending.timer = timer;
            } catch { target.pending.delete(requestId); reject(refused()); close(target); return; }
            if (fired || target.closed || target.pending.get(requestId) !== pending) return;
            try { target.worker.postMessage({protocol: PROTOCOL, kind: 'call', workerId: target.workerId,
                requestId, extensionId, method, args: safeArgs}); }
            catch { try { scheduler.clear(pending.timer); } catch {} target.pending.delete(requestId);
                reject(refused()); close(target); }
        });
    };
    const revokeWorker = target => {
        if (targets.has(target) && target.active) {
            for (const [requestId, pending] of [...target.capabilityPending]) {
                finishCapability(target, requestId, pending, {failure: 'unavailable-operation'});
            }
            target.active = false; rejectPending(target);
            if (!target.registered) target.rejectRegistration(refused());
        }
    };
    const terminateWorker = target => {
        if (!targets.has(target) || target.closed) return;
        try { target.worker.postMessage({protocol: PROTOCOL, kind: 'terminate', workerId: target.workerId}); } catch {}
        close(target);
    };
    return Object.freeze({resolvePin, startWorker, callWorker, revokeWorker, terminateWorker});
};

module.exports = {createNativeBrokerWorkerHost, DEFAULT_LIMITS};
