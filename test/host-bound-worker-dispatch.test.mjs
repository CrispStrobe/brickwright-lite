import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const centralSource = readFileSync(path.join(root,
    'overlay/scratch-vm/src/dispatch/central-dispatch.js'), 'utf8');
const sharedSource = readFileSync(path.join(root,
    'packages/scratch-vm/src/dispatch/shared-dispatch.js'), 'utf8');
const extensionWorkerSource = readFileSync(path.join(root,
    'overlay/scratch-vm/src/extension-support/extension-worker.js'), 'utf8');
const workerDispatchSource = readFileSync(path.join(root,
    'overlay/scratch-vm/src/dispatch/worker-dispatch.js'), 'utf8');

class FakeWorker {
    constructor () {
        this.messages = [];
        this.listeners = {};
    }

    postMessage (message) {
        this.messages.push(message);
    }

    addEventListener (type, listener) {
        this.listeners[type] = listener;
    }

    receive (message) {
        this.onmessage({data: message});
    }
}

const compileBroker = () => {
    const log = {error: () => {}, warn: () => {}};
    const sharedFilename = path.join(root, 'packages/scratch-vm/src/dispatch/shared-dispatch.host-bound-test.js');
    const sharedModule = new Module(sharedFilename);
    sharedModule.filename = sharedFilename;
    sharedModule.require = request => {
        if (request === '../util/log') return log;
        return Module.prototype.require.call(sharedModule, request);
    };
    sharedModule._compile(sharedSource, sharedFilename);
    const filename = path.join(root, 'packages/scratch-vm/src/dispatch/central-dispatch.host-bound-test.js');
    const brokerModule = new Module(filename);
    brokerModule.filename = filename;
    brokerModule.require = request => {
        if (request === './shared-dispatch') return sharedModule.exports;
        if (request === '../util/log') return log;
        if (request === '../extension-support/capability-broker') {
            return Module.prototype.require.call(brokerModule,
                path.join(root, 'overlay/scratch-vm/src/extension-support/capability-broker.js'));
        }
        return Module.prototype.require.call(brokerModule, request);
    };
    brokerModule._compile(centralSource, filename);
    return brokerModule.exports;
};

const record = (workerId, source = 'Scratch.extensions.register({getInfo(){return {id:"x"}}});', capabilities = []) =>
    Object.freeze({
        protocol: 1,
        workerId,
        url: 'https://example.invalid/x.js',
        capabilities: Object.freeze(capabilities.slice()),
        source
    });

test('host-bound capability request returns only the semantic broker result', async () => {
    const previousWorker = globalThis.Worker;
    globalThis.Worker = FakeWorker;
    try {
        const broker = compileBroker();
        broker.capabilityBroker._handlers['project.metadata.read'] = async args => `value:${args.field}`;
        const worker = new FakeWorker();
        broker.addWorker(worker, record(31, 'source', ['project.metadata.read']));
        broker.workerState.get(worker).initialized = true;
        worker.receive({
            service: 'capabilityBroker',
            method: 'request',
            responseId: 901,
            args: [{
                protocol: 1,
                requestId: 1,
                operation: 'project.metadata.read',
                args: {field: 'locale'}
            }]
        });
        await new Promise(resolve => setImmediate(resolve));
        const reply = worker.messages.find(message => message.responseId === 901);
        assert.deepEqual(reply, {responseId: 901, result: 'value:locale'});
    } finally {
        if (typeof previousWorker === 'undefined') delete globalThis.Worker;
        else globalThis.Worker = previousWorker;
    }
});

const connect = async (broker, worker, hostRecord) => {
    broker.addWorker(worker, hostRecord);
    const handshake = worker.messages.shift();
    assert.deepEqual({service: handshake.service, method: handshake.method},
        {service: 'dispatch', method: 'handshake'});
    assert.ok(broker.workerState.has(worker), 'host identity exists before handshake response');
    worker.receive({responseId: handshake.responseId, result: true});
    await new Promise(resolve => setImmediate(resolve));
    const bootstrap = worker.messages.shift();
    assert.deepEqual({service: bootstrap.service, method: bootstrap.method, args: bootstrap.args}, {
        service: 'dispatch',
        method: 'bootstrap',
        args: [1, hostRecord.workerId, hostRecord.source]
    });
    return bootstrap;
};

test('host-bound worker identity precedes bootstrap and controls its namespace', async () => {
    const previousWorker = globalThis.Worker;
    globalThis.Worker = FakeWorker;
    try {
        const broker = compileBroker();
        const managerCalls = [];
        broker.setServiceSync('extensions', {
            registerExtensionService: service => managerCalls.push(['register', service]),
            onWorkerInit: (id, error) => managerCalls.push(['init', id, error])
        });
        const worker = new FakeWorker();
        await connect(broker, worker, record(7));

        worker.receive({service: 'extensions', method: 'allocateWorker', responseId: 10, args: []});
        assert.match(worker.messages.pop().error.message, /not allowed/);

        worker.receive({service: 'dispatch', method: 'setService', responseId: 11, args: [0]});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(broker.services['extension.7.0'], worker);
        assert.equal(worker.messages.pop().result, 'extension.7.0');

        worker.receive({service: 'extensions', method: 'registerExtensionService', responseId: 12, args: [0]});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(managerCalls.shift(), ['register', 'extension.7.0']);

        worker.receive({service: 'extensions', method: 'onWorkerInit', responseId: 13, args: []});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(managerCalls.shift(), ['init', 7, undefined]);
    } finally {
        if (typeof previousWorker === 'undefined') delete globalThis.Worker;
        else globalThis.Worker = previousWorker;
    }
});

