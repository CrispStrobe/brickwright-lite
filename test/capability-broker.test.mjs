import {test} from 'node:test';
import assert from 'node:assert/strict';

import brokerModule from '../overlay/scratch-vm/src/extension-support/capability-broker.js';

const {CapabilityBroker, MAX_DIAGNOSTICS, VOCABULARY_VERSION} = brokerModule;
const operation = 'project.metadata.read';
const record = (workerId, capabilities = [operation]) => Object.freeze({
    protocol: 1,
    workerId,
    url: `https://gallery.invalid/${workerId}.js`,
    slug: `reviewed-${workerId}`,
    digest: String(workerId).padStart(64, '0'),
    capabilities: Object.freeze(capabilities.slice()),
    source: 'reviewed source'
});
const request = (requestId = 1, overrides = {}) => Object.assign({
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
    await assert.rejects(broker.request(worker, request(1, {operation: 'native.invoke'})), /Unknown/);
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
    const captured = request(44);
    assert.equal(await broker.request(first, captured), 'ok');
    await assert.rejects(broker.request(first, captured), /Replayed/);
    await assert.rejects(broker.request(second, captured), /not declared/);
});

test('operation arguments are exact and strictly validated', async () => {
    const worker = {};
    const broker = new CapabilityBroker({[operation]: async () => 'ok'});
    broker.attach(worker, record(6));
    await assert.rejects(broker.request(worker, request(1, {args: {field: 'digest'}})), /arguments/);
    await assert.rejects(broker.request(worker, request(2, {args: {field: 'title', extra: true}})), /arguments/);
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
    await assert.rejects(broker.request(worker, request(2)), /not active/);
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
    assert.equal(await broker.request(worker, request(100_001)), 'ok');
    assert.equal(broker.diagnostics().length, MAX_DIAGNOSTICS);
    assert.doesNotMatch(String(brokerModule.CapabilityBroker), /requestIds\s*:\s*new Set/,
        'replay state must not grow once per request');
});

test('every refusal has a stable sanitized diagnostic code', async () => {
    const cases = [
        ['invalid-envelope', request(1, {extra: true})],
        ['unknown-operation', request(2, {operation: 'native.invoke'})],
        ['invalid-arguments', request(3, {args: {field: 'digest'}})]
    ];
    const worker = {};
    const broker = new CapabilityBroker({[operation]: () => 'ok'});
    broker.attach(worker, record(10));
    for (const [code, envelope] of cases) {
        await assert.rejects(broker.request(worker, envelope), error => error.code === code);
    }

    const undeclaredWorker = {};
    broker.attach(undeclaredWorker, record(11, []));
    await assert.rejects(broker.request(undeclaredWorker, request(1)), error =>
        error.code === 'undeclared-operation');
    broker.revoke(undeclaredWorker);
    await assert.rejects(broker.request(undeclaredWorker, request(2)), error =>
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
    assert.equal(await broker.request(first, request(1)), 'worker-12');
    await assert.rejects(broker.request(second, request(1)), error => error.code === 'undeclared-operation');

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
    const pending = broker.request(worker, request(1));
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
