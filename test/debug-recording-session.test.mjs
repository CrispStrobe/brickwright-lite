import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {createRecordingSession} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';

const fixture = () => {
    let state = 3;
    const target = {
        capabilities: () => ({recording: ['checkpoint', 'restore']}),
        captureCheckpoint: () => ({schema: 1, time: {domain: 'cpu', ticks: state}, state}),
        restoreCheckpoint: saved => { state = saved.state; }
    };
    const eventStream = createDebugEventStream();
    const recorder = createDebugRecorder();
    return {target, eventStream, recorder, session: createRecordingSession({
        recorder, eventStream, getTarget: () => target
    }), state: value => { if (value != null) state = value; return state; }};
};

const fact = ticks => ({time: {domain: 'cpu', ticks}, cpuId: 'cpu0',
    kind: 'instruction', phase: 'retire', fidelity: 'recorded', pcBefore: ticks, pcAfter: ticks + 1});

test('records from the live sequence cursor and restores a complete checkpoint', () => {
    const f = fixture();
    f.eventStream.publish(fact(1));
    assert.equal(f.session.start().checkpoint.eventCursor, 1);
    const recorded = f.eventStream.publish(fact(2));
    f.session.appendBatch(f.eventStream.drain().filter(event => event.seq >= 1));
    assert.deepEqual(f.recorder.eventsFrom(1).map(event => event.seq), [recorded.seq]);
    f.state(9);
    f.session.checkpoint();
    f.state(12);
    assert.equal(f.session.restore(2).accepted, true);
    assert.equal(f.state(), 9);
    assert.equal(f.session.status().active, false);
});

test('stops lossless recording visibly on a live-ring gap', () => {
    const f = fixture();
    f.session.start();
    const result = f.session.appendBatch([{schema: 1, kind: 'gap', dropped: 2, beforeSeq: 4}]);
    assert.equal(result.code, 'recording-gap');
    assert.deepEqual(f.session.status().failure,
        {code: 'recording-gap', dropped: 2, beforeSeq: 4});
});

test('recorder failures stop recording without breaking the event producer', () => {
    const f = fixture();
    f.session.start();
    const result = f.session.appendBatch([{schema: 1, seq: 99, kind: 'instruction'}]);
    assert.equal(result.code, 'recording-error');
    assert.equal(f.session.status().active, false);
});

test('refuses targets which do not claim complete checkpoints', () => {
    const recorder = createDebugRecorder();
    const eventStream = createDebugEventStream();
    const session = createRecordingSession({recorder, eventStream, getTarget: () => ({
        capabilities: () => ({recording: []})
    })});
    assert.equal(session.start().code, 'unsupported-checkpoint');
});

test('target checkpoint errors cross the command boundary as structured refusals', () => {
    const recorder = createDebugRecorder();
    const eventStream = createDebugEventStream();
    const target = {
        capabilities: () => ({recording: ['checkpoint', 'restore']}),
        captureCheckpoint: () => { throw new Error('opaque timer'); },
        restoreCheckpoint: () => { throw new Error('bad topology'); }
    };
    const session = createRecordingSession({recorder, eventStream, getTarget: () => target});
    assert.deepEqual(session.start(), {
        accepted: false, code: 'checkpoint-failed', reason: 'opaque timer'
    });
});

test('target checkpoint and restore refusals remain refusals at the session boundary', () => {
    const f = fixture();
    f.target.captureCheckpoint = () => ({accepted: false, reason: 'device is opaque'});
    assert.deepEqual(f.session.start(), {
        accepted: false, code: 'checkpoint-failed', reason: 'device is opaque'
    });

    f.target.captureCheckpoint = () => ({schema: 1, time: {domain: 'cpu', ticks: 3}, state: 3});
    assert.equal(f.session.start().accepted, true);
    f.target.restoreCheckpoint = () => ({accepted: false, reason: 'topology changed'});
    assert.deepEqual(f.session.restore(0), {
        accepted: false, code: 'restore-failed', reason: 'topology changed'
    });
});
