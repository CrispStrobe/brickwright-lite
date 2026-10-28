import assert from 'node:assert/strict';
import test from 'node:test';

import protocolModule from '../overlay/scratch-vm/src/extension-support/native-broker-protocol.js';

const {BrokerProtocolError, NativeBrokerProtocol, PROTOCOL_VERSION} = protocolModule;
const url = 'https://gallery.invalid/reviewed.js';
const pin = Object.freeze({
    url,
    slug: 'reviewed',
    digest: 'secret-digest',
    source: 'secret-source',
    capabilities: Object.freeze(['platform.kind.read'])
});
const owner = Object.freeze({});
const makeProtocol = (overrides = {}) => new NativeBrokerProtocol({
    owner,
    resolvePin: async candidate => candidate === url ? pin : null,
    startWorker: (resolvedPin, workerId) => {
        assert.equal(resolvedPin, pin);
        assert.equal(workerId, 0);
        return {target: {workerId}, registration: Promise.resolve(
            {extensions: [{extensionId: 4, opcodes: ['readKind'], menus: ['kindMenu']}]})};
    },
    callWorker: async (_state, extensionId, method, args) => ({extensionId, method, args}),
    ...overrides
});
const load = (requestId = 0, overrides = {}) => ({protocol: PROTOCOL_VERSION, requestId, url, ...overrides});
const call = (requestId, overrides = {}) => ({
    protocol: PROTOCOL_VERSION,
    requestId,
    workerId: 0,
    extensionId: 0,
    method: 'readKind',
    args: {},
    ...overrides
});

test('load resolves host pin authority and returns only broker-assigned identities', async () => {
    const broker = makeProtocol();
    const result = await broker.load(owner, load());
    assert.deepEqual(result, {protocol: 1, requestId: 0, workerId: 0, extensionIds: [0]});
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.extensionIds));
    assert.doesNotMatch(JSON.stringify(result), /secret|reviewed|platform\.kind|gallery/);
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 0});
});

test('registered opcode and menu calls are bound to their worker and extension', async () => {
    const broker = makeProtocol();
    await broker.load(owner, load());
    const opcode = await broker.call(owner, call(1, {args: {value: 7}}));
    // The public extension ID is broker-assigned (0); the injected worker adapter receives its
    // private provider ID (4), which never becomes caller authority.
    assert.deepEqual(opcode.result, {extensionId: 4, method: 'readKind', args: {value: 7}});
    assert.ok(Object.isFrozen(opcode.result.args));
    const menu = await broker.call(owner, call(2, {method: 'kindMenu'}));
    assert.equal(menu.result.method, 'kindMenu');
});

test('load refuses arbitrary URLs and caller-supplied authority fields', async () => {
    for (const envelope of [
        load(0, {url: 'https://attacker.invalid/x.js'}),
        load(0, {source: 'attacker source'}),
        load(0, {capabilities: ['platform.kind.read']}),
        load(0, {workerId: 99}),
        load(0, {slug: 'forged'})
    ]) {
        const broker = makeProtocol();
        await assert.rejects(broker.load(owner, envelope), BrokerProtocolError);
        assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
    }
});

test('one startup sequence rejects replay, gaps, malformed envelopes, and extra keys', async () => {
    const broker = makeProtocol();
    await broker.load(owner, load(0));
    await assert.rejects(broker.call(owner, call(0)), error => error.code === 'replayed-request');
    await assert.rejects(broker.call(owner, call(2)), error => error.code === 'out-of-order-request');
    assert.equal((await broker.call(owner, call(1))).requestId, 1, 'a refused gap must not poison the next ID');
    await assert.rejects(broker.call(owner, call(2, {extra: true})), error => error.code === 'invalid-envelope');
    await assert.rejects(broker.call(owner, call(2, {args: []})), error => error.code === 'invalid-data');
});

