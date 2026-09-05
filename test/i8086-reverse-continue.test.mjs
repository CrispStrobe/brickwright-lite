import test from 'node:test';
import assert from 'node:assert/strict';

import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {createRecordingSession} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';
import {createInstructionReplayController} from '../overlay/scratch-gui/src/lib/bw-debug/instruction-replay.js';
import {createHaltOccurrenceLedger} from '../overlay/scratch-gui/src/lib/bw-debug/halt-occurrence-ledger.js';
import {createReverseContinueCoordinator} from '../overlay/scratch-gui/src/lib/bw-debug/reverse-continue.js';

const fixture = () => {
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    // mov al,1; mov bl,2; mov cl,3; nop
    machine.mem.set([0xb0, 1, 0xb3, 2, 0xb1, 3, 0x90], 0x100);
    const target = createI8086DebugTarget({machine});
    const stream = createDebugEventStream();
    const recorder = createDebugRecorder();
    const recording = createRecordingSession({recorder, eventStream: stream, getTarget: () => target});
    target.onDebugEvent(fact => stream.publish(fact));
    stream.onEvent(event => recording.appendBatch([event]));
    const logicalDomain = domain => domain.replace(/-reset-\d+$/, '');
    const replay = createInstructionReplayController({
        recorder,
        getTarget: () => target,
        subscribeEvents: listener => stream.onEvent(listener),
        normalizeTimeDomain: logicalDomain,
        normalizeEvent: event => {
            const {schema, seq, inputCursor, ...fact} = event;
            return {...fact, time: {...fact.time, domain: logicalDomain(fact.time.domain)}};
        }
    });
    const halts = createHaltOccurrenceLedger();
    const reverse = createReverseContinueCoordinator({
        canReverse: () => replay.canReverse(),
        haltOccurrences: halts,
        reverseToEvent: cursor => replay.reverseToEvent(cursor)
    });
    return {machine, stream, recording, halts, reverse};
};

test('multiple recorded 8086 native halts reverse to their exact CPU states', () => {
    const f = fixture();
    assert.equal(f.recording.start().accepted, true);

    f.machine.step();
    const firstCursor = f.stream.nextSequence();
    const firstState = f.machine.saveState();
    f.halts.append({boundaryCursor: firstCursor, triggerEventSeq: null,
        matchingIds: ['address:256'], generation: 1, stopSide: 'before', source: 'i8086-native'});

    f.machine.step();
    const secondCursor = f.stream.nextSequence();
    const secondState = f.machine.saveState();
    f.halts.append({boundaryCursor: secondCursor, triggerEventSeq: null,
        matchingIds: ['address:258'], generation: 1, stopSide: 'before', source: 'i8086-native'});

    f.machine.step();
    const liveEnd = f.stream.nextSequence();
    f.recording.stop();

    const second = f.reverse.reverse(liveEnd);
    assert.equal(second.accepted, true);
    assert.deepEqual(second.matchingIds, ['address:258']);
    assert.deepEqual(f.machine.saveState(), secondState);

    const first = f.reverse.reverse(secondCursor);
    assert.equal(first.accepted, true);
    assert.deepEqual(first.matchingIds, ['address:256']);
    assert.deepEqual(f.machine.saveState(), firstState);
    assert.equal(f.reverse.status(firstCursor).code, 'no-previous-breakpoint');
});

test('failed replay does not advance the halt-occurrence chain', () => {
    const halts = createHaltOccurrenceLedger();
    halts.append({boundaryCursor: 2, triggerEventSeq: null, matchingIds: ['address:1'],
        generation: 0, stopSide: 'before', source: 'i8086-native'});
    let attempts = 0;
    const reverse = createReverseContinueCoordinator({
        canReverse: () => ({accepted: true}),
        haltOccurrences: halts,
        reverseToEvent: () => { attempts++; return {accepted: false, code: 'REPLAY_DIVERGED'}; }
    });
    assert.equal(reverse.reverse(3).code, 'REPLAY_DIVERGED');
    assert.equal(reverse.reverse(3).code, 'REPLAY_DIVERGED');
    assert.equal(attempts, 2, 'the same occurrence remains selected until replay succeeds');
});
