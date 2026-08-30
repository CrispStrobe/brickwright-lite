import {test} from 'node:test';
import assert from 'node:assert/strict';

import brokerModule from '../overlay/scratch-vm/src/extension-support/capability-broker.js';

const {CapabilityBroker, VOCABULARY_VERSION} = brokerModule;
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
