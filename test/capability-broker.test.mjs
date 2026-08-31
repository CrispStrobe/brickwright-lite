import {test} from 'node:test';
import assert from 'node:assert/strict';

import brokerModule from '../overlay/scratch-vm/src/extension-support/capability-broker.js';

const {CapabilityBroker, MAX_DIAGNOSTICS, VOCABULARY_VERSION} = brokerModule;
const operation = 'project.metadata.read';
const platformOperation = 'platform.kind.read';
const record = (workerId, capabilities = [operation]) => Object.freeze({
    protocol: 1,
    workerId,
    url: `https://gallery.invalid/${workerId}.js`,
    slug: `reviewed-${workerId}`,
    digest: String(workerId).padStart(64, '0'),
    capabilities: Object.freeze(capabilities.slice()),
    source: 'reviewed source'
});
const request = (requestId = 0, overrides = {}) => Object.assign({
    protocol: VOCABULARY_VERSION,
    requestId,
    operation,
    args: {field: 'locale'}
}, overrides);

test('one declared semantic operation succeeds with host-owned identity', async () => {
    const worker = {};
    let observedRecord;
    const broker = new CapabilityBroker({
        [operation]: async (args, hostRecord) => {
            assert.deepEqual(args, {field: 'locale'});
            observedRecord = hostRecord;
            return 'de-DE';
        }
    });
    const hostRecord = record(7);
    broker.attach(worker, hostRecord);
    assert.equal(await broker.request(worker, request()), 'de-DE');
    assert.equal(observedRecord, hostRecord);
});

test('declared platform kind read accepts only an exact empty plain argument record', async () => {
    const worker = {};
    let observedArgs;
    let observedRecord;
    const broker = new CapabilityBroker({
        [platformOperation]: async (args, hostRecord) => {
            observedArgs = args;
            observedRecord = hostRecord;
            return 'desktop';
        }
    });
    const hostRecord = record(19, [platformOperation]);
    broker.attach(worker, hostRecord);

    assert.equal(await broker.request(worker, request(0, {
        operation: platformOperation,
        args: {}
    })), 'desktop');
    assert.deepEqual(observedArgs, {});
    assert.ok(Object.isFrozen(observedArgs));
    assert.equal(observedRecord, hostRecord);
});

test('platform kind read refuses extra, inherited, and malformed arguments', async () => {
    const malformedArgs = [
        {unexpected: true},
        Object.assign(Object.create({polluted: true}), {}),
        null,
        [],
        'empty',
        0
    ];

    for (const [index, args] of malformedArgs.entries()) {
        const worker = {};
        const broker = new CapabilityBroker({[platformOperation]: () => 'desktop'});
        broker.attach(worker, record(20 + index, [platformOperation]));
        await assert.rejects(broker.request(worker, request(0, {
            operation: platformOperation,
            args
        })), error => error.code === 'invalid-arguments');
    }
});

test('platform kind read requires an exact host declaration and keeps diagnostics redacted', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[platformOperation]: () => ({secretNativeResult: true})});
    const hostRecord = record(30, []);
    broker.attach(worker, hostRecord);

    await assert.rejects(broker.request(worker, request(0, {
        operation: platformOperation,
        args: {}
    })), error => error.code === 'undeclared-operation');

    const diagnostic = broker.diagnostics().at(-1);
    assert.deepEqual({
        event: diagnostic.event,
        code: diagnostic.code,
        workerId: diagnostic.workerId,
        slug: diagnostic.slug,
        operation: diagnostic.operation,
        declared: diagnostic.declared
    }, {
        event: 'refused',
        code: 'undeclared-operation',
        workerId: 30,
        slug: 'reviewed-30',
        operation: platformOperation,
        declared: []
    });
    const serialized = JSON.stringify(diagnostic);
    assert.doesNotMatch(serialized, /reviewed source|secretNativeResult|gallery\.invalid|000000000000000000000000000000/);
});

test('undeclared operation is refused', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: async () => 'secret'});
    broker.attach(worker, record(1, []));
    await assert.rejects(broker.request(worker, request()), /not declared/);
});

