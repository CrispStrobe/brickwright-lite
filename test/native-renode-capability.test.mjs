import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const require_ = createRequire(import.meta.url);
const {createNativeRenodeCapabilities, OPERATIONS} = require_(
    '../overlay/scratch-vm/src/extension-support/native-renode-capability.js');

test('overlay and packaged Renode capability adapters are byte-identical', () => {
    assert.equal(
        readFileSync(new URL('../packages/scratch-vm/src/extension-support/native-renode-capability.js',
            import.meta.url), 'utf8'),
        readFileSync(new URL('../overlay/scratch-vm/src/extension-support/native-renode-capability.js',
            import.meta.url), 'utf8')
    );
});

test('Renode operations are absent without the native boundary', () => {
    assert.equal(createNativeRenodeCapabilities(), null);
    assert.equal(createNativeRenodeCapabilities({invoke: null}), null);
});

test('Renode debugger operations use the broker transport and share an ordered session', async () => {
    const calls = [];
    const invoke = async (command, params) => {
        calls.push({command, params});
        if (command === 'native_broker_open') return 'a'.repeat(64);
        const request = JSON.parse(params.payload);
        return JSON.stringify({kind: 'capability', result: request.operation});
    };
    const handlers = createNativeRenodeCapabilities({invoke});
    assert.deepEqual(Object.keys(handlers).sort(), Object.values(OPERATIONS).sort());
    const callsByOperation = [
        [OPERATIONS.start, {}], [OPERATIONS.run, {}], [OPERATIONS.pause, {}],
        [OPERATIONS.reset, {}], [OPERATIONS.step, {}], [OPERATIONS.registers, {}],
        [OPERATIONS.memory, {address: 0x20000000, length: 32}],
        [OPERATIONS.state, {}],
        [OPERATIONS.setBreakpoint, {address: 0x08000120}],
        [OPERATIONS.clearBreakpoint, {address: 0x08000120}], [OPERATIONS.close, {}],
        [OPERATIONS.ev3Start, {}], [OPERATIONS.ev3Run, {}], [OPERATIONS.ev3Pause, {}],
        [OPERATIONS.ev3Reset, {}], [OPERATIONS.ev3Step, {}], [OPERATIONS.ev3Registers, {}],
        [OPERATIONS.ev3Memory, {address: 0xffff0000, length: 32}], [OPERATIONS.ev3State, {}],
        [OPERATIONS.ev3Button, {button: 'center', pressed: true}],
        [OPERATIONS.ev3Analog, {channel: 3, value: 777}],
        [OPERATIONS.ev3SetBreakpoint, {address: 0xffff0040}],
        [OPERATIONS.ev3ClearBreakpoint, {address: 0xffff0040}], [OPERATIONS.ev3Close, {}]
    ];
    for (const [operation, args] of callsByOperation) {
        assert.equal(await handlers[operation](args), operation);
    }
    const requests = calls.filter(call => call.command === 'native_broker_request');
    assert.deepEqual(requests.map(call => call.params.requestId), callsByOperation.map((_, index) => index));
    assert.deepEqual(requests.map(call => JSON.parse(call.params.payload)), callsByOperation.map(
        ([operation, args]) => ({kind: 'capability', operation, args})));
    assert.equal(calls.filter(call => call.command === 'native_broker_open').length, 1);
    assert.equal(calls.some(call => /lease|invoke/.test(call.command)), false);
});

test('malformed reply drops the session and the next operation reopens it', async () => {
    let opens = 0;
    let malformed = true;
    const invoke = async command => {
        if (command === 'native_broker_open') {
            opens++;
            return 'b'.repeat(64);
        }
        if (command === 'native_broker_main_teardown') return;
        if (malformed) {
            malformed = false;
            return JSON.stringify({kind: 'call', result: 'ready'});
        }
        return JSON.stringify({kind: 'capability', result: 'closed'});
    };
    const handlers = createNativeRenodeCapabilities({invoke});
    await assert.rejects(() => handlers[OPERATIONS.start]({}), /malformed/);
    assert.equal(await handlers[OPERATIONS.close]({}), 'closed');
    assert.equal(opens, 2);
});

