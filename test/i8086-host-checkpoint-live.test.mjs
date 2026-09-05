import test from 'node:test';
import assert from 'node:assert/strict';

import {I8086Machine, BLINK8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createDebugFoundation} from '../overlay/scratch-gui/src/lib/bw-debug/debug-foundation.js';
import {createRecordingSession} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';
import {createInstructionReplayController} from '../overlay/scratch-gui/src/lib/bw-debug/instruction-replay.js';

const fixture = () => {
    const machine = new I8086Machine(BLINK8086);
    machine.cpu.cs = 0;
    machine.cpu.ip = 0x100;
    machine.mem.set([0x90, 0x90, 0x90], 0x100);
    const target = createI8086DebugTarget({machine});
    const foundation = createDebugFoundation();
    foundation.attachCapabilities(target.capabilities());
    const added = foundation.addBreakpoint({id: 'once', kind: 'execute', address: 0x100,
        oneShot: true, actions: [{type: 'counter'}, {type: 'log'}]});
    assert.equal(added.ok, true);
    let actionCounter = 0;
    let externalActions = 0;
    let replaying = false;
    let session;
    session = createRecordingSession({
        recorder: foundation.recorder,
        eventStream: foundation.events,
        getTarget: () => target,
        captureHostState: () => ({schema: 1, breakpoints: foundation.exportBreakpointState(),
            actionCounter}),
        prepareHostRestore: snapshot => ({
            breakpoints: foundation.prepareBreakpointState(snapshot.breakpoints),
            actionCounter: snapshot.actionCounter
        }),
        commitHostRestore: prepared => {
            const result = prepared.breakpoints.commit();
            if (!result.committed) return {accepted: false, reason: result.code};
            actionCounter = prepared.actionCounter;
            return {accepted: true};
        }
    });
    target.onDebugEvent(fact => foundation.events.publish(fact));
    foundation.events.onEvent(event => {
        session.appendBatch([event]);
        if (replaying) return;
        const plan = foundation.evaluateBreakpoints(event);
        foundation.executeBreakpointPlan(plan, {
            counter: () => { actionCounter++; },
            log: () => { externalActions++; }
        });
    });
    const logicalDomain = domain => domain.replace(/-reset-\d+$/, '');
    const replay = createInstructionReplayController({
        recorder: foundation.recorder,
        getTarget: () => target,
        restoreCheckpoint: checkpoint => session.restore(checkpoint.eventCursor),
        subscribeEvents: listener => foundation.events.onEvent(listener),
        normalizeTimeDomain: logicalDomain,
        normalizeEvent: event => {
            const {schema, seq, inputCursor, ...fact} = event;
            return {...fact, time: {...fact.time, domain: logicalDomain(fact.time.domain)}};
        },
        replayHostEvent: event => {
            const plan = foundation.evaluateBreakpoints(event);
            // Advance deterministic host state only. Log/capture/checkpoint,
            // halt and writes are external effects and remain suppressed.
            foundation.executeBreakpointPlan(plan, {counter: () => { actionCounter++; }});
            return {accepted: true};
        }
    });
    return {
        machine, target, foundation, session, replay,
        setReplaying: value => { replaying = value; },
        actionCounter: value => {
            if (value !== undefined) actionCounter = value;
            return actionCounter;
        },
        externalActions: () => externalActions
    };
};

const onceState = fixture => fixture.foundation.listBreakpoints()[0];

test('real 8086 checkpoint restores one-shot encounters, matches, enabled state, and action counter', () => {
    const f = fixture();
    assert.equal(f.session.start().accepted, true);
    f.machine.step();
    assert.deepEqual({...onceState(f), actionCounter: f.actionCounter()}, {
        ...onceState(f), enabled: false, encounters: 1, matches: 1, actionCounter: 1
    });
    const boundary = f.foundation.events.nextSequence();
    assert.equal(f.session.checkpoint().accepted, true);

    assert.equal(f.foundation.enableBreakpoint('once', onceState(f).generation), true);
    f.actionCounter(9);
    assert.equal(f.session.restore(boundary).accepted, true);
    assert.equal(onceState(f).enabled, false);
    assert.equal(onceState(f).encounters, 1);
    assert.equal(onceState(f).matches, 1);
    assert.equal(f.actionCounter(), 1);
});

test('verified replay reconstructs destination debugger-host state without repeating external actions', () => {
    const f = fixture();
    assert.equal(f.session.start().accepted, true);
    f.machine.step();
    const cursor = f.foundation.events.nextSequence();
    const targetAtDestination = f.machine.saveState();
    assert.equal(onceState(f).enabled, false);
    assert.equal(f.actionCounter(), 1);
    f.session.stop();
    f.machine.step();

    f.setReplaying(true);
    const result = f.replay.reverseToEvent(cursor);
    f.setReplaying(false);
    assert.equal(result.accepted, true);
    assert.deepEqual(f.machine.saveState(), targetAtDestination);
    assert.equal(onceState(f).enabled, false,
        'the destination consumed the one-shot even though replay suppresses its external action');
    assert.equal(onceState(f).encounters, 1);
    assert.equal(onceState(f).matches, 1);
    assert.equal(f.actionCounter(), 1,
        'deterministic counter state advances exactly once to the destination value');
    assert.equal(f.externalActions(), 1, 'the original log action is not repeated during reconstruction');
});
