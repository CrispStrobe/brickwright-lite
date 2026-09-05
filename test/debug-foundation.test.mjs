import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    createDebugFoundation,
    subscribeDebugTargetEvents
} from '../overlay/scratch-gui/src/lib/bw-debug/debug-foundation.js';

test('foundation composes explicit capabilities with event predicates', () => {
    const foundation = createDebugFoundation();
    foundation.attachCapabilities({events: ['instruction'], steps: ['insn']}, {target: 'test'});
    assert.equal(foundation.capabilities().fidelity.cycle, 'unsupported');
    assert.equal(foundation.addBreakpoint({id: 'pc', kind: 'execute', address: 4}).ok, true);
    assert.deepEqual(foundation.evaluateBreakpoints({kind: 'instruction', pcBefore: 4}).matchingIds, ['pc']);
    assert.equal(foundation.addBreakpoint({id: 'bus', kind: 'event', eventKind: 'bus'}).refusal.code,
        'unsupported-event-kind');
});

test('attaching another target drops predicates compiled for the old address space', () => {
    const foundation = createDebugFoundation();
    foundation.attachCapabilities({events: ['instruction']});
    foundation.addBreakpoint({id: 'old', kind: 'execute', address: 1});
    foundation.attachCapabilities({events: ['instruction']});
    assert.deepEqual(foundation.evaluateBreakpoints({kind: 'instruction', pcBefore: 1}).matchingIds, []);
});

test('target facts enter the runner stream in total order and teardown unsubscribes', () => {
    const foundation = createDebugFoundation();
    let listener = null;
    const target = {onDebugEvent(callback) {
        listener = callback;
        return () => { listener = null; };
    }};
    const off = subscribeDebugTargetEvents(target, foundation.events);
    const fact = pc => ({
        time: {ticks: pc, domain: 'cpu'}, cpuId: 'cpu0', kind: 'instruction',
        phase: 'retire', fidelity: 'recorded', pcBefore: pc, pcAfter: pc + 1
    });
    listener(fact(0));
    listener(fact(1));
    assert.deepEqual(foundation.events.drain().map(event => event.seq), [0, 1]);
    off();
    assert.equal(listener, null);
});

test('target event bridge refuses a broken subscription contract', () => {
    const foundation = createDebugFoundation();
    assert.equal(subscribeDebugTargetEvents({}, foundation.events), null);
    assert.throws(() => subscribeDebugTargetEvents({onDebugEvent: () => null}, foundation.events),
        /unsubscribe function/);
});

test('target event bridge exposes the normalized sequenced event to a recording sink', () => {
    const foundation = createDebugFoundation();
    let listener;
    const seen = [];
    const off = subscribeDebugTargetEvents({onDebugEvent(callback) {
        listener = callback;
        return () => {};
    }}, foundation.events, event => seen.push(event));
    listener({time: {ticks: 1, domain: 'cpu'}, cpuId: 'cpu0', kind: 'instruction',
        phase: 'retire', fidelity: 'recorded', pcBefore: 1, pcAfter: 2});
    assert.equal(seen[0].seq, 0);
    assert.equal(seen[0].schema, 1);
    off();
});

test('foundation executes an arbitrated breakpoint plan with one halt', () => {
    const foundation = createDebugFoundation();
    foundation.attachCapabilities({events: ['instruction']});
    foundation.addBreakpoint({id: 'pc', kind: 'execute', address: 2,
        actions: [{type: 'log'}, {type: 'halt'}]});
    const plan = foundation.evaluateBreakpoints({kind: 'instruction', pcBefore: 2});
    const calls = [];
    const outcome = foundation.executeBreakpointPlan(plan, {
        log: () => calls.push('log'),
        halt: cause => calls.push(`halt:${cause.matchingIds[0]}`)
    });
    assert.deepEqual(calls, ['log', 'halt:pc']);
    assert.equal(outcome.halted, true);
});

test('foundation timeline follows explicitly drained batches including gaps', () => {
    const foundation = createDebugFoundation({eventCapacity: 2});
    const base = seq => ({schema: 1, seq, time: {ticks: seq, domain: 'cpu'},
        cpuId: 'cpu0', kind: 'instruction', phase: 'retire', fidelity: 'recorded',
        pcBefore: seq, pcAfter: seq + 1});
    foundation.events.append(base(0));
    foundation.events.append(base(1));
    foundation.events.append(base(2));
    foundation.ingestTimeline(foundation.events.drain());
    assert.deepEqual(foundation.timeline.range().map(event => event.seq), [1, 2]);
    assert.equal(foundation.timeline.state().gaps[0].dropped, 1);
    foundation.clear();
    assert.equal(foundation.timeline.state().retained, 0);
});