test('invented operation and wildcard declaration are refused', async () => {
    const worker = {};
    const broker = new CapabilityBroker();
    broker.attach(worker, record(1, []));
    await assert.rejects(broker.request(worker, request(0, {operation: 'native.invoke'})), /Unknown/);
    assert.throws(() => new CapabilityBroker().attach({}, record(2, ['project.*'])), /Unknown capability/);
});

test('forged slug and reply-shaped reflection fields are refused', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: async () => 'secret'});
    broker.attach(worker, record(3));
    await assert.rejects(broker.request(worker, {...request(), slug: 'reviewed-elsewhere'}), /envelope/);
    await assert.rejects(broker.request(worker, {...request(2), result: 'reflected'}), /envelope/);
});

test('cross-worker replay and same-session replay are refused', async () => {
    const first = {};
    const second = {};
    const broker = new CapabilityBroker({[operation]: async () => 'ok'});
    broker.attach(first, record(4));
    broker.attach(second, record(5, []));
    const captured = request(0);
    assert.equal(await broker.request(first, captured), 'ok');
    await assert.rejects(broker.request(first, captured), /Replayed/);
    await assert.rejects(broker.request(second, captured), /not declared/);
});

test('operation arguments are exact and strictly validated', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: async () => 'ok'});
    broker.attach(worker, record(6));
    await assert.rejects(broker.request(worker, request(0, {args: {field: 'digest'}})), /arguments/);
    await assert.rejects(broker.request(worker, request(1, {args: {field: 'title', extra: true}})), /arguments/);
});

test('stale reply and post-termination request are refused', async () => {
    let complete;
    const worker = {};
    const broker = new CapabilityBroker({
        [operation]: () => new Promise(resolve => { complete = resolve; })
    });
    broker.attach(worker, record(8));
    const pending = broker.request(worker, request());
    broker.revoke(worker);
    complete('late secret');
    await assert.rejects(pending, /Stale/);
    await assert.rejects(broker.request(worker, request(1)), /not active/);
});

test('monotonic replay protection is constant-space and rejects duplicate or lower IDs', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => 'ok'});
    broker.attach(worker, record(9));
    for (let requestId = 0; requestId < 100_000; requestId++) {
        assert.equal(await broker.request(worker, request(requestId)), 'ok');
    }
    await assert.rejects(broker.request(worker, request(99_999)), error =>
        error.code === 'replayed-request');
    await assert.rejects(broker.request(worker, request(50_000)), error =>
        error.code === 'replayed-request');
    await assert.rejects(broker.request(worker, request(100_001)), error =>
        error.code === 'out-of-order-request');
    assert.equal(await broker.request(worker, request(100_000)), 'ok');
    assert.equal(broker.diagnostics().length, MAX_DIAGNOSTICS);
    assert.doesNotMatch(String(brokerModule.CapabilityBroker), /requestIds\s*:\s*new Set/,
        'replay state must not grow once per request');
});

test('every refusal has a stable sanitized diagnostic code', async () => {
    const cases = [
        ['invalid-envelope', request(0, {extra: true})],
        ['unknown-operation', request(0, {operation: 'native.invoke'})],
        ['invalid-arguments', request(1, {args: {field: 'digest'}})]
    ];
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => 'ok'});
    broker.attach(worker, record(10));
    for (const [code, envelope] of cases) {
        await assert.rejects(broker.request(worker, envelope), error => error.code === code);
    }

    const undeclaredWorker = {};
    broker.attach(undeclaredWorker, record(11, []));
    await assert.rejects(broker.request(undeclaredWorker, request(0)), error =>
        error.code === 'undeclared-operation');
    broker.revoke(undeclaredWorker);
    await assert.rejects(broker.request(undeclaredWorker, request(1)), error =>
        error.code === 'invalid-session');

    const codes = broker.diagnostics().filter(entry => entry.event === 'refused').map(entry => entry.code);
    for (const [code] of cases) assert.ok(codes.includes(code), `missing diagnostic ${code}`);
    assert.ok(codes.includes('undeclared-operation'));
    assert.ok(codes.includes('invalid-session'));
});

