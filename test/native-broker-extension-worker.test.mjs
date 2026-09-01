import assert from 'node:assert/strict';
import test from 'node:test';
import workerModule from '../overlay/scratch-vm/src/extension-support/native-broker-extension-worker.js';

const {installNativeBrokerExtensionWorker} = workerModule;
const port = () => ({messages: [], postMessage (message) { this.messages[this.messages.length] = message; }, start () {}, close () {
    this.closed = true;
}});
const realm = () => ({Worker () {}, SharedWorker () {}, WebSocket () {}, MessageChannel () {}, postMessage () {},
    importScripts () {}, navigator: {bluetooth: {}, serial: {}, usb: {}, hid: {}}});
const extension = () => ({getInfo () { return {blocks: [{opcode: 'read'}], menus: {choices: {items: 'menu'}}}; },
    read: async args => ({value: args.value}), menu: () => ['a', 'b']});
const boot = async (overrides = {}) => {
    const channel = port(); const global = realm();
    const core = installNativeBrokerExtensionWorker({port: channel, realm: global,
        evaluate: (_source, Scratch) => Scratch.extensions.register((overrides.extension || extension)())});
    await core.receive({protocol: 1, workerId: 7, source: 'reviewed'});
    return {channel, global, core};
};

const poisonPrimordials = () => {
    const replacements = [
        [Object, 'getPrototypeOf'], [Object, 'getOwnPropertyDescriptor'], [Object, 'getOwnPropertyDescriptors'],
        [Object, 'defineProperty'], [Object, 'keys'], [Object, 'entries'], [Object, 'values'], [Object, 'hasOwn'],
        [Reflect, 'apply'], [Reflect, 'ownKeys'], [Array, 'isArray'], [Array.prototype, 'push'],
        [Array.prototype, 'slice'], [Map.prototype, 'get'], [Map.prototype, 'set'], [Map.prototype, 'delete'],
        [Map.prototype, 'clear'], [Map.prototype, 'forEach'], [Set.prototype, 'add'], [Set.prototype, 'has'],
        [Set.prototype, 'delete'], [RegExp.prototype, 'test'], [JSON, 'stringify'], [TextEncoder.prototype, 'encode']
    ];
    const originals = replacements.map(([owner, key]) => [owner, key, owner[key]]);
    const originalBoolean = globalThis.Boolean; const originalString = globalThis.String;
    for (const [owner, key] of replacements) owner[key] = () => { throw new Error(`poisoned ${key}`); };
    globalThis.Boolean = () => { throw new Error('poisoned Boolean'); };
    globalThis.String = () => { throw new Error('poisoned String'); };
    return () => {
        globalThis.Boolean = originalBoolean; globalThis.String = originalString;
        for (const [owner, key, value] of originals) owner[key] = value;
    };
};

test('one-shot bootstrap locks escapes before evaluation and registers bounded methods', async () => {
    const channel = port(); const global = realm(); let observed;
    const core = installNativeBrokerExtensionWorker({port: channel, realm: global, evaluate: (_source, Scratch) => {
        observed = [global.Worker, global.WebSocket, global.postMessage, global.navigator.bluetooth];
        Scratch.extensions.register(extension());
    }});
    await core.receive({protocol: 1, workerId: 3, source: 'verified'});
    assert.equal(observed[3], undefined);
    for (const item of observed.slice(0, 3)) assert.throws(() => new item());
    assert.deepEqual(channel.messages[0], {protocol: 1, kind: 'registration', workerId: 3,
        extensions: [{extensionId: 0, opcodes: ['read'], menus: ['menu']}]});
    assert.equal(global.Scratch.extensions.unsandboxed, false);
    await core.receive({protocol: 1, workerId: 3, source: 'again'});
    assert.equal(core.snapshot().phase, 'closed');
});

