import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {traceCpxPxtFactory, CPX_TRACE_PREFIX} from './helpers/cpx-pxt-trace.mjs';

// Interface mocks only: no compiler, simulator, extension or guest executes.
function fixture () {
    const lines = [], calls = [];
    const result = {original: true};
    const failure = new Error('original failure');
    const pending = Promise.resolve(result);
    const state = {buffer: new Uint8Array(30), length: 10,
        pixelColor (i) { return Array.from(this.buffer.slice(i * 3, i * 3 + 3)); }};
    const board = {defaultNeopixelPin: () => ({id: 8}), tryGetNeopixelState: () => state,
        writeSerial: line => lines.push(line)};
    class EventBus {
        queue (...args) { calls.push({kind: 'event', receiver: this, args}); return result; }
    }
    class Runtime {
        runFiberAsync (...args) { calls.push({kind: 'fiber', receiver: this, args}); return pending; }
    }
    const light = {sendBuffer (...args) {
        calls.push({kind: 'send', receiver: this, args});
        state.buffer = args[3].data;
        return result;
    }};
    const audio = {queuePlayInstructions (...args) {
        calls.push({kind: 'audio', receiver: this, args}); return result;
    }};
    const iface = {pxsim: {board: () => board, EventBus, Runtime, light, AudioContextManager: audio},
        maybeYield (...args) {
            calls.push({kind: 'yield', receiver: this, args});
            if (args[0].fail) throw failure;
            return args[0].yield;
        }};
    iface.expectedEntry = function originalEntry () {};
    const originalFactory = '(iface => { iface.factoryInput = iface; iface.factoryCalls = (iface.factoryCalls || 0) + 1; return iface.expectedEntry; })';
    const wrapped = traceCpxPxtFactory(originalFactory);
    const factory = vm.runInNewContext(wrapped, {Date: {now: () => 1234}});
    assert.equal(factory(iface), iface.expectedEntry, 'retain the original entry point');
    assert.equal(iface.factoryInput, iface, 'retain the original interface identity');
    assert.equal(iface.factoryCalls, 1, 'call the original factory exactly once');
    const traces = () => lines.map(line => {
        assert.ok(line.startsWith(CPX_TRACE_PREFIX));
        return JSON.parse(line.slice(CPX_TRACE_PREFIX.length));
    });
    return {iface, result, failure, pending, state, lines, calls, traces};
}

test('CPX diagnostic preserves original factory bytes and refuses absent input', () => {
    const original = '// compiler heading\n(function (iface) { return iface.entry; })\n';
    const wrapped = traceCpxPxtFactory(original);
    assert.equal(wrapped.split(original).length, 2);
    for (const value of ['', null, undefined, 7]) assert.throws(() => traceCpxPxtFactory(value), /factory expression required/);
});

test('CPX yield observer preserves receiver, arguments, result and original exception', () => {
    const f = fixture();
    const frame = {yield: true, fn: function originalFrame () {}};
    assert.equal(f.iface.maybeYield(frame, 7, 9), true);
    assert.equal(f.calls[0].receiver, f.iface);
    assert.deepEqual(f.calls[0].args, [frame, 7, 9]);
    assert.equal(f.traces()[0].kind, 'yield');
    assert.equal(f.traces()[0].t, 1234);
    assert.equal(f.traces()[0].function, 'originalFrame');
    assert.equal(f.iface.maybeYield({yield: false}, 8, 10), false);
    const unbound = f.iface.maybeYield;
    assert.equal(unbound({yield: false}, 8, 10), false);
    assert.equal(f.calls.at(-1).receiver, undefined, 'unbound invocation must retain its original receiver');
    assert.equal(f.lines.length, 1, 'ordinary false checks are not emitted');
    assert.throws(() => f.iface.maybeYield({fail: true}, 0, 0), error => error === f.failure);
});

test('CPX event and fiber observers preserve original receiver and promise identity', () => {
    const f = fixture();
    const bus = new f.iface.pxsim.EventBus();
    const runtime = new f.iface.pxsim.Runtime();
    const handler = {func: function originalHandler () {}};
    assert.equal(bus.queue(1, 3, 5), f.result);
    assert.equal(runtime.runFiberAsync(handler, 2, 4, 6), f.pending);
    assert.equal(f.calls[0].receiver, bus);
    assert.deepEqual(f.calls[0].args, [1, 3, 5]);
    assert.equal(f.calls[1].receiver, runtime);
    assert.deepEqual(f.calls[1].args, [handler, 2, 4, 6]);
    assert.equal(f.calls[1].args[0], handler);
    assert.deepEqual(f.traces().map(t => t.kind), ['event-queue', 'fiber-request']);
});

test('CPX send observer records alias identity without replacing or copying the supplied buffer', () => {
    const f = fixture();
    const data = new Uint8Array(30).fill(7);
    const args = [{id: 8}, undefined, 1, {data}];
    assert.equal(f.iface.pxsim.light.sendBuffer(...args), f.result);
    assert.equal(f.state.buffer, data);
    assert.equal(f.calls[0].receiver, f.iface.pxsim.light);
    assert.deepEqual(f.calls[0].args, args);
    assert.equal(f.calls[0].args[3], args[3]);
    const [trace] = f.traces();
    assert.equal(trace.input, trace.after.buffer);
    assert.notEqual(trace.before.buffer, trace.after.buffer);
    assert.deepEqual(trace.after.pixels, Array(10).fill(0x070707));
    data.fill(9);
    f.iface.maybeYield({yield: true}, 0, 0);
    assert.equal(f.traces()[1].ring.buffer, trace.after.buffer);
    assert.deepEqual(f.traces()[1].ring.pixels, Array(10).fill(0x090909));
});

test('CPX audio observer preserves the original instruction buffer and scheduling offset', () => {
    const f = fixture();
    const buffer = {data: Uint8Array.from([3, 0, 184, 1, 100, 0])};
    const audio = f.iface.pxsim.AudioContextManager;
    assert.equal(audio.queuePlayInstructions(-1, buffer), f.result);
    assert.equal(f.calls[0].receiver, audio);
    assert.deepEqual(f.calls[0].args, [-1, buffer]);
    assert.equal(f.calls[0].args[1], buffer);
    assert.equal(f.traces()[0].when, -1);
    assert.deepEqual(f.traces()[0].bytes, Array.from(buffer.data));
});


test('CPX observer retains pre-board records without changing the original event result', () => {
    const f = fixture();
    const getBoard = f.iface.pxsim.board;
    f.iface.pxsim.board = () => null;
    const bus = new f.iface.pxsim.EventBus();
    assert.equal(bus.queue(1, 3), f.result);
    assert.equal(f.iface.maybeYield({yield: true}, 0, 0), true);
    assert.equal(f.lines.length, 0, 'construction records wait for the original board collector');
    f.iface.pxsim.board = getBoard;
    assert.equal(bus.queue(2, 4), f.result);
    assert.deepEqual(f.traces().map(t => t.kind), ['event-queue', 'yield', 'event-queue']);
    assert.equal(f.traces()[0].id, 1);
    assert.equal(f.traces()[1].ring.buffer, null);
    assert.equal(f.traces()[2].id, 2);
});
