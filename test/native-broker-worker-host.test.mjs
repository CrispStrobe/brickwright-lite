import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import hostModule from '../overlay/scratch-vm/src/extension-support/native-broker-worker-host.js';
import workerModule from '../overlay/scratch-vm/src/extension-support/native-broker-extension-worker.js';

const {createNativeBrokerWorkerHost} = hostModule;
const {installNativeBrokerExtensionWorker} = workerModule;
const declared = 'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/capability-probe-declared.js';
const none = 'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/capability-probe-none.js';
const source = new Uint8Array(await readFile(new URL(
    '../overlay/scratch-gui/static/test-fixtures/capability-probe.js', import.meta.url)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));

class FakeWorker {
    constructor ({auto = true} = {}) { this.auto = auto; this.sent = []; this.terminated = 0; }
    emit (data) { this.onmessage?.({data}); }
    postMessage (message) {
        if (this.terminated) throw new Error('terminated');
        this.sent.push(message);
        if (!this.auto) return;
        if (!message.kind) queueMicrotask(() => this.emit({protocol: 1, kind: 'registration', workerId: message.workerId,
            extensions: [{extensionId: 4, opcodes: ['readKind'], menus: ['kindMenu']}]}));
        if (message.kind === 'call') queueMicrotask(() => this.emit({protocol: 1, kind: 'reply',
            workerId: message.workerId, requestId: message.requestId, result: {method: message.method, args: message.args}}));
    }
    terminate () { this.terminated++; }
}

class IntegratedWorker {
    constructor () {
        const port = {postMessage: data => queueMicrotask(() => this.onmessage?.({data})), close: () => {}};
        this.core = installNativeBrokerExtensionWorker({port, realm: {},
            evaluate: (text, Scratch) => Function('Scratch', text)(Scratch)});
        this.terminated = 0;
    }
    postMessage (data) { queueMicrotask(() => this.core.receive(data)); }
    terminate () { this.terminated++; this.core.terminate(); }
}

const setup = (overrides = {}) => {
    const workers = [];
    const host = createNativeBrokerWorkerHost({
        createWorker: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
        loadAsset: async () => source.slice(), sha256Hex: async bytes => hash(bytes), ...overrides
    });
    return {host, workers};
};
const pin = (host, url = none, signal = new AbortController().signal) => host.resolvePin(url, {signal});

test('packaged aliases resolve exact frozen local source before worker construction', async () => {
    const {host, workers} = setup();
    const [withCapability, without] = await Promise.all([pin(host, declared), pin(host)]);
    assert.equal(withCapability.digest, hash(source));
    assert.equal(withCapability.source, new TextDecoder().decode(source));
    assert.deepEqual(withCapability.capabilities, ['project.metadata.read']);
    assert.deepEqual(without.capabilities, []);
    assert.ok(Object.isFrozen(withCapability) && Object.isFrozen(withCapability.capabilities));
    assert.equal(workers.length, 0);
});

test('dedicated bootstrap, registration, call, revoke, and terminate use exact frames', async () => {
    const {host, workers} = setup(); const resolved = await pin(host);
    const started = host.startWorker(resolved, 7, {signal: new AbortController().signal});
    assert.deepEqual(await started.registration,
        {extensions: [{extensionId: 4, opcodes: ['readKind'], menus: ['kindMenu']}]});
    assert.deepEqual(workers[0].sent[0], {protocol: 1, workerId: 7, source: resolved.source});
    assert.deepEqual(await host.callWorker(started.target, 4, 'readKind', {x: 1}),
        {method: 'readKind', args: {x: 1}});
    assert.deepEqual(workers[0].sent[1], {protocol: 1, kind: 'call', workerId: 7, requestId: 0,
        extensionId: 4, method: 'readKind', args: {x: 1}});
    host.revokeWorker(started.target);
    await assert.rejects(host.callWorker(started.target, 4, 'readKind', {}));
    host.terminateWorker(started.target); host.terminateWorker(started.target);
    assert.deepEqual(workers[0].sent.at(-1), {protocol: 1, kind: 'terminate', workerId: 7});
    assert.equal(workers[0].terminated, 1);
});

test('packaged source runs across the real parent and dedicated worker cores', async () => {
    const workers = [];
    const host = createNativeBrokerWorkerHost({createWorker: () => {
        const worker = new IntegratedWorker(); workers.push(worker); return worker;
    }, loadAsset: async () => source.slice(), sha256Hex: async bytes => hash(bytes),
    requestCapability: async () => 'en-US'});
    const started = host.startWorker(await pin(host, declared), 11, {signal: new AbortController().signal});
    const registered = await started.registration;
    assert.deepEqual(registered.extensions[0].opcodes, ['allowed', 'sequence', 'undeclared']);
    assert.equal(await host.callWorker(started.target, 0, 'allowed', {}), 'en-US');
    host.terminateWorker(started.target);
    assert.equal(workers[0].terminated, 1);
});