test('the explicit legacy handshake retains the custom-URL FIFO protocol', async () => {
    const previousWorker = globalThis.Worker;
    globalThis.Worker = FakeWorker;
    try {
        const broker = compileBroker();
        let registered;
        broker.setServiceSync('extensions', {
            allocateWorker: () => [3, 'https://custom.invalid/legacy.js'],
            registerExtensionService: service => {
                registered = service;
            },
            onWorkerInit: () => {}
        });
        const worker = new FakeWorker();
        broker.addWorker(worker);
        const handshake = worker.messages.shift();
        assert.deepEqual(handshake.args, [false]);
        worker.receive({responseId: handshake.responseId, result: true});
        worker.receive({service: 'extensions', method: 'allocateWorker', responseId: 30, args: []});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(worker.messages.pop().result, [3, 'https://custom.invalid/legacy.js']);
        worker.receive({service: 'dispatch', method: 'setService', responseId: 31,
            args: ['extension.3.0']});
        await new Promise(resolve => setImmediate(resolve));
        worker.messages.pop();
        worker.receive({service: 'extensions', method: 'registerExtensionService', responseId: 32,
            args: ['extension.3.0']});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(registered, 'extension.3.0');
    } finally {
        if (typeof previousWorker === 'undefined') delete globalThis.Worker;
        else globalThis.Worker = previousWorker;
    }
});

test('broker rejects cross-owner frames and binds replies to their destination', async () => {
    const previousWorker = globalThis.Worker;
    globalThis.Worker = FakeWorker;
    try {
        const broker = compileBroker();
        broker.setServiceSync('extensions', {onWorkerInit: () => {}});
        const first = new FakeWorker();
        const second = new FakeWorker();
        await connect(broker, first, record(1, 'first'));
        await connect(broker, second, record(2, 'second'));

        first.receive({service: 'dispatch', method: 'setService', responseId: 20, args: [0]});
        await new Promise(resolve => setImmediate(resolve));
        first.messages.pop();
        broker.setServiceSync('extension.2.0', second);

        first.receive({service: 'extensions', method: 'registerExtensionService', responseId: 21, args: [1]});
        assert.match(first.messages.pop().error.message, /not allowed/,
            'an extension cannot register another host-bound namespace');

        const call = broker.call('extension.2.0', 'getInfo');
        const outbound = second.messages.shift();
        first.receive({responseId: outbound.responseId, result: 'forged'});
        assert.match(first.messages.pop().error.message, /another worker/);
        second.receive({responseId: outbound.responseId, result: 'owned'});
        assert.equal(await call, 'owned');
    } finally {
        if (typeof previousWorker === 'undefined') delete globalThis.Worker;
        else globalThis.Worker = previousWorker;
    }
});

test('termination removes owned services and rejects destination callbacks', async () => {
    const previousWorker = globalThis.Worker;
    globalThis.Worker = FakeWorker;
    try {
        const broker = compileBroker();
        const initFailures = [];
        broker.setServiceSync('extensions', {onWorkerInit: (id, error) => initFailures.push([id, error])});
        const worker = new FakeWorker();
        await connect(broker, worker, record(9));
        broker.setServiceSync('extension.9.0', worker);
        const pending = broker.call('extension.9.0', 'getInfo');
        worker.messages.shift();
        const failure = new Error('worker crashed');
        worker.listeners.error(failure);
        await assert.rejects(pending, /worker crashed/);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(broker.services['extension.9.0'], undefined);
        assert.equal(broker.workerState.has(worker), false);
        assert.deepEqual(initFailures, [[9, failure]]);
        assert.equal(broker.callbacks.filter(Boolean).length, 0);
        assert.equal(broker.callbackWorkers.filter(Boolean).length, 0);
    } finally {
        if (typeof previousWorker === 'undefined') delete globalThis.Worker;
        else globalThis.Worker = previousWorker;
    }
});

test('worker bootstrap locks escape hatches before evaluating verified source', () => {
    const lock = extensionWorkerSource.indexOf('blockNetworkEscapeHatches();');
    const evaluate = extensionWorkerSource.indexOf('(0, eval)');
    assert.ok(lock >= 0 && lock < evaluate);
    assert.match(extensionWorkerSource, /if \(hostBound\) return;\s*dispatch\.call\('extensions', 'allocateWorker'\)/,
        'only the explicitly legacy handshake may enter FIFO allocation');
    assert.match(workerDispatchSource, /_remoteCall\(hostTransport, 'dispatch', 'setService', extensionId\)/);
});
