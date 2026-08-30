import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const managerSource = readFileSync(
    path.join(root, 'overlay/scratch-vm/src/extension-support/extension-manager.js'), 'utf8');

const loadManager = ({pin, verify, dispatch, adapter}) => {
    const filename = path.join(root, 'overlay/scratch-vm/src/extension-support/extension-manager.loader-test.js');
    const mod = new Module(filename);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = request => {
        if (request === '../dispatch/central-dispatch') return dispatch;
        if (request === '../util/log') return {warn: () => {}, error: () => {}};
        if (request === '../util/maybe-format-message') return value => value;
        if (request === './block-type') return {};
        if (request === './gallery-integrity') return {
            pinForURL: () => pin,
            pinStatusFor: () => 'pinned',
            verifyGallerySource: verify
        };
        if (request === '../extensions/crispstrobe/adapter') return adapter;
        return Module.prototype.require.call(mod, request);
    };
    mod._compile(managerSource, filename);
    return mod.exports;
};

test('worker pin is fetched, verified and decoded before immutable host allocation', async () => {
    const events = [];
    let added;
    class FakeWorker {
        constructor (url) {
            events.push(`worker:${url}`);
        }
    }
    const oldWorker = globalThis.Worker;
    const oldFetch = globalThis.fetch;
    globalThis.Worker = FakeWorker;
    globalThis.fetch = async () => ({
        ok: true,
        arrayBuffer: async () => {
            events.push('bytes');
            return new TextEncoder().encode('Scratch.extensions.register({});').buffer;
        }
    });
    try {
        const dispatch = {
            setService: () => Promise.resolve(),
            addWorker: (worker, record) => {
                events.push('add');
                added = {worker, record};
            }
        };
        const pin = {
            slug: 'safe',
            served: 'a'.repeat(64),
            repo: 'b'.repeat(64),
            capabilities: ['fetch'],
            brokerCapabilities: ['project.metadata.read'],
            migration: {status: 'worker'}
        };
        const Manager = loadManager({
            pin,
            dispatch,
            verify: async () => events.push('verify'),
            adapter: () => assert.fail('worker pins must not use the adapter')
        });
        const manager = new Manager({});
        const loading = manager.loadExtensionURL('https://example.test/safe.js');
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(events, ['bytes', 'verify', 'worker:./extension-worker.js', 'add']);
        assert.equal(manager.pendingExtensions.length, 0, 'new path must not use the FIFO');
        assert.equal(added.record.protocol, 1);
        assert.equal(added.record.workerId, 0);
        assert.equal(added.record.url, 'https://example.test/safe.js');
        assert.equal(added.record.slug, 'safe');
        assert.equal(added.record.digest, 'a'.repeat(64));
        assert.deepEqual(added.record.capabilities, ['project.metadata.read']);
        assert.match(added.record.source, /Scratch\.extensions/);
        assert.ok(Object.isFrozen(added.record));
        assert.ok(Object.isFrozen(added.record.capabilities));
        assert.equal(manager.pendingWorkers[0].hostRecord, added.record);

        manager.onWorkerInit(0);
        assert.equal(await loading, 0);
    } finally {
        if (oldWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = oldWorker;
        globalThis.fetch = oldFetch;
    }
});

test('verification failure creates no worker, allocation, FIFO entry, or adapter fallback', async () => {
    let workers = 0;
    let additions = 0;
    let adaptations = 0;
    const oldWorker = globalThis.Worker;
    const oldFetch = globalThis.fetch;
    globalThis.Worker = class { constructor () { workers++; } };
    globalThis.fetch = async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)});
    try {
        const Manager = loadManager({
            pin: {slug: 'bad', served: 'a'.repeat(64), repo: 'b'.repeat(64), migration: {status: 'worker'}},
            dispatch: {setService: () => Promise.resolve(), addWorker: () => additions++},
            verify: async () => { throw new Error('pin mismatch'); },
            adapter: () => { adaptations++; }
        });
        const manager = new Manager({});
        await assert.rejects(manager.loadExtensionURL('https://example.test/bad.js'), /pin mismatch/);
        assert.deepEqual({workers, additions, adaptations}, {workers: 0, additions: 0, adaptations: 0});
        assert.equal(manager.nextExtensionWorker, 0);
        assert.equal(manager.pendingExtensions.length, 0);
        assert.equal(manager.pendingWorkers.length, 0);
    } finally {
        if (oldWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = oldWorker;
        globalThis.fetch = oldFetch;
    }
});

test('worker construction failure rejects without a dangling pending record or fallback', async () => {
    let adaptations = 0;
    const oldWorker = globalThis.Worker;
    const oldFetch = globalThis.fetch;
    globalThis.Worker = class { constructor () { throw new Error('worker unavailable'); } };
    globalThis.fetch = async () => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('verified source').buffer
    });
    try {
        const Manager = loadManager({
            pin: {slug: 'safe', served: 'a'.repeat(64), migration: {status: 'worker'}},
            dispatch: {setService: () => Promise.resolve(), addWorker: () => assert.fail('no worker to add')},
            verify: async () => true,
            adapter: () => { adaptations++; }
        });
        const manager = new Manager({});
        await assert.rejects(manager.loadExtensionURL('https://example.test/safe.js'), /worker unavailable/);
        assert.equal(adaptations, 0);
        assert.equal(manager.pendingWorkers.filter(Boolean).length, 0);
    } finally {
        if (oldWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = oldWorker;
        globalThis.fetch = oldFetch;
    }
});

