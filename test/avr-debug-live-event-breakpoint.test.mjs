import test from 'node:test';
import assert from 'node:assert/strict';

import {createAvr8jsAdapter} from '../overlay/scratch-gui/src/lib/bw-board/avr8js-adapter.js';
import {createAvr8jsDebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/avr8js-debug.js';
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
    assert.deepEqual(capabilities.events, ['instruction', 'device']);
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
    assert.deepEqual(order, [
        'instruction/retire',
        'device/access',
        'instruction/retire',
        'halt@6'
    ], 'the access matches immediately but its halt waits for the STS retire');
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