test('calls refuse unknown worker, extension, and non-allowlisted methods', async () => {
    for (const [overrides, code] of [
        [{workerId: 9}, 'unknown-worker'],
        [{extensionId: 9}, 'unknown-extension'],
        [{method: 'nativeInvoke'}, 'unknown-method']
    ]) {
        const broker = makeProtocol();
        await broker.load(owner, load());
        await assert.rejects(broker.call(owner, call(1, overrides)), error => error.code === code);
    }
});

test('terminate removes authority and revokes before terminating', async () => {
    const lifecycle = [];
    const broker = makeProtocol({
        revokeWorker: async () => lifecycle.push('revoked'),
        terminateWorker: async () => lifecycle.push('terminated')
    });
    await broker.load(owner, load());
    assert.equal((await broker.terminate(owner, {protocol: 1, requestId: 1, workerId: 0})).terminated, true);
    assert.deepEqual(lifecycle, ['revoked', 'terminated']);
    assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
    await assert.rejects(broker.call(owner, call(2)), error => error.code === 'unknown-worker');
});

test('termination makes an in-flight worker reply stale', async () => {
    let finish;
    const broker = makeProtocol({callWorker: () => new Promise(resolve => { finish = resolve; })});
    await broker.load(owner, load());
    const pending = broker.call(owner, call(1));
    await broker.terminate(owner, {protocol: 1, requestId: 2, workerId: 0});
    finish('native-secret');
    await assert.rejects(pending, error => error.code === 'stale-reply');
    assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
});

test('worker and pending state are bounded and errors are stable and redacted', async () => {
    const broker = makeProtocol({maxWorkers: 1, maxPending: 1});
    await broker.load(owner, load());
    await assert.rejects(broker.load(owner, load(1)), error => {
        assert.deepEqual(error.toJSON(), {
            name: 'BrokerProtocolError',
            code: 'capacity',
            message: 'Native broker request refused'
        });
        assert.doesNotMatch(JSON.stringify(error), /secret|gallery|source|digest/);
        return true;
    });
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 0});
});

test('pending request capacity is constant and released after completion', async () => {
    let finishLoad;
    const broker = makeProtocol({
        maxPending: 1,
        startWorker: (_pin, workerId) => ({target: {workerId},
            registration: new Promise(resolve => { finishLoad = resolve; })})
    });
    const first = broker.load(owner, load(0));
    await Promise.resolve();
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 1});
    await assert.rejects(broker.call(owner, call(1)), error => error.code === 'capacity');
    finishLoad({extensions: [{extensionId: 4, opcodes: ['readKind'], menus: ['kindMenu']}]});
    await first;
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 0});
    assert.equal((await broker.call(owner, call(1))).requestId, 1);
});

test('unforgeable owner is checked before sequence mutation on every entrypoint', async () => {
    const broker = makeProtocol();
    await assert.rejects(broker.load({}, load(0)), e => e.code === 'invalid-owner');
    await assert.rejects(broker.call({}, call(0)), e => e.code === 'invalid-owner');
    await assert.rejects(broker.terminate({}, {protocol: 1, requestId: 0, workerId: 0}), e => e.code === 'invalid-owner');
    assert.throws(() => broker.snapshot({}), e => e.code === 'invalid-owner');
    await assert.rejects(broker.dispose({}), e => e.code === 'invalid-owner');
    assert.equal((await broker.load(owner, load(0))).requestId, 0);
});

