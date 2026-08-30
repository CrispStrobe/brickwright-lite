import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const manager = readFileSync(path.join(root, 'overlay/scratch-vm/src/extension-support/extension-manager.js'),
    'utf8');
const worker = readFileSync(path.join(root, 'overlay/scratch-vm/src/extension-support/extension-worker.js'),
    'utf8');
const central = readFileSync(path.join(root, 'overlay/scratch-vm/src/dispatch/central-dispatch.js'), 'utf8');
const shared = readFileSync(path.join(root, 'packages/scratch-vm/src/dispatch/shared-dispatch.js'), 'utf8');
const picker = readFileSync(path.join(root, 'overlay/scratch-gui/src/containers/extension-library.jsx'), 'utf8');
const urlLoader = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/url-extensions.js'), 'utf8');
const guiWebpack = readFileSync(path.join(root, 'overlay/scratch-gui/webpack.config.js'), 'utf8');
const applyVmOverlay = readFileSync(path.join(root, 'scripts/apply-vm-overlay.mjs'), 'utf8');
const browserProof = readFileSync(path.join(root, 'scripts/verify-extension-sandbox.mjs'), 'utf8');

test('remote URLs take the explicit worker, compatibility, or unpinned route', () => {
    assert.match(manager, /pin\.migration && pin\.migration\.status === 'worker'/,
        'only explicitly promoted pins may enter the verified worker protocol');
    assert.match(manager, /return this\._loadPinnedWorkerExtension\(extensionURL\)/);
    assert.match(manager, /const pin = pinForURL\(extensionURL\);[\s\S]*not an immutable promoted worker pin/,
        'the execution boundary must re-derive authority instead of accepting a pin object');
    assert.match(manager, /return this\._loadTrustedRemoteExtension\(extensionURL\)/,
        'candidate and deferred pins retain the compatibility adapter');
    assert.match(manager, /return this\._loadSandboxedExtension\(extensionURL\)/);
    assert.doesNotMatch(manager, /if \(isRemoteExtensionURL\(extensionURL\)\) \{\s*return this\._loadTrustedRemoteExtension/,
        'remote by itself must never imply page-realm execution');
});

test('the trusted path still verifies bytes before adapting or registering', () => {
    const bytes = manager.indexOf('return res.arrayBuffer()');
    const verified = manager.indexOf('await verifyGallerySource(extensionURL, bytes)');
    const adapted = manager.indexOf('makeCrispExtension(source)');
    const registered = manager.indexOf('this._registerInternalExtension(extensionInstance)', adapted);
    assert.ok(bytes >= 0 && bytes < verified && verified < adapted && adapted < registered);
});

test('the worker API contains compatibility helpers but no page or native bridge', () => {
    for (const name of ['ArgumentType', 'BlockType', 'TargetType', 'Cast', 'translate', 'fetch']) {
        assert.match(worker, new RegExp(`\\b${name}\\b`));
    }
    assert.match(worker, /unsandboxed: false/);
    assert.match(worker, /capabilities: Object\.freeze/);
    assert.match(worker, /dispatch\.requestCapability\(operation, args\)/);
    assert.match(worker, /blockNetworkEscapeHatches\(\)/);
    assert.match(worker, /\['Worker', 'SharedWorker'\]/);
    assert.match(worker, /\['bluetooth', 'serial', 'usb', 'hid'\]/);
    assert.match(worker, /configurable: false/);
    assert.match(worker, /writable: false/);
    assert.doesNotMatch(worker,
        /__TAURI__|__TAURI_INTERNALS__|global\.(?:window|document)|Scratch\.(?:vm|runtime|renderer)/);
});

test('the shipped worker bundle is rebuilt from the overlaid sandbox source', () => {
    assert.match(guiWebpack, /node_modules\/scratch-vm\/dist\/web/);
    assert.match(guiWebpack, /extension-worker\.\{js,js\.map\}/);
    assert.match(applyVmOverlay,
        /entry: path\.join\(DEST, 'src', 'extension-support', 'extension-worker\.js'\)/);
    assert.match(applyVmOverlay, /target: 'webworker'/);
    assert.match(applyVmOverlay, /filename: 'extension-worker\.js'/);
    assert.match(applyVmOverlay, /__BRICKWRIGHT_SANDBOX_WORKER__/);
});

test('the browser proof preserves the global URL constructor', () => {
    assert.match(browserProof, /const proofURL =/);
    assert.match(browserProof, /new URL\('static\/test-fixtures\/sandbox-probe\.js', proofURL\)/);
    assert.doesNotMatch(browserProof, /const URL =/);
});

test('forged worker dispatch calls cannot reach arbitrary main-thread services', () => {
    assert.match(central, /if \(message\.service !== 'extensions'\) return false/);
    for (const method of ['allocateWorker', 'registerExtensionService', 'onWorkerInit']) {
        assert.match(central, new RegExp(`message\\.method === '${method}'`));
    }
    assert.match(central, /Blocked extension-worker dispatch frame/);
    assert.doesNotMatch(central, /message\.service === '(?:runtime|gui)'/,
        'runtime or GUI must never be an allowed worker destination');
    assert.match(central, /this\.services\[args\[0\]\] === worker/,
        'a worker may register only a service it owns');
    assert.match(central, /this\.callbackWorkers\[responseId\] = provider/);
    assert.match(central, /expected !== worker/,
        'a worker must not answer a call which was sent to another worker');
});

test('the broker rejects privileged calls and cross-worker response forgery at runtime', async () => {
    class FakeWorker {
        constructor () {
            this.messages = [];
        }

        postMessage (message) {
            this.messages.push(message);
        }

        receive (message) {
            this.onmessage({data: message});
        }
    }

    const previousWorker = globalThis.Worker;
    globalThis.Worker = FakeWorker;
    try {
        // Compile the overlay with a packages/ filename so its relative imports
        // resolve exactly as they will after the integration step in CI.
        const log = {error: () => {}, warn: () => {}};
        const sharedFilename = path.join(root, 'packages/scratch-vm/src/dispatch/shared-dispatch.sandbox-test.js');
        const sharedModule = new Module(sharedFilename);
        sharedModule.filename = sharedFilename;
        sharedModule.paths = Module._nodeModulePaths(path.dirname(sharedFilename));
        sharedModule.require = request => {
            if (request === '../util/log') return log;
            return Module.prototype.require.call(sharedModule, request);
        };
        sharedModule._compile(shared, sharedFilename);

        const filename = path.join(root, 'packages/scratch-vm/src/dispatch/central-dispatch.sandbox-test.js');
        const brokerModule = new Module(filename);
        brokerModule.filename = filename;
        brokerModule.paths = Module._nodeModulePaths(path.dirname(filename));
        brokerModule.require = request => {
            if (request === './shared-dispatch') return sharedModule.exports;
            if (request === '../util/log') return log;
            if (request === '../extension-support/capability-broker') {
                return Module.prototype.require.call(brokerModule,
                    path.join(root, 'overlay/scratch-vm/src/extension-support/capability-broker.js'));
            }
            return Module.prototype.require.call(brokerModule, request);
        };
        brokerModule._compile(central, filename);
        const broker = brokerModule.exports;

        let privilegedCalls = 0;
        broker.setServiceSync('runtime', {
            eraseEverything: () => {
                privilegedCalls++;
            }
        });
        let registeredService = null;
        let initializedWorker = null;
        broker.setServiceSync('extensions', {
            allocateWorker: () => [1, 'https://example.invalid/extension.js'],
            registerExtensionService: service => {
                registeredService = service;
            },
            onWorkerInit: id => {
                initializedWorker = id;
            }
        });

        const first = new FakeWorker();
        const second = new FakeWorker();
        broker.addWorker(first);
        broker.addWorker(second);

        const firstHandshake = first.messages.shift();
        const secondHandshake = second.messages.shift();
        first.receive({responseId: firstHandshake.responseId, result: true});
        second.receive({responseId: secondHandshake.responseId, result: true});

        first.receive({service: 'extensions', method: 'allocateWorker', responseId: 80, args: []});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(first.messages.pop().result, [1, 'https://example.invalid/extension.js']);

        first.receive({service: 'dispatch', method: 'setService', responseId: 79, args: ['extension.2.0']});
        assert.match(first.messages.pop().error.message, /not allowed/,
            'a worker cannot pre-claim another allocated worker namespace');

        first.receive({service: 'dispatch', method: 'setService', responseId: 81, args: ['extension.1.0']});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(broker.services['extension.1.0'], first);

        first.receive({
            service: 'extensions',
            method: 'registerExtensionService',
            responseId: 82,
            args: ['extension.1.0']
        });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(registeredService, 'extension.1.0');

        first.receive({service: 'extensions', method: 'onWorkerInit', responseId: 83, args: [1]});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(initializedWorker, 1);

        first.receive({
            service: 'runtime',
            method: 'eraseEverything',
            responseId: 90,
            args: []
        });
        assert.equal(privilegedCalls, 0);
        assert.match(first.messages.pop().error.message, /not allowed/);

        broker.setServiceSync('extension.2.0', second);
        const opcodeCall = broker.call('extension.2.0', 'probe', {value: 7}, {yield: () => {}},
            {opcode: 'probe', blockType: 'reporter', func: () => 'main-thread wrapper'});
        const opcodeOutbound = second.messages.shift();
        assert.deepEqual(opcodeOutbound.args, [{value: 7}, {opcode: 'probe', blockType: 'reporter'}],
            'runtime util and the block wrapper are removed while realBlockInfo survives');
        second.receive({responseId: opcodeOutbound.responseId, result: 42});
        assert.equal(await opcodeCall, 42);

        const legitimateCall = broker.call('extension.2.0', 'getInfo');
        const outbound = second.messages.shift();
        first.receive({responseId: outbound.responseId, result: 'forged'});
        assert.match(first.messages.pop().error.message, /another worker/);

        second.receive({responseId: outbound.responseId, result: 'legitimate'});
        assert.equal(await legitimateCall, 'legitimate');

        const terminated = new FakeWorker();
        terminated.postMessage = () => {
            throw new Error('worker is terminated');
        };
        broker.addWorker(terminated);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(broker.callbacks.filter(Boolean).length, 0,
            'a synchronous postMessage failure must not leak callback registrations');
        assert.equal(broker.callbackWorkers.filter(Boolean).length, 0,
            'a synchronous postMessage failure must not leak worker bindings');
    } finally {
        if (typeof previousWorker === 'undefined') delete globalThis.Worker;
        else globalThis.Worker = previousWorker;
    }
});

test('both URL entry points tell the user what the sandbox does and does not contain', () => {
    for (const source of [picker, urlLoader]) {
        assert.match(source, /isolated worker/i);
        assert.match(source, /HTTP\(S\)/i);
        assert.match(source, /WebSockets and nested/i);
        assert.match(source, /workers are blocked/i);
        assert.doesNotMatch(source, /full access to (?:this page|the editor)/i);
    }
});