test('pin authority rejects alias, byte, digest, UTF-8, and abort mutations', async () => {
    await assert.rejects(pin(setup().host, 'https://example.com/a.js'));
    await assert.rejects(pin(setup({loadAsset: async () => source.slice(1)}).host));
    await assert.rejects(pin(setup({sha256Hex: async () => '0'.repeat(64)}).host));
    await assert.rejects(pin(setup({loadAsset: async () => Uint8Array.from({length: source.length}, () => 0xff),
        sha256Hex: async () => hash(source)}).host));
    const before = new AbortController(); before.abort();
    await assert.rejects(pin(setup().host, none, before.signal), error => error.name === 'AbortError');
    const after = new AbortController();
    await assert.rejects(pin(setup({loadAsset: async () => { after.abort(); return source; }}).host, none, after.signal),
        error => error.name === 'AbortError');
});

test('identity, declaration, hostile frame, cross-worker, and replay mutations fail closed', async () => {
    const {host, workers} = setup(); const resolved = await pin(host);
    const started = host.startWorker(resolved, 7, {signal: new AbortController().signal}); await started.registration;
    await assert.rejects(host.callWorker({}, 4, 'readKind', {}));
    await assert.rejects(host.callWorker(started.target, 9, 'readKind', {}));
    await assert.rejects(host.callWorker(started.target, 4, 'native_invoke', {}));
    const accessor = {}; Object.defineProperty(accessor, 'secret', {enumerable: true, get: () => 1});
    await assert.rejects(host.callWorker(started.target, 4, 'readKind', accessor));
    const cycle = {}; cycle.self = cycle;
    await assert.rejects(host.callWorker(started.target, 4, 'readKind', cycle));
    workers[0].emit({protocol: 1, kind: 'reply', workerId: 8, requestId: 0, result: 1});
    assert.equal(workers[0].terminated, 1);

    const second = setup(); const secondPin = await pin(second.host);
    const other = second.host.startWorker(secondPin, 9, {signal: new AbortController().signal});
    second.workers[0].emit({protocol: 1, kind: 'registration', workerId: 9, extensions: [], extra: true});
    await assert.rejects(other.registration);
    assert.equal(second.workers[0].terminated, 1);

    const third = setup(); const thirdStarted = third.host.startWorker(await pin(third.host), 10,
        {signal: new AbortController().signal});
    third.workers[0].emit(new Proxy({}, {getPrototypeOf: () => { throw new Error('trap'); }}));
    await assert.rejects(thirdStarted.registration);
    assert.equal(third.workers[0].terminated, 1, 'throwing frame inspection closes the target');
});

test('capabilities are declaration-bound, sequenced, normalized, and destination-bound', async () => {
    const calls = [];
    const {host, workers} = setup({requestCapability: async (_target, operation, args) => {
        calls.push([operation, args]); return {kind: 'desktop'};
    }});
    const started = host.startWorker(await pin(host, declared), 7, {signal: new AbortController().signal});
    await started.registration;
    workers[0].emit({protocol: 1, kind: 'capability', workerId: 7, requestId: 0,
        operation: 'project.metadata.read', args: {field: 'locale'}});
    await tick();
    assert.deepEqual(calls, [['project.metadata.read', {field: 'locale'}]]);
    assert.deepEqual(workers[0].sent.at(-1), {protocol: 1, kind: 'capability-reply', workerId: 7,
        requestId: 0, result: {kind: 'desktop'}});
    workers[0].emit({protocol: 1, kind: 'capability', workerId: 7, requestId: 1,
        operation: 'platform.kind.read', args: {}});
    assert.deepEqual(workers[0].sent.at(-1), {protocol: 1, kind: 'capability-reply', workerId: 7,
        requestId: 1, failure: 'undeclared-operation'});
    workers[0].emit({protocol: 1, kind: 'capability', workerId: 7, requestId: 1,
        operation: 'project.metadata.read', args: {}});
    assert.equal(workers[0].terminated, 1, 'replayed worker-owned capability ID closes target');
});

test('worker-originated values are snapshotted and bounded before crossing host trust boundaries', async () => {
    let observed;
    const {host, workers} = setup({requestCapability: async (_target, _operation, args) => {
        observed = args;
        return {safe: true};
    }});
    const started = host.startWorker(await pin(host, declared), 7, {signal: new AbortController().signal});
    await started.registration;
    const args = {field: 'locale'};
    workers[0].emit({protocol: 1, kind: 'capability', workerId: 7, requestId: 0,
        operation: 'project.metadata.read', args});
    args.field = 'mutated';
    await tick();
    assert.deepEqual(observed, {field: 'locale'});
    assert.ok(Object.isFrozen(observed));

    const pending = host.callWorker(started.target, 4, 'readKind', {});
    const hostile = {}; Object.defineProperty(hostile, 'value', {enumerable: true, get: () => 'escaped'});
    workers[0].emit({protocol: 1, kind: 'reply', workerId: 7, requestId: 0, result: hostile});
    await assert.rejects(pending);
    assert.equal(workers[0].terminated, 1);
});