test('arguments and results reject unsafe structured data and enforce bounds', async () => {
    const bad = [() => {}, 1n, NaN, Infinity, new Date(), Object.create(null)];
    const cyclic = {}; cyclic.self = cyclic; bad.push(cyclic);
    const accessor = {}; Object.defineProperty(accessor, 'x', {get: () => 1, enumerable: true}); bad.push(accessor);
    const hidden = {}; Object.defineProperty(hidden, 'x', {value: 'authority'}); bad.push(hidden);
    const symbol = {[Symbol('hidden')]: 'authority'}; bad.push(symbol);
    const arrayAccessor = [];
    Object.defineProperty(arrayAccessor, '0', {get: () => 'authority', enumerable: true});
    arrayAccessor.length = 1; bad.push(arrayAccessor);
    for (const args of bad) {
        const broker = makeProtocol(); await broker.load(owner, load());
        await assert.rejects(broker.call(owner, call(1, {args: {value: args}})), e => e.code === 'invalid-data');
    }
    const bounded = makeProtocol({maxDepth: 2, maxNodes: 4, maxBytes: 12});
    await bounded.load(owner, load());
    await assert.rejects(bounded.call(owner, call(1, {args: {a: {b: {c: 1}}}})), e => e.code === 'invalid-data');
    const resultBroker = makeProtocol({callWorker: () => ({bad: () => {}})});
    await resultBroker.load(owner, load());
    await assert.rejects(resultBroker.call(owner, call(1)), e => e.code === 'invalid-data');
    const protoKey = JSON.parse('{"__proto__":{"polluted":true}}');
    const safeBroker = makeProtocol(); await safeBroker.load(owner, load());
    const safeResult = await safeBroker.call(owner, call(1, {args: protoKey}));
    assert.equal(Object.getPrototypeOf(safeResult.result.args), Object.prototype);
    assert.equal(Object.prototype.polluted, undefined);
});

test('envelopes reject accessors and symbol authority fields without advancing sequence', async () => {
    const broker = makeProtocol();
    const accessorEnvelope = load(0);
    Object.defineProperty(accessorEnvelope, 'url', {get: () => url, enumerable: true});
    await assert.rejects(broker.load(owner, accessorEnvelope), e => e.code === 'invalid-envelope');
    const symbolEnvelope = load(0); symbolEnvelope[Symbol('authority')] = true;
    await assert.rejects(broker.load(owner, symbolEnvelope), e => e.code === 'invalid-envelope');
    assert.equal((await broker.load(owner, load(0))).requestId, 0);
});

test('request snapshots prevent mutation from leaking pending state or redirecting calls', async () => {
    let finish;
    const broker = makeProtocol({callWorker: (_state, _extensionId, method) =>
        new Promise(resolve => { finish = () => resolve(method); })});
    await broker.load(owner, load());
    const envelope = call(1);
    const pending = broker.call(owner, envelope);
    envelope.requestId = 99;
    envelope.method = 'nativeInvoke';
    finish();
    assert.deepEqual(await pending, {protocol: 1, requestId: 1, result: 'readKind'});
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 0});
});

test('throwing envelope and data proxies produce only stable refusals', async () => {
    const secretProxy = new Proxy({}, {getPrototypeOf: () => { throw new Error('secret'); }});
    const broker = makeProtocol();
    await assert.rejects(broker.load(owner, secretProxy), error =>
        error.code === 'invalid-envelope' && !/secret/.test(error.message));
    await broker.load(owner, load(0));
    await assert.rejects(broker.call(owner, call(1, {args: {value: secretProxy}})), error =>
        error.code === 'invalid-data' && !/secret/.test(error.message));
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 0});
});

test('failed post-create registration rolls back with revoke and terminate', async () => {
    for (const registration of [
        {extensions: [{extensionId: 4, opcodes: ['x'], menus: []}, {extensionId: 4, opcodes: ['y'], menus: []}]},
        {extensions: [{extensionId: 4, opcodes: ['x', 'y'], menus: []}]}
    ]) {
        const events = [];
        const broker = makeProtocol({maxMethods: 1, startWorker: (_pin, workerId) =>
            ({target: {workerId}, registration: Promise.resolve(registration)}),
            revokeWorker: () => events.push('revoke'), terminateWorker: () => events.push('terminate')});
        await assert.rejects(broker.load(owner, load()), e => e.code === 'invalid-registration');
        assert.deepEqual(events, ['revoke', 'terminate']);
        assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
    }
});

