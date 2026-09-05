import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {createRecordingSession} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';
import {createInstructionReplayController} from '../overlay/scratch-gui/src/lib/bw-debug/instruction-replay.js';

const loadCoordinator = async () => {
    const module = await import('../overlay/scratch-gui/src/lib/bw-debug/selected-event-seek.js');
    assert.equal(typeof module.createSelectedEventSeekCoordinator, 'function');
    return module.createSelectedEventSeekCoordinator;
};

const fixture = () => {
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    // mov al,11h; mov [0200h],al; mov bl,22h; nop
    machine.mem.set([0xb0, 0x11, 0xa2, 0x00, 0x02, 0xb3, 0x22, 0x90], 0x100);
    const target = createI8086DebugTarget({machine});
    const stream = createDebugEventStream();
    const recorder = createDebugRecorder();
    const recording = createRecordingSession({recorder, eventStream: stream, getTarget: () => target});
    const events = [];
    target.onDebugEvent(fact => stream.publish(fact));
    stream.onEvent(event => {
        events.push(event);
        recording.appendBatch([event]);
    });
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
    return {machine, target, stream, recorder, recording, replay, events};
};

test('selected 8086 retire seeks through verified replay and restores exact state', async () => {
    const create = await loadCoordinator();
    const f = fixture();
    assert.equal(f.recording.start().accepted, true);
    f.machine.step();
    const selected = f.events.find(event => event.kind === 'instruction' && event.phase === 'retire');
    const selectedState = f.machine.saveState();
    f.machine.step();
    f.machine.step();
    f.recording.stop();

    let occurrenceResets = 0;
    const seek = create({
        canReverse: () => f.replay.canReverse(),
        reverseToEvent: cursor => f.replay.reverseToEvent(cursor),
        onAccepted: () => { occurrenceResets++; }
    });
    const result = seek.seek(selected);
    assert.equal(result.accepted, true);
    assert.equal(result.eventCursor, selected.seq + 1);
    assert.deepEqual(f.machine.saveState(), selectedState);
    assert.equal(occurrenceResets, 1,
        'an arbitrary successful seek starts reverse-continue from its new boundary');
});

test('memory/interior and absent selections refuse without replay', async () => {
    const create = await loadCoordinator();
    let replays = 0;
    const seek = create({
        canReverse: () => ({accepted: true}),
        reverseToEvent: () => { replays++; return {accepted: true}; },
        onAccepted: () => assert.fail('a refused selection cannot reset navigation state')
    });
    assert.equal(seek.status(null).code, 'no-selected-event');
    assert.equal(seek.seek(undefined).code, 'no-selected-event');
    assert.equal(seek.status({schema: 1, seq: 7, kind: 'memory', phase: 'access'}).code,
        'not-instruction-boundary');
    assert.equal(seek.seek({schema: 1, seq: 7, kind: 'memory', phase: 'access'}).code,
        'not-instruction-boundary');
    assert.equal(replays, 0);
});

test('replay failure preserves logical cursor and reverse-continue chain', async () => {
    const create = await loadCoordinator();
    let logicalCursor = 19;
    let resets = 0;
    const seek = create({
        canReverse: () => ({accepted: true}),
        reverseToEvent: () => ({accepted: false, code: 'REPLAY_DIVERGED'}),
        onAccepted: cursor => { logicalCursor = cursor; resets++; }
    });
    const retire = {schema: 1, seq: 3, kind: 'instruction', phase: 'retire'};
    assert.equal(seek.seek(retire).code, 'REPLAY_DIVERGED');
    assert.equal(logicalCursor, 19);
    assert.equal(resets, 0);
});

test('runner selected-event command reuses verified replay and resets occurrence chaining on success', () => {
    const source = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(source, /createSelectedEventSeekCoordinator/);
    assert.match(source, /seekSelectedDebugEventStatus/);
    assert.match(source, /seekSelectedDebugEvent/);
    assert.match(source, /reverseToEvent: eventCursor => runner\.reverseDebugToEvent\(eventCursor\)/);
    assert.match(source, /onAccepted:[\s\S]*reverseContinue\.reset\(\)/);
});
