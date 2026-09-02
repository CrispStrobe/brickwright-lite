'use strict';

const FAILURE_CODES = Object.freeze(new Set(['closed', 'invalid-envelope', 'replayed-request',
    'out-of-order-request', 'capacity', 'invalid-data', 'invalid-url', 'unpinned-url', 'stale-reply',
    'operation-failed', 'invalid-registration', 'unknown-worker', 'unknown-extension', 'unknown-method', 'timeout']));
const exact = (value, keys) => {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    return actual.every(key => typeof key === 'string' && descriptors[key].enumerable &&
        Object.hasOwn(descriptors[key], 'value')) && actual.slice().sort().join('\0') === keys.slice().sort().join('\0');
};
const hexId = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

const createNativeBrokerReceiver = ({NativeBrokerProtocol, BrokerProtocolError, invoke, createProtocol}) => {
    if (typeof NativeBrokerProtocol !== 'function' || typeof BrokerProtocolError !== 'function' ||
        typeof invoke !== 'function' || typeof createProtocol !== 'function') {
        throw new TypeError('Invalid broker bootstrap');
    }
    const sessions = new Map();
    const retired = new Set();
    const maxRetired = 64;
    let closed = false;
    let fullyDisposed = false;
    const dispose = async session => {
        const state = sessions.get(session);
        if (!state) {
            if (!retired.has(session)) {
                if (retired.size >= maxRetired) closed = true;
                else retired.add(session);
            }
            return;
        }
        if (state.disposed) return;
        state.disposed = true;
        sessions.delete(session);
        if (retired.size >= maxRetired) closed = true;
        else retired.add(session);
        try { await state.protocol.dispose(state.owner); } catch {}
    };
    const stableCode = error => error instanceof BrokerProtocolError && FAILURE_CODES.has(error.code) ?
        error.code : 'operation-failed';
    const reply = (delivery, payload) => invoke('native_broker_reply', {
        session: delivery.session,
        correlation: delivery.correlation,
        requestId: delivery.requestId,
        payload: JSON.stringify(payload)
    });
    const safeReply = async (delivery, payload) => {
        try { await reply(delivery, payload); } catch { await dispose(delivery.session); }
    };
    const receive = async delivery => {
        if (closed || !exact(delivery, ['session', 'correlation', 'kind', 'requestId', 'payload']) ||
            !hexId(delivery.session) || !hexId(delivery.correlation) ||
            !['load', 'call', 'terminate'].includes(delivery.kind) ||
            !Number.isSafeInteger(delivery.requestId) || delivery.requestId < 0 ||
            typeof delivery.payload !== 'string' || delivery.payload.length > 65536) return;
        let fields;
        try { fields = JSON.parse(delivery.payload); } catch { fields = null; }
        if (!fields || Object.getPrototypeOf(fields) !== Object.prototype || Object.hasOwn(fields, 'kind') ||
            Object.hasOwn(fields, 'protocol') || Object.hasOwn(fields, 'requestId')) return safeReply(delivery,
            {kind: 'failure', request_kind: delivery.kind, code: 'invalid-envelope'});
        let envelope;
        if (delivery.kind === 'load' && exact(fields, ['url'])) envelope =
            {protocol: 1, requestId: delivery.requestId, url: fields.url};
        else if (delivery.kind === 'call' && exact(fields,
            ['worker_id', 'extension_id', 'method', 'args'])) envelope = {protocol: 1,
            requestId: delivery.requestId, workerId: fields.worker_id, extensionId: fields.extension_id,
            method: fields.method, args: fields.args};
        else if (delivery.kind === 'terminate' && exact(fields, ['worker_id'])) envelope =
            {protocol: 1, requestId: delivery.requestId, workerId: fields.worker_id};
        else return safeReply(delivery, {kind: 'failure', request_kind: delivery.kind, code: 'invalid-envelope'});
        Object.freeze(envelope);
        let state = sessions.get(delivery.session);
        if (!state && retired.has(delivery.session)) return safeReply(delivery,
            {kind: 'failure', request_kind: delivery.kind, code: 'stale-reply'});
        if (!state && sessions.size >= 8) return safeReply(delivery,
            {kind: 'failure', request_kind: delivery.kind, code: 'capacity'});
        if (!state) {
            const owner = Object.freeze({});
            let protocol;
            try { protocol = createProtocol(owner, delivery.session, NativeBrokerProtocol); } catch {
                return safeReply(delivery,
                    {kind: 'failure', request_kind: delivery.kind, code: 'operation-failed'});
            }
            if (!(protocol instanceof NativeBrokerProtocol)) return safeReply(delivery,
                {kind: 'failure', request_kind: delivery.kind, code: 'operation-failed'});
            state = {owner, protocol, disposed: false}; sessions.set(delivery.session, state);
        }
        let response;
        try {
            let result;
            if (delivery.kind === 'load') result = await state.protocol.load(state.owner, envelope);
            else if (delivery.kind === 'call') result = await state.protocol.call(state.owner, envelope);
            else result = await state.protocol.terminate(state.owner, envelope);
            if (delivery.kind === 'load') response = {kind: 'load', worker_id: result.workerId,
                extension_ids: result.extensionIds};
            else if (delivery.kind === 'call') response = {kind: 'call', result: result.result};
            else response = {kind: 'terminate', terminated: result.terminated};
        } catch (error) {
            response = {kind: 'failure', request_kind: delivery.kind, code: stableCode(error)};
        }
        await safeReply(delivery, response);
    };
    const disposeAll = async () => {
        if (fullyDisposed) return; fullyDisposed = true; closed = true;
        await Promise.all([...sessions.keys()].map(dispose));
    };
    return Object.freeze({receive, dispose: disposeAll, disposeSession: dispose,
        snapshot: () => Object.freeze({sessions: sessions.size})});
};

const exactRealm = (realm, expectedOrigin) => realm.top === realm && realm.location &&
    realm.location.origin === expectedOrigin &&
    realm.location.pathname === '/capability-broker.html' && realm.location.search === '' && realm.location.hash === '';
const installNativeBrokerReceiver = options => {
    if (!exactRealm(globalThis, options.expectedOrigin)) throw new TypeError('Invalid broker realm');
    const control = createNativeBrokerReceiver(options);
    Object.defineProperty(globalThis, '__brickwrightBrokerReceive', {value: control.receive, configurable: false,
        enumerable: false, writable: false});
    Object.defineProperty(globalThis, '__brickwrightBrokerDisposeSession', {value: async session => {
        if (hexId(session)) try { await control.disposeSession(session); } catch {}
    }, configurable: false, enumerable: false, writable: false});
    Object.defineProperty(globalThis, '__brickwrightBrokerDisposeAll', {value: control.dispose,
        configurable: false, enumerable: false, writable: false});
    if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('pagehide', control.dispose,
        {once: true});
    // Acknowledge LAST. Every receiver global above is already installed non-configurable and
    // non-writable, so the acknowledgement cannot be sent by a realm that has not finished
    // becoming the receiver. The host holds no transport permission until this resolves, which
    // is why the order matters rather than merely reads well: acknowledging first would widen
    // the ACL around a receiver that might still fail to install.
    options.invoke('native_broker_ready').catch(() => control.dispose());
    return control;
};

module.exports = {createNativeBrokerReceiver, exactRealm, FAILURE_CODES, installNativeBrokerReceiver};