test('dependency failures are sanitized and termination attempts both cleanup stages', async () => {
    const resolver = makeProtocol({resolvePin: () => { throw new Error('resolver secret'); }});
    await assert.rejects(resolver.load(owner, load()), e => e.code === 'operation-failed' && !/secret/.test(e.message));
    const events = [];
    const broker = makeProtocol({revokeWorker: () => { events.push('revoke'); throw new Error('secret'); },
        terminateWorker: () => { events.push('terminate'); throw new Error('secret'); }});
    await broker.load(owner, load());
    await broker.terminate(owner, {protocol: 1, requestId: 1, workerId: 0});
    assert.deepEqual(events, ['revoke', 'terminate']);
});

test('dispose permanently closes protocol, cleans every worker, and stales inflight replies', async () => {
    let finish; const events = [];
    const broker = makeProtocol({callWorker: () => new Promise(resolve => { finish = resolve; }),
        revokeWorker: state => events.push(`r${state.workerId}`), terminateWorker: state => events.push(`t${state.workerId}`)});
    await broker.load(owner, load());
    const pending = broker.call(owner, call(1));
    await broker.dispose(owner); finish('secret');
    await assert.rejects(pending, e => e.code === 'closed');
    assert.deepEqual(events, ['r0', 't0']);
    await assert.rejects(broker.load(owner, load(2)), e => e.code === 'closed');
    await assert.rejects(broker.call(owner, call(2)), e => e.code === 'closed');
    await assert.rejects(broker.terminate(owner, {protocol: 1, requestId: 2, workerId: 0}), e => e.code === 'closed');
    assert.throws(() => broker.snapshot(owner), e => e.code === 'closed');
});

test('dispose cleans an atomically owned target without waiting for registration', async () => {
    let finishCreation;
    let enteredCreation;
    const entered = new Promise(resolve => { enteredCreation = resolve; });
    const events = [];
    const broker = makeProtocol({
        startWorker: (_pin, workerId) => {
            enteredCreation();
            return {target: {workerId}, registration: new Promise(resolve => { finishCreation = resolve; })};
        },
        revokeWorker: () => events.push('revoke'),
        terminateWorker: () => events.push('terminate')
    });
    const pendingLoad = broker.load(owner, load());
    await entered;
    const disposing = broker.dispose(owner);
    await disposing;
    assert.deepEqual(events, ['revoke', 'terminate']);
    finishCreation({extensions: [{extensionId: 4, opcodes: ['readKind'], menus: []}]});
    await assert.rejects(pendingLoad, error => error.code === 'closed');
    assert.deepEqual(events, ['revoke', 'terminate']);
});

test('checked worker IDs and registration collection bounds fail closed', async () => {
    const exhausted = makeProtocol(); exhausted._nextWorkerId = Number.MAX_SAFE_INTEGER;
    await assert.rejects(exhausted.load(owner, load()), e => e.code === 'capacity');
    const oversized = makeProtocol({maxExtensions: 1, startWorker: (_pin, workerId) => ({target: {workerId},
        registration: Promise.resolve({extensions: [
        {extensionId: 1, opcodes: ['a'], menus: []}, {extensionId: 2, opcodes: ['b'], menus: []}
    ]})})});
    await assert.rejects(oversized.load(owner, load()), e => e.code === 'invalid-registration');
});

const fakeTime = () => {
    let now = 0; let next = 0; const timers = new Map();
    return {
        clock: {now: () => now},
        scheduler: {
            set: (delay, callback) => { const id = ++next; timers.set(id, {at: now + delay, callback}); return id; },
            clear: id => timers.delete(id)
        },
        advance: async amount => {
            now += amount;
            for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])) {
                if (timer.at <= now && timers.delete(id)) timer.callback();
            }
            await Promise.resolve(); await Promise.resolve();
        },
        setNow: value => { now = value; }
    };
};

