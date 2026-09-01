import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import protocolModule from '../overlay/scratch-vm/src/extension-support/native-broker-protocol.js';
import bootstrapModule from '../apps/tauri/src-tauri/src/native_broker_bootstrap.js';

const {NativeBrokerProtocol} = protocolModule;
const {exactRealm, FAILURE_CODES, createNativeBrokerReceiver} = bootstrapModule;
const sid = byte => byte.toString(16).padStart(2, '0').repeat(32);
const url = 'https://gallery.invalid/reviewed.js';
const delivery = (session, correlation, kind, requestId, fields) =>
    ({session, correlation, kind, requestId, payload: JSON.stringify(fields)});
const dependencies = owner => ({
    owner,
    resolvePin: async candidate => Object.freeze({url: candidate, source: 'verified',
        capabilities: Object.freeze([])}),
    startWorker: (_pin, workerId) => ({target: {workerId}, registration: Promise.resolve({extensions: [
        {extensionId: 4, opcodes: ['readKind'], menus: []}
    ]})}),
    callWorker: async (_target, extensionId, method, args) => ({extensionId, method, args})
});

test('real protocol bootstrap maps load, call, and terminate replies exactly', async () => {
    const replies = [];
    const control = createNativeBrokerReceiver({NativeBrokerProtocol, BrokerProtocolError: protocolModule.BrokerProtocolError,
        invoke: async (command, args) => { assert.equal(command, 'native_broker_reply'); replies.push(args); },
        createProtocol: owner => new NativeBrokerProtocol(dependencies(owner))});
    const session = sid(1);
    await control.receive(delivery(session, sid(11), 'load', 0, {url}));
    await control.receive(delivery(session, sid(12), 'call', 1,
        {worker_id: 0, extension_id: 0, method: 'readKind', args: {}}));
    await control.receive(delivery(session, sid(13), 'terminate', 2, {worker_id: 0}));
    assert.deepEqual(replies.map(reply => JSON.parse(reply.payload)), [
        {kind: 'load', worker_id: 0, extension_ids: [0]},
        {kind: 'call', result: {extensionId: 4, method: 'readKind', args: {}}},
        {kind: 'terminate', terminated: true}
    ]);
    assert.deepEqual(replies.map(x => x.requestId), [0, 1, 2]);
    await control.dispose();
});

test('stable failures are code-only and fake failures normalize operation-failed', async () => {
    const replies = [];
    const codes = [...FAILURE_CODES];
    for (let index = 0; index < codes.length; index++) {
        const control = createNativeBrokerReceiver({NativeBrokerProtocol,
            BrokerProtocolError: protocolModule.BrokerProtocolError,
            invoke: async (_command, args) => replies.push(JSON.parse(args.payload)), createProtocol: owner => {
            const protocol = new NativeBrokerProtocol(dependencies(owner));
            protocol.load = async () => { throw new protocolModule.BrokerProtocolError(codes[index]); };
            return protocol;
        }});
        await control.receive(delivery(sid(20), sid(80 + index), 'load', 0, {url}));
        await control.dispose();
    }
    assert.deepEqual(replies.map(x => x.code), codes);
    assert.ok(replies.every(x => Object.keys(x).sort().join(',') === 'code,kind,request_kind'));
    const control = createNativeBrokerReceiver({NativeBrokerProtocol,
        BrokerProtocolError: protocolModule.BrokerProtocolError,
        invoke: async (_command, args) => replies.push(JSON.parse(args.payload)), createProtocol: owner => {
            const protocol = new NativeBrokerProtocol(dependencies(owner));
            protocol.load = async () => { throw {code: 'closed', secret: 'dependency stack'}; };
            return protocol;
        }});
    await control.receive(delivery(sid(21), sid(99), 'load', 0, {url}));
    assert.equal(replies.at(-1).code, 'operation-failed');
    await control.dispose();
});