test('diagnostic snapshots are immutable, bounded, host-identified and redact authority data', async () => {
    const first = {};
    const second = {};
    const broker = new CapabilityBroker({[operation]: (_args, hostRecord) => `worker-${hostRecord.workerId}`});
    broker.attach(first, record(12));
    broker.attach(second, record(13, []));
    assert.equal(await broker.request(first, request(0)), 'worker-12');
    await assert.rejects(broker.request(second, request(0)), error => error.code === 'undeclared-operation');

    const snapshot = broker.diagnostics();
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(snapshot.every(Object.isFrozen));
    assert.ok(snapshot.length <= MAX_DIAGNOSTICS);
    assert.ok(snapshot.some(entry => entry.workerId === 12 && entry.slug === 'reviewed-12'));
    assert.ok(snapshot.some(entry => entry.workerId === 13 && entry.slug === 'reviewed-13'));
    for (const entry of snapshot) {
        assert.deepEqual(Object.keys(entry).sort(),
            ['code', 'declared', 'event', 'operation', 'seq', 'slug', 'time', 'workerId']);
        assert.ok(Object.isFrozen(entry.declared));
        const serialized = JSON.stringify(entry);
        for (const secret of ['reviewed source', record(12).digest, 'locale', 'worker-12']) {
            assert.doesNotMatch(serialized, new RegExp(secret));
        }
    }
    assert.throws(() => snapshot.push({}), TypeError);
});

test('revocation and stale completion are independently visible without leaking results', async () => {
    let complete;
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => new Promise(resolve => { complete = resolve; })});
    broker.attach(worker, record(14));
    const pending = broker.request(worker, request(0));
    broker.revoke(worker);
    complete({privateResult: true});
    await assert.rejects(pending, error => error.code === 'stale-reply');
    const tail = broker.diagnostics().slice(-2);
    assert.deepEqual(tail.map(entry => [entry.event, entry.code]), [
        ['revoked', 'worker-revoked'],
        ['refused', 'stale-reply']
    ]);
    assert.doesNotMatch(JSON.stringify(tail), /privateResult/);
});

test('revocation is a permanent attributed tombstone for the same worker object', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => 'ok'});
    broker.attach(worker, record(15));
    broker.revoke(worker);
    assert.throws(() => broker.attach(worker, record(16)), /already attached/,
        'a revoked transport must never acquire a second host identity');
    await assert.rejects(broker.request(worker, request(0)), error => error.code === 'invalid-session');
    const refusal = broker.diagnostics().at(-1);
    assert.deepEqual({workerId: refusal.workerId, slug: refusal.slug, code: refusal.code}, {
        workerId: 15,
        slug: 'reviewed-15',
        code: 'invalid-session'
    });
});

test('all session diagnostics share one frozen canonical declaration snapshot', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => 'ok'});
    broker.attach(worker, record(17));
    await broker.request(worker, request(0));
    await broker.request(worker, request(1));
    broker.revoke(worker);
    const entries = broker.diagnostics().filter(entry => entry.workerId === 17);
    assert.ok(entries.length >= 4);
    assert.ok(entries.every(entry => entry.declared === entries[0].declared),
        'audit recording must not allocate and sort declarations per event');
    assert.ok(Object.isFrozen(entries[0].declared));
    assert.deepEqual(entries[0].declared, [operation]);
});

test('a high-ID gap is refused without poisoning the exact-next sequence', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => 'ok'});
    broker.attach(worker, record(18));
    await assert.rejects(broker.request(worker, request(Number.MAX_SAFE_INTEGER)), error =>
        error.code === 'out-of-order-request');
    assert.equal(await broker.request(worker, request(0)), 'ok',
        'a refused gap must not self-DoS the capability session');
    await assert.rejects(broker.request(worker, request(0)), error => error.code === 'replayed-request');
});
