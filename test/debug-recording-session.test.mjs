import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebugEventStream} from '../overlay/scratch-gui/src/lib/bw-debug/event-stream.js';
import {createDebugRecorder} from '../overlay/scratch-gui/src/lib/bw-debug/recorder.js';
import {
    createRecordingSession, subscribeDebugTargetInputs
} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';

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

test('target input subscription records only while active and returns recorder refusal', () => {
    let listener = null;
    let active = false;
    const seen = [];
    const target = {onDebugInput: cb => { listener = cb; return () => { listener = null; }; }};
    const session = {
        status: () => ({active}),
        appendInput: input => { seen.push(input); return {accepted: false, code: 'budget'}; }
    };
    const unsubscribe = subscribeDebugTargetInputs(target, session);
    assert.equal(listener({producer: 'key'}), true);
    assert.deepEqual(seen, []);
    active = true;
    assert.deepEqual(listener({producer: 'key'}), {accepted: false, code: 'budget'});
    assert.deepEqual(seen, [{producer: 'key'}]);
    unsubscribe();
    assert.equal(listener, null);
});

test('optional host state is captured separately and committed after target restore', () => {
    const f = fixture();
    let host = {counter: 2};
    const calls = [];
    const session = createRecordingSession({
        recorder: f.recorder,
        eventStream: f.eventStream,
        getTarget: () => f.target,
        captureHostState: () => ({schema: 1, counter: host.counter}),
        prepareHostRestore: snapshot => {
            calls.push(['prepare', snapshot.counter, f.state()]);
            return {counter: snapshot.counter};
        },
        commitHostRestore: staged => {
            calls.push(['commit', staged.counter, f.state()]);
            host = {...staged};
        }
    });
    const started = session.start();
    assert.deepEqual(started.checkpoint.hostSnapshot, {schema: 1, counter: 2});
    assert.equal(Object.hasOwn(started.checkpoint.snapshot, 'hostSnapshot'), false,
        'host state must not be passed through the target-owned snapshot');
    f.state(9);
    host.counter = 7;
    assert.equal(session.restore(0).accepted, true);
    assert.equal(f.state(), 3);
    assert.deepEqual(host, {counter: 2});
    assert.deepEqual(calls, [['prepare', 2, 9], ['commit', 2, 3]],
        'host validation precedes target mutation and host commit follows it');
});

test('host prepare refusal is atomic and never mutates the target', () => {
    const f = fixture();
    let restores = 0;
    const originalRestore = f.target.restoreCheckpoint;
    f.target.restoreCheckpoint = snapshot => { restores++; originalRestore(snapshot); };
    const session = createRecordingSession({
        recorder: f.recorder, eventStream: f.eventStream, getTarget: () => f.target,
        captureHostState: () => ({schema: 1, counter: 1}),
        prepareHostRestore: () => { throw new Error('definition capability changed'); },
        commitHostRestore: () => assert.fail('incompatible host state cannot commit')
    });
    session.start();
    f.state(9);
    assert.deepEqual(session.restore(0), {accepted: false, code: 'host-restore-incompatible',
        reason: 'definition capability changed'});
    assert.equal(f.state(), 9);
    assert.equal(restores, 0);
    assert.equal(session.status().active, true);
});

test('host commit failure rolls the target back and preserves recording lifecycle', () => {
    const f = fixture();
    const restoredStates = [];
    f.target.restoreCheckpoint = snapshot => {
        restoredStates.push(snapshot.state);
        f.state(snapshot.state);
    };
    const session = createRecordingSession({
        recorder: f.recorder, eventStream: f.eventStream, getTarget: () => f.target,
        captureHostState: () => ({schema: 1, counter: 1}),
        prepareHostRestore: snapshot => snapshot,
        commitHostRestore: () => { throw new Error('host swap failed'); }
    });
    session.start();
    f.state(9);
    assert.deepEqual(session.restore(0), {accepted: false, code: 'host-restore-failed',
        reason: 'host swap failed'});
    assert.equal(f.state(), 9, 'rollback restores the exact pre-command target state');
    assert.deepEqual(restoredStates, [3, 9]);
    assert.equal(session.status().active, true);
});

test('target rollback failure is distinguished from an ordinary host refusal', () => {
    const f = fixture();
    f.target.restoreCheckpoint = snapshot => {
        if (snapshot.state === 9) throw new Error('rollback topology failed');
        f.state(snapshot.state);
    };
    const session = createRecordingSession({
        recorder: f.recorder, eventStream: f.eventStream, getTarget: () => f.target,
        captureHostState: () => ({schema: 1}),
        prepareHostRestore: snapshot => snapshot,
        commitHostRestore: () => ({accepted: false, reason: 'host commit refused'})
    });
    session.start();
    f.state(9);
    const result = session.restore(0);
    assert.equal(result.code, 'restore-rollback-failed');
    assert.match(result.reason, /host commit refused/);
    assert.match(result.reason, /rollback topology failed/);
    assert.equal(session.status().active, true);
});