test('sessions isolate sequences; replay is stable and disposal is exactly once', async () => {
    const replies = []; let disposed = 0;
    const control = createNativeBrokerReceiver({NativeBrokerProtocol, BrokerProtocolError: protocolModule.BrokerProtocolError,
        invoke: async (_command, args) => replies.push(JSON.parse(args.payload)),
        createProtocol: owner => new NativeBrokerProtocol({...dependencies(owner),
            revokeWorker: () => { disposed++; }, terminateWorker: () => {}})});
    await control.receive(delivery(sid(2), sid(31), 'load', 0, {url}));
    await control.receive(delivery(sid(2), sid(32), 'call', 0,
        {worker_id: 0, extension_id: 0, method: 'readKind', args: {}}));
    await control.receive(delivery(sid(3), sid(33), 'load', 0, {url}));
    assert.equal(replies[1].code, 'replayed-request');
    assert.equal(replies[2].kind, 'load', 'a different session owns an independent protocol sequence');
    await control.dispose(); await control.dispose();
    assert.equal(disposed, 2);
    assert.deepEqual(control.snapshot(), {sessions: 0});
});

test('reply transport failure disposes once and stale session cannot recreate authority', async () => {
    let calls = 0; let disposed = 0;
    const control = createNativeBrokerReceiver({NativeBrokerProtocol, BrokerProtocolError: protocolModule.BrokerProtocolError,
        invoke: async () => { if (calls++ === 0) throw new Error('secret transport failure'); },
        createProtocol: owner => new NativeBrokerProtocol({...dependencies(owner),
            revokeWorker: () => { disposed++; }, terminateWorker: () => {}})});
    const session = sid(4);
    await control.receive(delivery(session, sid(41), 'load', 0, {url}));
    assert.equal(disposed, 1);
    await control.receive(delivery(session, sid(42), 'load', 0, {url}));
    assert.equal(disposed, 1);
    await control.dispose();
});

test('outer descriptors, session cap, and malformed inner fields fail closed', async () => {
    const replies = []; let getterRuns = 0;
    const control = createNativeBrokerReceiver({NativeBrokerProtocol,
        BrokerProtocolError: protocolModule.BrokerProtocolError,
        invoke: async (_command, args) => replies.push(JSON.parse(args.payload)),
        createProtocol: owner => new NativeBrokerProtocol(dependencies(owner))});
    const accessor = delivery(sid(5), sid(51), 'load', 0, {url});
    Object.defineProperty(accessor, 'payload', {enumerable: true, get: () => { getterRuns++; return '{}'; }});
    await control.receive(accessor);
    assert.equal(getterRuns, 0);
    await control.receive(delivery(sid(5), sid(52), 'load', 0, {worker_id: 1}));
    assert.equal(replies.at(-1).code, 'invalid-envelope');
    for (let i = 0; i < 8; i++) await control.receive(
        delivery(sid(100 + i), sid(120 + i), 'load', 0, {url}));
    await control.receive(delivery(sid(110), sid(130), 'load', 0, {url}));
    assert.equal(replies.at(-1).code, 'capacity');
    await control.dispose();
});

test('receiver leaves no unhandled rejection or timer handle after disposal', async () => {
    const unhandled = [];
    const listener = reason => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    const control = createNativeBrokerReceiver({NativeBrokerProtocol,
        BrokerProtocolError: protocolModule.BrokerProtocolError, invoke: async () => {},
        createProtocol: owner => new NativeBrokerProtocol(dependencies(owner))});
    await control.receive(delivery(sid(6), sid(61), 'load', 0, {url}));
    await control.dispose();
    await new Promise(resolve => setImmediate(resolve));
    process.off('unhandledRejection', listener);
    assert.deepEqual(unhandled, []);
    assert.equal(process._getActiveHandles().filter(handle => handle?.constructor?.name === 'Timeout').length, 0);
});

test('an early refusal survives rejected reply transport without an unhandled rejection', async () => {
    const unhandled = [];
    const listener = reason => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    const control = createNativeBrokerReceiver({NativeBrokerProtocol,
        BrokerProtocolError: protocolModule.BrokerProtocolError,
        invoke: async () => { throw new Error('secret transport failure'); },
        createProtocol: owner => new NativeBrokerProtocol(dependencies(owner))});
    await control.receive(delivery(sid(7), sid(71), 'load', 0, {worker_id: 1}));
    await new Promise(resolve => setImmediate(resolve));
    process.off('unhandledRejection', listener);
    assert.deepEqual(unhandled, []);
    await control.dispose();
});