test('resolve timeout is deterministic, consumes sequence, and clears pending', async () => {
    const time = fakeTime();
    const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, operationTimeoutMs: 10,
        resolvePin: () => new Promise(() => {})});
    const pending = broker.load(owner, load());
    await time.advance(9);
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 1});
    await time.advance(1);
    await assert.rejects(pending, e => e.code === 'timeout');
    assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
    await assert.rejects(broker.load(owner, load(0)), e => e.code === 'replayed-request');
});

test('late resolve after timeout never starts a worker', async () => {
    const time = fakeTime(); let resolve; let starts = 0;
    const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, operationTimeoutMs: 5,
        resolvePin: () => new Promise(r => { resolve = r; }), startWorker: () => { starts++; throw new Error('bad'); }});
    const pending = broker.load(owner, load());
    await time.advance(5); await assert.rejects(pending, e => e.code === 'timeout');
    resolve(pin); await Promise.resolve(); await Promise.resolve();
    assert.equal(starts, 0);
});

test('dispose returns while resolve and call dependencies never settle', async () => {
    const time = fakeTime();
    const resolving = makeProtocol({clock: time.clock, scheduler: time.scheduler,
        resolvePin: () => new Promise(() => {})});
    const pendingLoad = resolving.load(owner, load());
    await resolving.dispose(owner);
    await assert.rejects(pendingLoad, e => e.code === 'closed');

    const callTime = fakeTime(); const calling = makeProtocol({clock: callTime.clock, scheduler: callTime.scheduler,
        callWorker: () => new Promise(() => {})});
    await calling.load(owner, load());
    const pendingCall = calling.call(owner, call(1));
    await calling.dispose(owner);
    await assert.rejects(pendingCall, e => e.code === 'closed');
});

test('startWorker must return atomic target ownership synchronously', async () => {
    const broker = makeProtocol({startWorker: async () =>
        ({target: {}, registration: {extensions: []}})});
    await assert.rejects(broker.load(owner, load()), e => e.code === 'operation-failed');
});

test('registration timeout cleans exactly once and late settlement cannot publish', async () => {
    const time = fakeTime(); let finish; const events = [];
    const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, operationTimeoutMs: 5,
        startWorker: (_pin, workerId) => ({target: {workerId},
            registration: new Promise(resolve => { finish = resolve; })}),
        revokeWorker: () => events.push('revoke'), terminateWorker: () => events.push('terminate')});
    const pending = broker.load(owner, load());
    while (!finish) await Promise.resolve();
    await time.advance(5); await assert.rejects(pending, e => e.code === 'timeout');
    while (events.length < 2) await Promise.resolve();
    assert.deepEqual(events, ['revoke', 'terminate']);
    finish({extensions: [{extensionId: 4, opcodes: ['readKind'], menus: []}]});
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(events, ['revoke', 'terminate']);
    assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
});

test('late dependency rejection after timeout is handled and redacted', async () => {
    const time = fakeTime(); let rejectCall; const unhandled = [];
    const listener = reason => unhandled.push(reason); process.on('unhandledRejection', listener);
    try {
        const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, operationTimeoutMs: 5,
            callWorker: () => new Promise((_resolve, reject) => { rejectCall = reject; })});
        await broker.load(owner, load());
        const pending = broker.call(owner, call(1)); await time.advance(5);
        await assert.rejects(pending, e => e.code === 'timeout' && !/secret/.test(e.message));
        rejectCall(new Error('late secret')); await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(unhandled, []);
    } finally { process.off('unhandledRejection', listener); }
});

test('dispose with hung cleanup is bounded and terminate follows revoke timeout', async () => {
    const time = fakeTime(); const events = [];
    const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, cleanupTimeoutMs: 5,
        revokeWorker: () => { events.push('revoke'); return new Promise(() => {}); },
        terminateWorker: () => { events.push('terminate'); return new Promise(() => {}); }});
    await broker.load(owner, load());
    let disposed = false; const disposing = broker.dispose(owner).then(() => { disposed = true; });
    await Promise.resolve(); assert.deepEqual(events, ['revoke']); assert.equal(disposed, false);
    await time.advance(5);
    while (events.length < 2) await Promise.resolve();
    assert.deepEqual(events, ['revoke', 'terminate']); assert.equal(disposed, false);
    await time.advance(5); await disposing; assert.equal(disposed, true);
});