test('installed port listener consumes the platform message data field', async () => {
    const channel = port(); const global = realm();
    installNativeBrokerExtensionWorker({port: channel, realm: global,
        evaluate: (_source, Scratch) => Scratch.extensions.register(extension())});
    channel.onmessage({data: {protocol: 1, workerId: 4, source: 'verified'}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(channel.messages[0].kind, 'registration');
    assert.equal(channel.messages[0].workerId, 4);
});

test('exact call executes only registered methods and returns clone-bounded result', async () => {
    const {core, channel} = await boot();
    await core.receive({protocol: 1, kind: 'call', workerId: 7, requestId: 0, extensionId: 0,
        method: 'read', args: {value: 9}});
    assert.deepEqual(channel.messages.at(-1), {protocol: 1, kind: 'reply', workerId: 7, requestId: 0,
        result: {value: 9}});
});

test('semantic capability frames expose no declarations and bind exact replies', async () => {
    let capability;
    const channel = port(); const core = installNativeBrokerExtensionWorker({port: channel, realm: realm(),
        evaluate: (_source, Scratch) => { capability = Scratch.capabilities.request;
            Scratch.extensions.register(extension()); }});
    await core.receive({protocol: 1, workerId: 9, source: 'verified'});
    const pending = capability('project.metadata.read', {field: 'locale'});
    assert.deepEqual(channel.messages.at(-1), {protocol: 1, kind: 'capability', workerId: 9, requestId: 0,
        operation: 'project.metadata.read', args: {field: 'locale'}});
    assert.equal(Object.hasOwn(channel.messages.at(-1), 'capabilities'), false);
    await core.receive({protocol: 1, kind: 'capability-reply', workerId: 9, requestId: 0, result: 'en'});
    assert.equal(await pending, 'en');
    const refused = capability('project.metadata.read', {});
    await core.receive({protocol: 1, kind: 'capability-reply', workerId: 9, requestId: 1,
        failure: 'undeclared-operation'});
    await assert.rejects(refused, error => error.code === 'undeclared-operation');
});

test('capability reply reflection, cross-id, unknown failure, and terminate drain fail closed', async () => {
    for (const reply of [
        {protocol: 1, kind: 'capability-reply', workerId: 8, requestId: 0, result: true},
        {protocol: 1, kind: 'capability-reply', workerId: 7, requestId: 1, result: true},
        {protocol: 1, kind: 'capability-reply', workerId: 7, requestId: 0, failure: 'native.invoke'}
    ]) {
        let request; const channel = port();
        const core = installNativeBrokerExtensionWorker({port: channel, realm: realm(), evaluate: (_source, Scratch) => {
            request = Scratch.capabilities.request; Scratch.extensions.register(extension());
        }});
        await core.receive({protocol: 1, workerId: 7, source: 'verified'});
        const pending = request('project.metadata.read', {}); pending.catch(() => {});
        await core.receive(reply);
        await assert.rejects(pending);
        assert.equal(core.snapshot().phase, 'closed');
    }
    let request; const final = await boot({extension: () => ({getInfo () { return {blocks: [{opcode: 'read'}]}; },
        read () {}})});
    // A separate worker exposes the request closure so termination can prove pending cleanup.
    const channel = port(); const core = installNativeBrokerExtensionWorker({port: channel, realm: realm(),
        evaluate: (_source, Scratch) => { request = Scratch.capabilities.request; Scratch.extensions.register(extension()); }});
    await core.receive({protocol: 1, workerId: 12, source: 'verified'});
    const pending = request('project.metadata.read', {}); pending.catch(() => {});
    await core.receive({protocol: 1, kind: 'terminate', workerId: 12});
    await assert.rejects(pending);
    assert.equal(core.snapshot().capabilityPending, 0);
    final.core.terminate();
});

test('bootstrap and registration reject accessors, symbols, duplicates, and oversized sets', async () => {
    for (const mutate of [
        message => Object.defineProperty(message, 'source', {enumerable: true, get: () => 'x'}),
        message => { message[Symbol('authority')] = true; }
    ]) {
        const channel = port(); const core = installNativeBrokerExtensionWorker({port: channel, realm: realm(),
            evaluate: () => { throw new Error('must not evaluate'); }});
        const message = {protocol: 1, workerId: 1, source: 'x'}; mutate(message); await core.receive(message);
        assert.equal(channel.messages[0].code, 'invalid-bootstrap');
    }
    for (const bad of [
        () => ({getInfo () { return {blocks: [{opcode: 'same'}], menus: {x: 'same'}}; }, same () {}}),
        () => ({getInfo () { return {blocks: [{opcode: 'missing'}]}; }}),
        () => {
            const candidate = {getInfo () {
                return {blocks: Array.from({length: 257}, (_, i) => ({opcode: `m${i}`}))};
            }};
            for (let index = 0; index < 257; index++) candidate[`m${index}`] = () => {};
            return candidate;
        }
    ]) {
        const channel = port(); const core = installNativeBrokerExtensionWorker({port: channel, realm: realm(),
            evaluate: (_source, Scratch) => Scratch.extensions.register(bad())});
        await core.receive({protocol: 1, workerId: 1, source: 'x'});
        assert.equal(channel.messages[0].code, 'invalid-registration');
    }
});

test('call frames reject accessors, symbols, replay, cross-worker identity, and oversized data', async () => {
    const mutations = [
        message => Object.defineProperty(message, 'args', {enumerable: true, get: () => ({})}),
        message => { message[Symbol('x')] = 1; },
        message => { message.workerId = 8; },
        message => { message.requestId = 1; },
        message => { message.args = {text: 'x'.repeat(70000)}; }
    ];
    for (const mutate of mutations) {
        const {core, channel} = await boot();
        const message = {protocol: 1, kind: 'call', workerId: 7, requestId: 0, extensionId: 0,
            method: 'read', args: {value: 1}};
        mutate(message); await core.receive(message);
        assert.equal(channel.messages.at(-1).kind, 'failure');
        assert.equal(core.snapshot().phase, 'closed');
    }
    const replay = await boot();
    const valid = {protocol: 1, kind: 'call', workerId: 7, requestId: 0, extensionId: 0,
        method: 'read', args: {value: 1}};
    await replay.core.receive(valid); await replay.core.receive(valid);
    assert.equal(replay.channel.messages.at(-1).code, 'invalid-call');
});

test('terminate is exact, idempotent, and blocks late work', async () => {
    const {core, channel} = await boot();
    await core.receive({protocol: 1, kind: 'terminate', workerId: 7});
    assert.deepEqual(channel.messages.at(-1), {protocol: 1, kind: 'terminated', workerId: 7});
    core.terminate();
    await core.receive({protocol: 1, kind: 'call', workerId: 7, requestId: 0, extensionId: 0,
        method: 'read', args: {}});
    assert.equal(channel.messages.length, 2);
    assert.equal(core.snapshot().phase, 'closed');
});

test('async failure and cleanup produce no unhandled rejection', async () => {
    const unhandled = []; const listener = reason => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    const {core, channel} = await boot({extension: () => ({getInfo () { return {blocks: [{opcode: 'read'}]}; },
        read: async () => { throw new Error('secret'); }})});
    await core.receive({protocol: 1, kind: 'call', workerId: 7, requestId: 0, extensionId: 0,
        method: 'read', args: {}});
    await new Promise(resolve => setImmediate(resolve)); process.off('unhandledRejection', listener);
    assert.deepEqual(unhandled, []); assert.equal(channel.messages.at(-1).code, 'operation-failed');
    assert.equal(core.snapshot().phase, 'closed');
});

test('malicious source cannot poison captured validation and collection primordials', async () => {
    const channel = port(); let capability; let restore;
    const core = installNativeBrokerExtensionWorker({port: channel, realm: realm(), evaluate: (_source, Scratch) => {
        capability = Scratch.capabilities.request;
        restore = poisonPrimordials();
        Scratch.extensions.register(extension());
    }});
    try {
        await core.receive({protocol: 1, workerId: 21, source: 'poison intrinsics'});
    } finally { restore?.(); }
    assert.deepEqual(channel.messages[0], {protocol: 1, kind: 'registration', workerId: 21,
        extensions: [{extensionId: 0, opcodes: ['read'], menus: ['menu']}]});

    restore = poisonPrimordials();
    let pending;
    try {
        pending = capability('project.metadata.read', {field: 'locale'});
        await core.receive({protocol: 1, kind: 'call', workerId: 21, requestId: 0, extensionId: 0,
            method: 'read', args: {value: 4}});
    } finally { restore(); }
    assert.deepEqual(channel.messages.at(-2), {protocol: 1, kind: 'capability', workerId: 21, requestId: 0,
        operation: 'project.metadata.read', args: {field: 'locale'}});
    assert.deepEqual(channel.messages.at(-1), {protocol: 1, kind: 'reply', workerId: 21, requestId: 0,
        result: {value: 4}});
    await core.receive({protocol: 1, kind: 'capability-reply', workerId: 21, requestId: 0, result: 'en'});
    assert.equal(await pending, 'en');
});

test('poisoned size and descriptor helpers cannot bypass data bounds', async () => {
    const {core, channel} = await boot();
    const restore = poisonPrimordials();
    try {
        await core.receive({protocol: 1, kind: 'call', workerId: 7, requestId: 0, extensionId: 0,
            method: 'read', args: {value: 'x'.repeat(70000)}});
    } finally { restore(); }
    assert.equal(channel.messages.at(-1).kind, 'failure');
    assert.equal(core.snapshot().phase, 'closed');
});
