import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

test('source-visible worker messaging is locked while captured dispatch transport remains live', async () => {
    const outbound = [];
    const listeners = new Map();
    const fakeSelf = {
        postMessage: message => outbound.push(message),
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: () => {},
        close: () => {}
    };
    const previousSelf = globalThis.self;
    globalThis.self = fakeSelf;
    try {
        const filename = path.join(root, 'overlay/scratch-vm/src/dispatch/worker-dispatch.transport-test.js');
        const sharedFilename = path.join(root, 'packages/scratch-vm/src/dispatch/shared-dispatch.transport-test.js');
        const shared = new Module(sharedFilename);
        shared.filename = sharedFilename;
        shared.paths = Module._nodeModulePaths(path.dirname(sharedFilename));
        shared.require = request => request === '../util/log' ? {warn: () => {}, error: () => {}} :
            Module.prototype.require.call(shared, request);
        shared._compile(readFileSync(path.join(root,
            'packages/scratch-vm/src/dispatch/shared-dispatch.js'), 'utf8'), sharedFilename);
        const mod = new Module(filename);
        mod.filename = filename;
        mod.paths = Module._nodeModulePaths(path.dirname(filename));
        mod.require = request => {
            if (request === '../util/log') return {warn: () => {}, error: () => {}};
            if (request === './shared-dispatch') return shared.exports;
            return Module.prototype.require.call(mod, request);
        };
        mod._compile(readFileSync(path.join(root,
            'overlay/scratch-vm/src/dispatch/worker-dispatch.js'), 'utf8'), filename);
        const dispatch = mod.exports;
        const receive = message => listeners.get('message')({data: message});

        receive({service: 'dispatch', method: 'handshake', responseId: 1, args: [true]});
        assert.equal(await dispatch.waitForConnection, true);
        await new Promise(resolve => setImmediate(resolve));
        outbound.length = 0;

        dispatch.lockSourceMessaging();
        for (const name of ['postMessage', 'onmessage', 'addEventListener', 'removeEventListener']) {
            assert.equal(fakeSelf[name], undefined, `${name} must be absent from downloaded source`);
            const descriptor = Object.getOwnPropertyDescriptor(fakeSelf, name);
            assert.deepEqual({configurable: descriptor.configurable, writable: descriptor.writable},
                {configurable: false, writable: false});
        }

        const provider = {getInfo: () => ({id: 'lockedTransport'})};
        const registration = dispatch.setExtensionService(7, 0, provider);
        await new Promise(resolve => setImmediate(resolve));
        const setService = outbound.shift();
        assert.deepEqual({service: setService.service, method: setService.method, args: setService.args},
            {service: 'dispatch', method: 'setService', args: [0]});
        receive({responseId: setService.responseId, result: 'extension.7.0'});
        await registration;

        receive({service: 'extension.7.0', method: 'getInfo', responseId: 9, args: []});
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(outbound.pop(), {responseId: 9, result: {id: 'lockedTransport'}});

        const capability = dispatch.requestCapability('project.metadata.read', {field: 'locale'});
        await new Promise(resolve => setImmediate(resolve));
        const capabilityFrame = outbound.shift();
        assert.deepEqual(capabilityFrame.args, [{
            protocol: 1,
            requestId: 0,
            operation: 'project.metadata.read',
            args: {field: 'locale'}
        }]);
        assert.equal(capabilityFrame.service, 'capabilityBroker');
        assert.equal(capabilityFrame.method, 'request');
        receive({responseId: capabilityFrame.responseId, result: 'de-DE'});
        assert.equal(await capability, 'de-DE');
    } finally {
        if (previousSelf === undefined) delete globalThis.self;
        else globalThis.self = previousSelf;
    }
});