test('pending capacity, timeout, abort, and late replies clean up deterministically', async () => {
    let timer;
    const workers = [];
    const {host} = setup({maxPending: 1, scheduler: {set: (_ms, fn) => { timer = fn; return 1; }, clear: () => {}},
        createWorker: () => { const worker = new FakeWorker({auto: false}); workers.push(worker); return worker; }});
    const controller = new AbortController();
    const started = host.startWorker(await pin(host), 3, {signal: controller.signal});
    workers[0].emit({protocol: 1, kind: 'registration', workerId: 3,
        extensions: [{extensionId: 0, opcodes: ['readKind'], menus: []}]});
    await started.registration;
    const pending = host.callWorker(started.target, 0, 'readKind', {});
    await assert.rejects(host.callWorker(started.target, 0, 'readKind', {}));
    timer(); await assert.rejects(pending);
    workers[0].emit({protocol: 1, kind: 'reply', workerId: 3, requestId: 0, result: 'late'});
    assert.equal(workers[0].terminated, 1);
    controller.abort(); assert.equal(workers[0].terminated, 1);
});

test('registration deadline handles silence, late frames, synchronous timers, scheduler failure, and abort', async () => {
    const makeSilent = scheduler => {
        const workers = [];
        const host = createNativeBrokerWorkerHost({
            createWorker: () => { const worker = new FakeWorker({auto: false}); workers.push(worker); return worker; },
            loadAsset: async () => source.slice(), sha256Hex: async bytes => hash(bytes), scheduler
        });
        return {host, workers};
    };

    let deadline; const cleared = [];
    const silent = makeSilent({set: (_ms, fn) => { deadline = fn; return 41; }, clear: id => cleared.push(id)});
    const silentStart = silent.host.startWorker(await pin(silent.host), 20,
        {signal: new AbortController().signal});
    deadline();
    await assert.rejects(silentStart.registration);
    assert.equal(silent.workers[0].terminated, 1);
    assert.deepEqual(cleared, [41]);
    silent.workers[0].emit({protocol: 1, kind: 'registration', workerId: 20,
        extensions: [{extensionId: 0, opcodes: ['late'], menus: []}]});
    assert.equal(silent.workers[0].terminated, 1, 'late registration is inert');

    const synchronousClears = [];
    const synchronous = makeSilent({set: (_ms, fn) => { fn(); return 42; },
        clear: id => synchronousClears.push(id)});
    const syncStart = synchronous.host.startWorker(await pin(synchronous.host), 21,
        {signal: new AbortController().signal});
    await assert.rejects(syncStart.registration);
    assert.deepEqual(synchronousClears, [42]);
    assert.equal(synchronous.workers[0].terminated, 1);

    const failed = makeSilent({set: () => { throw new Error('scheduler failed'); }, clear: () => {}});
    const failedStart = failed.host.startWorker(await pin(failed.host), 22,
        {signal: new AbortController().signal});
    await assert.rejects(failedStart.registration);
    assert.equal(failed.workers[0].terminated, 1);

    const abortClears = [];
    const aborting = makeSilent({set: () => 43, clear: id => abortClears.push(id)});
    const controller = new AbortController();
    const abortStart = aborting.host.startWorker(await pin(aborting.host), 23, {signal: controller.signal});
    controller.abort();
    await assert.rejects(abortStart.registration);
    assert.deepEqual(abortClears, [43]);
    assert.equal(aborting.workers[0].terminated, 1);
    controller.abort();
    assert.equal(aborting.workers[0].terminated, 1, 'abort cleanup is exact once');
});

