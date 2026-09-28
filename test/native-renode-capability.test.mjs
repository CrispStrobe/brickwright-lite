import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require_ = createRequire(import.meta.url);
const {createNativeRenodeCapabilities, OPERATIONS} = require_(
    '../overlay/scratch-vm/src/extension-support/native-renode-capability.js');

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
        [OPERATIONS.clearBreakpoint, {address: 0x08000120}], [OPERATIONS.close, {}]
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
