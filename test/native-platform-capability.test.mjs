/**
 * The JavaScript half of `platform.kind.read` (CP3-D1).
 *
 * What is worth pinning here is not that it returns a string — it is the SHAPE: that the editor
 * names an operation and nothing else, that it never holds a lease, and that a build with no
 * native boundary refuses rather than inventing an answer.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require_ = createRequire(import.meta.url);
const {createNativePlatformCapability, OPERATION} =
    require_('../overlay/scratch-vm/src/extension-support/native-platform-capability.js');

const okReply = JSON.stringify({kind: 'capability', result: 'linux'});
const recorder = (reply = okReply) => {
    const calls = [];
    const invoke = async (command, params) => {
        calls.push({command, params});
        if (command === 'native_broker_open') return 'a'.repeat(64);
        if (command === 'native_broker_request') return typeof reply === 'function' ? reply() : reply;
        throw new Error(`unexpected command ${command}`);
    };
    return {calls, invoke};
};

test('no native boundary means no handler, so the operation stays unwired', () => {
    // The browser path. Fail-closed by ABSENCE: CapabilityBroker refuses an operation it has no
    // handler for, so nothing here has to decide what a browser should answer.
    assert.equal(createNativePlatformCapability({}), null);
    assert.equal(createNativePlatformCapability({invoke: null}), null);
    assert.equal(createNativePlatformCapability(), null);
});

test('the request names an operation and nothing else — no resource, no lease', async () => {
    const {calls, invoke} = recorder();
    assert.equal(await createNativePlatformCapability({invoke})({}), 'linux');

    const request = calls.find(c => c.command === 'native_broker_request');
    const payload = JSON.parse(request.params.payload);
    assert.deepEqual(Object.keys(payload).sort(), ['args', 'kind', 'operation']);
    assert.equal(payload.operation, OPERATION);
    assert.equal(payload.kind, 'capability');
    // The two things this side must NEVER supply: the resource (which would let it widen the
    // request) and a lease (which would be authority it could reuse).
    assert.equal('resource' in payload, false, 'the editor must not choose the resource');
    assert.equal('lease' in payload, false, 'the editor must never carry a lease');
    assert.equal(calls.some(c => /lease|invoke/.test(String(c.command))), false,
        `the editor must not reach the semantic commands directly: ${JSON.stringify(calls)}`);
});

test('a reply that is not a capability result is refused, not returned', async () => {
    for (const bad of [
        JSON.stringify({kind: 'call', result: 'linux'}),        // another kind's reply
        JSON.stringify({kind: 'capability', result: 42}),        // not a string
        JSON.stringify({kind: 'capability'}),                    // no result
        JSON.stringify(null),
        'not json at all'
    ]) {
        const {invoke} = recorder(bad);
        await assert.rejects(() => createNativePlatformCapability({invoke})({}),
            `a malformed reply was accepted: ${bad}`);
    }
});

test('a failure drops the session, and is never retried inside the call', async () => {
    // Retrying would spend a second lease on a request already denied once, and from here a
    // refusal and a dead session look the same.
    let requests = 0;
    const invoke = async command => {
        if (command === 'native_broker_open') return 'b'.repeat(64);
        requests++;
        throw new Error('broker refused');
    };
    const handler = createNativePlatformCapability({invoke});
    await assert.rejects(() => handler({}), /broker refused/);
    assert.equal(requests, 1, 'the call retried a refusal');

    // The NEXT call opens a fresh session rather than reusing the dead one.
    const opens = [];
    const invoke2 = async (command, params) => {
        opens.push(command);
        if (command === 'native_broker_open') return 'c'.repeat(64);
        return okReply;
    };
    const handler2 = createNativePlatformCapability({invoke: invoke2});
    await assert.rejects(() => (async () => {
        await handler2({});
        throw new Error('primed');
    })(), /primed/);
    assert.equal(opens.filter(c => c === 'native_broker_open').length, 1);
});

test('request ids advance within a session', async () => {
    const {calls, invoke} = recorder();
    const handler = createNativePlatformCapability({invoke});
    await handler({});
    await handler({});
    const ids = calls.filter(c => c.command === 'native_broker_request').map(c => c.params.requestId);
    assert.deepEqual(ids, [0, 1], 'a repeated request id would be refused as a replay');
    assert.equal(calls.filter(c => c.command === 'native_broker_open').length, 1,
        'the session is reused rather than reopened per call');
});
