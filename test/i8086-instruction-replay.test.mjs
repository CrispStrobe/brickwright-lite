import test from 'node:test';
import assert from 'node:assert/strict';
import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {createRecordingSession} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';
import {createInstructionReplayController} from '../overlay/scratch-gui/src/lib/bw-debug/instruction-replay.js';

const fixture = () => {
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    // mov al,89h; out 63h,al; in al,62h; mov [0200h],al; nop
    machine.mem.set([0xb0, 0x89, 0xe6, 0x63, 0xe4, 0x62, 0xa2, 0x00, 0x02, 0x90], 0x100);
    machine.step();
    machine.step();
    const target = createI8086DebugTarget({machine});
    const stream = createDebugEventStream();
    const recorder = createDebugRecorder();
    const session = createRecordingSession({recorder, eventStream: stream, getTarget: () => target});
    target.onDebugEvent(fact => stream.publish(fact));
    stream.onEvent(event => session.appendBatch([event]));
    const logicalDomain = domain => domain.replace(/-reset-\d+$/, '');
    const normalizeEvent = event => {
        const {schema, seq, inputCursor, ...fact} = event;
        return {...fact, time: {...fact.time, domain: logicalDomain(fact.time.domain)}};
    };
    const controller = createInstructionReplayController({
        recorder,
        getTarget: () => target,
        subscribeEvents: listener => stream.onEvent(listener),
        normalizeTimeDomain: logicalDomain,
        normalizeEvent,
        applyInput: (t, input) => t.setInput(
            input.payload.chip, input.payload.port, input.payload.bit, input.payload.level)
    });
    return {machine, target, stream, recorder, session, controller};
};

test('8086 reverses to a retire cursor through checkpoint, logged input, and verified event replay', () => {
    const f = fixture();
    assert.equal(f.session.start().accepted, true);
    const input = {producer: 'i8086.setInput', time: f.target.debugTime(),
        payload: {chip: 'ppi1', port: 'c', bit: 3, level: 1}};
    assert.equal(f.session.appendInput(input).accepted, true);
    assert.equal(f.target.setInput('ppi1', 'c', 3, 1), true);
    f.machine.step();
    f.machine.step();
    const cursor = f.stream.nextSequence();
    const expectedState = f.machine.saveState();
    // Same timestamp, but logged after the destination cursor: replay must
    // use the event's input cursor rather than inject this future input early.
    f.session.appendInput({...input, payload: {...input.payload, level: 0}});
    f.session.stop();

    f.machine.step();
    const result = f.controller.reverseToEvent(cursor);
    assert.deepEqual(result, {accepted: true, boundary: 'instruction', eventCursor: cursor,
        checkpointId: 0, replayedInstructions: 2, replayedEvents: 4});
    assert.deepEqual(f.machine.saveState(), expectedState);
    assert.equal(f.controller.canReverse().accepted, true);
    assert.deepEqual(f.target.capabilities().reverse, undefined,
        'a target alone must not advertise the end-to-end reverse capability');
});

test('8086 reverse refuses a cursor inside an instruction event group', () => {
    const f = fixture();
    f.session.start();
    f.machine.step(); // IN: port event then retire
    f.session.stop();
    assert.equal(f.controller.reverseToEvent(1).code, 'not-instruction-boundary');
});

test('replay reports event divergence without exposing recorded payloads', () => {
    const f = fixture();
    f.session.start();
    f.machine.step();
    const cursor = f.stream.nextSequence();
    f.session.stop();
    // Replace the observer method only for replay, injecting a changed value
    // while retaining all event ordering and cursor behavior.
    const divergent = createInstructionReplayController({
        recorder: f.recorder, getTarget: () => f.target,
        subscribeEvents: listener => f.stream.onEvent(event => listener(event.kind === 'port'
            ? {...event, port: {...event.port, value: event.port.value ^ 1}} : event)),
        applyInput: (target, input) => target.setInput(
            input.payload.chip, input.payload.port, input.payload.bit, input.payload.level),
        normalizeTimeDomain: domain => domain.replace(/-reset-\d+$/, ''),
        normalizeEvent: event => {
            const {schema, seq, inputCursor, ...fact} = event;
            return {...fact, time: {...fact.time, domain: fact.time.domain.replace(/-reset-\d+$/, '')}};
        }
    });
    const result = divergent.reverseToEvent(cursor);
    assert.equal(result.code, 'REPLAY_DIVERGED');
    assert.equal(result.divergence.cursor, 0);
    assert.equal('expected' in result.divergence, false);
    assert.equal('actual' in result.divergence, false);
});

test('replay preserves a target restore refusal', () => {
    const f = fixture();
    f.session.start();
    f.machine.step();
    const cursor = f.stream.nextSequence();
    f.session.stop();
    f.target.restoreCheckpoint = () => ({accepted: false, reason: 'machine topology changed'});
    assert.deepEqual(f.controller.reverseToEvent(cursor), {
        accepted: false, code: 'reverse-restore-failed', reason: 'machine topology changed'
    });
});