test('synchronous call timeout never posts work and setup post failure closes correlation authority', async () => {
    const workers = [];
    const scheduler = {set: (_ms, fn) => { fn(); return 71; }, clear: () => {}};
    class SynchronousWorker extends FakeWorker {
        postMessage (message) {
            if (!message.kind) {
                this.sent.push(message);
                this.emit({protocol: 1, kind: 'registration', workerId: message.workerId,
                    extensions: [{extensionId: 0, opcodes: ['readKind'], menus: []}]});
                return;
            }
            super.postMessage(message);
        }
    }
    const host = createNativeBrokerWorkerHost({createWorker: () => {
        const worker = new SynchronousWorker({auto: false}); workers.push(worker); return worker;
    }, loadAsset: async () => source.slice(), sha256Hex: async bytes => hash(bytes), scheduler});
    const started = host.startWorker(await pin(host), 31, {signal: new AbortController().signal});
    await started.registration;
    await assert.rejects(host.callWorker(started.target, 0, 'readKind', {}));
    assert.equal(workers[0].sent.filter(frame => frame.kind === 'call').length, 0);
    assert.equal(workers[0].terminated, 1);

    class ThrowingCallWorker extends SynchronousWorker {
        postMessage (message) { if (message.kind === 'call') throw new Error('post failed'); super.postMessage(message); }
    }
    const failedWorkers = [];
    const failedHost = createNativeBrokerWorkerHost({createWorker: () => {
        const worker = new ThrowingCallWorker({auto: false}); failedWorkers.push(worker); return worker;
    }, loadAsset: async () => source.slice(), sha256Hex: async bytes => hash(bytes)});
    const failed = failedHost.startWorker(await pin(failedHost), 32, {signal: new AbortController().signal});
    await failed.registration;
    await assert.rejects(failedHost.callWorker(failed.target, 0, 'readKind', {}));
    await assert.rejects(failedHost.callWorker(failed.target, 0, 'readKind', {}));
    assert.equal(failedWorkers[0].terminated, 1);
});

test('hung capabilities are bounded, time out, revoke worker promises, and ignore late completion', async () => {
    let resolveHost; const timers = [];
    const {host, workers} = setup({requestCapability: () => new Promise(resolve => { resolveHost = resolve; }),
        scheduler: {set: (_ms, fn) => { timers.push(fn); return timers.length; }, clear: () => {}}});
    const started = host.startWorker(await pin(host, declared), 40, {signal: new AbortController().signal});
    await started.registration;
    workers[0].emit({protocol: 1, kind: 'capability', workerId: 40, requestId: 0,
        operation: 'project.metadata.read', args: {}});
    await tick();
    timers.at(-1)();
    assert.deepEqual(workers[0].sent.at(-1), {protocol: 1, kind: 'capability-reply', workerId: 40,
        requestId: 0, failure: 'unavailable-operation'});
    resolveHost('late'); await tick();
    assert.equal(workers[0].sent.filter(frame => frame.kind === 'capability-reply').length, 1);

    workers[0].emit({protocol: 1, kind: 'capability', workerId: 40, requestId: 1,
        operation: 'project.metadata.read', args: {}});
    await tick();
    host.revokeWorker(started.target);
    assert.deepEqual(workers[0].sent.at(-1), {protocol: 1, kind: 'capability-reply', workerId: 40,
        requestId: 1, failure: 'unavailable-operation'});
    resolveHost('later'); await tick();
    assert.equal(workers[0].sent.filter(frame => frame.kind === 'capability-reply').length, 2);
});

test('revocation settles pre-registration ownership and late capability frames close without retention', async () => {
    const workers = [];
    const {host} = setup({createWorker: () => {
        const worker = new FakeWorker({auto: false}); workers.push(worker); return worker;
    }});
    const beforeRegistration = host.startWorker(await pin(host), 20, {signal: new AbortController().signal});
    host.revokeWorker(beforeRegistration.target);
    await assert.rejects(beforeRegistration.registration);
    workers[0].emit({protocol: 1, kind: 'registration', workerId: 20,
        extensions: [{extensionId: 0, opcodes: ['readKind'], menus: []}]});
    assert.equal(workers[0].terminated, 1);

    const started = host.startWorker(await pin(host, declared), 21, {signal: new AbortController().signal});
    workers[1].emit({protocol: 1, kind: 'registration', workerId: 21,
        extensions: [{extensionId: 0, opcodes: ['readKind'], menus: []}]});
    await started.registration;
    host.revokeWorker(started.target);
    workers[1].emit({protocol: 1, kind: 'capability', workerId: 21, requestId: 0,
        operation: 'project.metadata.read', args: {}});
    assert.equal(workers[1].terminated, 1);
    assert.equal(started.target.capabilityPending.size, 0);
});

test('synchronous registration cannot acquire a stray deadline after publication', async () => {
    let scheduled = 0;
    class SynchronousWorker extends FakeWorker {
        postMessage (message) {
            this.sent.push(message);
            this.emit({protocol: 1, kind: 'registration', workerId: message.workerId,
                extensions: [{extensionId: 0, opcodes: ['readKind'], menus: []}]});
        }
    }
    const worker = new SynchronousWorker({auto: false});
    const {host} = setup({createWorker: () => worker,
        scheduler: {set: () => { scheduled++; return 1; }, clear: () => {}}});
    const started = host.startWorker(await pin(host), 12, {signal: new AbortController().signal});
    await started.registration;
    assert.equal(scheduled, 0);
    assert.equal(worker.terminated, 0);
    host.terminateWorker(started.target);
});