test('long-running capabilities renew the bounded relay without replaying operations', async () => {
    const calls = [];
    let opens = 0;
    const invoke = async (command, params) => {
        calls.push({command, params});
        if (command === 'native_broker_open') return `session-${++opens}`;
        if (command === 'native_broker_main_teardown') return;
        return JSON.stringify({kind: 'capability', result: String(params.requestId)});
    };
    const handlers = createNativeRenodeCapabilities({invoke});
    for (let i = 0; i < 1300; i++) {
        assert.equal(await handlers[OPERATIONS.state]({}), String(i % 512));
    }
    assert.equal(opens, 3);
    assert.equal(calls.filter(c => c.command === 'native_broker_request').length, 1300);
    assert.deepEqual(calls.filter(c => c.command === 'native_broker_main_teardown').map(c => c.params),
        [{session: 'session-1'}, {session: 'session-2'}]);
});

test('simultaneous first calls share one open and unique request IDs', async () => {
    let finishOpen;
    const calls = [];
    const invoke = async (command, params) => {
        calls.push({command, params});
        if (command === 'native_broker_open') return new Promise(resolve => { finishOpen = resolve; });
        return JSON.stringify({kind: 'capability', result: String(params.requestId)});
    };
    const handlers = createNativeRenodeCapabilities({invoke});
    const first = handlers[OPERATIONS.state]({});
    const second = handlers[OPERATIONS.pause]({});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    finishOpen('owned');
    assert.deepEqual(await Promise.all([first, second]), ['0', '1']);
    assert.deepEqual(calls.filter(c => c.params).map(c => c.params.requestId), [0, 1]);
});

test('renewal drains in-flight replies before teardown and fails closed if cleanup fails', async () => {
    let resolveLast;
    let failCleanup = true;
    let opens = 0;
    const calls = [];
    const invoke = async (command, params) => {
        calls.push({command, params});
        if (command === 'native_broker_open') return `session-${++opens}`;
        if (command === 'native_broker_main_teardown') {
            if (failCleanup) throw new Error('cleanup refused');
            return;
        }
        if (params.requestId === 511) return new Promise(resolve => { resolveLast = resolve; });
        return JSON.stringify({kind: 'capability', result: 'ok'});
    };
    const handlers = createNativeRenodeCapabilities({invoke});
    for (let i = 0; i < 511; i++) await handlers[OPERATIONS.state]({});
    const last = handlers[OPERATIONS.state]({});
    await new Promise(resolve => setImmediate(resolve));
    const next = handlers[OPERATIONS.pause]({});
    const rejected = assert.rejects(next, /cleanup refused/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.some(c => c.command === 'native_broker_main_teardown'), false);
    resolveLast(JSON.stringify({kind: 'capability', result: 'last'}));
    assert.equal(await last, 'last');
    await rejected;
    assert.equal(opens, 1);
    failCleanup = false;
    assert.equal(await handlers[OPERATIONS.pause]({}), 'ok');
    assert.equal(opens, 2);
    assert.equal(calls.filter(c => c.params?.payload &&
        JSON.parse(c.params.payload).operation === OPERATIONS.pause).length, 1);
});

test('full firmware packet capability accepts only the bounded upload ABI', () => {
    const {OPERATIONS: broker} = require_('../overlay/scratch-vm/src/extension-support/capability-broker.js');
    const validate = broker['renode.spike.program.packet'].validate;
    assert.equal(validate({bytes:[112,1,5,0,0,0,0,0]}), true);
    for (const args of [{bytes:[112,1,3,0,0,0,0,0]}, {bytes:[112,1,5,0,0,0,0,0],address:0},
        {bytes:[112,1,5,0,0,0,0,true]}, {bytes:[112,1,5,0,0,0,0,256]}]) assert.equal(validate(args), false);
});

test('backend selection is an enum and cannot supply images or monitor text', () => {
    const {OPERATIONS: broker}=require_('../overlay/scratch-vm/src/extension-support/capability-broker.js');
    const valid=broker['renode.spike.session.start'].validate;
    for(const args of [{},{backend:'guest'},{backend:'nuttx'}])assert.equal(valid(args),true);
    for(const args of [{backend:'nuttx; quit'},{backend:'lego'},{backend:'nuttx',path:'/tmp/image'},{backend:true}])assert.equal(valid(args),false);
});