test('candidate and deferred pins remain on the verified adapter path', async () => {
    for (const status of ['candidate', 'deferred']) {
        let adapted = 0;
        const oldFetch = globalThis.fetch;
        globalThis.fetch = async () => ({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode('source').buffer
        });
        try {
            class Extension {
                getInfo () { return {id: status}; }
            }
            const Manager = loadManager({
                pin: {slug: status, served: 'a'.repeat(64), repo: 'b'.repeat(64), migration: {status}},
                dispatch: {
                    setService: () => Promise.resolve(),
                    setServiceSync: () => {},
                    callSync: () => {}
                },
                verify: async () => true,
                adapter: () => { adapted++; return Extension; }
            });
            await new Manager({}).loadExtensionURL(`https://example.test/${status}.js`);
            assert.equal(adapted, 1, `${status} should retain adapter compatibility`);
        } finally {
            globalThis.fetch = oldFetch;
        }
    }
});

test('direct loader calls cannot supply or promote a non-canonical capability record', async () => {
    let fetched = 0;
    let workers = 0;
    const oldWorker = globalThis.Worker;
    const oldFetch = globalThis.fetch;
    globalThis.Worker = class { constructor () { workers++; } };
    globalThis.fetch = async () => { fetched++; return {ok: true}; };
    try {
        const Manager = loadManager({
            pin: {slug: 'candidate', capabilities: [], migration: {status: 'candidate'}},
            dispatch: {setService: () => Promise.resolve(), addWorker: () => {}},
            verify: async () => true,
            adapter: () => assert.fail('direct promoted loader must fail before choosing an adapter')
        });
        const forged = Object.freeze({
            slug: 'forged', served: 'a'.repeat(64), capabilities: ['project.metadata.read'],
            migration: {status: 'worker'}
        });
        await assert.rejects(
            new Manager({})._loadPinnedWorkerExtension('https://example.test/candidate.js', forged),
            /not an immutable promoted worker pin/
        );
        assert.deepEqual({fetched, workers}, {fetched: 0, workers: 0});
    } finally {
        if (oldWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = oldWorker;
        globalThis.fetch = oldFetch;
    }
});

test('concurrent requests for one promoted URL share one fetch, worker and initialization', async () => {
    let fetches = 0;
    let workers = 0;
    let addedRecord;
    const oldWorker = globalThis.Worker;
    const oldFetch = globalThis.fetch;
    globalThis.Worker = class { constructor () { workers++; } };
    globalThis.fetch = async () => {
        fetches++;
        return {ok: true, arrayBuffer: async () => new TextEncoder().encode('source').buffer};
    };
    try {
        const Manager = loadManager({
            pin: {slug: 'once', served: 'a'.repeat(64), capabilities: [], migration: {status: 'worker'}},
            dispatch: {setService: () => Promise.resolve(), addWorker: (_worker, record) => { addedRecord = record; }},
            verify: async () => true,
            adapter: () => assert.fail('must not adapt')
        });
        const manager = new Manager({});
        const first = manager.loadExtensionURL('https://example.test/once.js');
        const second = manager.loadExtensionURL('https://example.test/once.js');
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual({fetches, workers}, {fetches: 1, workers: 1});
        assert.equal(manager.pendingWorkers[addedRecord.workerId].hostRecord, addedRecord);
        manager.onWorkerInit(addedRecord.workerId);
        assert.equal(await first, 0);
        assert.equal(await second, 0);
        assert.equal(manager.pendingPinnedLoads.size, 0);
    } finally {
        if (oldWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = oldWorker;
        globalThis.fetch = oldFetch;
    }
});

test('worker initialization waits for getInfo and runtime primitive registration', async () => {
    let releaseRuntime;
    const runtimeRegistered = new Promise(resolve => { releaseRuntime = resolve; });
    const calls = [];
    const dispatch = {
        setService: () => Promise.resolve(),
        call: (service, method) => {
            calls.push(`${service}.${method}`);
            if (service === 'extension.4.0') return Promise.resolve({id: 'proven', blocks: []});
            if (service === 'runtime') return runtimeRegistered;
            throw new Error(`unexpected ${service}.${method}`);
        }
    };
    const Manager = loadManager({pin: null, dispatch, verify: async () => true, adapter: () => {}});
    const manager = new Manager({});
    manager.pendingWorkers[4] = {
        extensionURL: 'https://example.test/proven.js',
        serviceNames: [],
        resolve: () => {},
        reject: () => {}
    };
    let settled = false;
    const registration = manager.registerExtensionService('extension.4.0').then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'registration must not acknowledge before runtime accepts primitives');
    releaseRuntime();
    await registration;
    assert.deepEqual(calls, ['extension.4.0.getInfo', 'runtime._registerExtensionPrimitives']);
    assert.deepEqual(manager.pendingWorkers[4].serviceNames, ['extension.4.0']);
    manager.onWorkerInit(4);
    assert.equal(manager.isExtensionLoaded('https://example.test/proven.js'), true);
    assert.equal(manager.isExtensionLoaded('proven'), true);
});