test('checkpoint capture and host preparation reject async and false/refused outcomes', () => {
    for (const result of [false, {refused: 'opaque'}, Promise.resolve({time: {domain: 'cpu', ticks: 0}})]) {
        const f = fixture();
        f.target.captureCheckpoint = () => result;
        assert.equal(f.session.start().code, 'checkpoint-failed');
    }

    for (const prepared of [false, {refused: 'stale host'}, Promise.resolve({})]) {
        const f = fixture();
        let targetRestores = 0;
        const original = f.target.restoreCheckpoint;
        f.target.restoreCheckpoint = snapshot => { targetRestores++; return original(snapshot); };
        const session = createRecordingSession({
            recorder: f.recorder, eventStream: f.eventStream, getTarget: () => f.target,
            captureHostState: () => ({schema: 1}),
            prepareHostRestore: () => prepared,
            commitHostRestore: () => true
        });
        session.start();
        f.state(9);
        assert.equal(session.restore(0).code, 'host-restore-incompatible');
        assert.equal(f.state(), 9);
        assert.equal(targetRestores, 0);
    }
});

test('async/false target restore and async host commit fail closed with rollback', () => {
    for (const restored of [false, {refused: 'bad topology'}, Promise.resolve(true)]) {
        const f = fixture();
        f.session.start();
        f.target.restoreCheckpoint = () => restored;
        assert.equal(f.session.restore(0).code, 'restore-failed');
    }

    const f = fixture();
    const restoredStates = [];
    f.target.restoreCheckpoint = snapshot => {
        restoredStates.push(snapshot.state);
        f.state(snapshot.state);
    };
    const session = createRecordingSession({
        recorder: f.recorder, eventStream: f.eventStream, getTarget: () => f.target,
        captureHostState: () => ({schema: 1}),
        prepareHostRestore: snapshot => snapshot,
        commitHostRestore: () => Promise.resolve(true)
    });
    session.start();
    f.state(9);
    assert.equal(session.restore(0).code, 'host-restore-failed');
    assert.equal(f.state(), 9);
    assert.deepEqual(restoredStates, [3, 9]);
});

test('async or false rollback is reported distinctly', () => {
    for (const rollbackResult of [false, {refused: 'rollback refused'}, Promise.resolve(true)]) {
        const f = fixture();
        let calls = 0;
        f.target.restoreCheckpoint = snapshot => {
            calls++;
            if (calls === 1) { f.state(snapshot.state); return true; }
            return rollbackResult;
        };
        const session = createRecordingSession({
            recorder: f.recorder, eventStream: f.eventStream, getTarget: () => f.target,
            captureHostState: () => ({schema: 1}),
            prepareHostRestore: snapshot => snapshot,
            commitHostRestore: () => false
        });
        session.start();
        f.state(9);
        const result = session.restore(0);
        assert.equal(result.code, 'restore-rollback-failed');
    }
});

test('legacy sessions keep target-only checkpoint shape and host snapshots fail closed without hooks', () => {
    const legacy = fixture();
    const checkpoint = legacy.session.start().checkpoint;
    assert.equal(Object.hasOwn(checkpoint, 'hostSnapshot'), false);

    const host = fixture();
    const hostSession = createRecordingSession({
        recorder: host.recorder, eventStream: host.eventStream, getTarget: () => host.target,
        captureHostState: () => ({schema: 1}),
        prepareHostRestore: snapshot => snapshot,
        commitHostRestore: () => true
    });
    hostSession.start();
    host.state(8);
    const legacyReader = createRecordingSession({
        recorder: host.recorder, eventStream: host.eventStream, getTarget: () => host.target
    });
    assert.equal(legacyReader.restore(0).code, 'host-restore-unavailable');
    assert.equal(host.state(), 8);
    assert.throws(() => createRecordingSession({
        recorder: host.recorder, eventStream: host.eventStream, getTarget: () => host.target,
        captureHostState: () => ({})
    }), /capture, prepare, and commit hooks/);
});

test('suspend and resume preserve recorder payload and restore the active lifecycle', () => {
    const f = fixture();
    f.session.start();
    const before = f.recorder.checkpoints();
    assert.deepEqual(f.session.suspend(), {accepted: true, wasActive: true});
    assert.equal(f.session.status().active, false);
    assert.equal(f.session.status().suspended, true);
    assert.equal(f.session.appendInput({producer: 'key', time: {domain: 'cpu', ticks: 3}}).code,
        'recording-inactive');
    assert.deepEqual(f.session.resume(), {accepted: true, active: true});
    assert.deepEqual(f.recorder.checkpoints(), before, 'resume never clears or recaptures the root');
    assert.equal(f.session.status().suspended, false);
});

test('resume fails closed if recorder or event-stream cursors changed while suspended', () => {
    const recorderMutation = fixture();
    recorderMutation.session.start();
    recorderMutation.session.suspend();
    recorderMutation.recorder.appendInput({schema: 1, producer: 'test',
        time: {domain: 'cpu', ticks: 3}});
    assert.equal(recorderMutation.session.resume().code, 'recording-changed-while-suspended');
    assert.equal(recorderMutation.session.status().active, false);

    const streamMutation = fixture();
    streamMutation.session.start();
    streamMutation.session.suspend();
    streamMutation.eventStream.publish(fact(4));
    assert.equal(streamMutation.session.resume().code, 'recording-changed-while-suspended');
    assert.equal(streamMutation.session.status().active, false);
});

test('suspension remembers inactivity and explicit stop cancels rollback resumption', () => {
    const f = fixture();
    assert.deepEqual(f.session.suspend(), {accepted: true, wasActive: false});
    assert.deepEqual(f.session.resume(), {accepted: true, active: false});
    f.session.start();
    f.session.suspend();
    assert.equal(f.session.start().code, 'recording-suspended');
    assert.equal(f.session.suspend().code, 'recording-already-suspended');
    f.session.stop();
    assert.equal(f.session.resume().code, 'recording-not-suspended');
});
