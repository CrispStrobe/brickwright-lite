import test from 'node:test';
import assert from 'node:assert/strict';

import {createAvr8jsAdapter} from 'bw-board/avr8js-adapter.js';
import {createAvr8jsDebugTarget} from 'bw-board/avr8js-debug.js';
import {
    commandCapability, eventBreakpointCapabilities, normalizeDebugCapabilities
} from '../overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js';
import {EventBreakpointEngine} from '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoints.js';
import {createEventBreakpointDispatcher} from
    '../overlay/scratch-gui/src/lib/bw-debug/event-breakpoint-dispatcher.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {dispatchEventBreakpointAtBoundary} from
    '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

const ldiR16 = value => 0xe000 | ((value & 0xf0) << 4) | (value & 0x0f);
const TWI_START = new Uint16Array([
    ldiR16(0xa4), // TWINT | TWSTA | TWEN
    0x9300, 0x00bc, // STS TWCR,r16
    0x0000
]);

test('real AVR device breakpoint halts only at its advertised following retire', () => {
    const adapter = createAvr8jsAdapter({program: TWI_START});
    const target = createAvr8jsDebugTarget(adapter);
    const capabilities = normalizeDebugCapabilities(target.capabilities(), {target: 'avr8js'});
    // 'memory' JOINED THIS LIST AND THAT IS THE FEATURE, not drift. Until
    // bw-board fde7556 the AVR debug target published retires and bridge
    // notifications and NO data accesses at all: it never wrapped readData /
    // writeData, so a consumer watching an AVR board saw memory accesses while
    // it ran freely and LOST them the moment a debugger attached. Folding the
    // target onto the shared instrument gave the debugger path the accessor
    // wrappers, and the declaration moved in the same commit as the behaviour.
    // Measured there: a real TWI START went from 1 device fact to 1 memory + 1
    // device -- the memory fact being the write to TWCR, the store that STARTS
    // the transaction the device fact describes. The debugger had been
    // reporting the effect and not the cause.
    assert.deepEqual(capabilities.events, ['instruction', 'device', 'memory']);
    assert.equal(capabilities.extensions.eventBreakpointBoundary, 'instruction-retire');

    const engine = new EventBreakpointEngine(eventBreakpointCapabilities(capabilities));
    assert.equal(engine.add({id: 'twi-start', kind: 'device', deviceId: 'twi0', event: 'start'}).ok, true);
    const order = [];
    let halts = 0;
    const dispatcher = createEventBreakpointDispatcher({
        engine,
        recordingSession: {status: () => ({active: false})},
        handlers: {halt: () => { halts++; order.push(`halt@${adapter.cpu.pc * 2}`); }}
    });
    const facts = [];
    const stream = createDebugEventStream();
    stream.onEvent(event => {
        facts.push(event);
        order.push(`${event.kind}/${event.phase}`);
        dispatchEventBreakpointAtBoundary({capabilities, dispatcher, event,
            options: {context: {event, counts: {}}}});
    });
    target.onDebugEvent(fact => stream.publish(fact));

    target.step('insn', 2);
    assert.equal(target.runFor(10_000), 'halted');
    // ASSERTED POSITIONALLY, NOT AS A PINNED SEQUENCE. The claim this test is
    // NAMED for is that the device access matches immediately while its halt
    // waits for the following retire — and that claim is about the ORDER of
    // three specific entries, not about everything else the stream happens to
    // carry. Pinned as a full list it broke the moment the target learned to
    // report memory accesses (bw-board fde7556), which is a capability gain
    // rather than a regression, and it would break again on the next one.
    const at = name => order.indexOf(name);
    assert.ok(at('device/access') > -1, `no device access in ${order.join(', ')}`);
    assert.ok(at('device/access') > at('instruction/retire'),
        'the access is reported inside the instruction that caused it');
    assert.equal(order.at(-1), 'halt@6',
        `the halt is last and lands at the STS retire, not at the access: ${order.join(', ')}`);
    assert.equal(order.filter(x => x === 'halt@6').length, 1, 'exactly one halt');
    assert.equal(order.filter(x => x === 'instruction/retire').length, 2,
        'two retires: the one carrying the access, and the one the halt waits for');
    assert.equal(halts, 1);

    for (const event of facts) {
        dispatchEventBreakpointAtBoundary({capabilities, dispatcher, event,
            options: {replay: true, context: {event, counts: {}}}});
    }
    assert.equal(halts, 1, 'replaying published facts neither fires nor leaves a pending double-fire');

    assert.equal(commandCapability(capabilities, 'reverseInstruction').accepted, false);
    assert.equal(commandCapability(capabilities, 'checkpoint').accepted, false);
    assert.equal(commandCapability(capabilities, 'stepCycle').accepted, false);
});

test('runner admission refuses absent or wrong boundary claims without target-kind exceptions', () => {
    let dispatches = 0;
    const dispatcher = {dispatch: () => { dispatches++; return {dispatched: true}; }};
    const event = {kind: 'device', phase: 'access'};
    for (const extensions of [undefined, {}, {eventBreakpointBoundary: 'instruction-access'}]) {
        assert.equal(dispatchEventBreakpointAtBoundary({capabilities: {extensions}, dispatcher, event}), null);
    }
    assert.equal(dispatches, 0);
    assert.deepEqual(dispatchEventBreakpointAtBoundary({
        capabilities: {extensions: {eventBreakpointBoundary: 'instruction-retire'}},
        dispatcher, event
    }), {dispatched: true});
    assert.equal(dispatches, 1);
});