test('monotonic clock regression fails closed without consuming sequence', async () => {
    const time = fakeTime(); const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler});
    time.setNow(-1);
    await assert.rejects(broker.load(owner, load()), e => e.code === 'operation-failed');
    time.setNow(0);
    assert.equal((await broker.load(owner, load())).requestId, 0);
});

test('terminate timeout never restores worker authority and cleanup continues', async () => {
    const time = fakeTime(); const events = [];
    const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, operationTimeoutMs: 5,
        cleanupTimeoutMs: 10, revokeWorker: () => { events.push('revoke'); return new Promise(() => {}); },
        terminateWorker: () => events.push('terminate')});
    await broker.load(owner, load());
    const terminating = broker.terminate(owner, {protocol: 1, requestId: 1, workerId: 0});
    await time.advance(5);
    await assert.rejects(terminating, error => error.code === 'timeout');
    assert.deepEqual(broker.snapshot(owner), {workers: 0, pending: 0});
    await assert.rejects(broker.call(owner, call(2)), error => error.code === 'unknown-worker');
    await time.advance(5);
    while (events.length < 2) await Promise.resolve();
    assert.deepEqual(events, ['revoke', 'terminate']);
});

test('timed-out calls release capacity and never inspect late result getters', async () => {
    const time = fakeTime(); let finish; let reads = 0;
    const broker = makeProtocol({clock: time.clock, scheduler: time.scheduler, operationTimeoutMs: 5, maxPending: 1,
        callWorker: () => new Promise(resolve => { finish = resolve; })});
    await broker.load(owner, load());
    const first = broker.call(owner, call(1));
    await time.advance(5); await assert.rejects(first, error => error.code === 'timeout');
    assert.deepEqual(broker.snapshot(owner), {workers: 1, pending: 0});
    const late = {}; Object.defineProperty(late, 'secret', {get: () => { reads++; return 'secret'; }});
    finish(late); await Promise.resolve(); await Promise.resolve();
    assert.equal(reads, 0);
});

test('cleanup scheduler failure still attempts terminate and resolves disposal', async () => {
    const events = [];
    const scheduler = {set: () => { throw new Error('timer secret'); }, clear: () => {}};
    await assert.rejects(makeProtocol({scheduler}).load(owner, load()), error => error.code === 'operation-failed');

    let failCleanupTimers = false;
    const time = fakeTime();
    const conditionalScheduler = {
        set: (delay, callback) => {
            if (failCleanupTimers && delay === 7) throw new Error('timer secret');
            return time.scheduler.set(delay, callback);
        },
        clear: time.scheduler.clear
    };
    const broker = makeProtocol({clock: time.clock, scheduler: conditionalScheduler, cleanupTimeoutMs: 7,
        revokeWorker: () => { events.push('revoke'); return new Promise(() => {}); },
        terminateWorker: () => events.push('terminate')});
    await broker.load(owner, load()); failCleanupTimers = true;
    await broker.dispose(owner);
    assert.deepEqual(events, ['revoke', 'terminate']);
});

test('a synchronous timeout callback cannot strand pending capacity', async () => {
    const scheduler = {set: (_delay, callback) => { callback(); return 1; }, clear: () => {}};
    const broker = makeProtocol({scheduler, maxPending: 1});
    await assert.rejects(broker.load(owner, load()), error => error.code === 'timeout');
    assert.equal(broker._operations.size, 0);
    await assert.rejects(broker.load(owner, load(1)), error => error.code === 'timeout');
    assert.equal(broker._operations.size, 0);
});