test('host factory establishment failures produce one redacted reply', async () => {
    for (const createProtocol of [
        () => { throw new Error('secret factory failure'); },
        () => ({secret: 'wrong protocol type'})
    ]) {
        const replies = [];
        const control = createNativeBrokerReceiver({NativeBrokerProtocol,
            BrokerProtocolError: protocolModule.BrokerProtocolError,
            invoke: async (command, args) => { replies.push({command, ...args}); }, createProtocol});
        await control.receive(delivery(sid(8), sid(81), 'load', 0, {url}));
        assert.equal(replies.length, 1);
        assert.equal(replies[0].command, 'native_broker_reply');
        assert.deepEqual(JSON.parse(replies[0].payload),
            {kind: 'failure', request_kind: 'load', code: 'operation-failed'});
        assert.deepEqual(control.snapshot(), {sessions: 0});
        await control.dispose();
    }
});

test('installation realm is exact and production receiver descriptor is immutable', () => {
    const realm = origin => {
        const value = {location: {origin, pathname: '/capability-broker.html', search: '', hash: ''}};
        value.top = value; return value;
    };
    const valid = realm('tauri://localhost');
    assert.equal(exactRealm(valid, 'tauri://localhost'), true);
    for (const invalid of [
        {...valid, top: {}},
        realm('https://tauri.localhost'),
        {...valid, location: {...valid.location, pathname: '/other.html'}},
        {...valid, location: {...valid.location, search: '?x=1'}},
        {...valid, location: {...valid.location, hash: '#x'}}
    ]) assert.equal(exactRealm(invalid, 'tauri://localhost'), false);
    const source = String(bootstrapModule.installNativeBrokerReceiver);
    assert.match(source, /configurable:\s*false/u);
    assert.match(source, /writable:\s*false/u);
});

test('the production CommonJS sources compose in separate lexical scopes', () => {
    const protocolSource = readFileSync(new URL(
        '../overlay/scratch-vm/src/extension-support/native-broker-protocol.js', import.meta.url), 'utf8');
    const bootstrapSource = readFileSync(new URL(
        '../apps/tauri/src-tauri/src/native_broker_bootstrap.js', import.meta.url), 'utf8');
    const rustSource = readFileSync(new URL(
        '../apps/tauri/src-tauri/src/native_broker.rs', import.meta.url), 'utf8');
    assert.match(rustSource, /const protocolModule=\(\(\)=>\{\{const module=/u);
    assert.match(rustSource, /const bootstrapModule=\(\(\)=>\{\{const module=/u);
    const script = `(()=>{const l=globalThis.location,expectedOrigin='tauri://localhost';
        if(globalThis.top!==globalThis||l.origin!==expectedOrigin||l.pathname!=='/capability-broker.html'||
            l.search!==''||l.hash!=='')throw new TypeError('Invalid broker realm');
        const protocolModule=(()=>{const module={exports:{}};${protocolSource};return module.exports;})();
        const bootstrapModule=(()=>{const module={exports:{}};${bootstrapSource};return module.exports;})();
        const install=bootstrapModule.installNativeBrokerReceiver;let installed=false;
        Object.defineProperty(globalThis,'__brickwrightInstallBrokerHost',{value:host=>{
            if(installed)throw new TypeError('Broker already initialized');installed=true;
            delete globalThis.__brickwrightInstallBrokerHost;
            return install({NativeBrokerProtocol:protocolModule.NativeBrokerProtocol,
                BrokerProtocolError:protocolModule.BrokerProtocolError,
                invoke:globalThis.__TAURI_INTERNALS__.invoke,createProtocol:host,expectedOrigin});
        },configurable:true});})();`;
    const realm = {location: {origin: 'tauri://localhost', pathname: '/capability-broker.html',
        search: '', hash: ''}, __TAURI_INTERNALS__: {invoke: async () => {}}};
    realm.top = realm;
    vm.runInNewContext(script, realm);
    assert.equal(typeof realm.__brickwrightInstallBrokerHost, 'function');
});
